# GlobeLink V11.0.8 - Sources specialisees

## Objectif

Les hotels, restaurants et activites utilisent maintenant une source specialisee par categorie,
tout en conservant la source brute du lieu pour verification.

## Changements

- Hotels : lien principal vers Booking.com.
- Restaurants : recherche restaurant-only via Yelp, avec Tripadvisor restaurants en secours.
- Activites : lien principal vers GetYourGuide, avec Tripadvisor activites en secours.
- Google Places reste prioritaire pour les coordonnees, les types de lieux et les photos.
- Les sites officiels restent utilises pour les photos, mais les liens de reservation ne sont plus
  confondus avec le site officiel.
- Les activites editoriales de tous les pays gardent Wikipedia comme preuve et ajoutent
  GetYourGuide comme lien de recherche/reservation.
- Un cache par source est prepare dans les tags (`source_cache_ttl_ms`) pour eviter les appels
  repetes.
- Les variables d'environnement partenaires sont documentees dans les tags :
  `BOOKING_PARTNER_API_KEY`, `GETYOURGUIDE_PARTNER_API_KEY`, `TRIPADVISOR_API_KEY`,
  `YELP_API_KEY`, `THEFORK_PARTNER_API_KEY`.

## Validation

- Phase 2 : 45/45 controles.
- Carte V12 photos fiables : 9/9.
- Carte V13 sources specialisees : 13/13.
- Toute la serie carte V2 a V13 passe en execution directe Node.

Les tests TypeScript/Vitest/build complets demandent `node_modules`. L'installation npm a ete
bloquee dans cet environnement par le cache npm local, donc l'archive exclut `node_modules`.
