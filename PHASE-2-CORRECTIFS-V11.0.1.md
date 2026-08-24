# GlobeLink V11.0.1 Beta — Correctifs Phase 2

## Corrigé

- Photos hôtels/restaurants/activités sur l'accueil : coordonnées réinjectées dans le résolveur Google Places.
- Conservation automatique de la clé Google Places lors du passage à une nouvelle archive.
- Bloc **Ton GlobeLink personnalisé** toujours visible pour un utilisateur connecté.
- Onboarding disponible depuis le Fil d'accueil.
- Entrée **Destinations** visible + explorateur de destinations.
- Notification envoyée à la personne likée dans Travel Match.
- Notification envoyée aux deux personnes lors d'un match réciproque.
- Conversation directe automatiquement liée au match.
- Nouveau match visible en temps réel dans l'onglet Messages.
- Bootstrap Supabase forcé en version `11.0.1-phase2-fix` au premier lancement.

## Premier lancement de cette version

`LANCER_GLOBELINK.bat` réapplique automatiquement le bootstrap Supabase une fois afin d'installer la nouvelle logique Travel Match. Si l'authentification Supabase CLI a expiré, le lanceur peut demander une reconnexion.

La clé Google Places n'est jamais incluse dans le ZIP. Le lanceur tente désormais de la restaurer depuis la configuration utilisateur Windows ou une ancienne version GlobeLink voisine. Si aucune clé ne peut être retrouvée, exécuter une seule fois `CONFIGURER_PHOTOS_GOOGLE_PLACES.bat`.

## Contrôles

- Sécurité : OK
- Phase 1 : 27/27
- Phase 2 : 20/20
- Cartes V2 à V12 : tous les contrôles statiques dédiés réussis
- Syntaxe TypeScript/TSX modifiée : aucune erreur de parsing détectée

Le build npm complet n'est pas déclaré comme exécuté dans cet environnement, car les dépendances du projet ne sont pas disponibles localement.
