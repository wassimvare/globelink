# Test complet — GlobeLink V10.8.14

Ce test doit être réalisé avant toute publication. Prépare :

- un PC Windows ;
- deux navigateurs différents ou un PC et un téléphone ;
- deux adresses e-mail auxquelles tu as accès ;
- un compte administrateur ;
- si Stripe est testé, une configuration Stripe en **mode test** uniquement.

## 1. Démarrage

1. Décompresse le ZIP dans un nouveau dossier.
2. Double-clique sur `LANCER_GLOBELINK.bat`.
3. Attends l'adresse `https://...trycloudflare.com` affichée en vert.
4. Ouvre cette même adresse sur les deux appareils.
5. Vérifie qu'aucune page rouge et aucune erreur de configuration Supabase
   n'apparaissent.

Résultat attendu : accueil visible, catalogue chargé, navigation fluide.

## 2. Création des deux comptes

Sur l'appareil A, crée le compte A. Sur l'appareil B, crée le compte B.

Pour chacun :

1. vérifie la réception du code e-mail ;
2. confirme le compte ;
3. connecte-toi ;
4. complète le profil ;
5. déconnecte-toi puis reconnecte-toi.

Teste aussi **Continuer avec Google** sur un des appareils.

Résultat attendu : retour dans GlobeLink après Google, aucune boucle de connexion,
aucun accès aux pages privées après déconnexion.

## 3. Profils et réseau social

1. Le compte A cherche le compte B et s'abonne.
2. Le compte B vérifie la notification puis s'abonne en retour.
3. A publie une photo, un texte et une vidéo courte.
4. B voit les publications, aime, commente et enregistre.
5. A modifie sa publication puis supprime un commentaire lui appartenant.
6. Passe le profil A en privé et vérifie avec un troisième navigateur déconnecté
   que ses contenus privés ne sont pas visibles.

Résultat attendu : aucun compte ne peut modifier le contenu de l'autre.

## 4. Stories et médias

1. A publie une story photo.
2. A publie une story vidéo inférieure à deux minutes.
   L'étape « Analyse » doit se terminer rapidement. Pour une grosse vidéo,
   l'écran doit passer presque tout de suite à « Envoi compatible iPhone… ».
   Il ne doit plus rester figé sur « Préparation de la vidéo… ».
3. B lit les stories dans l'ordre et ajoute un like.
4. Teste une vidéo lourde : les morceaux envoyés doivent faire environ 6 Mo
   chacun ; le découpage automatique doit prendre le relais au-dessus de 18 Mo.

Résultat attendu : lecture sans écran noir, ordre correct et aucune story d'un
profil privé non autorisé.

## 5. Match, messages et appels

1. A aime B dans Travel Match.
2. B aime A : le match doit créer ou retrouver une seule conversation directe.
3. Échange au moins cinq messages, dont un fichier ou une image.
4. Depuis A, lance un appel audio. B accepte, puis chacun coupe/réactive son micro.
5. Lance un appel vidéo et teste caméra avant/arrière.
6. Refuse un appel, puis laisse un appel expirer pour tester l'appel manqué.
7. Recommence avec un téléphone en 4G/5G et l'autre appareil en Wi-Fi.

Résultat attendu : seules les deux personnes de la conversation reçoivent l'appel.
Si l'appel échoue seulement entre réseaux différents, configure TURN avant la
production.

## 6. Voyages, carte, catalogue et marketplace

1. Crée, modifie puis supprime un voyage.
2. Ajoute des étapes, lieux et dépenses.
3. Avec le compte A, crée un lieu ou une activité depuis “Ajouter un lieu”.
   Renseigne seulement la ville et le pays : latitude/longitude ne doivent pas
   être demandées par défaut.
4. Pendant la saisie, vérifie que la page ne recharge pas toute seule.
5. Vérifie que la position est détectée automatiquement au moment de l'envoi ou
   avec le bouton **Détecter**, y compris avec une petite commune/village.
6. Après l'envoi, vérifie que le compte A est redirigé vers `/place-status/:id`
   avec le statut `pending` ou `ai_flagged`.
7. Vérifie qu'il n'apparaît pas immédiatement sur la carte ni dans la recherche.
8. Avec le compte admin, ouvre `/admin`, onglet **Lieux IA** : le résumé IA doit
   indiquer la cohérence du lieu, l'indice de géocodage et les points à vérifier.
9. Valide le lieu depuis l'admin.
10. Avec le compte A, vérifie la notification de validation et la page statut
    `approved`.
11. Recharge la carte : le lieu validé doit maintenant apparaître.
12. Recommence avec un autre lieu et refuse-le : le compte A doit recevoir une
    notification de refus et le lieu ne doit jamais apparaître sur
    la carte.
13. Vérifie la carte et le catalogue quotidien.
14. Consulte un produit de la marketplace.
15. Vérifie qu'un achat ne peut pas être fabriqué en manipulant le navigateur :
    seul le serveur de paiement doit pouvoir le confirmer.

## 7. IA et abonnement

Cette partie nécessite les secrets Gemini/Tavily/Stripe dans l'environnement
serveur.

1. Sans connexion, appelle `/api/chat` : la réponse doit être refusée.
2. Connecté, teste le chat et le générateur d'itinéraire.
3. Envoie plusieurs demandes et vérifie les limites quotidiennes.
4. Vérifie que l'assistant voyage refuse correctement l'accès hors connexion et
   ne charge aucun SDK IA tiers dans le navigateur.
5. En mode test Stripe, souscris AI Pro, vérifie l'activation, puis annule.
6. Rejoue le même webhook : aucune double activation ne doit apparaître.

## 8. Administration

1. Connecte le compte administrateur.
2. Vérifie l'accès au tableau de bord et aux signalements.
3. Masque un contenu signalé, puis rétablis-le.
4. Vérifie l'onglet **Lieux IA** : score IA, motifs, bouton Valider et bouton
   Refuser.
5. Accorde puis retire AI Pro à un compte test.
6. Avec un compte normal, tente d'ouvrir `/admin`.

Résultat attendu : accès refusé au compte normal, actions d'administration tracées.

## 9. PWA et reprise

1. Installe GlobeLink sur Android puis iPhone si disponibles.
2. Ferme et rouvre l'application.
3. Coupe Internet : la page hors connexion doit apparaître sans exposer de
   messages ou données privées en cache.
4. Rétablis Internet et utilise `NETTOYER_CACHE_NAVIGATEUR.bat` si une ancienne
   version reste affichée.

## 10. Décision finale

La publication est autorisée seulement si :

- toutes les étapes ci-dessus passent ;
- `npm run check` et `npm audit` passent encore ;
- l'ancien secret Supabase est révoqué ;
- protection des mots de passe compromis, CAPTCHA et SMTP sont actifs ;
- domaine HTTPS, redirections, TURN et webhook Stripe sont configurés ;
- documents légaux et RGPD sont renseignés.

Note les appareils, navigateurs, date et résultat de chaque anomalie avant de
valider la recette.
