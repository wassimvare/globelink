# GlobeLink V11.0.11 - APIs officielles catalogue

Cette version ajoute les connecteurs API demandes pour renforcer les sources du catalogue.

## Providers ajoutes

- Hotels : Booking.com Demand API.
- Activites : GetYourGuide Partner API.
- Activites : Tripadvisor Content API.
- Restaurants : Yelp Fusion API.
- Google Places reste disponible pour les restaurants et les photos exactes de lieux.

## Integration

- Nouveau module serveur `official-catalog-apis.functions.ts`.
- Priorite aux APIs officielles dans `fetchLiveCatalog`.
- Recherche viewport carte capable de tenter les APIs officielles avant les fallbacks.
- Job Supabase `sync-travel-catalog` capable d'importer Booking, Tripadvisor, GetYourGuide et Yelp.
- Les cles restent cote serveur et ne sont jamais declarees en `VITE_`.

## Securite et robustesse

- Si une cle manque, le provider concerne est ignore sans vider la carte.
- Les APIs officielles restent prioritaires quand leurs cles sont presentes.
- Les sources tracables de secours restent visibles pour eviter les ecrans vides pendant la configuration.
- Les images generiques restent bloquees : aucune photo de destination n'est reutilisee comme photo d'etablissement.
- Diagnostic `npm run check:apis` ajoute pour voir quelles cles sont vraiment configurees.
