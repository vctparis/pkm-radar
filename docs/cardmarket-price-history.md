# Historique du prix des boosters — Cardmarket + eBay

## Question traitée

Pour le set sélectionné, le prix du booster scellé monte-t-il ou baisse-t-il sur une fenêtre fixe de 365 jours ?

Les sources ne sont pas fusionnées :

- **Cardmarket `trend`** : indicateur quotidien du guide public, marché européen et langues confondues ;
- **Cardmarket `avg`** : moyenne publiée, affichée comme contexte du point ;
- **eBay.fr `p10` et médiane** : prix demandés par les annonces actives retenues après matching et contrôle d’intégrité.

Une disparition d’annonce eBay n’est jamais interprétée comme une vente.

## Collecte Cardmarket

Commande : `npm run ingest:cardmarket`.

Le collecteur :

1. télécharge le guide public Pokémon et le catalogue public des produits scellés ;
2. vérifie le schéma, la taille minimale, la date source et les 30 identifiants produit revus ;
3. confirme dans le catalogue que chaque identifiant reste un `Pokémon Booster` ;
4. conserve un point par date et par produit dans `data/cardmarket/history.json` ;
5. journalise URL, ETag, taille, dates source et empreintes SHA-256 dans `data/cardmarket/_manifest.jsonl` ;
6. refuse une réécriture silencieuse d’un point déjà archivé.

Le mapping `data/cardmarket/product-map.json` choisit volontairement un booster standard. Sleeved boosters, boosters 3/5/6 cartes, jumbo, lots et produits dérivés sont exclus.

## Recalculabilité et brut

L’historique compact contient toutes les valeurs nécessaires pour recalculer le graphique publié et l’empreinte de leur fichier source. Le guide complet fait environ 15 Mo par jour et ne doit pas être commité dans Git.

Pour conserver aussi chaque fichier brut, définir `CARDMARKET_ARCHIVE_DIR` vers un stockage persistant versionné. Sur un runner éphémère, cette variable doit pointer vers un volume ou un stockage synchronisé ; un simple dossier local du runner ne constitue pas une archive.

## Affichage honnête

- La fenêtre reste fixée à 365 jours même si seulement quelques jours sont disponibles.
- Avant huit observations, les points sont montrés sans ligne de tendance.
- Les jours absents restent vides ; ils ne sont pas interpolés.
- La couverture `CM x/365 · eBay y/365` reste visible.
- Les variations 30 jours et 1 an restent à `—` tant qu’aucun point suffisamment proche de la date de comparaison n’existe.
