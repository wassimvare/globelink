# GlobeLink V10.8.14 — note de livraison technique

Date de préparation : 14 août 2026

## Contrôles réalisés

- installation reproductible avec `npm ci` ;
- ESLint et TypeScript sans erreur ;
- 33 tests Vitest réussis ;
- build de production réussi ;
- audit npm : avis transitif `nanoid` via l'outillage Vite, sans correctif
  disponible dans l'arbre de dépendances actuel ;
- aucune clé serveur ou clé de fournisseur privée dans l'archive ;
- règles RLS testées avec un rôle authentifié réel ;
- index de toutes les clés étrangères présents ;
- contraintes de sécurité historiques validées ;
- fonctions RLS internes déplacées hors du schéma API public ;
- appels Realtime privés et contrôle de participation à la conversation ;
- taille Storage limitée à 50 Mo par objet ;
- bucket média privé par défaut, avec lecture publique limitée aux dossiers
  explicitement publics ;
- IA voyage déplacée côté serveur authentifié, sans SDK IA tiers côté client ;
- file de validation admin ajoutée pour les lieux et activités proposés par les
  utilisateurs ;
- géocodage automatique des lieux depuis la ville et le pays ;
- page de suivi utilisateur après soumission d'un lieu ;
- notifications automatiques de validation/refus des lieux ;
- résumé IA admin enrichi avec indice de géocodage ;
- recommandation IA admin explicite : accepter, vérifier manuellement ou
  refuser ;
- analyse IA masquée dans l'interface utilisateur et interdite en lecture
  directe aux rôles `anon` et `authenticated` ;
- files admin « À valider » et « À vérifier » fusionnées en « En attente » ;
- géocodage élargi des petites villes/villages avec fallback Open-Meteo ;
- affichage admin/statut corrigé pour remplacer les flags techniques de secours
  par des libellés lisibles ;
- analyse automatique locale renforcée quand aucun modèle IA serveur n'est
  configuré ;
- chargement explicite du fichier `.env` par le lanceur Windows ;
- configuration Gemini native corrigée avec `x-goog-api-key` et modèle par
  défaut `gemini-3.6-flash` ;
- budget de sortie Gemini 3.6 augmenté pour laisser de la place à la réflexion
  et au résumé visible, avec diagnostic détaillé des réponses vides ;
- installation automatique Windows au lancement : migrations Supabase, fonction
  `sync-travel-catalog`, secret catalogue, planning quotidien et première
  collecte ;
- correction du faux échec PowerShell lorsque Supabase CLI écrit des messages
  techniques sur stderr ;
- remplacement du `db push` automatique par un bootstrap SQL direct et
  idempotent pour éviter les blocages d'historique de migrations Supabase ;
- marqueur `.runtime/globelink-auto-setup.json` pour éviter de redéployer le
  catalogue à chaque lancement ;
- script local `CONFIGURER_GEMINI_API.bat` ajouté pour enregistrer la clé Gemini
  sans l'inclure dans l'archive finale ;
- rechargement forcé du service worker supprimé ;
- migrations V10 à V10.8 présentes dans le projet.

## Ce que cette archive autorise

Cette version est prête pour une **recette fonctionnelle complète**. Elle n'est
pas une autorisation automatique d'ouvrir le service au public : les réglages du
tableau de bord, le domaine, les fournisseurs externes et les informations légales
appartiennent au propriétaire du service.

## Actions obligatoires avant ouverture publique

1. remplacer toute ancienne clé Supabase `service_role` déjà partagée ;
2. activer la protection contre les mots de passe compromis, CAPTCHA et SMTP ;
3. utiliser un domaine HTTPS permanent et limiter les redirections Auth à ce domaine ;
4. configurer un serveur TURN pour les appels entre réseaux difficiles ;
5. tester Stripe en mode test et vérifier la signature du webhook ;
6. renseigner les mentions légales, la confidentialité, les CGU et la politique RGPD ;
7. exécuter la recette à deux comptes décrite dans `TEST-COMPLET-V10.8.md`.

## Marketplace

Les faux achats directs depuis le navigateur sont volontairement bloqués. Les
écritures d'achat ne doivent être réalisées qu'après validation d'un paiement par
un serveur ou un webhook signé.
