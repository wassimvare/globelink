# GlobeLink V10.9.7 — Carte V8 Photos réelles

## Problème corrigé

OpenStreetMap sait très bien localiser un hôtel, un restaurant ou une activité, mais beaucoup de fiches OSM ne contiennent aucune photo. GlobeLink affichait donc correctement le lieu mais n'avait aucune image fiable à montrer.

## Nouveau résolveur photo

Quand une fiche de lieu s'ouvre, GlobeLink tente maintenant, dans cet ordre :

1. photo directement liée au POI OpenStreetMap ;
2. Wikimedia Commons / Wikidata / Wikipedia déjà référencés par le POI ;
3. Google Places (New) si `GOOGLE_PLACES_API_KEY` est configurée côté serveur ;
4. enrichissement Nominatim autour des coordonnées exactes ;
5. recherche Wikidata par nom + coordonnées avec validation de distance ;
6. Openverse, avec correspondance stricte du nom et de la ville.

Aucune image Unsplash/générique n'est utilisée comme si elle représentait l'établissement.

## Google Places : couverture recommandée pour hôtels/restaurants

Pour une couverture proche de Google Maps sur les établissements commerciaux, configure Google Places (New) :

1. active **Places API (New)** dans ton projet Google Cloud ;
2. active la facturation Google Maps Platform ;
3. crée une clé API autorisée pour Places API (New) ;
4. double-clique `CONFIGURER_PHOTOS_GOOGLE_PLACES.bat` ;
5. colle la clé ;
6. relance `LANCER_GLOBELINK.bat`.

La clé est enregistrée sous `GOOGLE_PLACES_API_KEY` sans préfixe `VITE_` : elle reste côté serveur.

Le script peut également tester la `GEMINI_API_KEY` déjà présente si elle est issue du même projet Google Cloud et autorisée à appeler Places API.

## Sécurité et exactitude

- la clé Google Places n'est jamais envoyée au navigateur ;
- les résultats Google/Wikidata sont comparés au nom du POI et à ses coordonnées ;
- un candidat trop éloigné ou dont le nom ne correspond pas est rejeté ;
- les attributions photo renvoyées par la source sont affichées ;
- aucune photo générique n'est substituée à une vraie photo manquante ;
- les URL de photo Google sont conservées uniquement en mémoire très brièvement et ne sont pas enregistrées en base.

## Contrôle

Lancer :

```bash
npm run check:map
```

La Carte V8 possède son contrôle `scripts/map-v8-check.mjs`.
