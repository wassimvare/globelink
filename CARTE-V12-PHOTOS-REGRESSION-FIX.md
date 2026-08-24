# GlobeLink V10.9.11 — Carte V12 — correction de la régression photos

## Cause
La V10.9.10 préchargeait jusqu’à 40 lieux et conservait les URI Google Places comme fraîches pendant 15 minutes. Les URI photo Google étant temporaires, une URI pouvait expirer avant l’ouverture de la fiche. La charge de préfetch pouvait également générer trop d’appels Places.

## Correctifs
- préchargement limité à 6 lieux maximum à fort zoom, 4 à zoom moyen et 2 sinon ;
- seulement 2 workers en parallèle ;
- démarrage du préchargement après 600 ms ;
- anti-répétition pendant 10 minutes pour un lieu dont le préfetch vient d’être tenté ;
- fraîcheur React Query ramenée à 30 secondes pour la photo principale ;
- si une URI Google Places échoue dans `<img>`, GlobeLink refait automatiquement la résolution Google pour obtenir une URI fraîche ;
- suppression du deuxième appel Google déclenché au clic : la fiche effectue le lookup complet, le préfetch pointeur/touch ne sert qu’à chauffer le cache.

## Configuration
`GOOGLE_PLACES_API_KEY` reste côté serveur et n’est pas inclus dans le ZIP. Réutiliser le `.env` configuré précédemment.
