# GlobeLink V10.9.3 — Carte V4 / correctif viewport

## Problème réellement identifié

Les captures de Lyon montraient encore le texte « Zoome sur une région » alors que la carte était déjà fortement zoomée. Cela prouvait que l'état `viewport` restait `null`.

La cause était dans `LeafletMap` : les listeners `moveend` / `zoomend` étaient attachés depuis un `useEffect` extérieur qui pouvait s'exécuter avant que `mapRef.current` existe. Si le ref était encore nul à cet instant, l'effet quittait immédiatement et n'était jamais réattaché. Conséquence : aucune zone visible n'était envoyée à React Query, donc `fetchViewportCatalog()` ne se déclenchait pas.

## Correction

- ajout de `ViewportReporter`, enfant réel de `MapContainer` ;
- utilisation de `react-leaflet/useMapEvents`, donc les événements sont branchés uniquement lorsque l'instance Leaflet existe ;
- émission immédiate du viewport initial (`schedule(map, 0)`) ;
- rechargement sur `moveend` et `zoomend` ;
- debounce 220 ms ;
- suppression de l'ancien listener fragile basé sur `mapRef.current`.

## Deuxième chemin de données

Pour éviter qu'une panne du runtime serveur laisse encore une carte vide :

- nouveau fallback `browser-viewport-catalog.ts` ;
- requête Overpass directe depuis le navigateur aux zooms ville/métropole ;
- Overpass autorise explicitement le CORS pour cet usage ;
- récupération serveur et récupération navigateur lancées en parallèle avec `Promise.any` ;
- la première source qui retourne de vrais lieux alimente la carte ;
- cache navigateur de 15 minutes ;
- deux miroirs Overpass côté navigateur.

## Contrôles

- Carte V2 : 10/10
- Carte V3 : 8/8
- Carte V4 viewport : 10/10
- Phase 1 : 27/27
- parsing TypeScript/TSX : OK
- test simulé du fallback navigateur : restaurant + pharmacie + hôtel correctement convertis en marqueurs.

## Test utilisateur attendu

1. Ouvrir Carte.
2. Zoomer sur Lyon (niveau ville).
3. Sans bouger la carte, le viewport initial est émis et les POI doivent commencer à apparaître.
4. Déplacer ensuite la carte vers Villeurbanne/Oullins : une nouvelle récupération est déclenchée automatiquement.
