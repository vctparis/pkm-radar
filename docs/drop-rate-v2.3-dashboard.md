# Drop rate v2.3 — contrat du dashboard

La page répond d'abord à une décision : **quel booster conserve le plus de valeur, avec quel niveau de preuve ?** Les chiffres exacts restent disponibles, mais la lecture principale passe par la forme, la position et une palette sémantique.

## Carte des graphiques

| Section | Question | Forme | Données et garde-fou |
| --- | --- | --- | --- |
| Vue de décision | Quels sets combinent valeur et preuve ? | Scatter directement annoté, un point par set | X = EV nette / prix du booster ; Y = part d'EV repricée ; forme = confiance ; contour = omission structurelle. Les points qui peuvent changer la décision sont nommés sans survol, avec placement anti-collision. 25 points de même grain. |
| Scénarios | Que reste-t-il du prix payé ? | Bullet / intervalle horizontal | Booster, brut, fourchette nette et vente rapide sur une échelle commune. Aucun waterfall : les scénarios ne sont pas additifs. |
| Couverture | Quelle part repose vraiment sur le marché actuel ? | Barre empilée à dénominateur fixe | Repricée, fallback mince, fallback conflit, absence de marché frais, queue non suivie. Les omissions catalogue restent hors de la barre. |
| Raretés | Quelles raretés portent l'EV ? | Barres avec repère et point | Barre actuelle, repère historique, point vente rapide. Une seule couleur de donnée par statut. |
| Cartes | Quelles cartes font la moyenne ? | Barres horizontales interactives avec équation directe | Chaque ligne lit « prix de la carte × chance = contribution par booster ». Seule la contribution pilote la longueur ; le prix, d'une autre unité, reste un nombre directement visible. Détail du scénario rapide et du volume au focus/survol. |

## Palette et formes

- Vert : cotation française EX+ actuelle et sélection.
- Ambre : scénario prudent, conflit ou vigilance.
- Graphite : ancre historique et contexte.
- Terracotta : alerte structurelle seulement.
- Cercle plein : confiance élevée ; carré : moyenne ; losange ouvert : faible.

La couleur n'est jamais le seul canal. L'identité d'un point important ne dépend jamais du survol : le tooltip enrichit, il n'identifie pas. Toutes les interactions au survol existent aussi au focus clavier et au toucher.

## Provenance minimale

Le premier niveau expose le volume de taux, le nombre d'offres, les voix vendeur-carte, les deux sources et la fraîcheur. Le second niveau documente les seuils, frais, taux par rareté, santé des crawls et conflits de cotation. Une exclusion n'est publiable que si la carte, l'ancre, la médiane, le ratio et la profondeur restent recomputables.
