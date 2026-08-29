# GlobeLink — Phase 2 Stabilisation

La phase 2 protège les surfaces essentielles du produit contre les régressions de navigation, d'authentification et de rendu.

## Contrat des routes privées

Les parcours suivants doivent rester derrière le layout `_authenticated` :

- `/trips`
- `/match`
- `/messages`
- `/notifications`
- `/settings`
- `/activity`
- `/dashboard`
- `/achievements`
- `/intelligence`

Le layout privé doit continuer à vérifier : session active, confirmation du compte, statut du profil et onboarding.

## Contrat des surfaces publiques

Les écrans `/`, `/destinations`, `/activities`, `/map`, `/search` et `/auth` doivent rester accessibles sans session, ne pas déclencher d'erreur navigateur et ne pas provoquer de débordement horizontal sur les viewports testés.

## Barrière CI

`npm run check:phase2` valide désormais les invariants historiques de la phase 2 ainsi que les frontières critiques public/privé.

Playwright couvre ces surfaces sur desktop Chromium et mobile Chromium. Toute régression de redirection, crash JavaScript ou débordement horizontal bloque la fusion.
