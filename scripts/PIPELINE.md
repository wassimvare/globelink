# Pipeline technique GlobeLink

Depuis la phase 1 de stabilisation, le code présent dans `src/` est la source de vérité. Les commandes normales de développement, build et contrôle ne doivent plus modifier les sources avant de démarrer.

## Pipeline normal

- `npm run dev` : démarre directement Vite.
- `npm run build` : validations Phase 3, tests ciblés, génération des routes, TypeScript puis build Vite.
- `npm run check` : contrôles sécurité, phases, carte, Explorer, lint, TypeScript, tests et build sans mutation préalable de `src/`.
- `check:apis` et `check:explorer` sont désormais des contrôles uniquement, pas des scripts de transformation.

## Transformations historiques

- `apply-build-patches.mjs` et `apply-late-source-patches.mjs` sont conservés uniquement comme outils de récupération/migration explicites via `npm run patch:legacy`.
- Ils ne doivent plus être appelés automatiquement par `dev`, `build`, `build:dev` ou les commandes `check:*`.
- `apply-recap-media-map-fix.mjs` a été retiré du runner historique car il ciblait une ancienne structure de code et faisait échouer le pipeline.

## Règle

Les nouveaux correctifs doivent être écrits directement dans les fichiers source concernés. Ne plus ajouter de patch automatique de source dans Vite, `package.json`, les checks ou les workflows de production.

Si une migration ponctuelle nécessite une transformation, elle doit être exécutée explicitement, validée, intégrée au code source puis retirée du chemin normal d'exécution.
