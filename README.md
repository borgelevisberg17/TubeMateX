# TubeMateX

O **TubeMateX** é um downloader multi-site para conteúdos públicos e autorizados. A aplicação oferece uma interface de utilizador moderna, seleção de formatos de vídeo e áudio, pré-visualização de metadados, fila de downloads, progresso em tempo real via Server-Sent Events e histórico persistente por navegador ou sessão.

> Usa o TubeMateX apenas para conteúdos que tens autorização para guardar. A aplicação não foi desenhada para contornar DRM, paywalls, autenticação de terceiros ou restrições de acesso.
 
## Arquitetura

O frontend é servido pelo Express e utiliza HTML, CSS e JavaScript vanilla, sem uma etapa de compilação obrigatória. O backend usa Node.js, Express, SQLite relacional, sessões SQLite e `@openanime/youtube-dl-exec`, que fornece o motor yt-dlp. O banco `tubematex.sqlite` contém as tabelas `users` e `downloads`, com índices por proprietário e favoritos. O ffmpeg é necessário no sistema para juntar vídeo e áudio e para converter formatos de áudio. A interface também pode ser instalada como PWA, com cache controlado da shell e sem colocar endpoints dinâmicos de download em cache.

| Área | Implementação |
| --- | --- |
| Interface | HTML semântico, CSS responsivo, tema claro/escuro e JavaScript vanilla |
| API | Express com `/api/media/info`, `/api/downloads`, `/api/history` e healthcheck |
| Fila | Jobs em memória com limite de concorrência configurável |
| Progresso | Server-Sent Events em `/api/downloads/:id/events` |
| Metadados | yt-dlp com suporte aos extractors disponíveis na versão instalada |
| Histórico | JSON por visitante/sessão, com retenção configurável |
| Sessões | `express-session` com SQLiteStore; Google OAuth é opcional |
| Segurança | Validação de URL, bloqueio de endereços privados, rate limiting, headers de proteção e limites de tamanho |

## Execução local

Requer Node.js 18 ou superior e ffmpeg instalado. Depois de clonar o projeto, instala as dependências e arranca o servidor:

```bash
git clone https://github.com/borgelevisberg17/TubeMateX.git
cd TubeMateX/backend
npm install
cp .env.example .env
node server.js
```

Abre `http://localhost:3000`. Para validar o serviço, consulta `http://localhost:3000/health`.

O login Google é opcional. Sem as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, o downloader continua funcional para visitantes. Quando o login é ativado, o callback OAuth deve ser `${BASE_URL}/auth/google/callback`.

## Docker

A imagem inclui Node.js, ffmpeg e o yt-dlp fornecido pelo pacote do backend. O volume `/var/lib/tubematex` deve ser persistente para manter sessões, histórico e ficheiros temporários:

```bash
docker build -t tubematex .
docker run --name tubematex \
  --env-file backend/.env \
  -p 3000:3000 \
  -v tubematex-data:/var/lib/tubematex \
  tubematex
```

Em produção, define um `SESSION_SECRET` longo e aleatório, limita `MAX_CONCURRENT_DOWNLOADS` conforme a memória disponível e coloca o serviço atrás de HTTPS. O exemplo completo de variáveis encontra-se em `backend/.env.example`.

## API principal

`GET /api/search?q=...&type=all|music|video|film&source=all|youtube|soundcloud|vimeo|twitch` pesquisa conteúdos públicos no browser e devolve resultados normalizados com título, thumbnail, duração, fonte e URL original. A Busca Global consulta as streams definidas em `SEARCH_PROVIDERS` — por omissão `ytsearch,scsearch,vimeo,twitch`. YouTube e SoundCloud funcionam sem tokens através do yt-dlp; Vimeo requer `VIMEO_ACCESS_TOKEN` e Twitch requer `TWITCH_CLIENT_ID` e `TWITCH_APP_ACCESS_TOKEN`. As fontes são consultadas em paralelo, os resultados são intercalados e URLs duplicados são removidos. Cada resultado pode ser encaminhado para o fluxo de download com MP3, MP4, WEBM ou OPUS. `GET /api/media/info?url=...` analisa o conteúdo e devolve título, thumbnail, duração, plataforma e autor. `POST /api/downloads` recebe `{ "url": "...", "format": "mp4" }` e devolve HTTP 202 com um job. Os formatos disponíveis são `mp4`, `webm`, `best`, `mp3` e `opus`. Para vídeo, o utilizador pode escolher qualidade automática ou um limite de 1080p, 720p ou 480p; o preset é validado no backend e aplicado ao seletor de formatos do yt-dlp. `GET /api/downloads/:id/events` transmite atualizações do job e `GET /api/downloads/:id/file` entrega o ficheiro concluído ao visitante que criou o pedido. `GET /api/history` e `DELETE /api/history` consultam e limpam o histórico do visitante. `GET /api/library` aceita `q`, `format`, `site`, `favorite`, `sort`, `limit` e `offset`, devolvendo resultados filtrados, facets e indicação de paginação. `PATCH /api/library/:id/favorite` cria ou remove um favorito persistente; `GET /api/favorites` devolve apenas os favoritos recentes.

## Autenticação e histórico persistente

O login Google é opcional e usa Passport OAuth 2.0. A sessão é armazenada em SQLite e o perfil persistido na tabela `users`; o identificador do provedor nunca é exposto como credencial de sessão completa. Para ativá-lo, cria uma credencial OAuth Web Application no Google Cloud Console, define `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `BASE_URL`, e adiciona `${BASE_URL}/auth/google/callback` como Authorized redirect URI. O callback grava ou atualiza o utilizador na tabela `users`, serializa apenas o ID na sessão e associa os downloads ao proprietário autenticado.

Visitantes continuam a poder descarregar sem conta. O histórico anónimo usa um cookie privado; depois do login, os registos desse visitante são migrados automaticamente para o proprietário `user-google-<id>`, preservando favoritos e ficheiros. O banco e `sessions.sqlite` devem ficar num volume persistente definido por `DATABASE_PATH` e `SESSION_DB_DIR`. O servidor cria o esquema automaticamente e importa uma vez os históricos JSON legados, renomeando-os para `.migrated` depois de concluído o processo.

## Biblioteca e favoritos

A pesquisa está disponível na página inicial, no painel “Pesquisa no browser”. O utilizador pode escolher Tudo, Música, Vídeos ou Filmes, selecionar Busca Global, YouTube, SoundCloud, Vimeo ou Twitch e usar “Usar link” para iniciar o fluxo de download com o formato pretendido. Quando uma fonte opcional não tem credenciais, o browser informa-a explicitamente em vez de falhar silenciosamente. A aplicação continua a aceitar URLs diretos de outras plataformas suportadas pelo yt-dlp.

A página `/profile` funciona como biblioteca pessoal. A pesquisa procura título, plataforma, formato e qualidade; os filtros incluem vídeo, áudio, plataforma e apenas favoritos; a ordenação pode ser por mais recentes, mais antigos ou título. Os favoritos são guardados no histórico privado do visitante e permanecem disponíveis depois de reiniciar o servidor, desde que o volume de dados seja persistente.

## PWA e experiência instalada

O manifest encontra-se em `frontend/manifest.webmanifest`, o service worker em `frontend/sw.js` e o ícone vetorial em `frontend/assets/icon.svg`. A shell da aplicação pode ser consultada offline depois da primeira visita, enquanto API, autenticação e ficheiros continuam sempre dependentes da rede e não são guardados no cache.

## Docker Compose e Nginx no VPS

O deployment completo encontra-se em `docker-compose.yml` e `deploy/README.md`. Ele separa a API Node, os workers BullMQ, Redis e o Nginx, mantém a porta 3000 apenas na rede interna Docker, monta os volumes persistentes `tubematex_data` e `tubematex_redis_data`, publica 80/443 e usa Certbot para emitir e renovar TLS. O Redis disponibiliza sessões, fila, estados e eventos partilhados; podes escalar com `docker compose up -d --build --scale app=3 --scale worker=2`. Começa com `cp deploy/.env.example .env`, `cp backend/.env.example backend/.env` e executa `./deploy/bootstrap.sh`. O script constrói a imagem, arranca a aplicação, emite o certificado e reinicia o Nginx em HTTPS. A renovação pode ser executada com `./deploy/renew-cert.sh` através de cron.

## Produção e manutenção

Os jobs e os ficheiros temporários são intencionalmente retidos por um período limitado. O serviço deve usar armazenamento persistente para a pasta de dados e uma política de monitorização para acompanhar espaço em disco, memória, falhas do yt-dlp e limites das plataformas de origem. O motor só descarrega conteúdos públicos ou autorizados e está sujeito às políticas e Termos de Serviço de cada plataforma.

## Consola administrativa de fontes e catálogo

O TubeMateX inclui uma consola protegida em `/admin` para gerir fontes autorizadas e itens editoriais. A consola permite criar, editar, desativar e excluir fontes; definir a URL oficial e a allowlist de domínios; cadastrar canais, filmes, séries, anime, doramas, documentários e VOD; adicionar título, descrição, imagem de preview, país, idioma, categorias, feed principal e URL HLS/DASH/MP4/WEBM; validar o estado da media; e aprovar ou rejeitar manualmente cada item antes de o publicar no espaço Cine.

O inventário administrativo usa as tabelas SQLite `admin_sources` e `admin_catalog_items`. Itens novos começam com `approvalStatus=pending`. Apenas itens `approved` associados a fontes `enabled` entram em `/api/entertainment/home`, `/api/entertainment/search` e `/api/entertainment/sources`. A edição de um item aprovado volta a colocá-lo em estado pendente, criando um novo gate editorial.

### Configuração do acesso

Em desenvolvimento local, copia `backend/.env.example` para `backend/.env` e configura:

```env
NODE_ENV=development
ADMIN_USERNAME=define-o-utilizador
ADMIN_PASSWORD=define-a-senha-localmente
```

Em produção, não uses `ADMIN_PASSWORD`. Gera um hash scrypt fora do código:

```bash
npm run admin:hash -- "a-tua-senha-forte"
```

Coloca a saída em `backend/.env`:

```env
NODE_ENV=production
ADMIN_USERNAME=define-o-utilizador
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...
```

Usa uma senha exclusiva, longa e armazenada no gestor de segredos do servidor. A senha não deve ser colocada em commits, screenshots, logs ou ficheiros `.env` versionados. A sessão administrativa usa cookie server-side, expiração de oito horas, rate limit de login e token CSRF para operações mutáveis.

### Fluxo recomendado

Primeiro cria uma fonte em **Fontes**, com a URL oficial e os domínios CDN que realmente pertencem ao fornecedor. A allowlist aceita o domínio exato e subdomínios; URLs para localhost, redes privadas, metadata endpoints, utilizador/senha embutidos e hosts internos são rejeitadas. Depois cadastra o item em **Catálogo**, guarda-o e executa **Validar media**. A validação usa HEAD sem seguir redirects para fora da allowlist e classifica o item como `online`, `offline`, `incompatible`, `redirect` ou `not-configured`.

Por fim, revê título, descrição, imagem, categoria, feed, tipo de stream e origem oficial. Só depois usa **Aprovar**. Itens metadata-only podem ser aprovados para descoberta e link para a origem, mas não ganham reprodução direta. Um item com media offline não pode ser aprovado até a origem voltar a responder ou o URL ser corrigido.

### API administrativa

| Endpoint | Operação |
|---|---|
| `GET /api/admin/session` | Verifica se o admin está configurado e se a sessão está autenticada |
| `POST /api/admin/login` | Inicia sessão com `username` e `password` |
| `POST /api/admin/logout` | Termina a sessão |
| `GET /api/admin/overview` | Métricas de fontes, pendentes, aprovados e offline |
| `GET/POST/PATCH/DELETE /api/admin/sources` | CRUD de fontes autorizadas |
| `POST /api/admin/sources/:id/validate` | Valida a URL base ou media da fonte |
| `GET/POST/PATCH/DELETE /api/admin/catalog` | CRUD de itens de catálogo |
| `POST /api/admin/catalog/:id/validate` | Persiste o health check de um item |
| `POST /api/admin/catalog/:id/approve` | Publica manualmente o item |
| `POST /api/admin/catalog/:id/reject` | Retira ou rejeita o item |

As rotas `POST`, `PATCH` e `DELETE` exigem o header `X-Admin-CSRF` devolvido depois do login. Todas as URLs de origem, media e imagem têm de pertencer à allowlist da fonte. O painel não transforma o servidor num proxy arbitrário e não contorna DRM, paywalls, autenticação, geoblocking ou direitos de terceiros.

### Rotas públicas alimentadas pelo painel

Depois da aprovação, o item é normalizado para o mesmo contrato dos cards Cine e passa a poder aparecer nos rails **Fontes autorizadas**, **Em destaque**, pesquisa agregada e catálogo de entretenimento. O campo `mediaUrl` controla a reprodução direta; sem ele, o card mantém `metadataOnly=true` e usa `externalUrl` para abrir a origem oficial.

Em deployment Docker Compose, monta o mesmo volume persistente em `app` e `worker`, mantém `DATABASE_PATH` partilhado e configura `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` através do ambiente do serviço. Não coloques credenciais reais em `docker-compose.yml`, no Git ou no frontend.
