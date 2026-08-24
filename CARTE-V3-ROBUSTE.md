# GlobeLink V10.9.2 — Carte V3 robuste

## Problème corrigé

La Carte V2 pouvait rester vide sur des vues régionales. Une requête Overpass utilisant une très grande bounding box obligeait le serveur à parcourir énormément de POI avant de limiter la sortie, ce qui provoquait des délais d’attente ou des réponses vides.

## Corrections

- Les vues ville/quartier utilisent toujours une requête bbox précise.
- Les vues régionales sont découpées en 5 petites recherches circulaires réparties sur la zone visible.
- Rayon adaptatif selon le zoom pour éviter les requêtes trop lourdes.
- Plusieurs miroirs Overpass sont essayés automatiquement.
- Repli POST -> GET lorsqu’un miroir refuse temporairement la méthode.
- Fusion avec `external_catalog_items` Supabase dans la zone visible.
- Déduplication des résultats internet + Supabase.
- Cache serveur conservé.
- Le chargement se relance automatiquement après déplacement ou zoom.

## Validation

- Phase 1 statique : 27/27
- Carte V2 : 10/10
- Carte V3 robuste : 8/8

Note : l’environnement de génération ne dispose pas d’un accès DNS sortant vers les serveurs Overpass, donc la réponse réseau réelle doit être testée sur la machine où GlobeLink est lancé. Le code dispose désormais de plusieurs miroirs et du catalogue Supabase comme fallback.
