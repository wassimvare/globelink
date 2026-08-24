# GlobeLink V10.9.6 — Carte V7 : Tout + couverture mondiale

## Correctifs

- `Tout` signifie maintenant réellement **tout** : voyageurs + offres + toutes les catégories de lieux.
- Quand `Tout` est actif, les boutons Restaurant, Hôtel, Activité, Offres et les catégories secondaires apparaissent eux aussi comme sélectionnés.
- Cliquer sur une catégorie depuis `Tout` l'isole réellement et masque les voyageurs, comme sur une application cartographique grand public.
- Cliquer sur `Voyageurs` depuis `Tout` isole les voyageurs ; un second clic revient à `Tout`.

## Couverture mondiale instantanée

- Ajout de **107 zones de découverte** réparties en Amérique du Nord, Amérique du Sud, Europe, Afrique, Moyen-Orient, Asie et Océanie.
- Ces points bleus sont disponibles immédiatement, sans attendre une requête OpenStreetMap mondiale.
- Ils ne falsifient pas le nombre de POI :
  - si GlobeLink possède déjà des lieux chargés autour d'une ville, le point peut afficher leur nombre réel ;
  - sinon il affiche simplement un point bleu.
- Cliquer sur un point zoome vers la ville, puis le chargeur viewport existant récupère les vrais restaurants, hôtels, activités, etc.

## Pourquoi cette approche

Interroger OpenStreetMap pour le monde entier à chaque ouverture serait lent, coûteux et fragile. La V7 affiche donc une couche mondiale instantanée de destinations, puis charge les vraies données uniquement dans la zone explorée — le même principe de chargement progressif utilisé par les applications cartographiques modernes.
