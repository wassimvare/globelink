# GlobeLink — Carte V2 dynamique

## Corrigé

- La carte ne dépend plus uniquement d'un catalogue mondial limité.
- Chargement automatique des POI de la zone visible après déplacement ou zoom.
- Requête Overpass calculée à partir des bornes Leaflet visibles.
- Protection contre les requêtes continentales trop lourdes.
- Nombre de résultats adaptatif au niveau de zoom (jusqu'à 450 POI locaux).
- Cache serveur des zones pendant 6 heures.
- Temporisation de 350 ms après les mouvements de carte.
- Clustering maison des marqueurs aux faibles niveaux de zoom.
- Clic sur un cluster = zoom automatique vers le groupe.
- Ajout des catégories pharmacie, distributeur et bar au mapping OpenStreetMap.
- Indicateur visuel pendant le chargement d'une nouvelle zone.
- Message explicatif lorsque l'utilisateur doit zoomer pour obtenir les POI locaux.

## Comportement

- Zoom monde/continent : clusters et données mondiales mises en cache.
- Zoom >= 5 : chargement automatique de la zone visible.
- Plus le zoom est fort, plus GlobeLink peut retourner de lieux locaux.
- Les recherches ville/pays existantes restent disponibles.

## Validation

- Phase 1 : 27/27 contrôles statiques réussis.
- Carte V2 : 10/10 contrôles spécifiques réussis.
- Les trois fichiers TypeScript/TSX modifiés passent le parseur TypeScript sans erreur de syntaxe.
