# Catalogue et photos sur le Raspberry

Le site consulte le catalogue local avant les sources publiques, puis Google en
secours. Les pages Destinations n'appellent Google que pour les catégories encore
insuffisantes. Les résultats OpenStreetMap obtenus côté serveur sont enregistrés
dans `external_catalog_items` ; les données et photos Google ne sont pas copiées
dans cette bibliothèque permanente.

Les photos réutilisables Wikimedia sont enregistrées dans `catalog-media`, avec
leur auteur, leur source et leur licence. Leur URL publique est reconstruite avec
l'adresse Supabase active, y compris après migration. Les erreurs temporaires de
photo deviennent réessayables après une heure, au lieu de trente jours.

## Installation sur une instance Supabase Docker existante

Depuis le dépôt, dans le terminal du Raspberry :

```bash
sudo python3 scripts/setup-catalog-selfhost.py --public-url https://raspberrypi.tailaa3fb6.ts.net
```

Ajouter `--check-only` pour inspecter sans modifier. En présence de plusieurs
instances, préciser `--db-container NOM` et `--functions-container NOM`.

Le script sélectionne les conteneurs Supabase, vérifie les tables et le volume
des fonctions, sauvegarde les fonctions et le schéma public sous
`/var/backups/globelink-catalog`, installe uniquement les deux fonctions du
catalogue et leur module partagé, puis applique les définitions SQL idempotentes
dans une transaction. Il ne migre ni ne supprime les comptes ou publications.
Seul le conteneur Edge Functions est redémarré.

Le secret local est généré hors Git dans le volume des fonctions. La configuration
du cron utilise l'adresse interne Docker et les secrets du coffre Vault ; les
images publiées utilisent l'adresse HTTPS donnée au script. Le script vérifie un
petit lot photo, lance la synchronisation, puis un deuxième lot photo. Il affiche
les compteurs et les deux tâches actives, sans afficher les clés.

Les tâches quotidiennes s'exécutent à 04:15 pour les lieux et 04:45 pour les photos
(fuseau de `pg_cron`, généralement UTC). Un lancement importe un lot de photos,
pas toute la bibliothèque mondiale. Un lieu sans photo libre identifiable ne
reçoit pas d'image inventée.

Si le script affiche `ARRÊT`, conserver le message et vérifier les journaux du
conteneur des fonctions. Une erreur après installation n'annule pas les étapes
déjà terminées. Le script peut être relancé : il conserve le secret existant et
remplace les tâches portant le même nom. Ne pas restaurer le schéma complet sur
une base active sans examiner les différences.

## Configuration du site Vercel

`VITE_SUPABASE_URL` et `SUPABASE_URL` doivent désigner la même instance publique.
`SUPABASE_SERVICE_ROLE_KEY` doit appartenir au Raspberry et rester côté serveur.
Si les origines diffèrent, le code refuse d'écrire dans l'ancien catalogue.

## Vérification effectuée dans le dépôt

Les tests couvrent les URLs de photos migrées, le rejet des chemins et licences
invalides, la priorité local/public/Google et la persistance limitée aux données
OSM. L'exécution réelle des fonctions, le téléchargement de photos et les crons
doivent être confirmés sur le Raspberry par le résultat du script.
