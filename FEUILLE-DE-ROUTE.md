# 🌍 GlobeLink V11 — Feuille de route

Dernière mise à jour : **24 août 2026**  
Version de référence : **V11.0.13-beta.1**  
Production : **https://globelink-theta.vercel.app**

## Objectif

Faire passer GlobeLink d'une application déjà très complète à un produit stable, rapide, sécurisé, compréhensible, réellement utile en voyage, mondial, prêt pour de vrais utilisateurs et préparé pour une future publication mobile.

---

# 🚀 ORDRE DE DÉVELOPPEMENT OFFICIEL

| Phase | Statut actuel | Cible |
|---|---|---|
| 🔴 Phase 1 — Stabilisation | ✅ Validée | GlobeLink V10.9 |
| 🟠 Phase 2 — Expérience utilisateur | 🟠 En cours | GlobeLink V11 Beta |
| 🟡 Phase 3 — Intelligence GlobeLink | ⏳ À venir | GlobeLink V11 |
| 🟢 Phase 4 — Business | ⏳ À venir | GlobeLink V11.5 |
| 🔵 Phase 5 — Mobile | ⏳ À venir | GlobeLink 1.0 Mobile |

---

# 🔴 PHASE 1 — STABILISATION

## Statut : ✅ VALIDÉE

Priorité absolue : obtenir une base fiable avant d'empiler de nouvelles fonctions.

### Validé

- ✅ Build production fonctionnel
- ✅ Base React + TypeScript + Vite
- ✅ Supabase intégré
- ✅ RLS et contrôles d'accès sur les zones critiques
- ✅ Authentification email / mot de passe
- ✅ Connexion Google via Supabase
- ✅ Redirection OAuth Google corrigée vers `https://globelink-theta.vercel.app`
- ✅ Client Supabase compatible Vercel
- ✅ Travel Match de base
- ✅ Passage du match à la conversation
- ✅ Messagerie privée et Realtime
- ✅ Notifications principales
- ✅ Protection des secrets côté serveur
- ✅ Bonne base V11.0.13-beta.1 remise sur `main` et en production
- ✅ Contrôles Phase 1 existants : 27/27

### À continuer de surveiller

- 🟠 Réduire progressivement les `any` TypeScript
- 🟠 Étendre la couverture de tests
- 🟠 Continuer les audits RLS/Supabase à chaque fonctionnalité sensible

➡️ **Jalon : GlobeLink V10.9 — atteint sur la base actuelle**

---

# 🟠 PHASE 2 — EXPÉRIENCE UTILISATEUR

## Statut : 🟠 EN COURS

Cette phase doit rendre GlobeLink simple à comprendre, rapide et réellement agréable à utiliser.

## 🏠 Accueil

- 🟠 Simplifier la hiérarchie visuelle
- 🟠 Mettre les informations importantes en premier
- 🟠 Personnaliser réellement le contenu
- 🟠 Améliorer « Près de toi »
- 🟠 Améliorer « Pour toi »
- 🟠 Mettre davantage en avant la destination actuelle
- 🟠 Réduire la sensation de surcharge
- 🟠 Uniformiser cartes et espacements

## 🗺️ Carte — cœur de GlobeLink

Objectif : quand l'utilisateur ouvre la carte, il doit pouvoir trouver immédiatement voyageurs, restaurants, hôtels, activités, bons plans, offres, posts, questions, événements et lieux communautaires.

### Base déjà présente

- ✅ Carte mondiale
- ✅ Géolocalisation
- ✅ Lieux communautaires
- ✅ Restaurants / hôtels / activités dans l'architecture
- ✅ Offres
- ✅ Plusieurs catégories de marqueurs
- ✅ Modération des lieux communautaires
- ✅ Affichage mondial des données disponibles
- ✅ Correctifs carte V2 à V12 conservés

### À finaliser

- 🟠 Barre : `Tout | Voyageurs | Activités | Restaurants | Hôtels | Offres | Posts | Événements`
- 🟠 Filtrage instantané
- 🟠 Clustering propre
- 🟠 Icône immédiatement identifiable par catégorie
- 🟠 Prix lorsque pertinent
- 🟠 Note
- 🟠 Distance
- 🟠 Photo réelle
- 🟠 Ouvert / fermé
- 🟠 Fiche complète au clic
- 🟠 Chargement uniquement selon la zone visible
- 🟠 Cache et déduplication renforcés

## 🌍 Sources officielles du catalogue

### Ticketmaster

- ✅ `TICKETMASTER_API_KEY` configurée dans Vercel
- ✅ API Ticketmaster intégrée dans la V11
- ✅ Test réel réussi en production
- ✅ Événement réel retourné

**Statut : ✅ ACTIF**

### Google Places

- ✅ `GOOGLE_PLACES_API_KEY` configurée dans Vercel
- ✅ Google Places intégré dans la V11
- ✅ Appels serveur pour éviter d'exposer la clé
- ✅ Clé reconnue par Google
- ⏸ Google Maps Platform / facturation volontairement reportée à la fin
- ⚠️ Tant que ce point n'est pas activé : `SearchTextRequest per day` renvoie un quota bloqué

**Statut : 🟠 INTÉGRÉ MAIS NON DÉBLOQUÉ**

### Répartition cible

- 🏨 Hôtels → Google Places
- 🍴 Restaurants → Google Places
- 📍 Lieux / attractions / activités locales → Google Places
- 🎟 Événements / concerts / spectacles → Ticketmaster

Règle obligatoire :

> **Pas de source fiable = ne pas afficher. Pas de photo vérifiée = ne pas inventer de photo.**

## 🌎 Couverture mondiale

- 🟠 Vérifier les sources dans les grandes villes du monde
- 🟠 Améliorer recherche pays / ville / région
- 🟠 Supprimer les doublons
- 🟠 Vérifier les coordonnées
- 🟠 Éviter les lieux fantômes
- 🟠 Mettre en cache les résultats
- 🟠 Charger les résultats selon le viewport

## 📍 Pages Destination

Pour chaque destination, regrouper :

- voyageurs présents ;
- voyageurs arrivant bientôt ;
- publications ;
- questions ;
- activités ;
- restaurants ;
- hôtels ;
- offres ;
- événements ;
- conseils communautaires ;
- budget moyen ;
- météo ;
- IA GlobeLink.

Statut : 🟠 base présente, expérience à finaliser.

## ❤️ Travel Match 2.0

- 🟠 Compatibilité destination / dates
- 🟠 Distance
- 🟠 Âge
- 🟠 Langues
- 🟠 Centres d'intérêt
- 🟠 Type de voyage
- 🟠 Activités recherchées
- 🟠 Score de compatibilité explicable

## 💬 Messagerie 2.0

- 🟠 Envoyé / reçu / lu
- 🟠 En ligne
- 🟠 « écrit… »
- 🟠 Réponses
- 🟠 Réactions
- 🟠 Photos / vidéos
- 🟠 Localisation
- 🟠 Partage lieu / activité
- 🟠 Suppression / signalement / blocage

## 📸 Stories et publications

- 🟠 Vérification iPhone / Android
- 🟠 Préchargement
- 🟠 Compression image et vidéo
- 🟠 Réseau lent
- 🟠 Progression / swipe / pause / réponse / like
- 🟠 Liste des vues et expiration 24 h
- 🟠 Publications multi-photo
- 🟠 Tags / mentions / enregistrement / partage
- 🟠 Prévisualisation vidéo fiable

## 🔎 Recherche universelle

- 🟠 Destinations
- 🟠 Voyageurs
- 🟠 Activités
- 🟠 Restaurants
- 🟠 Hôtels
- 🟠 Publications
- 🟠 Offres
- 🟠 Historique / suggestions / autocomplétion / tendances

## 🔔 Notifications

- 🟠 Nouveau follower
- 🟠 Like / commentaire / réponse
- 🟠 Match
- 🟠 Message
- 🟠 Appel manqué
- 🟠 Offre proche
- 🟠 Activité intéressante
- 🟠 Réponse à une question
- 🟠 Voyageur compatible arrivé dans la destination

## 👋 Onboarding

- 🟠 Où voyages-tu ?
- 🟠 Quand ?
- 🟠 Qu'aimes-tu ?
- 🟠 Quel type de voyageurs veux-tu rencontrer ?
- 🟠 Construire automatiquement feed, destinations, recommandations, Travel Match et carte

## 🎨 Design, performances et fiabilité

- 🟠 Design cohérent sur mobile et desktop
- 🟠 Skeleton loaders
- 🟠 États vides travaillés
- 🟠 Messages d'erreur propres
- 🟠 Mode sombre
- 🟠 Accessibilité
- 🟠 Lazy loading
- 🟠 Pagination / infinite scroll
- 🟠 Compression médias
- 🟠 Cache
- 🟠 Optimisation Supabase/PostgreSQL
- 🟠 Objectif premier affichage < 2 s dans de bonnes conditions

## Dette technique Phase 2

- 🟠 Intégrer définitivement Google Places + Ticketmaster dans les sources sans dépendre du patch temporaire de build
- 🟠 Nettoyer `.v11-api-payload`
- 🟠 Nettoyer les scripts temporaires après stabilisation
- 🟠 Garder le smoke-test fournisseur en contrôle manuel
- 🟠 Lancer `npm run check` complet après nettoyage

## Critères de validation Phase 2

1. Expérience accueil / onboarding claire.
2. Carte centrale, rapide et compréhensible.
3. Google Places actif en production.
4. Ticketmaster actif en production.
5. Hôtels, restaurants, activités et événements réels remontent correctement.
6. Photos cohérentes avec les établissements.
7. Aucun faux fallback trompeur.
8. Pages Destination complètes.
9. Travel Match et messagerie 2.0 suffisamment stables.
10. Pipeline complet de validation réussi.

➡️ **Jalon : GlobeLink V11 Beta**

---

# 🟡 PHASE 3 — INTELLIGENCE GLOBELINK

## Statut : ⏳ À VENIR

L'IA ne doit pas être un simple chatbot : elle doit comprendre le contexte réel GlobeLink.

## GlobeLink AI 2.0

- ⏳ Localisation
- ⏳ Budget
- ⏳ Météo
- ⏳ Heure
- ⏳ Activités disponibles
- ⏳ Préférences
- ⏳ Offres GlobeLink
- ⏳ Voyageurs compatibles
- ⏳ Distances
- ⏳ Publications communautaires

## Fonctions IA ciblées

- ⏳ « Organise ma journée »
- ⏳ « Que faire autour de moi ? »
- ⏳ « Où manger ? »
- ⏳ « Trouve-moi une activité »
- ⏳ « Prépare mon voyage »
- ⏳ « Optimise mon itinéraire »
- ⏳ « Combien va me coûter mon voyage ? »

## Mode voyage

Pour un voyage enregistré, GlobeLink doit pouvoir proposer automatiquement :

- météo ;
- activités ;
- personnes compatibles ;
- offres ;
- événements ;
- publications locales ;
- checklist ;
- budget ;
- itinéraire.

## Travel Match intelligent

- ⏳ Recommandations personnalisées
- ⏳ Score de compatibilité intelligent
- ⏳ Explication lisible du score
- ⏳ Suggestions basées sur destination / dates / centres d'intérêt / activités

## Modération IA

- ⏳ Analyse automatique des lieux ajoutés
- ⏳ Conseil admin accepter / refuser / vérifier
- ⏳ Analyse IA visible uniquement pour l'administration

➡️ **Jalon : GlobeLink V11**

---

# 🟢 PHASE 4 — BUSINESS

## Statut : ⏳ À VENIR

## GlobeLink+

Possibilités prévues :

- ⏳ Travel Match avancé
- ⏳ IA avancée
- ⏳ Itinéraires illimités
- ⏳ Filtres supplémentaires
- ⏳ Fonctions premium voyage

Principe : ne pas bloquer trop tôt les fonctions essentielles gratuites.

## GlobeLink Business

Comptes professionnels ciblés :

- restaurants ;
- hôtels ;
- activités ;
- agences ;
- guides.

Fonctions :

- ⏳ Créer / revendiquer une fiche
- ⏳ Compte professionnel vérifié
- ⏳ Publier une offre
- ⏳ Apparaître sur la carte
- ⏳ Sponsoring clairement identifié
- ⏳ Réservations lorsque le cadre partenaire/API l'autorise
- ⏳ Tableau de bord professionnel
- ⏳ Analytics professionnels

## Analytics plateforme

- ⏳ Utilisateurs actifs
- ⏳ Rétention J1/J7/J30
- ⏳ Publications / stories
- ⏳ Matchs / messages
- ⏳ Voyages créés
- ⏳ Recherches
- ⏳ Utilisation carte
- ⏳ Utilisation IA
- ⏳ Conversion premium
- ⏳ Signalements

## Système de confiance

- ⏳ Profil complété
- ⏳ Email vérifié
- ⏳ Téléphone vérifié
- ⏳ Ancienneté
- ⏳ Avis
- ⏳ Signalements
- ⏳ Badge vérifié
- ⏳ Identité vérifiée éventuellement plus tard

➡️ **Jalon : GlobeLink V11.5**

---

# 🔵 PHASE 5 — MOBILE

## Statut : ⏳ À VENIR

Cette phase commence quand la version web est suffisamment stable.

- ⏳ Beta privée
- ⏳ TestFlight
- ⏳ Tests Android
- ⏳ Corriger les retours utilisateurs
- ⏳ Packaging iOS
- ⏳ Packaging Android
- ⏳ Notifications push
- ⏳ Permissions localisation
- ⏳ Permissions caméra
- ⏳ Permissions photos
- ⏳ Deep Links
- ⏳ Universal Links
- ⏳ Publication App Store
- ⏳ Publication Google Play

## Avant publication publique

- ⏳ Audit sécurité final
- ⏳ Tests RLS complets
- ⏳ Rate limiting et anti-spam
- ⏳ Monitoring frontend/backend/API externes
- ⏳ Conditions générales
- ⏳ Politique de confidentialité
- ⏳ Suppression et export des données
- ⏳ Consentement / RGPD
- ⏳ Politique de modération
- ⏳ Règles communautaires
- ⏳ Support

➡️ **Jalon : GlobeLink 1.0 Mobile**

---

# 🎯 PRIORITÉS IMMÉDIATES — 24 AOÛT 2026

1. Stabiliser et nettoyer la V11.0.13 sans régression.
2. Faire de la carte le cœur réel de GlobeLink.
3. Finaliser les pages Destination.
4. Nettoyer définitivement l'intégration Google Places + Ticketmaster.
5. Continuer avec Ticketmaster actif pendant que Google Places reste en attente.
6. Finaliser photos, catégories et fiches sans faux contenu.
7. Améliorer Travel Match et messagerie.
8. Finaliser onboarding et recherche universelle.
9. À la fin de la Phase 2, activer Google Maps Platform, débloquer Google Places et effectuer un test mondial.
10. Ne passer la Phase 2 en ✅ validée qu'après validation complète de la V11 Beta.

---

# 📌 ÉTAT SYNTHÉTIQUE

- GlobeLink V11.0.13-beta.1 en production : ✅
- Phase 1 — Stabilisation : ✅ VALIDÉE
- Phase 2 — Expérience utilisateur : 🟠 EN COURS
- Phase 3 — Intelligence GlobeLink : ⏳ À VENIR
- Phase 4 — Business : ⏳ À VENIR
- Phase 5 — Mobile : ⏳ À VENIR
- Connexion Google / Supabase : ✅
- Ticketmaster : ✅ ACTIF
- Google Places : 🟠 INTÉGRÉ / QUOTA BLOQUÉ / ACTIVATION REPORTÉE
- Carte et destinations : 🟠 À FINALISER
- Sources fiables et photos réelles : 🟠 EN FINALISATION

---

# 🏁 OBJECTIF FINAL

GlobeLink doit répondre en quelques secondes à quatre questions :

1. **📍 Qu'est-ce qu'il y a autour de moi ?**
2. **🎯 Qu'est-ce que je peux faire aujourd'hui ?**
3. **👥 Qui puis-je rencontrer ?**
4. **✈️ Comment organiser mon voyage ?**

Toutes les fonctionnalités doivent converger vers ces quatre usages au lieu de fonctionner comme une accumulation de fonctions séparées.
