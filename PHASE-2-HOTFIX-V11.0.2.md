# GlobeLink V11.0.2 Beta — Hotfix Phase 2

Cette version part de V11.0.1 et corrige trois régressions observées en test réel.

## 1. Pages Destination qui affichaient 0 lieu

Cause : une destination pays sans ville (par exemple `Tunisie`) était géocodée au centre géographique du pays puis interrogée avec un petit rayon. Ce centre peut être loin d'une zone urbaine et retourner zéro restaurant/hôtel/activité.

Correction :
- résolution pays -> hub urbain réel via `WORLD_MAP_HUBS` (ex. Tunisie -> Tunis) ;
- recherche catalogue sur `ville + pays` ;
- seconde passe par viewport autour du hub si la première réponse est trop faible ;
- la recherche internet générale privilégie elle aussi un hub urbain lorsqu'une requête correspond à un pays ;
- les cartes Destination transmettent désormais ville/pays de fallback au résolveur de photos.

## 2. Travel Match depuis une page publique

Le bouton Travel Match d'une page Destination ne pousse plus un visiteur anonyme directement dans une route protégée. Il l'envoie vers `/auth?redirect=/match`, puis revient vers Match après connexion.

## 3. Inscription bloquée sur « Impossible de vérifier le pseudo »

Cause : la vérification faisait un `SELECT` anonyme directement sur `profiles`, alors que la RLS de production cache volontairement les profils non vérifiés.

Correction :
- nouvelle RPC `public.is_username_available(text)` en `SECURITY DEFINER` ;
- l'RPC ne retourne qu'un booléen et n'expose aucune donnée de profil ;
- autorisée à `anon`, `authenticated` et `service_role` ;
- si l'RPC est temporairement indisponible, l'inscription n'est plus bloquée : l'unicité atomique reste garantie par le trigger `handle_new_user` et l'index unique.

## Installation automatique

Le bootstrap passe à `11.0.2-phase2-hotfix`. Au premier lancement de cette version, GlobeLink réapplique automatiquement `supabase/bootstrap/globelink_auto_setup.sql` pour installer l'RPC pseudo.
