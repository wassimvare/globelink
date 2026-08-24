# GlobeLink V11.0.10 - contenu visible et sources verifiables

Cette version corrige la regression de la V11.0.9 qui vidait la carte, les restaurants, les hotels et les activites en appliquant la regle "source officielle stricte" trop tot dans le flux.

## Corrections

- Restauration des flux live OpenStreetMap, Google destination catalog et catalogue navigateur.
- Nouveau filtre `trusted-visible` : un lieu peut etre affiche s'il est tracable, geolocalise et dans une categorie utile.
- Conservation du filtre strict officiel pour les vraies lignes Booking.com, Google Places, GetYourGuide et Tripadvisor.
- Suppression des categories parasites : pharmacie, distributeur, bar, pub et nightclub.
- Restaurants routes vers Google Maps en priorite, avec Uber Eats et Tripadvisor en sources de verification secondaires.
- Hotels routes vers Booking.com.
- Activites routees vers GetYourGuide et Tripadvisor.
- Les fiches d'etablissement n'utilisent plus les photos de destination comme photo de lieu.
- Si aucune photo exacte n'est trouvee, la fiche affiche un etat sans image verifiee au lieu d'une fausse photo.

## Validation

- Ajout du controle `map-v15-check.mjs` pour empecher une nouvelle regression "tout est vide".
- Les controles V14/V15 verifient que la carte utilise le filtre visible, que les flux sont actifs et que les mauvaises categories ne sont plus requetees.
