#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Falta .env na raiz. Executa: cp deploy/.env.example .env" >&2
  exit 1
fi
if [[ ! -f backend/.env ]]; then
  echo "Falta backend/.env. Executa: cp backend/.env.example backend/.env" >&2
  exit 1
fi

set -a
source .env
set +a

DOMAIN="${DOMAIN:?Define DOMAIN em .env}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:?Define CERTBOT_EMAIL em .env}"

echo "A construir a imagem da aplicação…"
docker compose build app
echo "A iniciar aplicação e Nginx…"
docker compose up -d app worker nginx

if [[ ! -f "deploy/certbot/conf/live/${DOMAIN}/fullchain.pem" ]]; then
  echo "A emitir certificado para ${DOMAIN}…"
  docker compose --profile tls run --rm certbot
  docker compose restart nginx
else
  echo "Certificado existente encontrado para ${DOMAIN}."
fi

docker compose ps
