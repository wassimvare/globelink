# GlobeLink V10.9.10 — Carte V11 · Photos instantanées

## Objectif
Réduire au maximum le délai d'affichage des vraies photos et augmenter la couverture sans réintroduire d'images fausses.

## Modifications
- Préchargement automatique des photos des lieux visibles dès le zoom ville (avant le clic).
- Jusqu'à 40 lieux proches du centre sont pré-enrichis à fort zoom, avec 6 workers dédupliqués.
- Les images résolues sont préchargées dans le cache HTTP du navigateur.
- Le même cache React Query est réutilisé par la fiche pendant 15 minutes et conservé en mémoire jusqu'à 1 heure.
- Survol, pression et clic sur un marqueur déclenchent un préchauffage prioritaire.
- Mode `fastOnly` : le préchargement s'arrête après les sources liées + Google Places pour ne pas bloquer la file sur des fallbacks lents.
- Si le mode rapide ne trouve rien, aucun résultat vide n'est mis en cache : la fiche conserve le droit d'essayer les fallbacks profonds.
- Reconnaissance des sous-types Google modernes (`italian_restaurant`, `french_restaurant`, etc.).
- Couverture hébergement étendue (`guest_house`, `bed_and_breakfast`, `extended_stay_hotel`, `inn`, etc.).
- Recherche Google compacte de secours lorsque le nom/adresse OSM est incomplet.
- Jusqu'à 8 références photo Google sont testées pour un candidat fiable avant abandon.

## Limite volontaire
Aucune photo générique n'est inventée. Si aucune source fiable ne possède réellement une image de l'établissement, GlobeLink garde le placeholder plutôt que d'afficher une mauvaise photo.
