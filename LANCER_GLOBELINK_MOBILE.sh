#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

PORT="${PORT:-5173}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22 et npm sont necessaires pour lancer la preview mobile."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparation de GlobeLink..."
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
fi

LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "$LAN_IP" ] && command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
if [ -z "$LAN_IP" ] && command -v ip >/dev/null 2>&1; then
  LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)"
fi

printf '\nGlobeLink demarre pour le mobile.\n'
if [ -n "$LAN_IP" ]; then
  printf 'Sur le telephone connecte au meme Wi-Fi, ouvre : http://%s:%s\n\n' "$LAN_IP" "$PORT"
else
  printf 'Trouve l adresse IP locale de cet ordinateur puis ouvre http://ADRESSE-IP:%s\n\n' "$PORT"
fi
printf 'Garde ce terminal ouvert pendant le test.\n\n'

npm run dev -- --host 0.0.0.0 --port "$PORT"
