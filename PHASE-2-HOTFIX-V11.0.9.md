# GlobeLink V11.0.9 - Sources officielles strictes

## Correction

- Les hotels, restaurants et activites externes sont maintenant affiches seulement si la source passe la regle stricte.
- Hotel: source Booking.com verifiee avec photo officielle.
- Restaurant: source Google Maps/Google Places ou source restaurant partenaire verifiee avec photo exacte.
- Activite: source GetYourGuide ou Tripadvisor verifiee avec photo officielle.
- Les liens generes vers Booking.com, Yelp, GetYourGuide ou Tripadvisor restent des liens de recherche: ils ne valident plus une fiche OpenStreetMap.
- Les photos de destination ne sont plus utilisees comme secours pour une fiche d'etablissement.
- Les fallbacks OpenStreetMap, Openverse, Wikidata/Nominatim par simple nom et catalogue editorial ne peuvent plus creer une fiche commerciale non verifiee.

## Validation

- Securite: OK.
- Phase 1: 27/27.
- Phase 2: 45/45.
- Carte V2 a V14: OK.
- TypeScript: OK.
- ESLint: OK.
- Tests: 50/50.
- Build production: OK.
