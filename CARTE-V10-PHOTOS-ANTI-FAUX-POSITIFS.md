# GlobeLink V10.9.9 — Carte V10 — Photos anti-faux-positifs

## Problème corrigé

Une fiche de **Novotel Cornellà** pouvait afficher le logo **Parclick** comme si Parclick était le site officiel de l’hôtel. Le fallback `og:image` acceptait jusqu’ici un site OSM/Google sans vérifier assez strictement l’identité de l’établissement.

## Corrections

- Rejet explicite des plateformes tierces de réservation, parking, avis et agrégation (dont Parclick, Booking, TripAdvisor, Expedia, TheFork, Parkopedia, etc.) pour le fallback « site officiel ».
- Le site renvoyé par Google Places est essayé avant le lien brut OpenStreetMap.
- Vérification de l’identité de la page avant d’utiliser `og:image` : `og:title`, `twitter:title`, `<title>`, `<h1>` et noms schema.org sont comparés au nom réel du lieu.
- Matching Google Places plus strict pour hôtels/restaurants : nom + distance + type obligatoire.
- Jusqu’à 4 candidats Google proches et jusqu’à 3 photos par candidat peuvent être essayés.
- Si une image principale échoue dans le navigateur, le fallback suivant est déclenché quelle que soit la source.
- Le fallback secondaire peut désormais ignorer à la fois Google et le site officiel pour éviter les boucles.
- Invalidation du cache média (`verified-place-media-v4`).

## Règle produit

GlobeLink préfère afficher **aucune photo** plutôt qu’une image d’un établissement, parking, plateforme ou marque qui ne correspond pas au lieu sélectionné.
