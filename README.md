# PKM Radar

Dashboard de suivi du marché Pokémon TCG, prêt à déployer sur Vercel.

## Lancer en local

1. Installez les dépendances : `npm install`
2. Copiez `.env.example` vers `.env.local`
3. Mettez le JWT CardTrader dans `.env.local`
4. Lancez : `npm run dev`
5. Ouvrez `http://localhost:3000/#radar`

## Déployer sur Vercel

1. Importez ce dossier dans un dépôt GitHub, ou lancez `npx vercel` depuis le dossier.
2. Ajoutez `CARDTRADER_API_TOKEN` dans **Project Settings → Environment Variables**.
3. Redéployez le projet après l'ajout ou la rotation du token.

Le token est lu uniquement côté serveur. Il ne doit jamais être ajouté dans `public/`, dans le code client ou dans Git.
