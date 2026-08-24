# Configurer les APIs officielles du catalogue GlobeLink

GlobeLink V11.0.11 sait interroger des fournisseurs officiels cote serveur. Aucune de ces cles ne doit commencer par `VITE_`, car elles ne doivent jamais etre exposees au navigateur.

Utilise `CONFIGURATION_APIS_OFFICIELLES.env.example` comme modele, puis lance :

```bash
npm run check:apis
```

Sous Windows, tu peux aussi lancer directement :

```text
CONFIGURER_APIS_OFFICIELLES.bat
```

Ce diagnostic indique quels fournisseurs sont vraiment connectes. Les connecteurs peuvent etre installes dans le code sans retourner de donnees si les cles API ne sont pas renseignees.

## Hotels

Provider principal : Booking.com Demand API.

Variables :

- `BOOKING_API_TOKEN`
- `BOOKING_PARTNER_API_KEY` en secours si ton contrat Booking utilise ce nom
- `BOOKING_AFFILIATE_ID` optionnel
- `BOOKING_API_BASE_URL` optionnel, defaut `https://demandapi.booking.com/3.1`
- `BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT` optionnel

## Activites

Providers principaux : GetYourGuide et Tripadvisor.

Variables GetYourGuide :

- `GETYOURGUIDE_API_KEY`
- `GETYOURGUIDE_PARTNER_API_KEY` en secours
- `GETYOURGUIDE_API_BASE_URL` optionnel, defaut `https://api.getyourguide.com/1`

Variables Tripadvisor :

- `TRIPADVISOR_API_KEY`
- `TRIPADVISOR_API_BASE_URL` optionnel, defaut `https://api.content.tripadvisor.com/api/v1`

## Restaurants

Provider restaurant ajoute : Yelp Fusion API.

Variables :

- `YELP_API_KEY`
- `YELP_API_BASE_URL` optionnel, defaut `https://api.yelp.com/v3`

Google Places reste utilise pour les photos exactes et les restaurants de destination si `GOOGLE_PLACES_API_KEY` ou `GOOGLE_MAPS_API_KEY` est configure.

## Comportement sans cle API

Si une cle manque, GlobeLink ignore simplement le provider concerne. Pour eviter une carte vide pendant la configuration, l'application garde les sources tracables de secours deja disponibles, mais elle ne fabrique pas de fausses photos et ne reutilise pas de photo de destination comme photo d'etablissement.

Des que les cles Booking, Tripadvisor, GetYourGuide ou Yelp sont renseignees, ces APIs officielles passent en priorite.

## Synchronisation Supabase

Le job `sync-travel-catalog` importe aussi ces sources quand les memes variables sont configurees dans les secrets Supabase Edge Functions.
