# Validation GlobeLink V11.0.5

## Correctifs ciblés
- Navigation `/destinations/` canonique et préchargée.
- Catalogue destination en deux temps : première source réelle immédiate, enrichissement arrière-plan.
- Réutilisation du cache viewport de la carte comme placeholder instantané.
- Google Places Nearby Search typé autour du hub urbain, Text Search seulement si une catégorie manque.
- Les petits résultats Google ne sont plus jetés.
- Covers pays via Wikipédia/Wikimedia avec métadonnées d'attribution/licence ; aucun fallback Unsplash générique.

## Contrôles exécutés
- Phase 1 statique : 27/27.
- Phase 2 : 35/35.
- Carte V2 : 10/10.
- Carte V3 : 8/8.
- Carte V4 : 10/10.
- Carte V5 : 13/13.
- Carte V6 : 14/14.
- Carte V7 : 10/10.
- Carte V8 : 13/13.
- Carte V9 : 19/19.
- Carte V10 : 16/16.
- Carte V11 : 15/15.
- Carte V12 : 9/9.
- Parsing TypeScript/TSX : 164 fichiers, 0 erreur de syntaxe.

## Limite de l'environnement de validation
`npm ci` n'a pas pu être exécuté jusqu'au bout dans le conteneur de validation. Les contrôles statiques et de syntaxe ci-dessus ont été exécutés, mais le build npm complet doit rester la validation finale sur la machine de lancement.
