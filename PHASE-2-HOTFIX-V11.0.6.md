# GlobeLink V11.0.6 Beta — Images de lieux et destinations

## Corrigé

- Toutes les destinations sont maintenant traitées : suppression de l'ancienne limite de 48 photos.
- Chaque pays utilise un monument emblématique contrôlé, par exemple la Tour Eiffel pour la France, la Statue de la Liberté pour les États-Unis et les pyramides de Gizeh pour l'Égypte.
- Les fiches destination affichent la même image emblématique que la grille Destinations.
- Le panneau pays de la carte n'utilise plus les anciennes couvertures génériques Unsplash.
- Les fiches d'établissement conservent désormais latitude, longitude, ville et pays afin de retrouver la photo exacte via Google Places.
- La recherche Google Places fonctionne aussi pour les établissements ajoutés avec seulement un nom, une ville et un pays.
- Les images privées ajoutées par les utilisateurs sont signées avant affichage dans la fiche lieu.
- Les hôtels, restaurants et activités du panneau pays passent par le même résolveur d'images fiable que la carte.
- Les fiches et cartes d'offres utilisent également les sources Google Places, site officiel, Wikimedia et Openverse.

## Sécurité contre les mauvaises images

- Les résultats Google restent contrôlés par nom, catégorie et proximité lorsque les coordonnées existent.
- Sans coordonnées, un résultat faible situé dans une autre ville ou un autre pays est rejeté.
- Les anciennes illustrations Unsplash ne sont jamais présentées comme photos vérifiées.
- Une image Wikimedia affiche son monument, sa source et son attribution.

## Validation

- Tests automatiques de couverture pour tous les pays actuellement présents dans GlobeLink.
- Tests explicites France / États-Unis / Égypte.
- Validation Phase 2 enrichie pour les fiches lieu, pays, destination et offre.
