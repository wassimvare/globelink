# Phase 7 — IA gratuite / IA+

## GlobeLink IA — Gratuit

Le mode gratuit reste un assistant d'inspiration et d'information :

- questions et conseils rapides ;
- inspiration destination ;
- exemples de journée ;
- conseils généraux de budget et d'organisation ;
- aucune lecture du carnet ;
- aucune recherche temps réel présentée comme vérifiée ;
- aucune modification directe du voyage.

Quand une demande nécessite le carnet, une vraie comparaison, des données récentes, un itinéraire complet ou une modification du voyage, GlobeLink IA répond utilement dans son périmètre puis propose IA+ de manière contextuelle.

## GlobeLink IA+

IA+ est un agent de voyage connecté à GlobeLink :

- lit le voyage sélectionné et son budget réel ;
- peut utiliser des sources récentes quand elles sont disponibles ;
- compare plusieurs options ;
- produit un programme strictement séparé par date ;
- prépare un aperçu des journées et budgets applicables ;
- applique le programme dans `trip_days` et `trip_entries` ;
- applique les budgets IA+ dans `trip_expenses` en catégorie `Prévision IA+` ;
- ne transforme jamais une prévision IA+ en dépense réelle.

L'utilisateur garde l'action finale : une réponse actionnable affiche **Appliquer au carnet**. Une réponse informative reste **Enregistrer le conseil**.

## Protection contre les régressions

`npm run check:phase7` vérifie le contrat fonctionnel et exécute les tests du parseur d'actions IA+.
