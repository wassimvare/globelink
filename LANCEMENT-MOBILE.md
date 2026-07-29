# GlobeLink V7 sur téléphone

## Lancement depuis le PC Windows

1. Décompresse entièrement le ZIP.
2. Connecte le PC et le téléphone au même Wi-Fi.
3. Double-clique sur `LANCER_GLOBELINK_MOBILE.bat` sur le PC.
4. Autorise Node.js sur les **réseaux privés** si Windows le demande.
5. Ouvre sur le téléphone l’adresse `http://192.168…:5173` affichée par le lanceur, ou scanne le QR code ouvert sur le PC.
6. Garde la fenêtre du lanceur ouverte.

`127.0.0.1` désigne toujours l’appareil sur lequel l’adresse est ouverte. Sur le téléphone, il faut donc utiliser l’adresse Wi-Fi du PC et non `127.0.0.1`.

## En cas de blocage

- évite un Wi-Fi invité ;
- désactive temporairement le VPN ;
- vérifie que le profil réseau Windows est **Privé** ;
- autorise Node.js et le port 5173 dans le pare-feu ;
- relance `DIAGNOSTIC_MOBILE.bat`.

## Conseiller voyage

Les écrans `/ai-trip` et `/ai-pro` utilisent Puter.js sans clé API développeur. Une connexion ou une autorisation Puter peut apparaître au premier usage. Les prix, formalités, horaires, règles d’entrée et informations sanitaires doivent toujours être vérifiés auprès de sources officielles.

## Installation sur l’écran d’accueil

Pour une installation PWA fiable, déploie ensuite le site sur une adresse HTTPS. Sur iPhone : Safari → Partager → Sur l’écran d’accueil. Sur Android : Chrome → Installer l’application.
