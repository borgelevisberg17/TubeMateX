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
