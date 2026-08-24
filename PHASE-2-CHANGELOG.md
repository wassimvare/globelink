# GlobeLink V11 Beta — Phase 2

Base de travail : **GlobeLink V10.9.11 — Carte V12 Photos fixées**.

Cette release conserve les correctifs de la Phase 1 et toutes les évolutions Carte V2 → V12, puis ajoute la couche produit de la Phase 2.

## 1. Onboarding personnalisé

- Nouveau parcours en 4 étapes après connexion.
- Nom, ville et pays.
- Centres d'intérêt.
- Langues et style de voyage.
- Prochain voyage optionnel avec dates.
- Mise à jour du profil Supabase.
- Création d'une intention de voyage publique quand le prochain voyage est renseigné.
- Les données alimentent ensuite Travel Match et les recommandations.

## 2. Accueil personnalisé

- Nouvelle carte **Ton prochain voyage** sur l'accueil.
- Destination, dates et centres d'intérêt visibles immédiatement.
- Accès direct à la page Destination.
- Accès direct à Travel Match pour cette préparation de voyage.

## 3. Recherche universelle V2

- Recherche voyageurs, destinations, lieux, publications, questions et voyages.
- Ajout des destinations stockées dans Supabase.
- Les pays et destinations ouvrent maintenant leur page Destination.
- Filtres par catégorie avec compteurs.
- Le filtre revient automatiquement sur `Tout` lors d'une nouvelle recherche.

## 4. Pages Destination

Nouvelle route `/destinations/$slug`.

Chaque page peut agréger :

- activités ;
- restaurants ;
- hôtels ;
- offres ;
- voyageurs ayant des dates publiques ;
- questions de la communauté ;
- publications récentes ;
- informations éditoriales de destination ;
- raccourcis Carte et Travel Match.

Les médias privés des profils/publications sont signés avant affichage.

## 5. Country Sheet

- Ajout d'un bouton **Page destination** depuis la fiche pays de la carte.
- Conservation du bouton de préparation d'itinéraire IA.

## 6. Travel Match V2

- Préremplissage du contexte à partir du profil réel.
- Langues, centres d'intérêt et style de voyage réutilisés.
- Prochain voyage utilisé comme contexte de matching.
- Score expliqué avec chevauchement de dates et intérêts communs.
- Le système existant de like/pass/match/conversation reste conservé.

## 7. Messagerie V2

- Recherche dans les conversations.
- Filtre **Non lus**.
- État vide adapté au filtre/recherche.
- Conservation de Realtime, indicateur d'écriture, lecture, médias, voix et appels déjà présents.

## 8. Notifications V2

- Filtres `Tout`, `Social`, `Messages`, `Voyage`.
- État vide spécifique à la catégorie.
- Realtime et marquage lu existants conservés.

## 9. Design / cohérence

- Styles spécifiques au nouvel onboarding.
- Carte du prochain voyage harmonisée avec l'identité GlobeLink.
- Responsive mobile/desktop.
- Prise en charge de `prefers-reduced-motion` pour l'animation du nouvel onboarding.

## 10. Contrôles ajoutés

- `npm run check:phase2`
- 14 contrôles statiques dédiés à la Phase 2.
- Le pipeline `npm run check` inclut désormais la Phase 2 avant lint/typecheck/tests/build.
- Nouveau test unitaire `src/lib/phase2.test.ts` pour les helpers de destination/date/recherche.

## Version

`11.0.0-beta.1`

---

# Correctifs V11.0.1 Beta — Phase 2

Cette passe corrige les régressions constatées après l'intégration initiale de la Phase 2.

## Photos de l'accueil réparées

- Les cartes d'hôtels, restaurants et activités de l'accueil transmettent de nouveau les coordonnées réelles au résolveur média.
- Google Places peut donc identifier le bon établissement depuis l'accueil, comme sur la carte.
- La clé `GOOGLE_PLACES_API_KEY` reste strictement côté serveur.
- Le lanceur mémorise désormais la clé Places dans une variable utilisateur Windows dédiée et peut la restaurer automatiquement dans une nouvelle version de GlobeLink.
- Si la nouvelle archive est extraite à côté d'une ancienne version, le lanceur recherche également la clé Places dans les anciennes `.env` GlobeLink sans recopier les autres secrets.

## Accueil personnalisé réellement visible

- La carte **Ton GlobeLink personnalisé** est affichée pour tout utilisateur connecté.
- Si un prochain voyage existe, elle affiche destination, dates et intérêts.
- Sinon elle propose immédiatement de préparer un voyage à partir du profil et des centres d'intérêt.
- Le parcours d'onboarding est maintenant monté au niveau racine de l'application : il peut donc apparaître depuis le Fil d'accueil, et pas seulement après l'ouverture d'une route protégée.

## Destinations rendues accessibles

- Ajout d'un accès **Destinations** dans la navigation principale et dans le menu `Plus`.
- Ajout d'un explorateur de destinations sur la route existante `/destinations/explorer`.
- Recherche de destinations et ouverture des pages détaillées depuis cet explorateur.
- Les pages détaillées continuent d'agréger lieux, offres, voyageurs, questions et publications.

## Travel Match : notifications et Messages

- Un like Travel Match unique crée désormais une notification chez la personne likée.
- Quand le like devient réciproque, les deux voyageurs reçoivent une notification de match.
- La notification de match contient l'identifiant de la conversation et ouvre directement Messages.
- La conversation directe est créée/récupérée côté serveur au moment du match.
- La boîte Messages écoute maintenant les insertions `conversation_participants` en Realtime : le nouveau match apparaît sans rechargement manuel chez les deux utilisateurs.
- Le lanceur force une nouvelle application du bootstrap Supabase (`11.0.1-phase2-fix`) au premier démarrage afin d'installer la nouvelle fonction `send_match_like` même sur une base déjà configurée.

## Validation supplémentaire

- `check:phase2` vérifie maintenant aussi la conservation automatique de Google Places entre versions.
- Phase 2 : **20/20 contrôles statiques réussis** après cette passe.

## Version

`11.0.1-beta.2`

