# Auditoria visual — Entretenimento TubeMateX Netflix

## Capturas verificadas

| Largura | Resultado técnico | Observação visual |
|---|---|---|
| 1440 px | Sem overflow horizontal; hero, 8 rails de catálogo e hub live renderizados | Hero com imagem real, CTA claros, rails densos e origem visível em cada card |
| 768 px | Sem overflow horizontal | Navegação permanece legível e rails continuam horizontais sem comprimir cards |
| 390 px | Sem overflow horizontal | Hero vertical com ações reduzidas, navegação horizontal, cards em rails de dois itens e filtros em coluna |

## Achados

A experiência já apresenta uma mudança clara em relação à página anterior: hero de conteúdo real, hierarquia cinematográfica, rails horizontais por intenção, seção live separada, origem nos cards e drawer de detalhes. A captura mobile não mostra sobreposição nem componentes fora da largura; a densidade de cards é mantida através de scroll horizontal.

O hero atualmente recebe uma thumbnail real de uma busca pública do YouTube. A descrição é deliberadamente explicativa quando a fonte não fornece sinopse. Os cards IPTV aparecem sem thumbnail quando o catálogo não disponibiliza logo, preservando a honestidade da origem em vez de criar arte falsa.

A reprodução do item selecionado foi validada no E2E, incluindo a abertura do player live e o ciclo de fecho. O estado de Minha lista e Continue Watching é persistido localmente após ações reais. O contrato agregado foi validado contra a instância backend real, devolvendo hero e oito rails com origem. O player live aceita HLS.js em Chromium e mantém fallback nativo quando disponível. Não há necessidade de importar assets locais ou gerar capas artificiais.


## Auditoria visual final — footer e players

As capturas finais confirmam que o footer global aparece no Cine com seis destinos — Início, Music, Cine, Social, Biblioteca e Definições Gerais — e que a navegação local do Cine continua separada no topo para Início, Filmes, Séries, Anime & Dorama, Ao vivo e Minha lista. O hero usa uma imagem real de catálogo e o catálogo inicia automaticamente, sem o estado inicial “A preparar o catálogo” visível após o carregamento.

No desktop, a hierarquia é cinematográfica: hero amplo, rails independentes para destaque, filmes, séries, anime, dorama, documentários, notícias e canais públicos. No mobile, os rails mantêm cards legíveis em scroll horizontal, os filtros live passam para uma coluna e o footer adapta-se para uma grelha de duas colunas. As capturas desktop e mobile não apresentam overflow horizontal.

O drawer de detalhe inclui player interno HTML5/HLS, destino VLC e destino mpv, além de download VOD e painel de temporadas/episódios condicionado à existência de uma playlist real. Canais live continuam sem botão de download.
