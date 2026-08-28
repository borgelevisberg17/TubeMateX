# Auditoria de plataformas e formatos — evidência inicial

## Evidência oficial do yt-dlp

A documentação oficial de seleção de formatos informa que, sem opções, o yt-dlp tenta usar algo equivalente a `bestvideo*+bestaudio/best`. Ela também distingue `best` (um formato que contém vídeo e áudio), `bestvideo*` (melhor formato com vídeo) e `bestaudio` (melhor áudio-only). Códigos de formato específicos são dependentes do extractor e só podem ser confirmados com `--list-formats` para o item concreto.[1]

A lista oficial de sites suportados afirma que os extractors mudam com frequência, que um site listado não é garantia de funcionamento e que a única forma confiável de verificar suporte é tentar o URL real. Sites ausentes podem, em alguns casos, funcionar pelo extractor genérico ou por embed extraction.[2]

## Implicação para o erro observado

A mensagem `Requested format is not available` não é uma falha de URL por si só. Ela significa que a expressão pedida não encontrou uma combinação disponível para aquele vídeo. A correção deve usar fallback adaptativo e, em caso de falha, relistar formatos/diagnosticar o item, em vez de repetir uma combinação rígida ou afirmar que todas as qualidades são suportadas.

## Referências

[1]: https://github.com/yt-dlp/yt-dlp#format-selection — yt-dlp, “Format selection”.
[2]: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md — yt-dlp, “Supported sites”.

## Inventário da instalação local

A instalação local do yt-dlp expõe extractors para YouTube, SoundCloud, TikTok, Instagram, Facebook, Reddit, Vimeo, Twitch, Kick, Bilibili, Dailymotion, Bandcamp, Mixcloud, Audiomack, Archive.org, Apple Podcasts e Apple Music Connect. O próprio output marca alguns extractors como `CURRENTLY BROKEN`, incluindo Instagram user, TikTok effect/sound/tag. A presença do extractor não garante que cada URL funcione: o comportamento depende do tipo de URL, disponibilidade pública, autenticação, região e alterações da plataforma.

O catálogo do produto deve, portanto, distinguir: pesquisa nativa disponível no backend; download/metadata por URL direta; suporte condicionado a autenticação; plugins opcionais; e catálogo metadata-only/DRM. Não é tecnicamente honesto apresentar Spotify ou o catálogo Apple Music como downloads normais quando o extractor retorna DRM ou URL unsupported.

## Pesquisa de APIs oficiais para Social

A documentação oficial do TikTok apresenta Login Kit, Content Display, Embed Videos, Content Posting API, Share Kit e Research & Insights. O uso oficial está centrado em contas/autorização, publicação, embeds e pesquisa/insights com requisitos próprios; não existe na página um endpoint aberto equivalente a uma pesquisa geral anónima para alimentar um downloader. A experiência Social pode oferecer URL direto via yt-dlp e embed/metadata quando possível, mas não deve fingir que uma API pública geral do TikTok está disponível.[3]

A documentação oficial da Instagram Graph API informa que `GET /<IG_MEDIA_ID>` exige access token e que a API retorna apenas media de contas profissionais do Instagram; não pode consultar media de contas pessoais. Portanto, Instagram direct-link download deve ser tratado como extractor condicionado a URL público, cookies/autorização e mudanças do Instagram, com erro explícito quando a origem bloquear o acesso. Uma integração oficial futura exigiria credenciais Meta e contas profissionais autorizadas, não apenas uma chamada pública sem chave.[4]

## Referências

[3]: https://developers.tiktok.com/ — TikTok for Developers, produtos e APIs oficiais.
[4]: https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media — Meta, “Mídia do Instagram”.

## Pesquisa de APIs oficiais para Áudio

A Web API oficial do Spotify permite pesquisar álbuns, artistas, playlists, faixas, shows, episódios e audiobooks, com filtros de mercado, paginação e links externos. A própria referência de faixas inclui a política de que o conteúdo Spotify não pode ser descarregado; portanto, a integração correta é metadata, links para Spotify e, se credenciais/escopo forem fornecidos, playback autorizado via SDK/API — não extrair áudio protegido.[5]

A Apple Music API oficial serve para obter informação sobre álbuns, músicas, artistas, playlists, vídeos musicais, estações, ratings e charts, e a busca oficial cobre catálogo e biblioteca do utilizador. Isso permite uma área de descoberta real com metadata e links, mas não transforma o catálogo protegido em ficheiros MP3/MP4 públicos. Apple Music deve continuar como metadata/link ou playback autorizado via MusicKit quando as credenciais e o contexto de utilizador existirem.[6]

## Referências

[5]: https://developer.spotify.com/documentation/web-api/reference/search — Spotify for Developers, “Search for Item”.
[6]: https://developer.apple.com/documentation/applemusicapi — Apple Developer, “Apple Music API”.

## Entretenimento e fontes públicas

A documentação do YouTube Data API confirma que `search.list` pesquisa vídeos e permite restringir resultados por região através de `regionCode`; esta API é adequada para descoberta estruturada quando uma chave de API estiver configurada, enquanto o extractor yt-dlp continua responsável por resolver URLs públicos e streams.[7]

O repositório público iptv-org mantém uma coleção de canais IPTV publicamente disponíveis, playlists M3U e uma API separada. O próprio repositório declara que não armazena os vídeos e que as ligações são submetidas por utilizadores, podendo ser removidas quando infringem direitos. Por isso, uma integração segura deve importar apenas metadata/canais públicos, mostrar origem e país, verificar disponibilidade e permitir reprodução de streams ao vivo — não assumir que todos os canais ou conteúdos de doramas/filmes são licenciados ou estáveis.[8]

Para filmes públicos, o Internet Archive oferece uma coleção de filmes e vídeos gratuitos/emprestáveis. É uma fonte mais adequada para uma primeira integração de catálogo aberto do que sites de streaming desconhecidos. Para sites públicos adicionais, o TubeMateX deve exigir extractor suportado, URL público e estado de disponibilidade; não deve agregar links piratas ou catálogos sem licença verificável.

## Referências

[7]: https://developers.google.com/youtube/v3/docs/search/list — Google for Developers, “Search: list”.
[8]: https://github.com/iptv-org/iptv — iptv-org, “Collection of publicly available IPTV channels”.

## Probe local de descoberta

O probe local `tiktok:search5:anime` falhou com `Unsupported url scheme: "tiktok"`; portanto, a versão instalada não oferece pesquisa TikTok anónima via yt-dlp. O suporte TikTok real permanece por URL direto público, metadata/stream resolvido pelo extractor e uma lista editorial opcional configurada em `TIKTOK_DISCOVERY_URLS`. Isso evita colocar cards fictícios no feed e torna a limitação visível.

## Estrutura oficial do catálogo IPTV

A API pública do iptv-org expõe `channels.json`, `streams.json`, `feeds.json`, `guides.json`, categorias, idiomas e países. O canal fornece nome, nomes alternativos, país, categorias, site oficial e indicador NSFW; o stream fornece URL, feed, qualidade e um `label` para casos em que a transmissão pode não estar disponível. A documentação também expõe uma `blocklist` com razões `dmca` ou `nsfw`. O catálogo do TubeMateX deve consumir estes campos e manter origem, país, idioma, categoria, qualidade e label de disponibilidade no card, removendo itens bloqueados e evitando confundir uma transmissão pública com licença universal.[9]

## Referências

[9]: https://github.com/iptv-org/api#readme — iptv-org API, campos de Channels, Streams, Languages, Countries e Blocklist.

## Playlists fornecidas pelo utilizador

A documentação oficial do iptv-org confirma que a playlist principal atualmente publicada é `https://iptv-org.github.io/iptv/index.m3u`; as outras playlists são listadas em `PLAYLISTS.md`. O projeto declara que apenas mantém links submetidos publicamente, não hospeda ficheiros e não controla o destino dos links; também prevê remoção quando um titular de direitos apresenta uma reclamação. Portanto, a playlist geral não deve ser chamada de “garantia legal” ou “segura” no sentido absoluto: o TubeMateX deve aplicar a sua própria exclusão de NSFW/DMCA, manter o link da fonte e testar a disponibilidade no momento da reprodução.[10]

A URL `https://iptv-org.github.io/iptv/index.nsfw.m3u` devolveu HTTP 404 durante a auditoria de 27/08/2026. Não deve ser adicionada como fonte funcional até existir no README/PLAYLISTS ou responder com M3U válido. A lista geral baixada tinha 12.857 entradas, 27 candidatos por nome a conteúdo adulto e deve ser filtrada no backend; a lista em espanhol tinha 2.259 entradas, três candidatos adultos; a lista de Espanha tinha 336 entradas, sem candidatos adultos pelo filtro nominal. Estas listas são variantes da mesma base: todos os itens de espanhol/Espanha estavam presentes na lista geral no momento da auditoria.[10]

O artigo da Oficina da Net recomenda fontes oficiais como EBC/TV Brasil, TV Cultura, TV Câmara, TV Senado, TV Justiça, TV Escola, SescTV, Rede Minas, Canal Futura, TVs universitárias e NASA TV, e alerta que ofertas gratuitas de canais pagos como Globo, Telecine, ESPN, HBO e Premiere são pirataria. O domínio `jethrojeff.com` não é uma playlist IPTV: é um site editorial de desenvolvimento pessoal, saúde, lifestyle e comida, sem M3U/streams identificados. O endpoint `https://www.m3u.cl/lista/total.m3u` respondeu com 1.076 entradas e sete URLs duplicadas, mas não fornece a mesma taxonomia/origem do iptv-org; será tratado como fonte externa não aprovada até validação individual dos links.[11] [12]

[10]: https://github.com/iptv-org/iptv#readme — README oficial do iptv-org/iptv.
[11]: https://www.oficinadanet.com.br/iptv/62987-listas-iptv-gratis-2025 — artigo consultado em 27/08/2026.
[12]: https://jethrojeff.com/ — página consultada em 27/08/2026; não é uma playlist IPTV.


## Atualização — escopo IPTV e players externos

A documentação oficial do [iptv-org/iptv](https://github.com/iptv-org/iptv) descreve o projeto como uma coleção de canais IPTV publicamente disponíveis, orientada para players com suporte a transmissão live. O repositório esclarece que não armazena ficheiros de vídeo, mas links submetidos publicamente, e que não controla o destino desses links. A API expõe canais, feeds, logos, streams, guias e blocklist, mas não constitui um catálogo VOD hierárquico com temporadas e episódios. Assim, o TubeMateX Cine pode carregar automaticamente todos os canais aprovados como live, mas só deve mostrar temporadas e episódios quando uma fonte VOD separada fornecer essa estrutura e URLs verificáveis.

Para reprodução HLS em browsers Chromium, a referência técnica do [hls.js](https://github.com/video-dev/hls.js/) confirma o uso de MediaSource Extensions sobre o elemento HTML5 video; o fallback nativo continua necessário em ambientes com suporte nativo a HLS. VLC e mpv serão apresentados como destinos externos opcionais através de links/protocolos locais, sem fingir que o browser consegue abrir uma aplicação instalada ou transferir headers privados para uma origem externa.


## Atualização — separação editorial entre Social e Cine

A experiência TubeMateX Cine foi reposicionada para não funcionar como uma lista de trailers do YouTube. O endpoint dedicado `/api/entertainment/home` agora usa Internet Archive para vídeo público e iptv-org filtrado para canais/feeds live. A pesquisa dedicada `/api/entertainment/search` também exclui YouTube e informa essa política no contrato. YouTube continua disponível nos fluxos de Social, onde vídeos curtos, criadores e URLs diretos são o contexto adequado.

O hero do Cine é institucional: apresenta a proposta de descoberta de filmes, séries, anime, doramas, novelas, documentários e televisão pública, usando uma imagem real de catálogo apenas como ambientação visual. O título do hero não é um trailer aleatório nem uma promessa de catálogo proprietário.

## Diagnóstico de reprodução HLS — agosto de 2026

A falha genérica `O canal live não pôde ser descodificado neste momento` foi refinada no player do Cine. A auditoria de amostras reais encontrou manifestações HLS HTTP 200 com codecs AVC/AAC, mas também fontes que respondem HTTP 403 por geoblocking, fontes com headers/referrer exigidos e manifests ou segmentos que podem expirar. O browser não consegue adicionar arbitrariamente `Referer` ou `User-Agent` a cada pedido de segmento sem um proxy autorizado; por isso o catálogo agora preserva esses requisitos e encaminha esses casos para VLC, mpv ou para a fonte original.

O HLS.js passou a classificar falhas fatais por HTTP 401/403 (região ou headers), 404/410 (manifesto/segmentos indisponíveis), `mediaError` (codec incompatível) e indisponibilidade genérica. O player evita tentar diretamente canais marcados `Geo-blocked` e oferece retry manual, sem loops automáticos.
