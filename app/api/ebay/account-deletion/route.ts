import { createHash } from "node:crypto";

// Endpoint de conformité eBay « Marketplace Account Deletion ».
//
// eBay envoie d'abord un GET de validation portant un challenge_code, et
// attend le SHA-256 de la concaténation, DANS CET ORDRE :
//
//     challengeCode + verificationToken + endpointURL
//
// Les deux causes d'échec sont l'URL et le token. On en neutralise une : l'URL
// est reconstruite à partir de la requête reçue, donc elle vaut exactement
// celle qu'eBay a appelée, à la casse et au slash près. Sur Vercel, l'en-tête
// `host` porte bien le domaine public appelé. Une variable d'environnement
// reste possible en dérogation si un jour un redirect s'intercale.
//
// Reste le token, qui doit être rigoureusement identique dans Vercel et dans
// le portail eBay. Comme il est invisible des deux côtés une fois saisi, un
// GET sans challenge_code renvoie une empreinte courte — assez pour vérifier
// que les deux côtés parlent du même secret, trop peu pour le reconstituer.

export const dynamic = "force-dynamic";

// eBay impose un jeton de 32 à 80 caractères pris dans [A-Za-z0-9_-]. Une
// valeur hors de ces bornes est rejetée côté eBay quoi qu'il arrive : mieux
// vaut le dire ici, précisément, que de laisser la validation échouer là-bas
// derrière un message générique.
function resolveToken() {
  const raw = process.env.EBAY_VERIFICATION_TOKEN;
  const candidate = raw?.trim();
  if (!candidate) return { token: null, problem: "absent" as const, length: 0 };
  if (!/^[A-Za-z0-9_-]+$/.test(candidate)) {
    return { token: null, problem: "caractères interdits" as const, length: candidate.length };
  }
  if (candidate.length < 32 || candidate.length > 80) {
    return { token: null, problem: "longueur hors bornes 32-80" as const, length: candidate.length };
  }
  // Un collage malheureux embarque souvent la clé et le signe égal.
  if (candidate.includes("EBAY_")) {
    return { token: null, problem: "la ligne entière a été collée", length: candidate.length } as const;
  }
  return { token: candidate, problem: null, length: candidate.length };
}

function resolveEndpoint(request: Request) {
  const override = process.env.EBAY_NOTIFICATION_ENDPOINT;
  if (override) return { endpoint: override.trim(), source: "env" as const };

  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return { endpoint: `${proto}://${host}${url.pathname}`, source: "request" as const };
}

// Empreinte non réversible, destinée à comparer deux saisies du même secret.
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 10);

export async function GET(request: Request) {
  const challengeCode = new URL(request.url).searchParams.get("challenge_code");
  const { token: verificationToken, problem, length } = resolveToken();
  const { endpoint, source } = resolveEndpoint(request);

  // Mode diagnostic : eBay envoie toujours un challenge_code, donc son absence
  // signale un appel humain venu vérifier la configuration.
  if (!challengeCode) {
    return Response.json({
      ready: Boolean(verificationToken),
      endpointUsedForHash: endpoint,
      endpointSource: source,
      tokenLength: length,
      tokenFingerprint: verificationToken ? fingerprint(verificationToken) : null,
      tokenProblem: problem,
      hint: problem
        ? `Le jeton présent dans l'environnement est inutilisable (${problem}). Coller uniquement la valeur, sans le nom de la variable ni retour à la ligne, puis redéployer.`
        : "Saisir dans le portail eBay exactement cette URL, et le jeton dont l'empreinte est indiquée.",
    });
  }

  if (!verificationToken) {
    // Répondre un hash calculé sur un jeton invalide ferait échouer eBay sans
    // rien expliquer ; l'erreur nomme la cause exacte.
    return Response.json(
      { error: `EBAY_VERIFICATION_TOKEN inutilisable : ${problem} (${length} caractères)` },
      { status: 500 },
    );
  }

  const challengeResponse = createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");

  return Response.json({ challengeResponse }, { headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request) {
  // Le corps est tracé, mais la réponse n'en dépend jamais : un payload
  // inattendu ne justifie pas un non-2xx, qui ferait désactiver la clé.
  try {
    const payload = await request.json();
    console.log(`[ebay] suppression de compte notifiée : ${payload?.notification?.data?.username ?? "inconnu"}`);
  } catch {
    console.log("[ebay] notification reçue avec un corps illisible");
  }

  // Le radar ne stocke aucune donnée d'utilisateur eBay — uniquement des prix
  // agrégés. Rien à effacer : l'accusé de réception suffit.
  return new Response(null, { status: 200 });
}
