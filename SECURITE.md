# Sécurité — GlobeLink V10.8.14

## Protections intégrées

- authentification Supabase vérifiée côté serveur sur les API IA ;
- confirmation d'adresse avant les fonctions sociales sensibles ;
- RLS et contrôles de propriété sur toutes les données exposées ;
- fonctions RLS privilégiées placées dans un schéma non exposé ;
- quatre RPC authentifiés limités à des opérations contrôlées ;
- création de conversation directe atomique et résistante aux courses ;
- faux achats et changement de propriétaire bloqués côté navigateur ;
- quotas IA par utilisateur et par fonctionnalité ;
- appel Realtime privé, destinataire validé et participation vérifiée ;
- webhook Stripe signé, limité en taille et idempotent ;
- chemins Storage liés à l'utilisateur et limite de 50 Mo par objet ;
- bucket `media` privé, lectures publiques limitées aux dossiers publics
  attendus, stories/DM/voyages protégés par RLS ;
- lieux et activités utilisateur invisibles publiquement tant qu'un
  administrateur ne les a pas validés après vérification IA ;
- score, résumé, indicateurs et recommandation IA des lieux interdits en lecture
  aux rôles navigateur, y compris via les événements Realtime ;
- géocodage des villes exécuté côté serveur, avec validation pays/ville, cache et
  limitation de débit ;
- IA voyage exécutée côté serveur avec authentification et quota, sans SDK IA
  tiers chargé dans le navigateur ;
- CSP, anti-iframe, permissions navigateur et en-têtes de sécurité ;
- service worker limité aux ressources statiques, sans cache des API privées.

## Règles absolues pour les secrets

Ne place jamais dans Git, un ZIP public ou une variable `VITE_*` :

- `SUPABASE_SERVICE_ROLE_KEY` ;
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ;
- `GEMINI_API_KEY`, `LOVABLE_API_KEY`, `TAVILY_API_KEY` ;
- SMTP, Amadeus, catalogue ou TURN permanents.

La clé `sb_publishable_*` intégrée au lanceur est volontairement publique et ne
remplace pas RLS. Toute ancienne clé serveur partagée doit être révoquée.

## Réglages externes obligatoires

Le code ne peut pas activer à lui seul les réglages du tableau de bord. Avant
publication : active protection contre les mots de passe compromis, CAPTCHA,
SMTP, MFA sur les comptes administrateurs, domaine HTTPS permanent et TURN.

Surveille les journaux Supabase/Stripe, sauvegarde la base, teste une restauration
et prévois un audit externe avant une ouverture à grande échelle.
