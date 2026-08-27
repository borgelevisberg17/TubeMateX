# Auditoria visual intermédia — reconstrução aprovada

As capturas locais em 1440px confirmam que a direção estrutural já separa Música e Social, mas ainda precisa de polimento antes de qualquer publicação.

| Área | Constatação | Correção necessária |
| --- | --- | --- |
| Música | A composição é audio-first e o player está separado, porém o estado vazio fica verticalmente exagerado e domina a tela. | Reduzir o palco vazio, transformar o player num cartão compacto e reservar a escala grande para uma faixa selecionada. |
| Social | O feed tem identidade própria com cards verticais e preview de vídeo, mas o estado vazio ainda é muito baixo contraste e a navegação repete “Biblioteca” no header. | Corrigir a navegação global para não duplicar destinos e melhorar os estados vazios/feedback. |
| Geral | O cabeçalho tem boa simplicidade, mas a tela fica demasiado vazia sem resultados. | Introduzir informação contextual real, sem placeholders: instrução de URL, estado de fontes e área de capacidade. |
| Geral | O contraste entre painéis é adequado, sem gradientes decorativos. | Preservar esta decisão; não voltar ao shell antigo. |

Esta auditoria foi feita antes de qualquer commit/publicação. A próxima iteração deve corrigir os problemas observados e validar também Entretenimento, Biblioteca e Definições.

## Entretenimento

A captura confirma uma identidade mais cinematográfica, com hero editorial e filtros de tipo. Contudo, o hero está excessivamente vazio sem conteúdo e a navegação global continua com a duplicação de Biblioteca. O layout deve manter o contraste entre hero e catálogo, mas reduzir áreas sem informação e incluir um estado inicial mais orientado à ação, como colar link ou pesquisar título, sem dados fictícios.

## Biblioteca e Definições

As capturas em 1440px mostram que a Biblioteca passou a parecer um gestor de ficheiros, com navegação lateral, estatísticas e histórico com ações. O menu de três pontos e a conversão aparecem no mesmo alinhamento, sem sobreposição. Definições passou a ter separação clara entre Preferências, Conta, Dados e Diagnóstico, com controles alinhados e feedback de backend visível.

A validação ainda precisa cobrir interação de pesquisa, menu de três pontos, conversão, preferências persistentes e largura mobile. Nenhuma publicação deve ocorrer antes desses fluxos e do teste real de MP3/MP4.

## Validação no browser interno — home

A nova home carregou corretamente na instância exposta, com navegação para Música, Social, Entretenimento, Biblioteca e Definições, pesquisa global, download rápido e fila. Visualmente, a composição deixou de ser uma linha longa de Command Center: o hero tem hierarquia forte, as cinco áreas são destinos distintos e o painel operacional fica abaixo da escolha de área. Não foram observadas sobreposições na viewport desktop.

A validação visual das páginas especializadas ainda deve ser feita no browser interno, incluindo as versões mobile e os novos temas cromáticos. A sessão local por `localhost` devolveu timeout 504, por isso a validação usa a URL temporariamente exposta da instância sandbox.

## Validação no browser interno — Música

Música carregou com identidade própria: título áudio-first, pesquisa orientada a artistas/faixas/podcasts, chips de fontes e painel de descoberta com espaço reservado ao player horizontal. A composição separa o player da descoberta e não exibe um player de vídeo concorrente. A área de preview permanece vazia até existir uma fonte real, sem placeholder gráfico enganador.

## Validação no browser interno — Social

Social carregou com uma experiência distinta de Música: linguagem de feed, foco em criadores/temas/links e preview exclusivamente de vídeo. O texto agora informa honestamente que TikTok, Instagram e Facebook podem exigir URL direto ou plugin aprovado; os chips mostram apenas os providers de pesquisa nativos disponíveis. A composição não exibe player de áudio nessa área.

## Validação no browser interno — Entretenimento

Entretenimento tem estrutura própria de catálogo: hero de cinema/séries, filtros Tudo/Filmes/Séries/Anime/Dorama e pesquisa de títulos/episódios. A paleta ainda está próxima do tema azul comum nas capturas, portanto a próxima correção visual deve aplicar explicitamente o vermelho cinematográfico solicitado, mantendo o dark como base e sem gradientes decorativos nas previews.

## Tema cinematográfico aplicado

Na instância corrigida, Entretenimento passou a usar fundo dark vinho, bordas vermelhas, CTA vermelho e chips ativos vermelhos. A identidade visual ficou claramente diferente de Música e Social sem usar gradientes nas previews. O contraste dos títulos e filtros permaneceu legível na viewport desktop; falta validar a mesma paleta em mobile.

## Validação no browser interno — Biblioteca

A Biblioteca carregou com navegação lateral, estatísticas, filtros, exportação e lista de ficheiros sem sobreposição. O estado vazio é claro e não usa toast para explicar detalhes. O inspector de detalhes existe na marcação e será validado com dados controlados; o próximo teste deve confirmar que ficheiros MP3 e MP4 abrem players diferentes no mesmo painel, nunca simultaneamente.

## Validação no browser interno — Definições

Definições carregou com navegação lateral e tabs internas Geral/Downloads/Player/Aparência/Sistema. O painel apresenta preferências persistentes, conta, privacidade/histórico e diagnóstico real do backend. A nova resposta de capabilities mantém 5 formatos, 20 plataformas e 2 downloads paralelos; a indicação de autenticação do YouTube ficará disponível no diagnóstico após a atualização do texto do painel.

## Tema Social aplicado

Social passou a usar cyan como cor de ação e identidade de stream, mantendo o fundo dark e os cards próprios de feed. A diferença para o vermelho cinematográfico de Entretenimento ficou clara na navegação, chips e CTA. Não foram observadas sobreposições na viewport desktop.

## Diagnóstico de autenticação visível

A Definições agora mostra diretamente os providers de pesquisa ativos — YouTube, SoundCloud, Vimeo e Twitch — e informa que o YouTube está sem cookies configurados, explicando por que certos conteúdos podem pedir autenticação. Isto substitui a mensagem genérica de falha por uma orientação operacional correta.

## Validação mobile

A captura de 390px da home mostra navegação compactada sem menu horizontal, cards de áreas em duas colunas, download rápido empilhado e fila legível. A captura mobile de Entretenimento mantém o vinho/dark, os filtros quebrados de forma natural e a pesquisa sem sobreposição. O texto do placeholder de pesquisa é truncado dentro do campo, sem overflow horizontal.

## Nova descoberta real — Home

A Home da instância 3012 carregou o estado de descoberta conectado ao endpoint `/api/discover`, em vez de inserir cards falsos no HTML. O painel começa com a mensagem de carregamento e deve atualizar para itens reais provenientes de YouTube/SoundCloud e, quando configurados, catálogos oficiais opcionais.

## Home com descoberta efetiva no browser interno

A Home carregou 8 itens reais do endpoint de descoberta. A amostra observada trouxe faixas e sessões do SoundCloud com botão **Ouvir**, e resultados do YouTube com **Pré-visualizar**, cada um mantendo origem, título, autor e duração. Não foram inseridos itens fictícios. O player da Home agora suporta áudio e vídeo de forma mutuamente exclusiva.

## Social com feed real

O Social carregou 8 cards reais de YouTube no browser interno, com thumbnails, origem, duração, preview de vídeo e download. Não mostrou TikTok fictício: como não há URLs editoriais TikTok configurados nem pesquisa anónima suportada pelo extractor local, a área mantém a instrução de colar um link público TikTok/Instagram/Facebook ou configurar fontes aprovadas. Isso é preferível a inventar resultados.

## Problema encontrado no teste Social

Ao colar um URL TikTok no browser interno enquanto o feed inicial ainda carregava, a resposta da descoberta terminou depois e voltou a renderizar o feed, ocultando a pesquisa direta. Isto é uma condição de corrida no frontend, não uma falha do extractor. A correção deve ignorar a resposta de descoberta quando o utilizador já iniciou uma pesquisa.

## TikTok direct link validado no browser interno

Após corrigir a condição de corrida, o link público TikTok foi submetido no Social e devolveu um card real com thumbnail, título, autor `scout2015`, duração de 10 segundos, origem TikTok e ações **Abrir vídeo**/**Baixar**. A descoberta inicial não sobrescreveu mais o resultado direto.

## Preview TikTok no Social

O card TikTok real ficou visível como experiência de feed vertical, e o botão **Abrir vídeo** iniciou o estado de preparação do preview no browser interno. A próxima verificação deve confirmar a abertura do drawer/player após a resolução da stream.

## Feed Social misto validado

Com `TIKTOK_DISCOVERY_URLS` configurado, o browser interno mostrou 9 itens reais: um card TikTok com thumbnail/duração e oito cards YouTube. A origem aparece em cada card e as ações permanecem focadas em vídeo. Assim, o feed TikTok é real, mas configurável, respeitando a ausência de pesquisa TikTok anónima oficial no extractor instalado.

## Música com descoberta real

A área Música apresenta identidade lime/áudio-first, player horizontal dedicado e fontes YouTube/SoundCloud visíveis. No primeiro instante o painel mostra carregamento assíncrono; a API real já foi validada por curl e deve substituir este estado por faixas reais. Spotify e Apple Music continuam disponíveis como metadata-only apenas quando tokens oficiais forem configurados.

## Player áudio real validado

A área Música carregou 12 resultados reais, principalmente SoundCloud e YouTube, com duração, artista, origem e ações Ouvir/Baixar. Ao clicar em Ouvir, o player áudio-first entrou no estado de preparação sem abrir drawer de vídeo; a exclusividade entre áudio e vídeo permanece respeitada.

## Player e Entretenimento real

O browser interno mostrou uma faixa SoundCloud real no player horizontal, com título, artista, tempo decorrido e duração total. Entretenimento abriu com a paleta vermelho/vinho solicitada, filtros de Filmes/Séries/Anime/Dorama e descoberta assíncrona pronta para receber YouTube, Internet Archive e IPTV público.

## IPTV público no player

O primeiro card de IPTV público (`AsianBox · Direto`, origem iptv-org, país MN) abriu um drawer de vídeo com nome, estado ao vivo e controles nativos. O player chegou a 0:00 e iniciou preparação; a disponibilidade concreta depende do endpoint de stream individual, por isso o produto deve manter estado de erro/indisponível quando o canal estiver offline, sem afirmar que todo canal funciona permanentemente.

## Home final com múltiplas fontes

A Home carregou 8 itens reais no browser interno, misturando Internet Archive, YouTube e SoundCloud. Cada item exibe título, origem e duração; faixas receberam **Ouvir** e vídeos **Pré-visualizar**, sem cards fictícios. A descoberta agora é assíncrona, cacheada por cinco minutos e orientada por termos rotativos.

## Catálogo de Entretenimento validado

O catálogo final mostrou 12 itens reais com origem: YouTube trouxe short films, Internet Archive trouxe filmes públicos e iptv-org trouxe canais ao vivo como ToonGoggles/Are We There Yet?/AXN CEE. Os canais IPTV exibem **Ver direto**, não **Baixar**, e não são rotulados como dorama sem metadata explícita. Os filtros da interface estão ligados à metadata de título/descrição e podem retornar vazio para Dorama/Anime quando a fonte não sustenta essa classificação.

## Catálogo filtrável — browser

A rota atualizada de Entretenimento abriu no browser conectado, mas a extensão expirou ao aguardar a hidratação visual (HTTP 504). A validação funcional permanece disponível na instância local: os filtros Brasil/português/notícias, Portugal/português/entretenimento, EUA/inglês/documentário e Coreia/coreano/entretenimento retornaram apenas canais compatíveis; a pesquisa `Record` retornou Record News e `National Geographic` retornou quatro streams catalogados. Continuarei com Playwright headless e API local, sem pedir takeover ao utilizador.
