# GlobeLink V11.0.4 — Destinations réelles

## Corrigé

- La page Destination n'attend plus uniquement les miroirs Overpass publics.
- Google Places (clé serveur existante) fournit en priorité les restaurants, hôtels et activités autour du hub urbain réel de la destination.
- Tunisie utilise le hub Tunis (36.8065, 10.1815).
- Les résultats Google conservent la référence photo exacte du vrai établissement.
- CatalogImage résout directement cette référence côté serveur, sans exposer GOOGLE_PLACES_API_KEY.
- OpenStreetMap reste un fallback gratuit si Google Places n'est pas disponible.
- Les cartes de l'explorateur Destinations n'utilisent plus de paysages Unsplash génériques pour les pays sans vraie photo.
- Les couvertures Unsplash historiques sont refusées comme photo vérifiée de destination.
- Sans couverture réellement enregistrée, GlobeLink affiche un visuel de destination neutre plutôt qu'une fausse image.

## Validation

- Sécurité : OK
- Phase 1 : 27/27
- Phase 2 : 31/31
- Carte V2 → V12 : OK
- 163 fichiers TS/TSX : 0 erreur de syntaxe

## Configuration

La clé Google Places reste serveur uniquement. Le ZIP n'embarque aucun `.env` ni aucune clé API. Le lanceur GlobeLink conserve le mécanisme de récupération de `GOOGLE_PLACES_API_KEY` ajouté aux versions précédentes.
