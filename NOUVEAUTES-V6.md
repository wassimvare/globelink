# GlobeLink V6 — Administration, IA réelle et récupération par code

## Administration

Le menu `/admin` permet désormais de gérer les comptes sans modifier directement la base :

- visibilité du compte : public, limitée ou masquée ;
- accès à l’IA : gratuit, Pro ou désactivé ;
- quota IA quotidien personnalisé ;
- profil vérifié et mise à la une ;
- attribution et retrait des badges ;
- rôles modérateur et administrateur ;
- suspension, bannissement et suppression ;
- journal d’audit de chaque opération sensible.

Les champs administratifs sont protégés par un trigger SQL. Un utilisateur normal ne peut pas s’attribuer un badge, une vérification, un accès IA supérieur ou changer son statut depuis le navigateur.

## IA gratuite pendant le lancement

Les vrais comptes disposent par défaut de 50 demandes par jour. Le quota est modifiable depuis l’administration. Les comptes de démonstration restent limités ou désactivés.

Le moteur principal utilise Gemini côté serveur. La clé n’est jamais envoyée au navigateur. Une recherche web facultative peut enrichir les réponses avec des sources récentes. Sans moteur de recherche configuré, l’IA indique honnêtement que les informations doivent être vérifiées.

## Mot de passe oublié par code

Le parcours n’oblige plus l’utilisateur à ouvrir une page externe :

1. il saisit son adresse e-mail ;
2. il reçoit un code temporaire à 6 chiffres ;
3. il saisit le code sur `/reset-password` ;
4. il choisit un nouveau mot de passe ;
5. la modification est appliquée immédiatement et les anciennes sessions sont fermées.

L’ancien format de lien reste accepté temporairement pour ne pas bloquer les e-mails déjà envoyés.

## Interface et fluidité

- boutons avec retour visuel plus naturel ;
- transitions de stories directionnelles et plus rapides ;
- meilleure lisibilité des polices Manrope et Fraunces ;
- administration responsive ;
- animations désactivables via le réglage système « réduire les animations » ;
- amélioration des focus clavier, du tactile et des contrastes ;
- profils vérifiés et badges visibles sur les pages publiques.

## Installation obligatoire

Appliquer la migration :

`supabase/migrations/20260728230000_admin_access_ai_otp.sql`

Puis suivre `CONFIGURATION-PRODUCTION.md` pour le moteur IA, l’e-mail de récupération et le premier administrateur.
