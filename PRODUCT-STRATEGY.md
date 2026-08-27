# TubeMateX — Estratégia de produto e critérios de aceite

## Diagnóstico

A interface atual utiliza o mesmo shell para todas as áreas. Isso cria uma experiência indistinta: Música, Social, Entretenimento, Biblioteca e Definições parecem a mesma página com filtros diferentes. O player ocupa uma coluna lateral mesmo quando não é relevante, a área de plataformas consome demasiado espaço e o histórico aparece como uma lista técnica sem contexto de biblioteca. A captura também mostra pouca diferenciação de tarefas, densidade irregular e ausência de uma navegação contextual clara.

O problema não é resolvido apenas com novas cores ou mais cards. É necessário separar as experiências por objetivo, mantendo apenas tokens, acessibilidade, navegação global e componentes básicos compartilhados.

## Nova arquitetura de experiência

### 1. Música e Áudio

Objetivo: encontrar, ouvir e guardar áudio rapidamente.

A página deve abrir com um cabeçalho de descoberta musical, pesquisa ampla e atalhos de playlists/álbuns quando houver metadata. O centro deve priorizar uma lista compacta de faixas com capa, artista, duração, fonte, qualidade e ação principal. O player de áudio deve ser persistente no rodapé, ocupando uma faixa horizontal, com capa, título, waveform/progresso, controles, volume, velocidade e fila. Não deve existir um palco de vídeo nesta experiência.

Filtros específicos: fonte, artista, duração, bitrate, formato e tipo de áudio. A ação principal é Ouvir/Pré-visualizar; Baixar é secundária mas sempre acessível. A UI deve mostrar explicitamente quando uma fonte é catálogo/metadata-only.

### 2. Social

Objetivo: descobrir vídeos curtos e conteúdo social para guardar individualmente ou em lote.

A página deve usar uma composição de descoberta visual com grid responsivo de cards verticais, proporção 9:16 quando a thumbnail indicar conteúdo curto, badge grande de plataforma, autor, data/duração e seleção múltipla. O player deve abrir num drawer/modal de vídeo focalizado, não no mini player de áudio. A fila deve oferecer seleção de vários itens e download em lote sem ocupar a área principal.

Filtros específicos: plataforma, vídeo curto/longo, ao vivo, autor, data e qualidade. O formato padrão deve ser MP4/WEBM; MP3 não deve ser o CTA dominante nesta área.

### 3. Entretenimento

Objetivo: navegar por vídeo longo, filmes, séries, anime, dorama, novelas e episódios públicos/autorizados.

A página deve usar catálogo editorial: hero de item selecionado quando houver metadata, fileiras ou grid de títulos, cards largos e uma área de detalhes com título, sinopse, duração, temporada/episódio, idioma, legendas e qualidade. A seleção de episódio deve preceder o download. O player deve ocupar a área principal em proporção cinematográfica e não competir com o player de áudio.

Filtros específicos: filme/série/anime/dorama/novela, temporada, episódio, resolução, legenda, idioma e fonte. A UI deve diferenciar claramente conteúdo público disponível de conteúdo protegido ou indisponível.

### 4. Biblioteca

Objetivo: gerir ficheiros e histórico, não pesquisar.

A Biblioteca deve abandonar o formato de lista genérica. Deve possuir resumo de armazenamento, tabs Todos, Áudio, Vídeo, Favoritos e Falhas, pesquisa local, ordenação e visão lista/grid. Cada item precisa de menu vertical consistente com Ver detalhes, Guardar, Converter, Repetir e Remover. O detalhe deve abrir um painel lateral com metadata, origem, tamanho, formato, data, estado e ações.

### 5. Definições

Objetivo: configurar o sistema sem misturar conta, download e diagnóstico.

A tela deve ter navegação interna por categorias: Geral, Downloads, Player, Aparência, Fontes, Armazenamento, Conta e Sobre. Cada categoria deve conter apenas controles relacionados, descrição curta, valor atual e feedback de salvamento. O estado do backend, extractors/plugins, diretório de downloads, limite de concorrência e testes de conectividade devem ficar em Diagnóstico/Sistema, não misturados com preferências pessoais.

## Shell compartilhado, não template compartilhado

Todas as áreas podem compartilhar marca, tokens de cor, tipografia, ícones, notificações, acessibilidade, menu de conta e comportamento de navegação. Elas não devem compartilhar a mesma composição de três colunas, os mesmos filtros ou o mesmo player.

A navegação global deve indicar a área atual e oferecer cinco destinos: Música, Social, Entretenimento, Biblioteca e Definições. Cada área deve ter subnavegação própria e CTA contextual.

## Contratos necessários do backend

A UI deve consumir dados reais e separar capacidades reais de marketing. Os contratos principais são:

| Necessidade | Contrato |
| --- | --- |
| Pesquisa categorizada | `/api/search?q=&type=&source=&limit=` com providers configurados |
| Metadata de URL | `/api/media/info?url=` |
| Stream | `/api/media/stream?url=&type=` |
| Download | `POST /api/downloads` com URL, formato e qualidade |
| Fila em tempo real | `/api/downloads/:id/events` |
| Biblioteca/histórico | `/api/library`, `/api/history`, `/api/favorites` |
| Plataformas e plugins | `/api/platforms`, `/api/plugins` |
| Diagnóstico | `/api/capabilities` |

Quando não houver suporte real, a interface deve mostrar Não disponível, Requer autenticação, Catálogo/metadata-only ou URL direta necessária. Nunca deve renderizar dados de demonstração para preencher espaço.

## Player — regra central

Deve existir apenas um contexto de mídia ativo. Música usa o player persistente horizontal; Social e Entretenimento usam player de vídeo focalizado. Trocar de área pausa e limpa o contexto anterior. Um vídeo nunca deve aparecer dentro do mini player de áudio. Streams sem URL compatível devem mostrar estado de erro com causa provável e ação de tentar outra fonte/qualidade.

## Critérios de aceite antes da publicação

1. Cada rota possui composição visual própria e o objetivo da área é compreensível em cinco segundos.
2. Nenhum card, player, histórico ou estatística usa dados inventados.
3. O player de áudio e o player de vídeo não ficam simultaneamente ativos.
4. A Biblioteca tem menu de três pontos estilizado em todos os estados, incluindo itens carregados depois da pesquisa.
5. Definições possui navegação interna, feedback de salvamento e agrupamento compreensível.
6. As páginas continuam funcionais em 1440px, 1055px, 768px e 390px sem overflow horizontal.
7. Pesquisa, metadata, stream, download, fila e histórico continuam consumindo as rotas reais.
8. TikTok MP4 e SoundCloud MP3 continuam passando no smoke test real.
9. Spotify e Apple Music são testados como metadata/limitação, sem falsa promessa de download DRM.
10. A suíte E2E, testes de responsividade e smoke tests devem passar antes do commit.
11. O navegador deve ser aberto para uma inspeção visual final de cada área antes da publicação.
12. A publicação somente ocorre depois de comparar a implementação com este documento e confirmar que todos os critérios foram satisfeitos.
