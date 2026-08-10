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

Le scope linguistique : **cartes françaises en priorité, japonaises quand la série n'existe qu'au Japon**. Les
autres langues sont exclues des métriques de marché — elles brouillent la mesure. Trois sets japonais sans
équivalent occidental sont suivis en mode « live seulement » (Tag All Stars, Shiny Star V, VMAX Climax).

| Source | Rôle | Limite |
|---|---|---|
| eBay.fr (Browse, OAuth client credentials) | **Vendeurs réels français** : boosters + chaque pépite, aspect `Langue:Français` (ou `Japonais`), vendeur en France, liens d'annonces | Prix demandés, pas conclus ; plancher brut bruité → p10 et médiane |
| TCGdex (libre, sans clé) | Catalogue **français** (noms, images) + locale `ja` pour les sets japonais | Pas de prix |
| Cardmarket via `pokemontcg.io` | Historique des prix de cartes (base des croissances) | S'arrête au 1ᵉʳ juillet 2026 ; toutes langues ; API instable (~1 requête sur 3 en erreur) ; **aucun set japonais** |
| CardTrader | Profondeur d'offre en direct ; source scellée principale des sets japonais (annonces `jp`) | Marketplace italienne — quasi aucun produit français ; aucun historique |
| PSA | Population gradée | Pas d'API publique — saisie manuelle dans `data/manual-psa.json`, couvre les 6 sets d'origine |

**Ventes conclues** : la seule source existante est eBay Marketplace Insights (Limited Release, approbation
business rarement accordée) — candidature possible, rien d'intégré. Vinted et le scraping des ventes terminées
eBay sont écartés : hors conditions d'utilisation.

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
