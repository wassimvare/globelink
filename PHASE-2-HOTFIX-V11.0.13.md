# GlobeLink V11.0.13 - Assistant de configuration API

Cette version ajoute une aide concrete pour configurer les cles API sans les coller dans le chat.

## Corrections

- Ajout de `CONFIGURER_APIS_OFFICIELLES.bat`.
- Ajout de `CONFIGURER_APIS_OFFICIELLES.ps1`.
- Le script cree ou met a jour `.env.local` localement.
- Les cles sont saisies en mode masque dans PowerShell.
- `npm run check:apis` est lance apres configuration.
- Booking envoie maintenant `X-Affiliate-Id` si `BOOKING_AFFILIATE_ID` est configure.

## Rappel

Les vraies cles API doivent etre recuperees dans les portails officiels Booking.com, Tripadvisor, GetYourGuide, Yelp et Google Cloud. Elles ne sont jamais incluses dans le ZIP.
