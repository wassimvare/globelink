# GlobeLink V10.9.5 — Carte V6

## Objectif

Refondre la carte avec une ergonomie inspirée des meilleures applications cartographiques grand public, sans copier leur identité visuelle, et conserver les fonctions différenciantes GlobeLink.

## Changements principaux

### Recherche
- Barre de recherche principale toujours visible.
- Recherche déclenchée à la validation au lieu d'appeler les fournisseurs à chaque frappe.
- Effacement rapide de la recherche.
- Auto-centrage sur les résultats d'une destination recherchée.

### Catégories
- Barre principale simplifiée : Tout, Voyageurs, Offres, Restaurant, Hôtel, Activité, Plus.
- Les catégories secondaires sont déplacées sous le bouton Plus.
- Les filtres budget et tri restent disponibles sans surcharger l'écran principal.

### Carte
- Compteur de lieux directement sur la carte.
- Compteurs Offres et Voyageurs sur les grands écrans.
- Bouton Rechercher dans cette zone.
- Bouton Ma position directement sur la carte.
- Travel Match accessible depuis la carte mobile et desktop.
- Les marqueurs affichent le nom du lieu à fort niveau de zoom.
- Les gros repères pays disparaissent en vue ville pour limiter le bruit visuel.
- Clustering et chargement dynamique des POI conservés.
- Cache, catalogue Supabase, passe rapide OpenStreetMap et enrichissement complet conservés.

### Fiche lieu
- Bottom sheet sur mobile et panneau latéral sur desktop.
- La fiche n'affiche plus un énorme placeholder gris lorsqu'aucune photo réelle n'existe.
- Une photo n'est affichée que lorsqu'une référence média vérifiable existe.
- Actions rapides : Itinéraire, Enregistrer, Partager, Appeler et Site lorsque les données existent.
- Adresse, cuisine, horaires, note et budget affichés uniquement lorsqu'ils sont réellement disponibles.
- Source externe conservée en bas de la fiche.
- Bloc GlobeLink autour de ce lieu avec accès à Travel Match.

### Données OpenStreetMap enrichies
- Téléphone conservé côté navigateur et serveur lorsqu'il existe.
- Adresse construite depuis addr:housenumber, addr:street, addr:postcode et addr:city/town/village.
- Les références image/Wikimedia/Wikidata/Wikipedia de la V5 restent utilisées pour les photos réelles.

## Validation

- Phase 1 sécurité/stabilisation : 27/27.
- Carte V2 : 10/10.
- Carte V3 : 8/8.
- Carte V4 : 10/10.
- Carte V5 : 13/13.
- Carte V6 : 14/14.
- Parsing TypeScript/TSX des fichiers modifiés : aucune erreur de syntaxe détectée.

## Limite de validation de l'environnement

`npm ci` complet n'a pas terminé dans la fenêtre d'exécution disponible. Le contrôle `npm run check` reste configuré pour effectuer sécurité, validations carte, lint, typecheck, tests et build dès que les dépendances npm sont disponibles.
