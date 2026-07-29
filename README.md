# GlobeLink

Réseau social de voyage — version V7.3 avec responsive mobile et appels audio/vidéo.

## Installation

```bash
npm install
npm run dev
```

Copiez `.env.example` vers `.env`, puis renseignez vos valeurs Supabase et les autres services utilisés.

## Test sur téléphone

- `LANCER_GLOBELINK_MOBILE.bat` : accès depuis le même réseau Wi-Fi.
- `GLOBELINK_APPELS_HTTPS.bat` : accès HTTPS pour autoriser caméra et micro sur téléphone.

## Sécurité

Le fichier `.env`, les caches, les dépendances installées et les clés privées ne sont pas versionnés.
