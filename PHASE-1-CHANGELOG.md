# GlobeLink V10.9 — Phase 1 stabilisation

## Statut

**Phase 1 : validée par le garde de release statique (`npm run check:phase1`) : 27/27 contrôles.**

Le contrôle complet dépendant de `npm ci` reste également branché dans `npm run check` (sécurité + Phase 1 + lint + TypeScript + Vitest + build). Dans l'environnement de préparation de cette archive, le registre npm n'a pas pu fournir `zwitch@2.0.4`; le garde de release ne masque pas cette limite.

## Correctifs sécurité

- Refus des clés Supabase `sb_secret_*` dans le navigateur.
- Refus des anciens JWT `service_role` lorsqu'ils sont utilisés comme clé publique.
- Même protection appliquée au middleware serveur.
- Vérification des variables `.env*` avant release.
- Suppression de `VITE_TURN_URL`, `VITE_TURN_USERNAME` et `VITE_TURN_CREDENTIAL` du code d'appel.
- Configuration TURN récupérée à la demande côté serveur pour un utilisateur authentifié via `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
- Fallback STUN sans secret si TURN n'est pas configuré.

## Authentification

- Route applicative authentifiée contrôlée par `supabase.auth.getUser()`.
- Compte non confirmé redirigé vers la vérification e-mail.
- JWT des Server Functions vérifié via `getClaims()`.

## Travel Match

- Cible de like désormais obligatoirement validée comme UUID avant l'appel RPC serveur.
- Les likes/matchs restent effectués via la fonction serveur/RPC sécurisée.
- RLS vérifiée sur `travel_intents`, `match_likes` et `match_passes`.

## Messagerie / appels

- Correction du timer « écrit… » : plus de propriété artificielle attachée à une fonction React.
- Nettoyage du timer à la fermeture de la conversation.
- Erreurs de lecture des participants/messages propagées correctement.
- Erreurs d'upload média journalisées avant affichage utilisateur.
- Configuration ICE/TURN sortie du bundle public.
- RLS vérifiée sur conversations, participants et messages.

## Carte / contenu

- Vérification que les lieux affichés côté communauté restent filtrés sur `moderation_status = approved`.
- RLS vérifiée sur `places`.

## Administration / RLS

Le garde Phase 1 vérifie la présence de RLS sur :

- profiles
- posts
- stories
- travel_intents
- match_likes
- match_passes
- conversations
- conversation_participants
- messages
- places
- reports
- user_roles
- purchases
- notifications

Il vérifie également que les fonctions admin utilisent le contrôle `assertAdmin(context)`.

## Validation ajoutée

Commande rapide, sans dépendances tierces :

```bash
npm run check:security
npm run check:phase1
```

Commande de release complète :

```bash
npm ci
npm run check
```

`npm run check` exécute maintenant :

1. sécurité des variables d'environnement ;
2. invariants Phase 1 ;
3. ESLint ;
4. TypeScript ;
5. Vitest ;
6. build production.

## Résultats obtenus lors de la préparation

- `npm run check:security` : **OK**
- `npm run check:phase1` : **27/27 OK**
- parse syntaxique de tous les `.ts/.tsx` via TypeScript global : **0 erreur de syntaxe**
- `npm ci --offline` : bloqué uniquement car `zwitch@2.0.4` n'est pas présent dans le cache npm de l'environnement.

