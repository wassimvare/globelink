# GlobeLink — configuration des API voyage

GlobeLink utilise désormais deux fournisseurs externes depuis le serveur uniquement :

- **Google Places API (New)** : restaurants, hôtels, attractions et photos de fiches Google.
- **Ticketmaster Discovery API** : événements géolocalisés.

Aucune clé secrète ne doit être préfixée par `VITE_` ni être copiée dans du code React.

## Variables d'environnement

À configurer dans l'environnement serveur de déploiement et dans `.env.local` pour le développement local :

```bash
GOOGLE_PLACES_API_KEY=
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

GlobeLink utilise Google Places comme source vérifiée unique pour les établissements et lieux touristiques :

- restaurants ;
- hôtels ;
- activités et attractions ;
- coordonnées ;
- notes et nombre d'avis lorsque Google les fournit ;
- horaires lorsque Google les fournit ;
- photos de la fiche établissement.

GlobeLink utilise Text Search (New) avec un field mask explicite, puis Place Photos (New). Lorsqu'une photo contient une attribution obligatoire, l'interface l'affiche sous la photo.

## 2. Ticketmaster Discovery API

1. Créer un compte sur le portail développeur Ticketmaster.
2. Ouvrir l'application créée par défaut ou créer une application.
3. Copier le **Consumer Key / API Key** dans `TICKETMASTER_API_KEY`.

GlobeLink interroge Discovery API v2 pour les événements autour de la zone chargée et récupère notamment le lieu, la date, les images, le lien officiel et les prix lorsqu'ils sont fournis.

## Vérification dans GlobeLink

Ouvrir `/map` :

- les pastilles **Google / Ticketmaster** indiquent si chaque source est configurée et répond ;
- saisir une ville ou un pays pour lancer une recherche vérifiée ;
- utiliser **Autour de moi** pour rechercher près de la position de l'utilisateur ;
- chaque fiche affiche sa source et un lien officiel lorsqu'il est fourni ;
- lorsqu'aucune photo vérifiée n'existe, GlobeLink affiche `Photo vérifiée indisponible` au lieu d'une image générique.

## Répartition des sources

| Contenu | Source |
| --- | --- |
| Hôtels | Google Places |
| Restaurants | Google Places |
| Activités / attractions | Google Places |
| Événements / concerts / spectacles | Ticketmaster |

## Règle de fiabilité

Les résultats issus de ces intégrations ne sont affichés que lorsqu'ils proviennent effectivement de la réponse d'un fournisseur. GlobeLink ne fabrique ni note, ni prix, ni photo de remplacement pour ces fiches.
