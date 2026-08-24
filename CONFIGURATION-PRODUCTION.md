# Configuration de production — GlobeLink V10.8.14

## 1. Secrets

Si une ancienne archive contenait une clé serveur Supabase, remplace-la dans
**Supabase > Project Settings > API Keys**. Une suppression du fichier local ne
révoque pas une clé déjà copiée.

Conserve uniquement dans les secrets de l'hébergeur :

- `SUPABASE_SERVICE_ROLE_KEY` ;
- `ADMIN_BOOTSTRAP_USER_ID` ;
- `GEMINI_API_KEY`, `TAVILY_API_KEY` ;
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ;
- mots de passe SMTP et secrets TURN permanents.

## 2. Base Supabase

1. Sauvegarde la base.
2. Vérifie l'historique des migrations.
3. Applique les migrations manquantes dans l'ordre, jusqu'à :
   - `20260805220000_v10_1_security_performance_completion.sql` ;
   - `20260805223000_v10_2_private_rls_helpers.sql`.
   - `20260805224500_v10_3_atomic_ai_quotas.sql`.
   - `20260807080000_v10_4_private_media_storage.sql`.
   - `20260810170000_v10_5_ai_place_moderation.sql`.
   - `20260810174500_v10_7_place_moderation_notifications.sql`.
   - `20260814120249_v10_8_private_place_ai_analysis.sql`.
4. Lance les conseillers Security et Performance.

Les deux tables serveur `daily_discovery_snapshots` et `stripe_webhook_events`
ont volontairement RLS sans politique navigateur. Les quatre RPC
`admin_set_ai_pro_grant`, `get_visible_stories`,
`open_or_create_direct_conversation` et `send_match_like` sont des points
d'entrée authentifiés intentionnels ; ils contrôlent l'utilisateur dans leur
corps. Les autres fonctions privilégiées sont hors du schéma API public.

## 3. Authentification

Dans le tableau de bord Supabase :

- exige la confirmation d'adresse ;
- active la protection contre les mots de passe compromis ;
- active CAPTCHA pour inscription, connexion sensible et récupération ;
- configure un SMTP personnalisé et teste la réception du code ;
- place le domaine HTTPS final dans **Site URL** ;
- retire les redirections temporaires et limite la liste au domaine final ;
- configure Google avec le callback Supabase
  `https://hzsfocphpynxoykfkfaj.supabase.co/auth/v1/callback`.

## 4. Variables de l'hébergeur

Variables publiques : `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et leurs
équivalents `VITE_*`.

Variables serveur :

- `SUPABASE_SERVICE_ROLE_KEY` ;
- `ADMIN_BOOTSTRAP_USER_ID=<uuid-du-compte-admin-bootstrap>` ;
- `PUBLIC_APP_URL=https://ton-domaine.example` ;
- `GEMINI_API_KEY` si les fonctions IA sont activées, y compris la vérification
  automatique des lieux/activités ;
- Tavily si la recherche web IA est activée ;
- `GEOCODING_BASE_URL`, `GEOCODING_USER_AGENT` et `GEOCODING_EMAIL` si tu
  remplaces ou personnalises le service de géocodage compatible Nominatim ;
- Stripe et `STRIPE_AI_PRO_PRICE_ID` si l'abonnement est activé.

Le webhook Stripe doit pointer vers
`https://ton-domaine.example/api/stripe-webhook`.

## 5. Appels et médias

- HTTPS permanent obligatoire ;
- serveur TURN recommandé pour les réseaux mobiles/pare-feu stricts ;
- identifiants TURN courts ou limités au domaine ;
- bucket `media` privé par défaut : seules les politiques RLS autorisent les
  dossiers publics, les stories visibles et les pièces jointes des conversations ;
- test Safari iOS, Chrome Android et deux réseaux différents ;
- surveillance des quotas Storage et politique de conservation.

## 6. Obligations produit

Avant l'ouverture publique, renseigne l'identité de l'éditeur, l'hébergeur, le
contact, les mentions légales, les CGU, la politique de confidentialité, la
durée de conservation et les procédures RGPD/signalement.

## 7. Modération des lieux et activités

Les lieux et activités créés par les utilisateurs ne doivent pas apparaître
directement sur la carte. Le flux attendu est :

1. l'utilisateur crée le lieu ou l'activité ;
2. le serveur détecte les coordonnées depuis la ville et le pays ;
3. le serveur lance la vérification IA ;
4. la ligne reste `pending` ou `ai_flagged` dans `places` ;
5. un administrateur ouvre `/admin`, onglet **Lieux IA** ;
6. après validation, le statut passe à `approved` et le lieu devient public ;
7. l'utilisateur voit le résultat sur `/place-status/:id` et reçoit une
   notification de validation ou de refus.

Sans `GEMINI_API_KEY`, la validation administrateur reste possible : GlobeLink
utilise une analyse automatique locale basée sur les données soumises, les
coordonnées et les indices de géocodage. Pour un résumé généré par un vrai modèle
IA, configure `GEMINI_API_KEY` côté serveur. `SUPABASE_SERVICE_ROLE_KEY` est
obligatoire côté serveur pour que la file **Lieux IA** puisse lire et compléter
les analyses privées ; elle ne doit jamais être placée dans une variable `VITE_*`.

En test local Windows, lance `CONFIGURER_GEMINI_API.bat` pour écrire la clé dans
`.env`, puis relance `LANCER_GLOBELINK.bat`. En production, ne mets jamais cette
clé dans le code : ajoute `GEMINI_API_KEY` dans les secrets de l'hébergeur.

Par défaut, le géocodage utilise OpenStreetMap/Nominatim côté serveur, avec cache
et limitation de débit. Pour une ouverture publique importante, utilise un service
de géocodage dédié et configure `GEOCODING_BASE_URL`.

## 8. Recette finale

Exécute `npm ci`, `npm run check`, puis suis intégralement
`TEST-COMPLET-V10.8.md` avec deux comptes et un compte administrateur.
