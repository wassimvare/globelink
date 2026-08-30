# GlobeLink — Feuille de route

_Mise à jour : 30 août 2026_

## Règle produit actuelle

**Aucune grosse nouvelle fonctionnalité avant la fin de la stabilisation.**
La priorité est de rendre les parcours déjà présents fiables, cohérents, rapides et propres sur mobile avant d'élargir le produit.

---

## Vue d'ensemble

| Phase | Statut | Objectif |
|---|---|---|
| 1. Architecture & source de vérité | ✅ Terminée | Nettoyer les patchs et stabiliser les données |
| 2. Authentification & navigation | ✅ Terminée | Routes protégées, connexion et navigation fiables |
| 3. Tests & CI | 🟡 Quasi terminée | E2E desktop/mobile opérationnels, finaliser les tests authentifiés en CI |
| 4. Domaines principaux | ✅ Terminée | Explorer, Voyage et Social séparés et cohérents |
| 5. Qualité des lieux | ✅ Terminée / surveillance | Déduplication, qualité, photos/logos fiables |
| 6. Carnet de voyage | ✅ Fonctionnel / stabilisation | Programme réellement jour par jour, choix et budgets cohérents |
| 7. IA gratuite & IA+ | ✅ Fonctionnel / stabilisation | Deux niveaux IA simples à comprendre et intégrés au carnet |
| 8. UX mobile & cohérence UI | 🔵 Priorité actuelle | Rendre toute l'app propre et évidente sur iPhone/Android |
| 9. Bêta privée & analytics | ⏳ À lancer | Tester avec de vrais utilisateurs et mesurer les blocages |
| 10. Sécurité & fiabilité production | ⏳ À faire | Durcir permissions, erreurs, performances et récupération |
| 11. Monétisation | ⏳ Après bêta | Finaliser IA+, limites gratuites et abonnement |
| 12. V1 publique | ⏳ Finale | Publication d'une version stable et exploitable |

---

# Phase 1 — Architecture & source de vérité ✅

- Suppression des anciens patchs temporaires.
- Réduction des sources de données concurrentes.
- Données de voyage centralisées autour du carnet.
- Nettoyage des incohérences provoquées par les anciennes migrations.

**Statut : terminé.**

---

# Phase 2 — Authentification & navigation ✅

- Routes publiques/privées clarifiées.
- Navigation desktop/mobile stabilisée.
- Tests des parcours principaux de connexion.
- Gestion des utilisateurs connectés sur les pages sensibles.

**Statut : terminé.**

---

# Phase 3 — Tests & CI 🟡

Déjà réalisé :
- Tests E2E desktop/mobile.
- Parcours principaux couverts.
- CI et validations automatiques opérationnelles.
- Régressions importantes du carnet couvertes par des tests.

À finir :
- Réactiver/compléter les scénarios authentifiés qui dépendent encore des secrets GitHub manquants.
- Ajouter systématiquement un test de non-régression après chaque bug critique utilisateur.

**Objectif de sortie : aucune correction critique sans test associé.**

---

# Phase 4 — Explorer / Voyage / Social ✅

- Séparation claire des domaines fonctionnels.
- Explorer devient la source de découverte.
- Le carnet devient la source du voyage utilisateur.
- Le social reste indépendant du moteur de planification.

**Statut : terminé.**

---

# Phase 5 — Qualité des lieux ✅ / surveillance

Déjà réalisé :
- Filtrage qualité.
- Déduplication.
- Amélioration des photos.
- Suppression des favicons WordPress/Google utilisés comme faux logos.
- Utilisation de vrais logos d'établissement quand ils sont vérifiables.
- Fallback plus propre lorsqu'aucune vraie photo n'est disponible.

À surveiller :
- Pays/destinations encore mal illustrés.
- Fiches sans image réelle.
- Temps de chargement de certaines destinations.
- Cohérence entre Explorer, fiches établissement et carte.

---

# Phase 6 — Carnet de voyage ✅ / stabilisation

Déjà réalisé :
- Programme affiché **jour par jour**.
- Chaque journée possède son propre contenu.
- Choix hôtel / déjeuner / dîner / activités persistants.
- Un seul choix actif par section lorsque nécessaire.
- Budgets répartis par date et synchronisés avec les choix réels.
- IA+ capable d'appliquer ses propositions au carnet.
- Le “prochain voyage” de l'accueil est maintenant dérivé du carnet.
- Un voyage finalisé ne doit plus rester affiché comme voyage actif.
- Échec explicite de la finalisation si le statut du voyage n'est pas réellement sauvegardé.
- Tests de régression ajoutés autour des voyages finalisés.

Reste à verrouiller :
- Aucun jour vide lorsqu'un programme existe réellement.
- Ajout/suppression de journée toujours fiable.
- Aucune duplication d'un même programme sur plusieurs jours.
- Cohérence parfaite entre dates du voyage, jours du carnet et budget.
- Affichage mobile plus lisible des cartes et comparaisons.

**Critère de validation : on doit pouvoir créer, modifier, finaliser puis rouvrir un voyage sans incohérence.**

---

# Phase 7 — IA gratuite & IA+ ✅ / stabilisation

Structure retenue :
- **IA gratuite** : aide simple, rapide, compréhensible.
- **IA+** : planification complète et avancée.

Déjà réalisé :
- Suppression de la confusion créée par plusieurs menus IA.
- IA+ structurée par journée.
- Suggestions hôtel / activités / déjeuner / dîner.
- Comparaisons lorsque plusieurs options sont pertinentes.
- Budget par jour et budget global.
- Synchronisation du budget IA+ avec les choix réellement appliqués au carnet.
- Métadonnées de prévision budgétaire enregistrées.
- Meilleure résistance aux timeouts Gemini.

À finir :
- UX de chargement et d'erreur encore plus claire.
- Éviter toute journée vide ou réponse partiellement exploitable.
- Dégrader proprement vers une réponse simple si l'IA complète échoue.
- Vérifier que toutes les cartes IA+ possèdent une action claire vers le carnet.

---

# Phase 8 — UX mobile & cohérence UI 🔵 PRIORITÉ ACTUELLE

## 8.1 Mobile 10/10
- Vérification écran par écran sur iPhone.
- Vérification Android.
- Plus aucun contenu qui déborde de l'écran.
- Bottom sheets/modales toujours accessibles.
- Boutons suffisamment grands et cohérents.
- Espacements, titres et cartes harmonisés.

## 8.2 Actions sociales cohérentes
- Menu **•••** sur les publications.
- Menu **•••** sur le profil d'un autre utilisateur uniquement.
- Actions : Restreindre, Bloquer, Signaler, Annuler.
- Aucun bouton d'action inutilement séparé lorsque le menu ••• suffit.

## 8.3 Cartes et actions IA
- Bouton IA+ présent sur toutes les cartes concernées.
- Design identique entre Explorer, carnet et IA+.
- États chargement / vide / erreur harmonisés.

## 8.4 Paramètres
- Organiser les paramètres sur le modèle d'une application sociale mature : compte, confidentialité, sécurité, notifications, contenu, aide.
- Ne pas surcharger la première version : uniquement les réglages réellement fonctionnels.

**Sortie de phase : aucune capture utilisateur ne doit montrer un élément cassé, décalé, incompréhensible ou contradictoire.**

---

# Phase 9 — Bêta privée & analytics ⏳

- Bêta privée avec **10 à 20 utilisateurs**.
- Tableau analytics utilisable et lisible.
- Mesurer :
  - inscription → premier voyage ;
  - création du carnet ;
  - utilisation IA gratuite ;
  - ouverture IA+ ;
  - ajout au carnet ;
  - finalisation du voyage ;
  - rétention ;
  - erreurs techniques.
- Prévoir un vrai espace de remontée de bugs bêta.
- Prioriser les corrections selon fréquence + gravité.

**Pas de monétisation agressive avant d'avoir validé que le parcours principal fonctionne avec de vrais utilisateurs.**

---

# Phase 10 — Sécurité & fiabilité production ⏳

- Vérification complète des permissions Supabase/RLS.
- Blocage/restreindre/signaler réellement appliqués côté données.
- Protection des routes admin.
- Validation stricte des uploads.
- Gestion des erreurs réseau/API.
- Timeouts et retry contrôlés.
- Monitoring des erreurs production.
- Suppression des données de test et scripts temporaires.
- Audit performances mobile.

---

# Phase 11 — Monétisation ⏳

À lancer seulement après validation de la bêta.

- Définir précisément les limites de l'IA gratuite.
- Définir les avantages IA+.
- Éviter les paywalls ambigus.
- Afficher clairement ce qui est gratuit et ce qui est premium.
- Préparer abonnement, gestion du statut premium et restauration des achats.

---

# Phase 12 — V1 publique ⏳

Checklist finale :
- Carnet stable.
- IA fiable.
- Destinations et images propres.
- Mobile validé.
- Sécurité validée.
- Analytics actif.
- Parcours bêta corrigé.
- Monétisation compréhensible.
- Mentions légales / confidentialité / support.
- Aucun bug critique ouvert.

---

# Ordre de travail immédiat

1. **Finir la stabilisation du carnet** — jours, finalisation, prochain voyage, ajout/suppression, budgets.
2. **Terminer l'UX mobile 10/10** — écrans, cartes, menus •••, modales, boutons IA+.
3. **Nettoyer les derniers problèmes de destinations/images/logos.**
4. **Finaliser les tests authentifiés et les régressions critiques.**
5. **Lancer la bêta privée 10–20 utilisateurs.**
6. **Exploiter les analytics et corriger les vrais points de friction.**
7. **Audit sécurité/performance.**
8. **Seulement ensuite : monétisation IA+ puis V1 publique.**

---

## Priorité absolue actuelle

> GlobeLink n'a pas besoin de plus de fonctionnalités pour l'instant. Il a besoin que les fonctionnalités déjà présentes donnent une impression de produit fini.
