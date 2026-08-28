# Auditoria visual — separação VOD e TV IPTV

Foram capturadas as páginas em 1440×900 e 390×844 contra o backend real. O Cine apresenta um bloco claramente separado para **Filmes, séries e mundos para descobrir** e outro para **TV IPTV live — Canais por país e género**. Os rails de desporto, Portugal e cinema/ação/infantil aparecem antes do hub IPTV detalhado. A área IPTV mostra filtros, fontes auditadas e a seleção ao vivo.

Os cards live receberam logos reais do `logos.json` do iptv-org. Angola, Brasil e Portugal retornaram canais com imagens nos testes de API: Angola 2/2, Brasil 12/12 e Portugal 12/12 nos lotes consultados. O fallback de iniciais é reservado para canais sem logo.

Em mobile, a estrutura permanece legível, com rails horizontais e sem overflow; os filtros passam a coluna única e o footer de espaços permanece acessível. A experiência continua longa, mas agora a hierarquia VOD versus live é explícita.
