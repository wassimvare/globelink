# Sécurité GlobeLink

La sécurité ne se mesure pas au poids du code. Cette version privilégie des protections réellement exécutées plutôt que des fichiers artificiellement gonflés.

## Défense en profondeur

- **Navigateur** : CSP, anti-iframe, permissions même origine, HSTS en HTTPS, politique de référent et blocage des méthodes HTTP dangereuses.
- **Authentification** : redirections même origine, récupération compatible avec plusieurs formats de liens, validation des sessions, mots de passe renforcés et déconnexion globale.
- **Base de données** : RLS existante, triggers empêchant le changement de propriétaire, contraintes de taille et permissions réduites.
- **Médias** : formats autorisés, taille/dimensions/durée contrôlées, chemins aléatoires et refus des URL non sécurisées.
- **IA** : authentification, quota quotidien, limite de taille, historique borné, sources non fiables traitées comme données et non comme instructions.
- **Paiement** : secrets côté serveur, webhook signé, fenêtre anti-rejeu et idempotence.
- **PWA** : uniquement les fichiers statiques sont mis en cache ; aucune API ni page authentifiée n'est stockée hors ligne.

## Secrets

Ne jamais placer `SUPABASE_SERVICE_ROLE_KEY`, les clés IA, Tavily ou Stripe dans une variable `VITE_*`, un dépôt public, un message d'erreur ou une capture d'écran.

## Déploiement

1. Appliquer toutes les migrations SQL dans l'ordre.
2. Configurer les URL d'authentification exactes.
3. Ajouter les secrets uniquement dans l'environnement serveur.
4. Activer HTTPS avant la mise en production.
5. Tester chaque politique RLS avec deux comptes distincts et un visiteur déconnecté.
6. Activer la double authentification sur les comptes administrateurs de l'hébergement, de la base et du paiement.

## Contrôles V6

- Les clés Gemini et de recherche web restent exclusivement côté serveur.
- Les quotas IA sont liés au compte et enregistrés dans la base.
- Les comptes de démonstration ne reçoivent pas automatiquement l’accès complet.
- Les champs `verified`, `featured`, `visibility`, `ai_access`, `ai_daily_limit`, `status` et `is_demo` sont protégés par un trigger SQL.
- Les badges ne peuvent plus être écrits directement par le rôle `authenticated`.
- Chaque changement d’accès, de rôle ou de badge est journalisé.
- Le premier rôle administrateur est limité à `ADMIN_BOOTSTRAP_USER_ID`.
- Les recherches administratives sont normalisées, limitées et débarrassées des caractères pouvant casser les filtres PostgREST.
- Les codes de récupération sont vérifiés par le fournisseur d’authentification et ne sont jamais stockés par l’application.
- Après changement du mot de passe, la session de récupération est fermée.
- Les réponses IA ne sont ni mises en cache ni indexées.
- Les contenus web fournis à l’IA sont traités comme non fiables afin de limiter les injections de prompt.
