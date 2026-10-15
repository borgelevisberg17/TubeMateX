# Deployment do TubeMateX num VPS

## Pré-requisitos

Usa um VPS Ubuntu 22.04/24.04 com Docker Engine e Docker Compose v2 instalados. Cria um registo DNS `A` ou `AAAA` apontado ao IP do VPS, por exemplo `downloads.example.com`, e permite apenas SSH, HTTP e HTTPS no firewall.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

A porta `3000` é interna à rede Docker e não deve ser aberta no firewall.

## Instalação inicial

```bash
git clone https://github.com/borgelevisberg17/TubeMateX.git
cd TubeMateX
cp deploy/.env.example .env
cp backend/.env.example backend/.env
chmod 600 .env backend/.env
```

Edita `.env` e define `DOMAIN`, `CERTBOT_EMAIL`, `REDIS_PASSWORD` e um `METRICS_TOKEN` forte. Em `backend/.env`, define um `SESSION_SECRET` aleatório longo, `BASE_URL=https://$DOMAIN`, os tokens opcionais de Vimeo/Twitch e Google OAuth. Define os limites operacionais no `.env` da raiz (Compose), incluindo `MAX_STORAGE_BYTES`; para execução local direta, esses valores podem ser definidos em `backend/.env`. O Compose configura `YTDLP_PROXY_URL` para o proxy de saída; o backend em produção recusa arrancar sem esta configuração.

Arranca primeiro a aplicação e o Nginx em HTTP, para o desafio ACME funcionar:

```bash
docker compose build app egress-proxy
docker compose up -d app worker nginx
docker compose ps
```

Emite o certificado:

```bash
docker compose --profile tls run --rm certbot
docker compose restart nginx
docker compose ps
```

Depois do reinício, o Nginx deteta os certificados em `deploy/certbot/conf/live/$DOMAIN` e passa a servir HTTPS, mantendo `/.well-known/acme-challenge/` acessível em HTTP.

## Renovação

Os certificados Let's Encrypt expiram normalmente após um período limitado. Agenda duas tentativas diárias no cron do VPS:

```cron
17 3 * * * cd /opt/TubeMateX && docker compose --profile tls run --rm certbot renew --quiet && docker compose restart nginx
```

A operação é idempotente: se não houver renovação, o Nginx apenas reinicia de forma segura.

## Escala horizontal

O Redis é usado pelo Express para que as sessões OAuth sejam válidas em qualquer réplica. O Nginx resolve `app` através do DNS interno do Docker a cada 10 segundos e distribui os pedidos entre os containers disponíveis. Para subir três réplicas da API e dois workers de download no mesmo VPS:

```bash
docker compose up -d --build --scale app=3 --scale worker=2
```

Não publiques a porta 3000. Todas as réplicas devem usar o mesmo volume `tubematex_data` para o SQLite e os ficheiros. Para uma carga elevada ou vários VPS, troca SQLite por PostgreSQL e move downloads para object storage partilhado; SQLite num volume local é adequado apenas para réplicas no mesmo host e com concorrência moderada.

O proxy Squid dedicado é utilizado pelo yt-dlp para todas as operações de análise e download. A configuração bloqueia endereços privados, link-local e intervalos reservados, inclusive quando a resolução é feita pelo proxy; mantém o proxy apenas na rede Docker e não publiques a porta 3128. A validação DNS da aplicação é uma defesa adicional, não substitui esta fronteira.

O Redis partilha sessões, jobs BullMQ, estados temporários e eventos SSE. Os workers são consumidores concorrentes da fila `tubematex-downloads`; podes escalar a API e os workers de forma independente. O SQLite e o volume de ficheiros continuam partilhados no mesmo VPS. Para vários hosts, usa PostgreSQL e object storage partilhado, e não um volume Docker local.

## Operação

```bash
docker compose ps
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 nginx
docker compose restart app nginx
docker compose up -d --scale app=3 --scale worker=2
docker compose down
```

Os pedidos geram logs JSON com `requestId`, método, caminho sem query string, estado HTTP e duração. O endpoint `/internal/metrics` devolve métricas de processo e downloads apenas quando recebe `Authorization: Bearer $METRICS_TOKEN`; sem token configurado, responde 404. Encaminha logs `warn`/`error` e os sinais de métricas para a plataforma de monitorização do VPS para alertas. Não exponhas este endpoint publicamente.

Os dados persistem nos volumes Docker `tubematex_data` e `tubematex_redis_data`. O primeiro contém `tubematex.sqlite`, históricos migrados e ficheiros temporários; o segundo contém o AOF do Redis com as sessões partilhadas. O Nginx e o Certbot usam os diretórios versionados vazios `deploy/certbot/www` e `deploy/certbot/conf`; os certificados reais nunca devem ser comitados.

## Backup mínimo

Faz backup frequente do volume da aplicação e da configuração de certificados. Antes de copiar ficheiros SQLite, para o serviço ou usa um snapshot consistente do VPS.

```bash
docker compose stop app worker
sudo tar -C /var/lib/docker/volumes -czf /opt/backups/tubematex-$(date +%F).tgz tubematex_data/_data tubematex_redis_data/_data
sudo tar -C deploy/certbot -czf /opt/backups/tubematex-certbot-$(date +%F).tgz conf

docker compose start app worker
```

## Notas de produção

Mantém `SESSION_SECRET` e credenciais OAuth apenas em `backend/.env` ou num gestor de segredos. O Compose encaminha o tráfego pelo Nginx, o Node fica sem publicação direta de porta e os downloads têm limite e limpeza controlados pela aplicação. Configura memória e espaço em disco do VPS de acordo com a quantidade de transcodificação simultânea; começa com `MAX_CONCURRENT_DOWNLOADS=1` ou `2`.
