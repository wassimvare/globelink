# Appels audio et vidéo — GlobeLink V10.8.14

## Test sur téléphone

Double-clique sur `LANCER_GLOBELINK.bat`. Le lanceur :

1. démarre GlobeLink sur le PC ;
2. installe les composants manquants au premier lancement ;
3. crée une adresse HTTPS temporaire ;
4. affiche et copie l'adresse, puis ouvre un QR code.

Rien n'est installé sur le téléphone. Autorise seulement le micro et la caméra
dans Safari ou Chrome.

## Sécurité intégrée

- canal Realtime Broadcast privé ;
- signal accepté seulement pour son destinataire ;
- invitation acceptée seulement si les deux comptes appartiennent à la même
  conversation directe ;
- validation des identifiants, du type de signal et de l'expéditeur ;
- solution de secours via les messages RLS de la conversation ;
- caméra et micro disponibles uniquement dans un contexte HTTPS sécurisé.

## Conditions de test

- deux comptes différents, confirmés et connectés ;
- une conversation directe entre ces deux comptes ;
- GlobeLink ouvert des deux côtés ;
- autorisation micro/caméra accordée ;
- pour un test réaliste, un téléphone en 4G/5G et l'autre appareil en Wi-Fi.

L'adresse `trycloudflare.com` est temporaire et réservée aux tests. En production,
utilise un domaine HTTPS permanent et un serveur TURN avec des identifiants
temporaires ou limités.
