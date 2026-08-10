# PKM Radar

Radar de sélection Pokémon TCG : quels sets et quelles cartes tiennent la route quand on doute que **toutes** les
cartes puissent monter durablement.

## Ce que mesure le radar

Le modèle est sceptique par construction. Un fort momentum, seul, ne rapporte presque aucun point : c'est le signal
le plus facile à fabriquer et le premier à se retourner. Le score combine, dans cet ordre de poids :

| Composante | Poids | Ce qu'elle capte |
|---|---|---|
| Largeur (diffusion) | 30 % | Part des cartes du set en hausse. Sous 50 %, la majorité baisse. |
| Rareté de l'offre | 25 % | Boosters scellés réellement disponibles, et concentration des vendeurs. |
| Résistance PSA | 20 % | Vitesse à laquelle le grading dilue la rareté d'état. |
| Diversification | 15 % | Part de la valeur du set captée par sa carte la plus chère. |
| Maturité | 10 % | Âge du set, donc extinction du risque de reprint. |

## Sources et ce qu'elles permettent

| Source | Rôle | Limite |
|---|---|---|
| Cardmarket via `pokemontcg.io` | Historique des prix de cartes | S'arrête au 1ᵉʳ juillet 2026 ; API instable (~1 requête sur 3 en erreur, d'où les tentatives multiples) |
| CardTrader | Prix demandés et profondeur d'offre en direct | **Aucun** endpoint d'historique : la série se construit un relevé par jour |
| PSA | Population gradée | Pas d'API publique — saisie manuelle dans `data/manual-psa.json` |

### Ce que la donnée ne permet pas

Le **niveau de prix** d'un set au cours du temps n'est pas reconstituable. Chaque carte n'a qu'une seule date de
relevé chez Cardmarket, donc aucun échantillon apparié ne relie deux dates : un indice chaîné y recolle des cartes
différentes et compose son biais de raccord sur des centaines de jours. Seules les **variations relatives** sont
mesurables — chaque carte servant de base à elle-même. C'est pourquoi le radar affiche de la diffusion et du
momentum, jamais un indice de prix.

## Lancer en local

```bash
npm install
cp .env.example .env.local        # y mettre le JWT CardTrader
npm run ingest                    # relève les sources, écrit public/radar-data.json
npm run dev
```

`npm run ingest -- --offline` fonctionne sans token : historique Cardmarket seul.
`npm run inspect` affiche la couverture des séries set par set — à lancer après toute modification de la méthode.

## Relevé quotidien

`.github/workflows/daily-ingest.yml` exécute l'ingestion chaque jour à 06:12 UTC et commite le résultat, ce qui
déclenche un redéploiement Vercel. Il faut pour cela que le secret **`CARDTRADER_API_TOKEN`** soit défini dans
*Settings → Secrets and variables → Actions* du dépôt.

Le même token doit exister côté Vercel (*Settings → Environment Variables*) pour l'indicateur de connexion en
en-tête. **Si tu régénères le token, mets à jour les deux.**

## Structure

```
scripts/ingest.mjs      orchestrateur du relevé
scripts/lib/series.mjs  méthode de mesure — lire les commentaires avant d'y toucher
scripts/lib/scoring.mjs pondérations du modèle
data/history.json       relevés accumulés, versionnés (piste d'audit)
content/*.html          corps du dossier de recherche
```

Le token CardTrader est lu côté serveur uniquement. Il ne doit jamais apparaître dans `public/`, dans le code client
ou dans un commit.
