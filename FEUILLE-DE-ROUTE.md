# Feuille de route GlobeLink

Dernière mise à jour : **24 août 2026**  
Version de référence : **V11.0.13-beta.1**  
Production : **https://globelink-theta.vercel.app**

## Vue d'ensemble

| Phase | Statut | Objectif |
|---|---|---|
| Phase 1 — Stabilisation | ✅ Validée | Sécurité, Supabase, auth, messagerie, Travel Match, base technique fiable |
| Phase 2 — Expérience utilisateur & catalogue voyage | 🟠 Finalisation | Carte, destinations, hôtels/restaurants/activités, photos réelles, sources officielles |
| Phase 3 — Intelligence, croissance & monétisation | ⏳ À venir | IA voyage, recommandations avancées, comptes pro, revenus, lancement public |

---

# Phase 1 — Stabilisation

## Statut : ✅ VALIDÉE

Éléments validés :

- ✅ Sécurité de base et garde-fous du projet
- ✅ Supabase et RLS sur les zones critiques
- ✅ Connexion email / mot de passe
- ✅ Connexion Google via Supabase
- ✅ Redirection OAuth Google corrigée vers la production Vercel
- ✅ Client Supabase compatible avec le build Vercel
- ✅ Travel Match
- ✅ Messagerie et création de conversation après match
- ✅ Notifications principales
- ✅ Protection des secrets côté serveur
- ✅ Déploiement Vercel fonctionnel sur la bonne base V11.0.13

Références de validation existantes : `VALIDATION-PHASE1.md` et contrôles Phase 1 du projet.

---

# Phase 2 — Expérience utilisateur & catalogue voyage

## Statut : 🟠 EN FINALISATION

### Carte et navigation

- ✅ Carte mondiale intégrée
- ✅ Recherche et géolocalisation
- ✅ Pages destinations / pays
- ✅ Gestion des points et fiches lieux
- ✅ Correctifs performance carte V2 à V12 conservés
- ✅ Version V11.0.13 remise comme base officielle de production

### Sources officielles

#### Ticketmaster

- ✅ `TICKETMASTER_API_KEY` configurée côté Vercel
- ✅ API Ticketmaster branchée dans GlobeLink
- ✅ Test réel réussi en production
- ✅ Événements retournés par l'API

**Statut : ACTIF**

#### Google Places

- ✅ `GOOGLE_PLACES_API_KEY` configurée côté Vercel
- ✅ Google Places branché dans la V11
- ✅ Appels conservés côté serveur pour ne pas exposer la clé
- ✅ Clé reconnue par Google
- ❌ Requêtes actuellement bloquées par Google : quota `SearchTextRequest per day`
- ⏸ Activation complète Google Maps Platform / facturation reportée à la fin du projet

**Statut : INTÉGRÉ MAIS BLOQUÉ PAR LE QUOTA GOOGLE**

### Catalogue cible

Lorsque Google Places sera débloqué :

- 🏨 Hôtels → Google Places
- 🍴 Restaurants → Google Places
- 📍 Attractions / lieux / activités locales → Google Places
- 🎟 Événements / concerts / spectacles → Ticketmaster

Règle produit obligatoire :

> **Pas de source fiable = ne pas afficher le lieu. Pas de photo vérifiée = ne pas inventer de photo.**

### Photos et qualité des données

- 🟠 Finaliser l'utilisation systématique des photos fournisseurs
- 🟠 Vérifier qu'aucune ancienne image générique/fallback trompeuse ne remonte
- 🟠 Vérifier les attributions Google lorsque Google Places sera activé
- 🟠 Tester plusieurs villes/pays après déblocage du quota Google
- 🟠 Éliminer les anciens libellés Booking / Tripadvisor / GetYourGuide s'ils apparaissent encore dans l'interface

### Dette technique à nettoyer

- 🟠 Intégrer définitivement les fichiers Google Places + Ticketmaster dans les sources du projet au lieu de dépendre du mécanisme de patch de build
- 🟠 Nettoyer `.v11-api-payload` et les scripts temporaires une fois l'intégration stabilisée
- 🟠 Garder `npm run check:apis` uniquement comme contrôle manuel
- 🟠 Lancer une validation complète `npm run check` sur la V11 après nettoyage

## Critères pour passer la Phase 2 en ✅ VALIDÉE

La Phase 2 sera considérée comme terminée uniquement lorsque :

1. Google Places répond réellement en production sans erreur de quota.
2. Ticketmaster répond en production.
3. Hôtels, restaurants, activités et événements remontent sur la carte.
4. Les photos affichées correspondent réellement aux établissements.
5. Aucun ancien fournisseur non configuré ne génère de faux résultats.
6. Aucun secret API n'est exposé côté navigateur.
7. Les pages destinations et la carte restent rapides et sans régression.
8. Le pipeline complet de validation passe.

---

# Phase 3 — Intelligence, croissance & monétisation

## Statut : ⏳ À VENIR

Priorités prévues :

### IA voyage

- ⏳ Recommandations personnalisées selon profil, budget et préférences
- ⏳ Assistant de création d'itinéraire
- ⏳ Analyse des lieux ajoutés par les utilisateurs
- ⏳ Conseil IA admin : accepter / refuser / vérifier un lieu
- ⏳ L'analyse IA de modération reste invisible pour l'utilisateur final

### Expérience sociale

- ⏳ Finaliser stories photo/vidéo
- ⏳ Finaliser publications vidéo
- ⏳ Améliorer Travel Match
- ⏳ Appels audio/vidéo
- ⏳ Améliorer profils, feed et interactions

### Professionnels

- ⏳ Comptes établissements / entreprises
- ⏳ Gestion d'offres par les professionnels
- ⏳ Vérification des comptes professionnels
- ⏳ Statistiques et tableau de bord pro

### Monétisation

- ⏳ Définir modèle économique
- ⏳ Offres sponsorisées clairement identifiées
- ⏳ Abonnement premium éventuel
- ⏳ Commissions / affiliation uniquement avec partenaires autorisés

### Pré-lancement

- ⏳ Audit sécurité final
- ⏳ Audit performance
- ⏳ Tests mobiles iOS / Android / PWA
- ⏳ Tests utilisateurs
- ⏳ CGU / confidentialité / mentions légales
- ⏳ Monitoring erreurs et disponibilité
- ⏳ Domaine définitif
- ⏳ Préparation lancement public

---

# Priorités immédiates

Ordre de travail recommandé à partir du 24 août 2026 :

1. **Continuer les corrections UX et bugs de la V11 sans toucher au quota Google pour l'instant.**
2. **Nettoyer définitivement l'intégration Google Places + Ticketmaster dans le code source.**
3. **Tester et corriger les affichages Ticketmaster.**
4. **Finaliser carte, destinations et photos sans faux contenu.**
5. **À la fin : activer la facturation Google Maps Platform, débloquer Google Places et faire le test mondial.**
6. **Passer la Phase 2 en validée uniquement après ce test final.**
7. **Commencer ensuite la Phase 3.**

---

# État synthétique au 24 août 2026

- GlobeLink V11.0.13 en production : ✅
- Supabase : ✅
- Connexion Google : ✅
- Ticketmaster : ✅
- Google Places : 🟠 intégré / quota bloqué
- Carte et destinations : 🟠 à finaliser et retester
- Sources fiables / photos réelles : 🟠 en finalisation
- Phase 1 : ✅
- Phase 2 : 🟠
- Phase 3 : ⏳
