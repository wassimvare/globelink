# Configuration nécessaire avant la mise en production

Le code est prêt, mais les services externes doivent être configurés dans l'hébergement. Ne place jamais ces secrets dans `VITE_*` ni dans le navigateur.

## Liens d'e-mail Supabase

Dans Supabase → Authentication → URL Configuration :

- **Site URL** : l'URL publique exacte de GlobeLink.
- **Redirect URLs** : ajouter `https://ton-domaine/reset-password`, `https://ton-domaine/verify-email` et les URL locales `http://127.0.0.1:5173/**`, `http://localhost:5173/**`.

Sans cette autorisation, Supabase peut refuser le retour vers la page de changement de mot de passe. Le code gère les liens PKCE (`code`), les liens avec `token_hash` et les anciens liens contenant les jetons dans le hash.

## GlobeLink AI Pro

Variables serveur :

- `LOVABLE_API_KEY` : moteur de génération déjà utilisé par l'application.
- `TAVILY_API_KEY` : recherche web récente. Sans cette clé, AI Pro fonctionne en mode connaissances générales et le signale clairement.
- `STRIPE_SECRET_KEY` : clé secrète Stripe.
- `STRIPE_AI_PRO_PRICE_ID` : identifiant du prix récurrent, par exemple 9,99 €/mois.
- `STRIPE_WEBHOOK_SECRET` : secret de signature du webhook.
- `PUBLIC_APP_URL` : URL publique, par exemple `https://globelink.example`.

Webhook Stripe à créer : `https://ton-domaine/api/stripe-webhook`.
Événements minimum :

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Appliquer ensuite toutes les migrations Supabase, en particulier celles terminant par `ai_pro_security.sql` et `platform_integrity_hardening.sql`.

## Mises à jour quotidiennes

- Les destinations, activités, voyageurs et questions de la page d'accueil changent automatiquement chaque jour, sans traçage et sans changement aléatoire pendant la journée.
- Les offres sont sélectionnées quotidiennement dans le catalogue.
- Les photos du jour sont calculées à partir des publications récentes de la base.
- AI Pro effectue une nouvelle recherche à chaque demande quand `TAVILY_API_KEY` est configurée ; les sources et la date de réponse sont renvoyées avec l'analyse.

## Radar quotidien avec sources

La migration `20260728220000_daily_discovery_snapshots.sql` crée un cache serveur quotidien. Le premier chargement de la journée construit au maximum un instantané, puis tous les visiteurs reçoivent le même contenu. Cela évite les coûts et empêche d'utiliser la fonction comme moteur de recherche libre.

Pour activer le Radar en direct :

- configurer `TAVILY_API_KEY` et la clé du moteur IA côté serveur ;
- configurer `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur ;
- appliquer la migration quotidienne.

Sans ces services, l'accueil continue d'utiliser sa sélection locale renouvelée chaque jour.

## Application mobile installable

Le manifeste et le service worker sont actifs uniquement dans un build de production. Le cache est volontairement limité aux ressources statiques. Les routes `/api/`, les requêtes portant une autorisation et les pages privées ne sont jamais enregistrées.

## Modèles d'e-mail prêts à copier

Les fichiers `supabase/email-templates/reset-password.html` et `confirm-signup.html` utilisent directement `{{ .ConfirmationURL }}`. Copie leur contenu dans Supabase → Authentication → Email Templates. Le lien contient le jeton signé et la redirection choisie par l'application ; ne remplace pas cette variable par une URL écrite en dur.

---

## V6 — Administration et IA gratuite

### 1. Appliquer la migration V6

Exécuter `supabase/migrations/20260728230000_admin_access_ai_otp.sql` sur la base cible. Elle ajoute la visibilité, les statuts de vérification, les niveaux d’accès IA, les quotas et les protections d’administration.

### 2. Configurer le premier administrateur

Définir côté serveur :

```env
ADMIN_BOOTSTRAP_USER_ID=uuid-du-compte-proprietaire
```

Connecte-toi ensuite avec ce compte et ouvre `/admin`. L’initialisation est refusée à tout autre identifiant et devient impossible dès qu’un premier administrateur existe.

### 3. Activer le moteur IA

Créer une clé serveur Gemini puis définir :

```env
GEMINI_API_KEY=secret
GEMINI_MODEL=gemini-2.5-flash
```

Ne jamais préfixer cette clé avec `VITE_`. Les variables `VITE_` sont envoyées au navigateur.

Pour ajouter des résultats web récents et des sources :

```env
TAVILY_API_KEY=secret
```

La recherche web est facultative. Sans cette clé, le moteur conversationnel fonctionne mais signale que sa réponse ne repose pas sur une recherche Internet en direct.

### 4. Envoyer un code de récupération à 6 chiffres

Dans les modèles d’e-mail d’authentification, remplacer le contenu de l’e-mail de récupération par le fichier :

`supabase/email-templates/reset-password.html`

Le modèle doit conserver exactement la variable `{{ .Token }}`. C’est elle qui affiche le code temporaire. Pour un usage public, configurer un serveur SMTP dédié et tester l’e-mail sur Gmail, Outlook et Apple Mail.

### 5. URL autorisée

Conserver `/reset-password` dans les URL de redirection autorisées afin de rester compatible avec les anciens e-mails et les protections internes du fournisseur d’authentification.
