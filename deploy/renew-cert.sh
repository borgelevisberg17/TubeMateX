#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Falta .env na raiz." >&2
  exit 1
fi
set -a
source .env
set +a

DOMAIN="${DOMAIN:?Define DOMAIN em .env}"
docker compose --profile tls run --rm certbot renew --quiet
docker compose restart nginx

echo "Renovação verificada para ${DOMAIN}."
