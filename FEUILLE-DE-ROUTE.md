# 🌍 GlobeLink V11 — Feuille de route

Dernière mise à jour : **24 août 2026**  
Version de référence : **V11.0.13-beta.1**  
Production : **https://globelink-theta.vercel.app**

## Objectif

Faire passer GlobeLink d'une application déjà très complète à un produit stable, rapide, sécurisé, compréhensible, réellement utile en voyage, utilisable partout dans le monde, prêt pour de vrais utilisateurs et préparé pour une future publication mobile.

---

# 🚀 ORDRE DE DÉVELOPPEMENT OFFICIEL

| Phase | Statut actuel | Cible |
|---|---|---|
| 🔴 Phase 1 — Stabilisation | ✅ Validée | GlobeLink V10.9 |
| 🟠 Phase 2 — Expérience utilisateur | 🟠 En cours | GlobeLink V11 Beta |
| 🟡 Phase 3 — Intelligence GlobeLink | ✅ Validée | GlobeLink V11 |
| 🟢 Phase 4 — Business | ⏳ À venir | GlobeLink V11.5 |
| 🔵 Phase 5 — Mobile | ⏳ À venir | GlobeLink 1.0 Mobile |

> La Phase 3 a été réalisée avant la fermeture complète de la Phase 2 à la demande du projet. La Phase 2 reste ouverte principalement pour la carte, les médias et l'activation finale de Google Places.

---

# 🔴 PHASE 1 — STABILISATION

## Statut : ✅ VALIDÉE

- ✅ Build production fonctionnel
- ✅ React + TypeScript + Vite / TanStack Start
- ✅ Supabase intégré
- ✅ RLS et contrôles d'accès critiques
- ✅ Authentification email / mot de passe
- ✅ Connexion Google via Supabase
- ✅ Redirection OAuth production corrigée
- ✅ Client Supabase compatible Vercel
- ✅ Travel Match de base
- ✅ Passage match → conversation
- ✅ Messagerie privée et Realtime
- ✅ Notifications principales
- ✅ Secrets sensibles maintenus côté serveur
- ✅ Bonne base V11.0.13-beta.1 remise en production
- ✅ Contrôles Phase 1 existants : 27/27

➡️ **Jalon : GlobeLink V10.9 — atteint**

---

# 🟠 PHASE 2 — EXPÉRIENCE UTILISATEUR

## Statut : 🟠 EN COURS

### Accueil / onboarding

- 🟠 Simplifier la hiérarchie visuelle
- 🟠 Personnaliser « Près de toi » et « Pour toi »
- 🟠 Réduire la surcharge
- 🟠 Uniformiser cartes et espacements
- 🟠 Finaliser l'onboarding voyage

### Carte — cœur de GlobeLink

Base présente :

- ✅ Carte mondiale
- ✅ Géolocalisation
- ✅ Lieux communautaires
- ✅ Architecture restaurants / hôtels / activités
- ✅ Offres
- ✅ Plusieurs catégories de marqueurs
- ✅ Modération des lieux communautaires
- ✅ Correctifs carte V2 à V12 conservés

À finaliser :

- 🟠 Barre `Tout | Voyageurs | Activités | Restaurants | Hôtels | Offres | Posts | Événements`
- 🟠 Filtrage instantané
- 🟠 Clustering
- 🟠 Icônes immédiatement identifiables
- 🟠 Prix / note / distance / photo / ouvert-fermé lorsque disponibles
- 🟠 Fiches complètes au clic
- 🟠 Chargement selon la zone visible
- 🟠 Cache et déduplication renforcés

### Sources officielles

#### Ticketmaster

- ✅ `TICKETMASTER_API_KEY` dans Vercel
- ✅ intégré dans GlobeLink
- ✅ test réel réussi
- ✅ utilisé dans GlobeLink Intelligence

**Statut : ✅ ACTIF**

#### Google Places

- ✅ `GOOGLE_PLACES_API_KEY` dans Vercel
- ✅ intégré côté serveur
- ✅ clé reconnue par Google
- ⏸ activation Google Maps Platform / facturation volontairement reportée à la fin
- ⚠️ `SearchTextRequest per day` bloqué tant que l'activation n'est pas terminée

**Statut : 🟠 INTÉGRÉ MAIS NON DÉBLOQUÉ**

Répartition cible :

- 🏨 Hôtels → Google Places
- 🍴 Restaurants → Google Places
- 📍 Lieux / attractions / activités locales → Google Places
- 🎟 Événements → Ticketmaster

Règle obligatoire :

> **Pas de source fiable = ne pas afficher. Pas de photo vérifiée = ne pas inventer de photo.**

### Pages Destination / recherche / social

- 🟠 Finaliser les pages Destination
- 🟠 Finaliser la couverture mondiale
- 🟠 Recherche universelle
- 🟠 Travel Match 2.0 côté expérience
- 🟠 Messagerie 2.0
- 🟠 Stories et publications vidéo fiables
- 🟠 Notifications complètes
- 🟠 Responsive et performances

### Dette technique Phase 2

- 🟠 Intégrer définitivement Google Places + Ticketmaster dans les sources sans dépendre du patch temporaire de build
- 🟠 Nettoyer `.v11-api-payload`
- 🟠 Nettoyer les scripts temporaires
- 🟠 Relancer `npm run check` complet après nettoyage

### Critères de validation Phase 2

1. Carte centrale, rapide et compréhensible.
2. Google Places actif en production.
3. Ticketmaster actif en production.
4. Hôtels, restaurants, activités et événements réels remontent correctement.
5. Photos cohérentes avec les établissements.
6. Aucun faux fallback trompeur.
7. Pages Destination suffisamment complètes.
8. UX accueil / onboarding stabilisée.
9. Travel Match, messagerie, stories et publications sans bug bloquant.
10. Pipeline complet de validation réussi.

➡️ **Jalon : GlobeLink V11 Beta — à finaliser**

---

# 🟡 PHASE 3 — INTELLIGENCE GLOBELINK

## Statut : ✅ VALIDÉE

Référence complète : `VALIDATION-PHASE3.md`.

### GlobeLink AI 2.0

- ✅ Nouvelle expérience authentifiée `/intelligence`
- ✅ Contexte du profil utilisateur
- ✅ Centres d'intérêt et langues
- ✅ Style de voyage
- ✅ Destination / intention de voyage
- ✅ Voyage actif ou planifié
- ✅ Budget quotidien
- ✅ Temps disponible
- ✅ Rythme de journée
- ✅ Notes / contraintes personnelles

### « Organise ma journée »

- ✅ Programme matin / après-midi / soir
- ✅ Budget estimatif
- ✅ Adaptation météo
- ✅ Option sociale GlobeLink
- ✅ Plan B
- ✅ garde anti-hallucination pour les établissements et événements

### Modes intelligents

- ✅ **Organise ma journée**
- ✅ **Autour de moi**
- ✅ **Où manger ?**
- ✅ **Trouve une activité**
- ✅ **Mode voyage**
- ✅ lien vers le générateur d'itinéraire existant pour préparer un voyage complet

### Suggestions selon localisation et météo

- ✅ Géocodage de la destination
- ✅ météo Open-Meteo en temps réel
- ✅ température, ressenti, pluie, vent, min/max
- ✅ adaptation du programme à la météo
- ✅ Ticketmaster utilisé pour les événements vérifiés proches

### Mode voyage

- ✅ Utilise le carnet de voyage existant
- ✅ reprend destination, dates et budget
- ✅ calcule une proposition de budget journalier
- ✅ relie météo, événements et recommandations au voyage
- ✅ accès direct au carnet depuis Intelligence GlobeLink

### Travel Match intelligent

- ✅ moteur de compatibilité réutilisable
- ✅ score de 0 à 100 %
- ✅ destination
- ✅ chevauchement des dates
- ✅ langues communes
- ✅ centres d'intérêt communs
- ✅ proximité de budget
- ✅ tranche d'âge
- ✅ explication lisible du score
- ✅ uniquement profils actifs/publics et intentions publiques

### Sécurité et fiabilité IA

- ✅ fonctions serveur protégées par `requireSupabaseAuth`
- ✅ clés fournisseurs uniquement côté serveur
- ✅ quota IA `reserve_free_ai_usage`
- ✅ nettoyage et bornage des entrées utilisateur
- ✅ l'IA ne peut citer par leur nom que les événements vérifiés fournis dans le contexte
- ✅ sans Google Places actif, aucun faux restaurant / hôtel / commerce n'est inventé

### Validation automatique

- ✅ garde Phase 3 : **14/14**
- ✅ tests métier : **4/4**
- ✅ `tsc --noEmit` : **0 erreur**
- ✅ build Vite / TanStack Start : **OK**
- ✅ preview Vercel : **READY**
- ✅ route `/intelligence` enregistrée
- ✅ accès ajouté dans **Plus → Intelligence GlobeLink**

➡️ **Jalon : GlobeLink V11 — Phase 3 atteinte**

---

# 🟢 PHASE 4 — BUSINESS

## Statut : ⏳ À VENIR

### GlobeLink+

- ⏳ Travel Match avancé
- ⏳ IA avancée / quotas premium
- ⏳ Itinéraires illimités
- ⏳ Filtres supplémentaires
- ⏳ Fonctionnalités premium voyage

Principe : ne pas bloquer trop tôt les fonctions essentielles gratuites.

### GlobeLink Business

Comptes ciblés : restaurants, hôtels, activités, agences et guides.

- ⏳ Créer / revendiquer une fiche
- ⏳ Compte professionnel vérifié
- ⏳ Publier une offre
- ⏳ Apparaître sur la carte
- ⏳ Sponsoring clairement identifié
- ⏳ Réservations lorsque le cadre partenaire/API l'autorise
- ⏳ Tableau de bord professionnel
- ⏳ Analytics professionnels

### Analytics et confiance

- ⏳ Utilisateurs actifs / rétention
- ⏳ Utilisation carte / IA / voyages / matchs / messages
- ⏳ Conversion premium
- ⏳ Signalements
- ⏳ Profil complété / téléphone / ancienneté / badge vérifié

➡️ **Jalon : GlobeLink V11.5**

---

# 🔵 PHASE 5 — MOBILE

## Statut : ⏳ À VENIR

- ⏳ Beta privée
- ⏳ TestFlight
- ⏳ Tests Android
- ⏳ Packaging iOS
- ⏳ Packaging Android
- ⏳ Notifications push
- ⏳ Permissions localisation / caméra / photos
- ⏳ Deep Links / Universal Links
- ⏳ App Store
- ⏳ Google Play

### Avant publication publique

- ⏳ Audit sécurité final
- ⏳ Tests RLS complets
- ⏳ Rate limiting / anti-spam
- ⏳ Monitoring frontend/backend/API
- ⏳ CGU / confidentialité / RGPD
- ⏳ Suppression et export des données
- ⏳ Politique de modération
- ⏳ Support

➡️ **Jalon : GlobeLink 1.0 Mobile**

---

# 🎯 PRIORITÉS APRÈS VALIDATION DE LA PHASE 3

1. **Revenir terminer la Phase 2 sans casser la Phase 3.**
2. Finaliser la carte et les pages Destination.
3. Nettoyer définitivement l'intégration Google Places + Ticketmaster.
4. Continuer avec Ticketmaster actif pendant que Google Places reste en attente.
5. Finaliser photos, catégories et fiches sans faux contenu.
6. Stabiliser onboarding, stories, publications et messagerie.
7. À la fin de la Phase 2, activer Google Maps Platform et tester Google Places mondialement.
8. Passer la Phase 2 en ✅ validée uniquement après ces tests.
9. Ensuite commencer la **Phase 4 — Business**.

---

# 🏁 ÉTAT AU 24 AOÛT 2026

- GlobeLink V11.0.13-beta.1 : ✅ en production
- Phase 1 : ✅ validée
- Phase 2 : 🟠 en cours
- Phase 3 : ✅ validée
- Phase 4 : ⏳ à venir
- Phase 5 : ⏳ à venir
- Connexion Google : ✅
- Supabase : ✅
- Ticketmaster : ✅ actif
- Google Places : 🟠 intégré, activation finale reportée
- GlobeLink Intelligence : ✅ intégré et validé
