# GlobeLink — QA pré-lancement

Dernière revue : 25 août 2026

## Validé

- Navigation mobile avec retour visuel immédiat pendant les transitions.
- Préchargement des destinations principales de la barre mobile, du header et des paramètres.
- Navigation authentifiée optimisée : plus de validation réseau Auth complète à chaque changement d'écran.
- Statut du compte authentifié mis en cache brièvement et invalidé lors des changements Auth.
- Menu `Paramètres et confidentialité` du profil redirigé vers `/settings`.
- Sous-pages des paramètres isolées : une rubrique ne charge plus toutes les autres rubriques en arrière-plan.
- Touch targets renforcées sur les états 404/erreur.
- Barre de navigation mobile masquée lorsque le clavier est ouvert.
- Centre d'aide et support avec conversation utilisateur ↔ équipe GlobeLink.
- Gestion du support réservée aux rôles `admin` et `moderator` côté interface et RLS.
- Vérification des logs production : pas de nouvelle erreur 4xx/5xx lors de la revue.

## À contrôler sur appareils réels avant publication App Store / Play Store

- iPhone récent et iPhone petit écran : clavier, safe areas, orientation et retour navigateur.
- Android récent : permissions localisation/caméra/micro et installation PWA.
- Réseau lent / mode avion : reprise après reconnexion et états vides.
- Upload photo/vidéo longue durée sur réseau mobile.
- Appels audio/vidéo entre deux appareils réels.
- Réception réelle des notifications selon les permissions OS.

## Avant lancement public

- Faire relire juridiquement Conditions d'utilisation et Politique de confidentialité.
- Activer la protection Supabase contre les mots de passe compromis si le plan Auth utilisé le permet.
- Ajouter/maintenir des modérateurs réels avant ouverture publique.
- Effectuer un smoke test final après chaque changement de configuration des API externes.

Ce document ne remplace pas les tests automatiques ni les tests sur appareils physiques ; il sert de checklist de publication pour éviter les régressions de dernière minute.
