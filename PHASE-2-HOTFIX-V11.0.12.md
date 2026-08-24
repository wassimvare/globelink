# GlobeLink V11.0.12 - APIs configurees sans carte vide

Cette version corrige le cas ou tout devenait vide quand les cles API officielles n'etaient pas encore renseignees.

## Corrections

- Les connecteurs Booking.com, Tripadvisor, GetYourGuide et Yelp restent installes cote serveur.
- Ajout du diagnostic `npm run check:apis`.
- Ajout du modele `CONFIGURATION_APIS_OFFICIELLES.env.example`.
- Ajout de `CONFIGURER_APIS_OFFICIELLES.bat` pour remplir `.env.local` sur Windows.
- Envoi de `BOOKING_AFFILIATE_ID` dans les headers Booking quand il est configure.
- Les sources officielles passent en priorite quand les cles sont presentes.
- Sans cles, la carte et les destinations gardent les sources tracables de secours au lieu d'afficher zero partout.
- Les fausses photos restent bloquees : aucune photo de destination n'est reutilisee comme photo d'etablissement.

## Important

Les cles API ne sont pas incluses dans le ZIP. Elles doivent etre ajoutees dans `.env.local` en local et dans les secrets de production/Supabase pour que les fournisseurs officiels retournent des donnees.
