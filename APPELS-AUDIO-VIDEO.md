# Appels audio et vidéo — GlobeLink V7.3

## Utilisation sur téléphone

Pour les appels, lance `GLOBELINK_APPELS_HTTPS.bat` sur le PC au lieu du lanceur Wi-Fi normal.

Le script :

1. démarre GlobeLink sur le PC ;
2. télécharge `cloudflared` lors du premier lancement ;
3. crée une adresse temporaire HTTPS ;
4. affiche un QR code à ouvrir sur le téléphone.

Rien n'est installé sur le téléphone. Il faut uniquement autoriser le micro et la caméra dans Safari ou Chrome.

## Fonctions ajoutées

- appel audio depuis une conversation ;
- appel vidéo depuis une conversation ;
- écran d'appel entrant ;
- accepter ou refuser ;
- couper/réactiver le micro ;
- couper/réactiver la caméra ;
- changer caméra avant/arrière ;
- couper/réactiver le son reçu ;
- durée d'appel ;
- historique d'appel dans la conversation ;
- appel manqué, refusé, occupé ou interrompu ;
- signalisation protégée par les règles de la messagerie Supabase existante.

## Limites de la version locale

- Les deux utilisateurs doivent avoir GlobeLink ouvert et être connectés avec deux comptes différents.
- L'adresse `trycloudflare.com` est temporaire et destinée aux tests.
- Pour une mise en production, déploie GlobeLink sur un domaine HTTPS permanent.
- Pour fiabiliser les appels entre certains réseaux mobiles ou pare-feu stricts, configure un serveur TURN dans `.env` :

```env
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=utilisateur
VITE_TURN_CREDENTIAL=mot-de-passe
```
