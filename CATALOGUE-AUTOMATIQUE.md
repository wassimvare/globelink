# Catalogue internet automatique — GlobeLink V9

## Fonctionnement

GlobeLink enregistre dans Supabase un catalogue séparé des contenus publiés par la communauté :

- activités, restaurants et hôtels issus d’OpenStreetMap via Overpass ;
- offres d’activités avec prix et lien de réservation via Amadeus lorsque ses identifiants sont configurés ;
- bons plans web optionnels via Tavily, toujours marqués « à vérifier ».

La fonction Supabase `sync-travel-catalog` collecte les données, les normalise, évite les doublons puis retire les offres expirées. Un passage quotidien est planifié à 04:15 UTC. Les offres sont contrôlées chaque jour sur toutes les zones activées. Pour respecter le service public Overpass, les lieux OpenStreetMap sont renouvelés par rotation sur quatre zones à chaque passage.

## Installation rapide

En local Windows, le catalogue est installé automatiquement au premier lancement
de `LANCER_GLOBELINK.bat` : migrations, fonction Supabase, secret de
synchronisation, planning quotidien et première collecte.

Si Supabase demande une connexion, elle n'est nécessaire qu'une seule fois. Les
identifiants Amadeus et/ou Tavily sont enregistrés automatiquement s'ils existent
déjà dans `.env`. Le script manuel `INSTALLER_CATALOGUE_AUTO.bat` reste
disponible en dépannage.

OpenStreetMap fonctionne sans clé. Sans fournisseur d’offres configuré, les lieux sont alimentés automatiquement mais la rubrique « Offres du moment » reste vide plutôt que d’afficher de fausses promotions.

## Administration

Dans `Administration > Catalogue web`, un administrateur peut :

- déclencher une synchronisation immédiate ;
- activer ou réactiver le planning quotidien ;
- ajouter ou supprimer une zone de recherche ;
- filtrer les résultats par activité, restaurant, hôtel ou offre ;
- ouvrir la source originale ;
- supprimer un élément.

Lorsqu’un élément externe est supprimé, son identifiant fournisseur est ajouté à `external_catalog_blocks`. Il est donc supprimé du catalogue public et ne sera pas réimporté lors des collectes suivantes.

## Données et transparence

Les résultats externes affichent leur fournisseur et un lien vers la source. GlobeLink ne doit pas présenter un prix, un horaire ou une disponibilité comme garanti. Les offres expirent rapidement et sont remplacées lors du prochain passage.

OpenStreetMap reste soumis à l’ODbL et doit être attribué. Les cartes et fiches conservent l’attribution et le lien vers l’objet d’origine.

## Secrets

Ces valeurs doivent être enregistrées dans les secrets Supabase Edge Functions, jamais dans le navigateur ou GitHub :

- `CATALOG_SYNC_SECRET` ;
- `AMADEUS_CLIENT_ID` ;
- `AMADEUS_CLIENT_SECRET` ;
- `TAVILY_API_KEY`.

Le script d’installation les enregistre avec `supabase secrets set`. La clé `service_role` n’est pas ajoutée au projet.
