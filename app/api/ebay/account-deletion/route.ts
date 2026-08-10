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
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  const { endpoint, source } = resolveEndpoint(request);

  // Mode diagnostic : eBay envoie toujours un challenge_code, donc son absence
  // signale un appel humain venu vérifier la configuration.
  if (!challengeCode) {
    return Response.json({
      ready: Boolean(verificationToken),
      endpointUsedForHash: endpoint,
      endpointSource: source,
      tokenLength: verificationToken?.length ?? 0,
      tokenFingerprint: verificationToken ? fingerprint(verificationToken) : null,
      hint: "Cette URL et ce token doivent correspondre exactement à ceux saisis dans le portail eBay.",
    });
  }

  if (!verificationToken) {
    return Response.json({ error: "EBAY_VERIFICATION_TOKEN non configuré" }, { status: 500 });
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
