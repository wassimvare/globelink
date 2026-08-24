# GlobeLink — configuration des API voyage

GlobeLink utilise désormais trois fournisseurs externes depuis le serveur uniquement :

- **Google Places API (New)** : restaurants, hôtels, attractions et photos de fiches Google.
- **Amadeus Self-Service** : catalogue d'hôtels et Tours & Activities.
- **Ticketmaster Discovery API** : événements géolocalisés.

Aucune clé secrète ne doit être préfixée par `VITE_` ni être copiée dans du code React.

## Variables d'environnement

À configurer dans l'environnement serveur de déploiement et dans `.env.local` pour le développement local :

```bash
GOOGLE_PLACES_API_KEY=
AMADEUS_API_KEY=
AMADEUS_API_SECRET=
AMADEUS_ENV=test
TICKETMASTER_API_KEY=
```

Ne commitez jamais `.env.local`.

## 1. Google Places API (New)

1. Créer ou sélectionner un projet Google Cloud.
2. Activer la facturation du projet.
3. Activer **Places API (New)**.
4. Créer une clé API.
5. Restreindre la clé à l'API Places et, côté infrastructure, aux usages autorisés pour GlobeLink.
6. Copier la valeur dans `GOOGLE_PLACES_API_KEY` côté serveur.

GlobeLink utilise Text Search (New) avec un field mask explicite, puis Place Photos (New). Lorsqu'une photo contient une attribution obligatoire, l'interface l'affiche sous la photo.

## 2. Amadeus Self-Service

1. Créer un compte sur Amadeus for Developers.
2. Créer une application Self-Service.
3. Copier **API Key** dans `AMADEUS_API_KEY`.
4. Copier **API Secret** dans `AMADEUS_API_SECRET`.
5. Laisser `AMADEUS_ENV=test` pendant les essais.
6. Après activation de l'environnement de production Amadeus, passer à `AMADEUS_ENV=production`.

GlobeLink récupère un token OAuth côté serveur, puis interroge Hotel List par géocode et Tours & Activities autour de la zone recherchée.

## 3. Ticketmaster Discovery API

1. Créer un compte sur le portail développeur Ticketmaster.
2. Ouvrir l'application créée par défaut ou créer une application.
3. Copier le **Consumer Key / API Key** dans `TICKETMASTER_API_KEY`.

GlobeLink interroge Discovery API v2 pour les événements autour de la zone chargée.

## Vérification dans GlobeLink

Ouvrir `/map` :

- les pastilles **Google / Amadeus / Ticketmaster** indiquent si chaque source est configurée et répond ;
- saisir une ville ou un pays pour lancer une recherche vérifiée ;
- utiliser **Autour de moi** pour rechercher près de la position de l'utilisateur ;
- chaque fiche affiche sa source et un lien officiel lorsqu'il est fourni ;
- lorsqu'aucune photo vérifiée n'existe, GlobeLink affiche `Photo vérifiée indisponible` au lieu d'une image générique.

## Règle de fiabilité

Les résultats issus de ces intégrations ne sont affichés que lorsqu'ils proviennent effectivement de la réponse d'un fournisseur. GlobeLink ne fabrique ni note, ni prix, ni photo de remplacement pour ces fiches.
