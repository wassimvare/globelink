# GlobeLink V11 Beta — Phase 2

GlobeLink est un réseau social de voyage construit avec React 19, TanStack Start,
Supabase et Tailwind CSS. Il regroupe le fil, les stories, les profils, les
abonnements, Travel Match, la messagerie, les appels WebRTC, les voyages, la
marketplace, l'administration, l'IA voyage et la PWA.

Cette V11 Beta ajoute la **Phase 2 produit** : onboarding personnalisé, accueil lié
au prochain voyage, recherche universelle filtrable, pages Destination, Travel
Match V2, recherche/non-lus dans la messagerie et filtres de notifications. Les
correctifs Carte V2 à V12, dont les photos Google Places sécurisées, sont conservés.

Voir aussi `PHASE-2-CHANGELOG.md` et `VALIDATION-PHASE2.md`.

## Le lancer simplement sous Windows

1. Décompresse entièrement le ZIP.
2. Double-clique uniquement sur **`LANCER_GLOBELINK.bat`**.
3. Au premier lancement, attends l'installation automatique de Node.js, des
   composants, des tables Supabase GlobeLink et du catalogue web.
4. Si Supabase demande une connexion, connecte-toi une seule fois dans la
   fenêtre ouverte par le lanceur.
5. Ouvre l'adresse HTTPS affichée, ou scanne le QR code avec le téléphone.
6. Garde la fenêtre PowerShell ouverte pendant le test.

La configuration publique du projet Supabase est intégrée au lanceur. Elle ne
contient aucune clé privée. L'adresse HTTPS temporaire permet la connexion Google,
la caméra et le micro. Elle change à chaque lancement et sert uniquement aux tests.
Le lanceur crée aussi `.runtime/globelink-auto-setup.json` après l'installation
catalogue : les lancements suivants ne redéploient pas tout inutilement.

Lis ensuite [TEST-COMPLET-V10.8.md](TEST-COMPLET-V10.8.md).

## Installation développeur

Prérequis : Node.js 22 ou plus récent.

```bash
npm ci
cp .env.example .env
npm run dev
```

## Vérification complète du code

```bash
npm run check
npm audit
```

`npm run check` exécute d'abord les contrôles sécurité, Phase 1, Phase 2 et carte,
puis ESLint, TypeScript, les tests Vitest et la compilation de production. Une
livraison ne doit pas être publiée si l'une de ces étapes échoue.

## Supabase

Les dernières protections sont dans :

```text
supabase/migrations/20260805200000_v10_production_rls_hardening.sql
supabase/migrations/20260805220000_v10_1_security_performance_completion.sql
supabase/migrations/20260805223000_v10_2_private_rls_helpers.sql
supabase/migrations/20260805224500_v10_3_atomic_ai_quotas.sql
supabase/migrations/20260807080000_v10_4_private_media_storage.sql
supabase/migrations/20260810170000_v10_5_ai_place_moderation.sql
supabase/migrations/20260810174500_v10_7_place_moderation_notifications.sql
```

Elles verrouillent les changements de propriétaire, les faux achats, les
conversations, les quotas IA, les appels Realtime privés et les fonctions RLS
privilégiées. Elles rendent aussi le bucket média privé par défaut, limitent les
lectures publiques aux dossiers prévus, ajoutent les index de clés étrangères et
valident les contraintes historiques.

La V10.5 ajoute une file de modération pour les lieux et activités proposés par
les utilisateurs : la proposition passe par une vérification IA, reste invisible
sur la carte, puis apparaît uniquement après validation dans le tableau de bord
administrateur.

La V10.6 ajoute le géocodage automatique des lieux : l'utilisateur renseigne la
ville et le pays, les coordonnées sont détectées côté serveur, puis envoyées en
validation.

La V10.7 ajoute la page de suivi après soumission, le résumé IA enrichi pour
l'admin et les notifications automatiques quand un lieu est validé ou refusé.

La V10.8 corrige le rechargement forcé de la PWA, élargit fortement le géocodage
des petites villes/villages avec fallback Open-Meteo, et affiche un résumé de
vérification même quand la clé serveur Supabase n'est pas configurée.

La V10.8.1 corrige l'affichage de la vérification des lieux/activités : plus de
badges techniques `modele_ia_indisponible`, recalcul des anciens résumés
techniques, score lisible et analyse automatique locale claire quand aucun modèle
IA serveur n'est configuré.

La V10.8.2 corrige la configuration Gemini : le lanceur charge explicitement
`.env`, l'appel utilise l'authentification OpenAI-compatible officielle de
Gemini, un script `CONFIGURER_GEMINI_API.bat` configure la clé localement, et une
clé invalide est signalée clairement sans afficher le secret.

La V10.8.3 accepte aussi les nouvelles clés Google AI Studio `AQ...`. Elles sont
valides pour Gemini, comme les anciennes clés `AIza...`.

La V10.8.4 accepte les nouvelles clés Google AI Studio contenant un point,
comme les clés `AQ....`, au lieu de bloquer localement un format pourtant valide
côté Google.

La V10.8.5 appelle Gemini via l'API native Google `generateContent` avec
`x-goog-api-key`, ce qui est plus fiable pour les clés Google AI Studio. Le
script de configuration teste aussi la clé et le modèle immédiatement.

La V10.8.6 corrige les réponses Gemini 3.6 vides : le test et la modération
réservent assez de jetons pour la réflexion du modèle, n'envoient plus le
paramètre `temperature` obsolète sur Gemini 3.x et affichent le motif exact si
Google termine encore sans texte.

La V10.8.7 ajoute une recommandation IA claire pour l'administrateur : accepter,
vérifier manuellement ou refuser, avec les raisons et les points à contrôler.
Les détails IA sont retirés de la page utilisateur et protégés par des droits de
colonnes Supabase. Les anciennes files « À valider » et « À vérifier » sont
réunies dans une seule file « En attente ».

La V10.8.8 ajoute l'installation automatique au lancement Windows : migrations
Supabase, fonction `sync-travel-catalog`, secret de synchronisation, planning
quotidien et première collecte catalogue sont préparés au premier démarrage. Les
fournisseurs d'offres `AMADEUS_*` et `TAVILY_API_KEY` sont enregistrés
automatiquement s'ils existent déjà dans `.env`.

La V10.8.9 corrige le lanceur automatique : les messages techniques envoyés par
Supabase CLI sur stderr, comme `Initialising login role...`, ne coupent plus
l'installation tant que le processus se termine avec succès.

La V10.8.10 corrige l'installation automatique quand le projet Supabase distant
a un historique de migrations différent du dossier local. Le lanceur n'utilise
plus `supabase db push` pour le catalogue : il applique directement un bootstrap
SQL idempotent, puis déploie la fonction `sync-travel-catalog`.

La V10.8.11 corrige la page Sélection du moment : elle affiche les vraies offres
si elles existent, sinon la même sélection réelle de lieux et activités que
l'accueil. Les anciens textes maladroits de la page vide ont été remplacés.

La V10.8.12 affiche aussi les offres du moment sur la carte, en plus des
activités, restaurants, hôtels et lieux de la communauté. La carte garde une
catégorie dédiée « Offres » et fusionne les résultats sans doublons.

La V10.8.13 corrige l'affichage réel des offres sur la carte : si aucun
fournisseur d'offres n'a encore créé de lignes `deal`, la carte reprend la
sélection réelle de secours et l'affiche aussi sous le filtre « Offres ». Le
bouton de catégorie isole maintenant la catégorie cliquée au lieu de la retirer.

La V10.8.14 rend les marqueurs d'offres lisibles : le symbole principal indique
le type réel du lieu (restaurant, hôtel, activité...) et le badge 🔥 indique
seulement qu'il s'agit aussi d'une offre. La carte complète aussi Supabase avec
une sélection mondiale répartie sur plusieurs continents.

## Secrets et production

- Une variable `VITE_*` est visible dans le navigateur : n'y place jamais de
  secret.
- `SUPABASE_SERVICE_ROLE_KEY`, Stripe, Gemini, Tavily, SMTP et TURN restent dans
  les secrets de l'hébergeur.
- Configure `PUBLIC_APP_URL` avec le domaine HTTPS définitif.
- Configure `ADMIN_BOOTSTRAP_USER_ID` avec l'UUID du seul compte autorisé à
  initialiser le rôle administrateur.
- Pour les fonctions administrateur serveur, lance
  `CONFIGURER_PROJET_SUPABASE.bat` et protège le fichier `.env` généré.
- Pour un résumé IA réel côté admin, configure `GEMINI_API_KEY` côté serveur.
  `SUPABASE_SERVICE_ROLE_KEY` est obligatoire pour lire et compléter les analyses
  privées dans la file **Lieux IA**.
- Si une ancienne archive contenait une clé serveur Supabase, remplace cette clé
  avant toute publication.

Consulte [CONFIGURATION-PRODUCTION.md](CONFIGURATION-PRODUCTION.md) et
[SECURITE.md](SECURITE.md) avant l'ouverture au public.

## Commandes

| Commande            | Utilité                         |
| ------------------- | ------------------------------- |
| `npm run dev`       | Serveur de développement        |
| `npm run build`     | Compilation de production       |
| `npm run preview`   | Prévisualisation du build       |
| `npm run lint`      | Contrôle ESLint                 |
| `npm run typecheck` | Contrôle TypeScript             |
| `npm run test`      | Tests automatiques              |
| `npm run check`     | Tous les contrôles de livraison |


## V10.9.3 — Carte V4
Correctif du viewport Leaflet et fallback Overpass navigateur. Voir `CARTE-V4-VIEWPORT-FIX.md`.
