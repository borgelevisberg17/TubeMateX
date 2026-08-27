#!/bin/sh
set -eu

DOMAIN="${DOMAIN:-example.com}"
ESCAPED_DOMAIN=$(printf '%s' "$DOMAIN" | sed 's/[.[\*^$()+?{|\\]/\\&/g')

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
  sed "s/__DOMAIN__/${ESCAPED_DOMAIN}/g" /opt/tubematex/nginx-https.conf > /etc/nginx/conf.d/default.conf
else
  sed "s/__DOMAIN__/${ESCAPED_DOMAIN}/g" /opt/tubematex/nginx-http.conf > /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
