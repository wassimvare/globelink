# GlobeLink V10.9.8 — Carte V9 — Couverture photos renforcée

## Objectif

Augmenter fortement la proportion d'hôtels, restaurants et activités avec une vraie image, sans réintroduire d'images génériques présentées comme celles du lieu.

## Résolution média

GlobeLink essaie désormais, dans cet ordre :

1. Média explicitement lié au POI OpenStreetMap / Wikimedia / Wikidata / Wikipedia.
2. Google Places Text Search avec nom + adresse + ville/pays.
3. Google Places Nearby Search autour des coordonnées exactes.
4. Fusion et classement des candidats par similarité du nom, distance, adresse, type et présence de photos.
5. Place Details uniquement lorsque le meilleur candidat n'a pas fourni de photo.
6. Site officiel connu par OpenStreetMap ou Google Places : `og:image`, `twitter:image` ou image schema.org.
7. Si une URL image OSM échoue réellement dans le navigateur, le résolveur de secours est déclenché au lieu de rester bloqué.
8. Si la photo Google échoue à son tour, GlobeLink relance le résolveur sans Google pour essayer site officiel puis sources ouvertes.
9. Nominatim / Wikidata / Openverse en derniers recours vérifiés.

## Sécurité du site officiel

Le serveur refuse localhost, les domaines internes et les IP privées, vérifie les DNS avant la requête, limite la taille HTML et revérifie chaque redirection. Il n'utilise qu'une image reliée au site officiel sélectionné.

## Coût Google Places

La fiche ne demande pas tous les champs Google. `Place Details` demande d'abord uniquement `photos`; `websiteUri` n'est demandé que si aucun site officiel n'est déjà connu. Cela évite de transformer chaque ouverture de fiche en requête Google coûteuse inutile.

## Limite réelle

Aucune source mondiale ne garantit une photo pour 100 % des POI. Si Google Places, le site officiel et les sources ouvertes ne possèdent aucune image exploitable, GlobeLink conserve le placeholder « Photo vérifiée non disponible » plutôt que d'afficher une fausse photo.
