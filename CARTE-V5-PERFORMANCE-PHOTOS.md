# GlobeLink V10.9.4 — Carte V5 performance + photos réelles

## Objectif

Cette passe corrige deux problèmes observés sur la carte :

1. les POI mettaient plusieurs secondes à apparaître ;
2. une photo générique pouvait être affichée comme si elle représentait le restaurant, l'hôtel ou l'activité sélectionné.

## Chargement accéléré

La carte utilise maintenant quatre niveaux de données :

1. **cache navigateur local** : les lieux déjà consultés réapparaissent immédiatement ;
2. **catalogue Supabase** : les lieux déjà synchronisés sont récupérés sans attendre Overpass ;
3. **première vague OpenStreetMap légère** : une requête `node` limitée remplit rapidement une vue urbaine ;
4. **enrichissement complet en arrière-plan** : nodes, ways et relations complètent ensuite la zone sans vider la carte.

Autres optimisations :

- cache local persistant pendant 12 h ;
- déduplication commune des POI OpenStreetMap venant du serveur et du navigateur ;
- à partir du zoom ville, seuls les lieux proches de la zone visible sont rendus ;
- clustering maintenu jusqu'aux zooms urbains intermédiaires pour réduire le nombre de marqueurs DOM ;
- l'interface indique le nombre de lieux déjà affichés pendant la mise à jour en arrière-plan.

## Photos : aucune fausse illustration

`CatalogImage` n'utilise plus de banque Unsplash comme fallback d'un lieu précis.

Ordre de résolution d'une image :

1. image HTTPS réellement fournie par la source du POI ;
2. tag OpenStreetMap `image` ;
3. fichier `wikimedia_commons` ;
4. image P18 de l'entité `wikidata` ;
5. vignette libre de la page `wikipedia` associée.

Les métadonnées `image`, `wikimedia_commons`, `wikidata` et `wikipedia` sont maintenant conservées aussi bien dans le chemin Overpass navigateur que serveur.

Si aucune photo vérifiable n'existe, GlobeLink affiche **« Photo vérifiée non disponible »**. Aucune photo générique n'est présentée comme celle de l'établissement.

## Contrôles

- Phase 1 : **27/27** contrôles statiques réussis.
- Carte V2 : **10/10**.
- Carte V3 : **8/8**.
- Carte V4 : **10/10**.
- Carte V5 performance/photos : **13/13**.
- Parsing TypeScript/TSX de `src` et des Edge Functions : **0 erreur de syntaxe**.

## Fichiers principaux modifiés

- `src/routes/map.tsx`
- `src/lib/live-catalog.ts`
- `src/lib/browser-viewport-catalog.ts`
- `src/lib/public-travel-catalog.functions.ts`
- `src/lib/viewport-catalog-cache.ts` (nouveau)
- `src/components/CatalogImage.tsx`
- `scripts/map-v5-check.mjs` (nouveau)
- `package.json`
- `package-lock.json`
