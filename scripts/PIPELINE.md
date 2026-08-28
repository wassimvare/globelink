# Pipeline technique GlobeLink

Les transformations historiques sont centralisées ici pour éviter de dupliquer leur ordre dans `package.json` et pour garder `vite.config.ts` sans effet de bord.

- `apply-build-patches.mjs` : transformations principales, exécutées dans un ordre déterministe.
- `apply-late-source-patches.mjs` : transformations qui étaient auparavant lancées au chargement de Vite.
- `apply-explorer-travel-map-v1.mjs` : exécute l’ancien transform Explorer depuis un template texte temporaire, sans réécrire un fichier `.mjs` du dépôt.
- `apply-travel-match-v3.mjs` : regroupe le transform Travel Match et son ancien correctif TypeScript.
- `run-map-checks.mjs` : lance les validations carte v2 à v16 sans dupliquer quinze commandes npm.
- `lib/run-node-sequence.mjs` : exécuteur commun avec arrêt immédiat au premier échec.

## Règle

Tout nouveau patch doit être ajouté une seule fois dans le runner approprié. Il ne faut plus ajouter de mutation de source dans `vite.config.ts`.

À terme, les transformations encore présentes doivent être intégrées progressivement dans les fichiers source puis supprimées du pipeline, sans modifier le comportement produit.
