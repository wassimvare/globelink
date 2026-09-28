# GlobeLink — versions de test iOS et Android

## Ce que produit l'étape 3

Le workflow **Mobile test builds**, sur la PR mobile, compile :

- `globelink-android-test-apk` : **GlobeLink-test.apk**, signé avec une clé de
  développement, installable sur Android 7.0 minimum ;
- `globelink-ios-test-builds` : l'application pour simulateur et une archive
  iPhone **non signée**. Ces fichiers ne sont pas installables sur un iPhone.

Les artefacts restent disponibles 30 jours. Le workflow vérifie la signature,
le package et l'activité de lancement de l'APK. Les configurations Capacitor et
les pages locales réellement copiées dans chaque projet sont aussi vérifiées.
Une compilation réussie ne remplace pas un essai de connexion/appel sur téléphone.

## Fonctionnement de cette première version

GlobeLink utilise TanStack Start, avec du rendu et des fonctions sur serveur.
Son dossier de build web n'est donc pas une application statique à embarquer.
Cette version de **test en ligne** charge uniquement
`https://globelink-theta.vercel.app` dans le conteneur Capacitor ; le service web
et le backend restent ceux utilisés par GlobeLink. Les actions sur un compte
réel (messages, publications) sont réelles.

`mobile/web` fournit une page locale de secours en cas d'erreur réseau. HTTPS
est obligatoire, le contenu mixte est désactivé et aucun domaine supplémentaire
n'a accès au pont natif. Les liens externes suivent le comportement Capacitor.

Cette configuration `server.url` sert à tester sur appareil. Avant distribution
publique, prévoir un client mobile embarqué avec des API adaptées et valider
les exigences des stores. Cette PR ne déploie rien en production.

## Installer sur Android

1. Ouvrir l'exécution réussie dans GitHub Actions, connecté au compte autorisé.
2. Télécharger **globelink-android-test-apk** puis extraire le ZIP.
3. Transférer **GlobeLink-test.apk** sur le téléphone et l'ouvrir.
4. Autoriser l'installation depuis le navigateur/gestionnaire de fichiers si
   Android le demande, puis toucher **Installer**.
5. Ouvrir **GlobeLink Test** et se connecter par e-mail.

Le package de test `app.globelink.mobile.test` est distinct du futur package de
production. La clé de développement est conservée en cache CI lorsque possible.
Si ce cache expire et qu'une mise à jour refuse de s'installer, désinstaller
l'ancienne version de test puis réinstaller ; une reconnexion sera nécessaire.
Il ne s'agit pas d'une signature de publication Play Store.

Vérifier sur appareil : connexion, navigation, carte, sélection de photo,
permissions caméra/micro et appel avec l'application ouverte, puis fermeture et
réouverture. Mettre Android System WebView à jour. Google OAuth dans une WebView
n'est pas validé ; utiliser l'e-mail pour ce test. L'APK ne fonctionne pas sur iOS.

## Développement local

Prérequis : Node 22+, JDK 21, SDK Android 36 ; pour iOS, un Mac avec Xcode 26+.
Les projets natifs complets sont maintenant versionnés : **ne pas les supprimer
ni relancer `cap add`**, sous peine de perdre les personnalisations natives.

```bash
npm ci --ignore-scripts
npm run mobile:android:apk
# Résultat : android/app/build/outputs/apk/debug/app-debug.apk

npm run mobile:ios
# Ouvre ios/App/App.xcodeproj sur Mac après synchronisation.
```

`mobile:sync` utilise les pages locales de test, indépendamment de `npm run build`
qui continue de compiler la version web pour son serveur. `mobile:check` se lance
après synchronisation ; il contrôle les assets copiés et les versions verrouillées.

## Préparer iPhone / TestFlight

La compilation simulateur et la compilation iPhone sans signature peuvent être
vérifiées dans GitHub Actions sans identifiants Apple. Une archive sans signature
n'est ni un IPA installable ni une version TestFlight.

Pour obtenir une vraie version TestFlight, il reste à fournir/configurer :

1. Un compte membre de l'**Apple Developer Program** et son équipe (Team ID).
2. L'identifiant `app.globelink.mobile` dans Apple Developer et une fiche app
   correspondante dans App Store Connect.
3. La signature Apple Distribution et un profil de provisioning compatible,
   ou la signature automatique Xcode avec les droits de l'équipe.
4. Les informations de bêta et déclarations demandées dans App Store Connect.

Sur un Mac : ouvrir le projet avec `npm run mobile:ios`, sélectionner l'équipe
Apple dans **Signing & Capabilities**, augmenter le numéro de build puis choisir
**Product > Archive** pour un appareil iOS. Dans Organizer, choisir
**Distribute App > App Store Connect**, valider et envoyer. Après traitement,
ajouter les testeurs dans TestFlight ; les tests externes peuvent nécessiter une
revue Apple. L'envoi sera effectué après configuration du compte par le propriétaire.

Pour automatiser ensuite cette signature dans GitHub Actions, mettre les clés,
certificats et profils dans les secrets GitHub, jamais dans les fichiers du dépôt
ni dans les artefacts. Aucun certificat Apple ni accès App Store Connect n'est
nécessaire pour les deux compilations non signées de ce workflow.

## Appels et notifications : phase suivante

Cette version ne fournit pas encore les appels entrants lorsque l'application
est fermée. Les premières ébauches PushKit/CallKit et Firebase sont conservées
sans modification dans `mobile/call-foundation`, en dehors des sources compilées.

Il reste à intégrer Firebase/APNs, les tokens associés aux utilisateurs connectés,
les permissions/entitlements natifs, la distribution serveur des notifications
et le pont entre les actions répondre/raccrocher et la session WebRTC. Les sources
Android doivent suivre les règles de notification d'appel entrant ; un lancement
direct d'activité en arrière-plan ne suffit pas.

## Références

- https://capacitorjs.com/docs/config
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://developer.android.com/build/building-cmdline
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
