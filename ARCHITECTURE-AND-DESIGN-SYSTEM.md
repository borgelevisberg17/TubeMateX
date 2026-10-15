# TubeMateX — arquitetura, design system e qualidade

## Objetivo

Este documento transforma a estrutura atual numa direção comum de evolução: interfaces reconhecíveis entre áreas, operações previsíveis e componentes acessíveis, sem introduzir uma migração de framework ou alterar os contratos públicos da API.

## Arquitetura atual

```text
Browser (HTML semântico + CSS + JavaScript vanilla)
        │ HTTP / JSON / Server-Sent Events
        ▼
Express (backend/server.js: composição, configuração e middleware)
        ├── routes/       contratos de sistema, media, downloads e biblioteca
        ├── services/     integração e regras de media
        ├── queue         execução local ou distribuída (BullMQ/Redis)
        └── SQLite        utilizadores, sessões, histórico e catálogo
```

A aplicação é servida como ficheiros estáticos pelo Express. As páginas não precisam de build step e dependem dos endpoints existentes. Rotas isoladas em `backend/routes/` são uma fronteira adequada; `backend/server.js` deve continuar a ser o composition root, e não o destino de novas regras de negócio.

## Fronteiras e contratos recomendados

1. **HTTP/UI:** JavaScript de página gere estado de apresentação e chama a API; não deve conter SQL nem política de negócio. Escape de conteúdo externo antes de renderizar HTML.
2. **Rotas:** validar entrada, autenticação/autorização, limites e forma de resposta HTTP. Manter payloads compatíveis e erros legíveis.
3. **Serviços:** regras de domínio e integrações com yt-dlp, plataforma, biblioteca e fila. Evitar dependência de `req`/`res`.
4. **Persistência e filas:** encapsular SQLite/Redis atrás de repositórios/serviços pequenos; preservar a troca entre execução local e distribuída.
5. **Composição/configuração:** `server.js` instancia dependências e monta rotas. Evitar mover todo o backend em reescritas amplas; extrair uma responsabilidade por vez com testes de contrato.

### Padrão para uma nova funcionalidade

- Definir primeiro o contrato de entrada/saída, erros esperados e permissões.
- Implementar a regra num serviço testável sem HTTP sempre que houver lógica de domínio.
- Deixar a rota adaptá-la ao protocolo HTTP.
- Atualizar o frontend através do módulo da página, com estados de carregamento, vazio, sucesso, erro, cancelamento e nova tentativa.
- Cobrir a resposta com teste unitário/contrato e, quando o fluxo for central, com E2E.

## Design system

A base compartilhada está em `frontend/css/design-system.css`: tokens primitivos `--tmx-color-*`, papéis semânticos `--tmx-*`, escala de espaçamento, dimensões de controlo, foco, superfícies e sombras. As áreas mantêm aliases legados (`--h-*`, `--u-*`, `--space-*`) apenas como adaptadores durante a migração; novos componentes usam tokens semânticos diretamente. Variantes comuns de botões, campos, cartões, badges, estados, progresso, toasts, diálogos e paginação estão documentadas em `DESIGN-SYSTEM-GOVERNANCE.md`. Temas claro/escuro continuam a usar a preferência `tubematex-theme`.

`frontend/js/components.js` e `frontend/css/components.css` oferecem o shell comum de navegação/cabeçalho e o gerador vanilla de cartões de mídia para Música e Social. O Cine mantém seu cartão editorial próprio porque inclui progresso, múltiplas ações e metadados de catálogo; o cabeçalho global é o mesmo e a navegação local de categorias continua separada.

### Princípios de interface

- **Hierarquia clara:** título, contexto, conteúdo principal e ações primárias devem ser identificáveis em poucos segundos.
- **Consistência com intenção:** navegação, estados de foco, controles, cartões e mensagens seguem os mesmos fundamentos; áreas podem conservar cor de acento própria.
- **Feedback completo:** pesquisa e tarefas expõem progresso, resultados, limitações e recuperação; não depender apenas de cor para comunicar estado.
- **Responsivo primeiro:** sem overflow horizontal em 320 px; ações importantes continuam acessíveis em ecrãs pequenos e com zoom.
- **Sem surpresas:** abrir nova aba apenas quando indicado, desativar/explicar ações indisponíveis e manter URLs/fonte visíveis.

### Acessibilidade como critério de aceite

- HTML semântico: um `main` identificado, títulos hierárquicos, links para navegação e botões para ações.
- Toda página oferece “Saltar para o conteúdo principal”; foco visível e ordem de tabulação coerente.
- Campos têm nome acessível; botões de ícone têm `aria-label`; resultados e mensagens assíncronas são anunciáveis por tecnologia assistiva.
- Na área IPTV, cada filtro tem rótulo visível associado ao controlo; carregamento, estado ocupado e resultados são expostos sem depender só de cor; navegação e recolhimento anunciam o estado atual.
- Controlos de tamanho de toque e contrastes legíveis, incluindo tema claro e esquema de alto contraste do sistema.
- Respeitar `prefers-reduced-motion` e não depender de animação para transmitir informação.
- Testar teclado, leitor de ecrã e zoom, além de verificações automáticas; uma verificação automatizada não comprova conformidade WCAG.

## Qualidade e verificações

- `npm run test:accessibility`: verifica convenções estruturais, navegação partilhada e SVGs acessíveis em todas as páginas principais.
- `npm run test:contrast`: calcula razões WCAG AA dos tokens por tema, dos acentos do cabeçalho e dos componentes IPTV (inclui placeholders e foco não textual), resolvendo referências semânticas no contexto do tema.
- `npm run test:design-system`: verifica a presença de camadas de tokens, variantes de componentes, política de aliases e critérios de responsividade/acessibilidade.
- `npm run test:backend`: executa testes unitários de serviços/componentes e testes de contrato HTTP com o runner nativo `node:test` (sem banco real nem serviços externos).
- `npm test`: atalho para a suíte unitária e de contrato do backend; os fluxos de navegador continuam disponíveis nos comandos E2E existentes.
- `npm run test:e2e` e testes de domínio (`test:catalog`, `test:entertainment`, `test:admin`) validam fluxos e contratos existentes.
- `npm run validate:iptv`: percorre os canais IPTV elegíveis em português/inglês de todas as categorias e produz um relatório por canal; exige o backend ativo. Consulte [STREAMING-VALIDATION-AND-PERFORMANCE.md](STREAMING-VALIDATION-AND-PERFORMANCE.md).
- Para revisão visual, verificar a página inicial e um fluxo representativo de cada área em larguras desktop, tablet e móvel; rever também modo claro, teclado e movimento reduzido.
- Mudanças de API devem manter testes smoke/contrato para input inválido, ausência de credenciais e limites; não acrescentar credenciais nem ficheiros `.env` ao Git.

## Plano incremental

1. **Fundação (feito/em evolução):** tokens partilhados, aliases visuais consistentes, foco global, skip link, redução de movimento, estados acessíveis na busca e testes de estrutura/contraste/governança. A política de migração dos aliases está em `DESIGN-SYSTEM-GOVERNANCE.md`.
2. **Shell e componentes iniciais (feito):** cabeçalho/ações e navegação partilhados nas sete telas principais; cartão reutilizável em Música e Social; categorias locais do Cine preservadas.
3. **Passo 2 (em curso):** navegação global e ações principais já usam SVGs inline com rótulos textuais/ARIA; Cine recebe ícones SVG nos cartões; contrastes dos tokens, acentos de navegação e componentes IPTV passam verificação automatizada. IPTV agora tem filtros com rótulos visíveis, submissão por Enter, limpeza, busy state, estados de erro anunciáveis, prevenção de respostas fora de ordem, estado acessível das vistas e foco visível. Próximo: estender a substituição aos ícones dos controlos do player e aos estados repetidos quando uma extração oferecer ganho real.
4. **Backend (base inicial feita):** `node:test` cobre classificação/tradução de erros, cache de metadata e contratos de health, capabilities e media info. Ampliar cobertura nas rotas de downloads/biblioteca e nos limites/autorização antes de extrair persistência para repositórios.
5. **Operação:** adicionar logs estruturados com request/job IDs, métricas de fila e indicadores de falha das fontes sem expor URLs privadas ou dados de sessão.
6. **Streaming (base inicial feita):** separar APIs de metadata de reprodução; verificar fontes públicas, idiomas PT/EN, HTTPS/DNS, manifesto/segmento e disponibilidade por canal; limitar concorrência/cache e permitir auditoria completa via `npm run validate:iptv`. Próximo: medir latência real do player, erros de CORS/codec por dispositivo e métricas históricas sem armazenar URLs sensíveis.

## Limites desta iteração

Foram adicionados contratos de saúde das fontes e validação individual IPTV; não alteramos política de download, autenticação, persistência ou deployment. O sistema não contorna DRM, autenticação ou bloqueios geográficos. Essa proteção só pode mudar mediante integração oficial, autorização do titular e validação jurídica/técnica específica.
