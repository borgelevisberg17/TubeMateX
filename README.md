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
