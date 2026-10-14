# TubeMateX — lista de melhorias

**Data da análise:** 14/10/2026  
**Repositório analisado:** `borgelevisberg17/TubeMateX`  
**Branch/commit analisado:** `main` / `c85e3eb`  
**Âmbito:** backend Express/Node.js, frontend vanilla, fila de downloads, SQLite/Redis/BullMQ, autenticação, consola administrativa, Docker/deploy, CI/CD, testes e documentação.

## Resumo executivo

O TubeMateX já tem uma base funcional relativamente completa: validação inicial de URLs, bloqueio parcial de SSRF, sessões persistentes, OAuth Google opcional, fila local/distribuída, SSE, favoritos, catálogo administrativo, allowlist de fontes e vários smoke tests.

As prioridades mais importantes antes de uma utilização pública são:

1. **Remover as bases SQLite versionadas do Git e rodar/revogar qualquer credencial ou dado que tenha passado pelo repositório.** A cópia atualmente versionada contém 67 registos de downloads, 1 fonte administrativa e 1 item de catálogo.
2. **Corrigir o pipeline de segurança e dependências.** `npm audit --omit=dev` encontrou 16 vulnerabilidades na árvore instalada: 2 críticas, 10 altas, 2 moderadas e 2 baixas.
3. **Corrigir o deploy CI/CD.** O workflow inicia PM2 num runner efémero do GitHub Actions, o que não é um mecanismo real de deploy para o servidor de produção.
4. **Separar o servidor monolítico em módulos e tornar a fila distribuída coerente.** O `backend/server.js` tem 1.646 linhas e mistura HTTP, autenticação, SQL, descoberta, IPTV, administração e execução de processos.
5. **Reforçar SSRF, cookies/sessões, headers HTTP, gestão de ficheiros e limites operacionais.**
6. **Fazer os testes serem determinísticos e executados automaticamente no CI.** Atualmente o CI não executa a suíte de testes.

---

## P0 — corrigir antes de produção

### 1. Retirar bases SQLite e artefactos de runtime do repositório

**Evidência:** `data/tubematex.sqlite`, `data/sessions.sqlite`, `data/tubematex.sqlite-wal` e `data/tubematex.sqlite-shm` estão rastreados pelo Git. A base principal contém 67 downloads.

**Melhoria:**

- Remover estes ficheiros do histórico e do estado atual do repositório, usando migração/rewrite do histórico se o repositório for partilhado.
- Adicionar regras explícitas para `data/*.sqlite`, `data/*.sqlite-*`, `sessions.sqlite`, downloads e históricos.
- Fazer o servidor falhar ou iniciar com uma base vazia fora do diretório versionado.
- Criar um script de seed separado para dados de demonstração, sem dados de utilizadores.
- Auditar os 67 registos e o conteúdo administrativo para verificar URLs privadas, dados pessoais, tokens ou informação operacional.
- Revogar/rodar qualquer segredo que tenha sido usado localmente e posteriormente commitado.

### 2. Corrigir as vulnerabilidades de dependências

**Evidência:** `npm audit --omit=dev` reportou 16 vulnerabilidades, incluindo vulnerabilidades críticas em `proxy-addr` e `tar`, além de problemas em `express`, `sqlite3`, `node-gyp`, `path-to-regexp`, `minimatch` e outros transitivos.

**Melhoria:**

- Atualizar `express`, `sqlite3`, `bullmq`, `connect-redis`, `redis` e a árvore transitiva para versões corrigidas.
- Regenerar ambos os lockfiles, ou preferencialmente consolidar o projeto num único workspace/lockfile.
- Executar `npm audit`, `npm outdated` e testes após cada atualização.
- Fixar versões importantes do sistema e de imagens Docker; evitar dependências redundantes.
- Usar Dependabot/Renovate com PRs automáticos e revisão obrigatória.
- Adicionar `npm audit --audit-level=high` ao CI.
- Não aceitar `npm ci || npm install` silenciosamente: o fallback pode mascarar uma instalação não reprodutível.

### 3. Fazer a aplicação falhar com configuração insegura

**Evidência:** há fallback de `SESSION_SECRET` para `change-this-session-secret-in-production`.

**Melhoria:**

- Em `NODE_ENV=production`, exigir `SESSION_SECRET` com entropia mínima, `BASE_URL` HTTPS, credenciais Redis e configuração administrativa segura.
- Rejeitar segredos curtos, valores conhecidos e valores de exemplo.
- Validar todas as variáveis no arranque com um módulo de configuração tipado.
- Expor apenas uma lista sanitizada de capacidades; nunca devolver segredos ou caminhos sensíveis.

### 4. Corrigir o workflow de deploy

**Evidência:** `.github/workflows/node.js.yml` faz checkout, instala dependências e executa `pm2 start` num runner GitHub-hosted. Esse processo não é persistente e não atualiza um servidor real.

**Melhoria:**

- Separar `ci.yml` de `deploy.yml`.
- No CI: lint, teste unitário, teste de integração, teste E2E, `npm audit`, build da imagem e scan de imagem.
- No deploy: publicar uma imagem Docker versionada num registry e fazer rollout num ambiente real via SSH, registry/orquestrador ou plataforma escolhida.
- Usar ambientes protegidos, approvals, secrets do GitHub e health checks.
- Implementar rollback para a imagem anterior.
- Remover `pm2 startup` do runner e documentar claramente o alvo de deploy.

### 5. Corrigir o cookie de visitante e a gestão de sessão

**Evidência:** o setter manual de cookies em `backend/server.js` não define `Path=/`. Isso pode fazer com que o cookie seja limitado ao caminho da requisição que o criou e não seja enviado de forma consistente a `/`, `/auth` e outras rotas.

**Melhoria:**

- Preferir `res.cookie` de uma biblioteca bem testada ou o middleware de cookies.
- Definir sempre `Path=/`, `HttpOnly`, `Secure` em produção e `SameSite` de acordo com a arquitetura.
- Regenerar a sessão depois do login administrativo e OAuth para evitar session fixation.
- Destruir/inutilizar a sessão no logout, em vez de apenas apagar uma propriedade.
- Definir explicitamente `name`, `rolling`, `maxAge` e política de expiração.
- Testar login, logout, migração de histórico anónimo e renovação de sessão com um cookie jar real.

### 6. Fechar melhor o SSRF e o risco de DNS rebinding

**Evidência:** `validateUrl()` faz uma resolução DNS inicial, mas depois entrega a URL a `yt-dlp` ou a `fetch`; redirects e novas resoluções podem apontar para endereços privados. A proteção de IPv4/IPv6 é manual e incompleta.

**Melhoria:**

- Implementar um cliente HTTP de saída centralizado que valide cada resolução e cada redirect.
- Bloquear loopback, RFC1918, link-local, CGNAT, multicast, IPv4-mapped IPv6, IPv6 local e endpoints de metadata de cloud.
- Não seguir redirects para hosts fora da allowlist; validar o destino final.
- Para fontes administrativas, validar o hostname final e não apenas o URL inicial.
- Aplicar allowlist explícita por origem para todas as chamadas de validação de media, thumbnail e playlist.
- Considerar egress filtering no Docker/network layer.
- Adicionar testes de SSRF para `127.0.0.1`, `::1`, `169.254.169.254`, IPv4-mapped IPv6, DNS que muda de resposta e redirects internos.

### 7. Corrigir a superfície de headers HTTP

**Evidência:** existem alguns headers manuais, mas não há Helmet, CSP, HSTS, `X-Download-Options`, proteção de origem consistente nem política clara de CORS.

**Melhoria:**

- Adicionar Helmet com CSP ajustada ao uso de HLS, imagens externas e OAuth.
- Ativar HSTS apenas quando HTTPS estiver garantido.
- Definir `Content-Security-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` e `X-Download-Options` conforme testes.
- Restringir CORS a origens configuradas e tratar preflight corretamente.
- Não usar `app.set('trust proxy', 1)` globalmente sem definir proxies confiáveis; caso contrário, IPs enviados pelo cliente podem afetar rate limit e auditoria.

### 8. Proteger operações caras contra abuso

**Evidência:** há rate limit geral e de downloads, mas `/api/media/info`, `/api/media/stream`, `/api/search`, `/api/iptv/*` e validações externas podem gerar processos e chamadas muito dispendiosas.

**Melhoria:**

- Rate limit por rota, IP, sessão e utilizador autenticado.
- Limitar concorrência por proprietário, não apenas globalmente.
- Colocar pesquisa, metadata, preview e download em filas distintas.
- Aplicar timeout total por operação, não apenas `socketTimeout` do yt-dlp.
- Adicionar circuit breaker e backoff para Vimeo, Twitch, TMDB, IPTV-org e outras fontes.
- Impor limites de tamanho de resposta, número de episódios e número de itens importados.
- Adicionar quota diária/semanal e quota de armazenamento por utilizador.

### 9. Corrigir a gestão e autorização de ficheiros

**Melhoria:**

- Associar sempre o ficheiro a um proprietário persistente, inclusive em jobs distribuídos.
- Validar existência, tamanho, extensão real e MIME antes de `res.download`.
- Usar diretório temporário por job e rename atómico para o resultado final.
- Limpar ficheiros órfãos após crash, restart, timeout e job abandonado.
- Criar um garbage collector periódico baseado na base de dados, e não apenas num `Map` em memória.
- Impedir que `MAX_DOWNLOAD_SIZE` seja contornado por ficheiros temporários, conversões ou múltiplas extensões.
- Definir quotas e monitorizar disco livre antes de iniciar downloads/conversões.
- Isolar yt-dlp/ffmpeg com utilizador sem privilégios, limites de CPU/memória/processos e, idealmente, container worker dedicado.

---

## P1 — alta prioridade

### 10. Separar o backend em módulos

`backend/server.js` tem 1.646 linhas e concentra:

- configuração e arranque;
- SQL e migrações;
- sessões e OAuth;
- validação de URLs;
- pesquisa e providers;
- descoberta/entretenimento/IPTV;
- administração;
- fila local e BullMQ;
- execução yt-dlp/ffmpeg;
- rotas HTTP;
- shutdown.

**Melhoria:** organizar em `config`, `db`, `migrations`, `auth`, `middleware`, `routes`, `services`, `providers`, `jobs`, `media` e `repositories`. Isto reduz regressões e permite testar cada área isoladamente.

### 11. Adotar migrações de base de dados

**Evidência:** o schema é criado por `CREATE TABLE IF NOT EXISTS` no arranque, sem versão de schema.

**Melhoria:** usar migrações versionadas, transações, índices documentados, constraints de domínio e uma estratégia de rollback. Adicionar índices para `downloads(owner_id, completed_at)`, `downloads(owner_id, site)`, pesquisa/filtros e itens administrativos quando necessário.

### 12. Corrigir a consistência entre fila local e BullMQ

**Melhoria:**

- Escolher explicitamente `local` ou `BullMQ` por ambiente; não manter dois comportamentos parcialmente diferentes.
- Persistir estado de job e proprietário numa fonte única.
- Implementar idempotência e deduplicação por `jobId`.
- Tratar retry sem duplicar o histórico nem perder o ficheiro.
- Garantir que cancelamento, pausa, resume e restart funcionam em jobs distribuídos.
- Não usar `SIGSTOP`/`SIGCONT` como mecanismo principal de pausa em ambientes containerizados; preferir cancelamento cooperativo e requeue.
- Persistir jobs após reinício e oferecer reconciliação de jobs ativos.
- Fechar Worker, Queue e clientes Redis com tratamento de erro e timeout.

### 13. Corrigir e melhorar o SSE

**Melhoria:**

- Enviar `retry:` e um `id:` por evento.
- Suportar reconexão desde o último evento.
- Limitar o número de conexões SSE por utilizador/IP.
- Fechar clientes em todos os caminhos de erro e shutdown.
- Não manter eventos apenas em memória numa instalação sem Redis.
- Cobrir reconexão, job concluído antes da subscrição e escala horizontal.

### 14. Melhorar a qualidade dos erros e observabilidade

**Melhoria:**

- Usar IDs de correlação por pedido e por job.
- Emitir logs estruturados JSON, sem URLs com tokens/cookies.
- Separar logs de segurança, aplicação, provider e job.
- Expor métricas: latência, taxa de erro, jobs por estado, retries, bytes descarregados, espaço livre, memória, chamadas externas e SSE abertas.
- Adicionar tracing para operações que atravessam API → fila → worker → yt-dlp.
- Criar alertas para falhas de Redis, disco, ffmpeg, yt-dlp, certificados e providers.
- Melhorar `/health` para distinguir liveness de readiness e indicar estado de DB/Redis/worker sem expor detalhes internos.

### 15. Corrigir exposição e tratamento de credenciais yt-dlp

**Melhoria:**

- Nunca aceitar cookies por upload/UI.
- Guardar cookies fora do volume geral, com permissões restritas e rotação.
- Redigir cookies, tokens e URLs assinados dos logs.
- Preferir secrets Docker/Kubernetes/secret manager a `.env` em disco.
- Verificar permissões de `YTDLP_COOKIES_FILE` e rejeitar ficheiros legíveis por outros utilizadores.
- Documentar claramente que autenticação não deve ser usada para contornar DRM, paywalls ou controlo de acesso.

### 16. Consolidar dependências e manifestos

**Evidência:** existem `package.json`/`package-lock.json` na raiz e no backend com dependências diferentes. A raiz inclui `axios`, `cors`, `play-dl`, `playwright` e `yt-dlp-exec`; o backend inclui `redis` e `ffmpeg`, mas não os mesmos pacotes.

**Melhoria:**

- Escolher uma única raiz de projeto ou declarar workspaces.
- Remover dependências não usadas (`axios`, `cors`, `play-dl`, `yt-dlp-exec` se não forem necessárias).
- Garantir que o lockfile usado pelo Docker/CI é o lockfile correto.
- Mover Playwright para `devDependencies` se não for necessário no runtime.
- Alinhar nomes, descrição, versão e scripts.

### 17. Testar o backend sem depender de serviços externos

**Melhoria:**

- Criar testes unitários para `validateUrl`, `adminAllowedHostname`, parsing M3U, `errorCode`, `safeFileName`, `libraryQuery` e autorização.
- Mockar yt-dlp, ffmpeg, DNS, fetch, Redis e SQLite nos testes.
- Adicionar testes de integração com uma base temporária e servidor real.
- Usar fixtures locais de media/M3U, não URLs reais instáveis.
- Manter smoke tests externos separados e não bloqueantes.

### 18. Executar testes no CI

**Evidência:** o workflow instala e tenta um `build`, mas não executa `test:e2e`, `test:admin`, `test:catalog`, `test:entertainment` ou testes de segurança.

**Melhoria:**

- Adicionar `npm test` real e scripts separados para unit/integration/e2e.
- Arrancar o servidor com configuração de teste e esperar pelo readiness endpoint.
- Instalar/usar ffmpeg de forma explícita no job que precisa dele.
- Guardar screenshots, traces e logs como artifacts em caso de falha.
- Fazer o CI falhar se houver erros de consola no browser, regressões de contrato ou vulnerabilidades altas/críticas.

### 19. Melhorar a segurança da consola administrativa

**Melhoria:**

- Suportar múltiplos administradores, roles e auditoria de ações.
- Registar quem criou, alterou, aprovou, rejeitou ou apagou cada fonte/item.
- Adicionar reautenticação para ações críticas e expiração absoluta de sessão.
- Adicionar paginação, pesquisa e filtros no admin.
- Fazer aprovação ser transacional e exigir health check recente, não apenas `health_status` persistido.
- Revalidar allowlist e health status antes de publicar cada item.
- Proteger importações M3U contra duplicados, listas malformadas e crescimento abusivo.
- Adicionar CSRF a todas as operações mutáveis do admin e testes automatizados do token.

### 20. Corrigir políticas de catálogo e origem

**Melhoria:**

- Modelar explicitamente `metadata-only`, `direct playback` e `downloadable`.
- Exigir licença/política/termos por fonte, data de verificação e responsável.
- Armazenar a origem do thumbnail e direitos de uso.
- Não prometer reprodução só porque um URL responde HTTP 200.
- Fazer health checks periódicos em worker, com expiração do estado.
- Adicionar aviso e fluxo de remoção/takedown por fonte/item.

### 21. Melhorar acessibilidade e compatibilidade do frontend

**Melhoria:**

- Auditar com axe/Lighthouse.
- Garantir foco visível, navegação completa por teclado, focus trap nos drawers e retorno de foco ao fechar.
- Melhorar labels/descrições de selects, botões e progresso.
- Respeitar `prefers-reduced-motion`.
- Garantir contraste WCAG AA nos temas claro/escuro.
- Evitar usar texto simbólico como ícone quando um SVG acessível puder ser usado.
- Testar 320 px, 375 px, tablet, desktop e zoom a 200%.

### 22. Reduzir risco e manutenção de HTML gerado por strings

**Evidência:** o frontend usa extensivamente `innerHTML`/template strings, ainda que existam funções `esc()` em muitos pontos.

**Melhoria:**

- Preferir `textContent`, `createElement` e templates DOM para campos externos.
- Centralizar uma função de escaping e validar URLs antes de colocá-los em `src`, `href` ou atributos.
- Criar testes XSS com títulos, thumbnails, nomes de fontes e descrições contendo HTML/URLs maliciosos.
- Aplicar CSP que limite `script-src`, `img-src`, `media-src` e `connect-src` às origens necessárias.

---

## P2 — melhorias de produto e operação

### 23. Melhorar a experiência da fila

- Persistir fila entre refresh/restart.
- Mostrar posição estimada, velocidade, ETA e tamanho total.
- Permitir reordenar, repetir, remover múltiplos e limpar concluídos.
- Permitir configurar concorrência por utilizador/admin.
- Mostrar motivo de falha acionável e botão de retry.
- Evitar que jobs concluídos desapareçam do estado ativo sem ligação clara à Biblioteca.
- Adicionar notificações do browser/PWA para conclusão e falha.

### 24. Melhorar downloads e conversões

- Mostrar formatos e codecs reais antes de iniciar.
- Permitir template de nome, metadados, thumbnail, capítulos e legendas quando autorizado.
- Suportar legendas com política clara de direitos.
- Tornar a conversão assíncrona via fila em vez de bloquear o request HTTP.
- Guardar origem, codec, resolução, bitrate e duração na biblioteca.
- Evitar recompressão quando o formato já é compatível.
- Adicionar controlo de qualidade de áudio/vídeo e estimativa de tamanho.

### 25. Melhorar pesquisa e providers

- Criar interface de provider com timeout, quota, health e normalização comuns.
- Cachear por query, provider e idioma com TTL configurável.
- Paginar resultados e incluir cursor quando a fonte suportar.
- Remover duplicados por canonical URL, ID de provider e título normalizado.
- Mostrar estado de provider indisponível sem esconder o motivo.
- Configurar locale, região, safe search e filtro de conteúdo.
- Adicionar contrato de schema para resultados de todos os providers.

### 26. Melhorar PWA/offline

- Versionar e invalidar o service worker de forma previsível.
- Mostrar estado offline real.
- Não cachear respostas personalizadas, sessões, eventos SSE nem ficheiros.
- Adicionar estratégia de atualização e fallback offline.
- Testar instalação, atualização e limpeza de cache.

### 27. Melhorar documentação e onboarding

- Criar `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` e runbook de produção.
- Documentar arquitetura e fluxo de um download com diagrama.
- Documentar portas, volumes, backups, restore, Redis, TLS, logs e troubleshooting.
- Explicar a diferença entre modo local, Docker simples e Compose com worker.
- Documentar matriz de plataformas suportadas e limites conhecidos.
- Separar documentação de produto, auditorias históricas e planos que já não refletem o código atual.

### 28. Implementar backups e recuperação

- Backup consistente de SQLite com `VACUUM INTO`/backup API, não cópia arbitrária de ficheiros WAL.
- Backup separado de sessões, base principal e ficheiros de downloads.
- Testar restauração periodicamente.
- Definir RPO/RTO, retenção e cifragem.
- Monitorizar integridade SQLite e tamanho do volume.

### 29. Otimizar desempenho

- Evitar carregar e ordenar catálogos IPTV completos para cada filtro; criar cache materializada ou índice local.
- Usar paginação no SQL, em vez de carregar todo o histórico e filtrar em memória.
- Limitar `Promise.all` de providers/URLs com um pool de concorrência.
- Adicionar compressão HTTP onde apropriado.
- Servir assets com hashes/versionamento e cache imutável.
- Reduzir CSS monolítico/minificado manualmente e remover estilos legados duplicados.
- Medir TTFB, LCP, CLS e tamanho de JavaScript antes/depois.

### 30. Melhorar consistência linguística e internacionalização

- Centralizar traduções PT-PT e mensagens de erro.
- Evitar mistura entre “baixar” e “descarregar”, ou entre português europeu e brasileiro.
- Usar `Intl.DateTimeFormat`, `Intl.NumberFormat` e unidades localizadas.
- Preparar fallback de idioma e tradução dos textos de catálogo.

### 31. Licenciamento e conformidade

- Rever MIT e licenças de todas as dependências, fontes, logos, imagens e assets.
- Criar processo de notice/attribution.
- Rever política de privacidade relativamente a IPs, cookies, histórico, OAuth, thumbnails, logs e dados persistentes.
- Definir retenção e eliminação de ficheiros e histórico.
- Explicitar no produto que o utilizador só deve descarregar conteúdos autorizados e que DRM/paywalls não são contornados.

---

## Ordem recomendada de execução

### Sprint 1 — segurança e estabilidade

1. Remover SQLite/artefactos do Git e auditar histórico.
2. Atualizar dependências e corrigir os 2 advisories críticos/10 altos.
3. Remover fallback inseguro de `SESSION_SECRET`.
4. Corrigir cookies com `Path=/` e regeneração de sessão.
5. Reforçar SSRF/redirect/DNS e adicionar testes.
6. Corrigir headers, CORS e `trust proxy`.
7. Impor limites de disco, tempo, CPU/memória e quotas.

### Sprint 2 — entrega e testes

1. Reescrever CI para executar testes de verdade.
2. Separar CI de deploy e implementar deploy/rollback real.
3. Consolidar `package.json`/lockfiles.
4. Criar testes unitários e integração para autorização, jobs, ficheiros e admin.
5. Adicionar logs estruturados, métricas e readiness/liveness.

### Sprint 3 — arquitetura de jobs e dados

1. Modularizar o servidor.
2. Introduzir migrações de DB.
3. Unificar fila local/BullMQ.
4. Persistir e reconciliar jobs após reinício.
5. Tornar conversões e limpeza assíncronas e robustas.

### Sprint 4 — produto e frontend

1. Melhorar fila, retry, notificações e previews.
2. Melhorar acessibilidade e navegação móvel.
3. Rever CSP/XSS e reduzir `innerHTML`.
4. Otimizar IPTV/pesquisa/cache.
5. Consolidar i18n, documentação, backups e compliance.

---

## Verificações executadas

- `node --check backend/server.js` — **OK**.
- `npm audit --omit=dev` em `backend/` — **16 vulnerabilidades reportadas: 2 críticas, 10 altas, 2 moderadas e 2 baixas**.
- Inspeção de `backend/server.js`, manifestos, Docker/Compose, CI, frontend, testes e documentação.
- Inspeção das bases SQLite sem expor o conteúdo dos registos — **67 downloads, 1 fonte administrativa e 1 item de catálogo** na base versionada.

## Nota final

A lista acima é uma auditoria de melhoria, não uma alteração funcional ao código. O maior risco imediato não está na interface: está na combinação de **dados de runtime versionados, dependências vulneráveis, deploy incorreto, validação de URLs incompleta e operação de downloads/conversões sem isolamento e quotas suficientes**.
