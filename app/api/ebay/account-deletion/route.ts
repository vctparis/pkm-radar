import { createHash } from "node:crypto";

// Endpoint de conformité eBay « Marketplace Account Deletion ».
//
// eBay impose cet endpoint avant d'activer une clé de production. Le portail
// développeur envoie d'abord un GET de validation contenant un challenge_code ;
// il faut répondre le SHA-256 de la concaténation, DANS CET ORDRE :
//
//     challengeCode + verificationToken + endpointURL
//
// L'URL entrant dans le hash est celle déclarée chez eBay, au caractère près.
// Un slash final en trop et la validation échoue avec un message générique —
// c'est la cause n°1 des échecs rapportés sur les forums eBay. D'où le passage
// par une variable d'environnement plutôt qu'une reconstruction depuis la
// requête : derrière un proxy, l'hôte vu par le serveur n'est pas toujours
// celui qu'eBay a appelé.
//
// Ensuite, eBay envoie en POST les notifications de suppression de compte. La
// seule obligation est de répondre un 2xx rapidement : un non-2xx répété fait
// désactiver la clé.

export const dynamic = "force-dynamic";

const DEFAULT_ENDPOINT = "https://pkm-radar.vercel.app/api/ebay/account-deletion";

export async function GET(request: Request) {
  const challengeCode = new URL(request.url).searchParams.get("challenge_code");
  if (!challengeCode) {
    return Response.json({ error: "challenge_code manquant" }, { status: 400 });
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  if (!verificationToken) {
    return Response.json({ error: "EBAY_VERIFICATION_TOKEN non configuré" }, { status: 500 });
  }

  const endpoint = process.env.EBAY_NOTIFICATION_ENDPOINT || DEFAULT_ENDPOINT;

  const challengeResponse = createHash("sha256")
    .update(challengeCode)
    .update(verificationToken)
    .update(endpoint)
    .digest("hex");

  // eBay exige explicitement application/json sur cette réponse.
  return Response.json({ challengeResponse }, { headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request) {
  // Le corps est lu et tracé, mais la réponse ne doit jamais en dépendre :
  // un payload inattendu ne justifie pas un non-2xx, qui coûterait la clé.
  try {
    const payload = await request.json();
    const username = payload?.notification?.data?.username ?? "inconnu";
    console.log(`[ebay] suppression de compte notifiée : ${username}`);
  } catch {
    console.log("[ebay] notification reçue avec un corps illisible");
  }

  // Aucune donnée utilisateur eBay n'est stockée par ce projet : le radar ne
  // manipule que des prix agrégés. Rien à effacer, l'accusé de réception suffit.
  return new Response(null, { status: 200 });
}
