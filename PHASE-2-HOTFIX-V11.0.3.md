# GlobeLink V11.0.3 Beta — Correctif Destinations

## Bugs corrigés

### Menu Destinations
- Le menu n'utilise plus le faux slug `/destinations/explorer`.
- Une vraie route index `/destinations` a été créée.
- L'explorateur de destinations est isolé de la fiche détail afin qu'un changement de menu ne puisse plus casser le composant dynamique.
- La route index tolère l'absence temporaire de la table `destinations` et conserve le catalogue éditorial.
- Tous les pays présents dans la couche mondiale de GlobeLink sont également proposés dans l'explorateur.

### Page Tunisie / pages pays vides
- Pour la Tunisie, GlobeLink se centre réellement sur Tunis grâce à `WORLD_MAP_HUBS`.
- La recherche utilise une petite zone urbaine (zoom 14), identique au comportement fiable de la carte.
- Une première passe OpenStreetMap navigateur rapide est lancée directement.
- Si elle est insuffisante, GlobeLink fusionne : catalogue persistant, recherche ville/pays, viewport serveur et passe navigateur complète.
- Les doublons sont retirés et les champs ville/pays manquants sont complétés avec la destination courante.
- Le cache de la requête Destination a changé de version pour ne pas conserver un ancien résultat vide.
- Si tous les fournisseurs externes sont momentanément indisponibles, un bouton permet de relancer immédiatement la récupération.

## Non-régression
- Phase 1 : 27/27
- Phase 2 : 28/28
- Carte V2 à V12 : tous les contrôles passent
- 162 fichiers TS/TSX : aucune erreur de syntaxe détectée par TypeScript `transpileModule`

Aucune clé API ni fichier `.env` n'est inclus dans l'archive.
