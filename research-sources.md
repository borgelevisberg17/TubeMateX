# Pesquisa de fontes externas — TubeMateX Cine

## IPTV público

- iptv-org/iptv: https://github.com/iptv-org/iptv
  - Coleção de canais IPTV publicamente disponíveis.
  - Playlist geral: https://iptv-org.github.io/iptv/index.m3u
  - O projeto informa que não armazena os vídeos, apenas links públicos submetidos por utilizadores, e que a presença de um link não garante controlo sobre o destino, disponibilidade ou licença global.
  - PLAYLISTS.md: https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md
  - A documentação lista playlists por país, categoria e idioma; o uso esperado é em players com suporte live.

- iptv-org/api: https://github.com/iptv-org/api
  - Endpoints públicos:
    - https://iptv-org.github.io/api/channels.json
    - https://iptv-org.github.io/api/feeds.json
    - https://iptv-org.github.io/api/logos.json
    - https://iptv-org.github.io/api/streams.json
    - https://iptv-org.github.io/api/guides.json
    - https://iptv-org.github.io/api/categories.json
    - https://iptv-org.github.io/api/countries.json
    - https://iptv-org.github.io/api/blocklist.json
  - `channels.json` fornece país ISO, categorias, website e `is_nsfw`.
  - `feeds.json` fornece idiomas, área de transmissão e formato.
  - `logos.json` fornece logos por canal/feed.
  - `streams.json` fornece URL, qualidade, `referrer`, `user_agent` e labels como `Geo-blocked`.
  - `blocklist.json` contém razões como `dmca` e `nsfw`.

## Catálogos de metadata e VOD autorizável

- TMDB API: https://developer.themoviedb.org/reference/getting-started
  - API oficial com endpoints de filmes, séries, pesquisa, trending, popularidade e watch providers.
  - Requer API key.
  - Deve ser usada para metadata, descoberta e links/provedores oficiais; não fornece autorização para redistribuir filmes.

- AniList GraphQL API: https://docs.anilist.co/
  - API oficial GraphQL para metadata de anime, manga, popularidade e estado de exibição.
  - Pode fornecer descoberta sem transformar o catálogo protegido em ficheiros.

- TVmaze API: https://www.tvmaze.com/api
  - API REST pública para pesquisa de séries, metadata, episódios, temporadas, schedules e imagens.
  - A documentação informa endpoints como `/search/shows`, `/shows/:id`, `/shows/:id/episodes` e `/shows/:id/seasons`.
  - Adequada para catálogo de séries/episódios e links de origem, não para extrair streams de terceiros.

- Internet Archive APIs: https://archive.org/developers/index-apis.html
  - Disponibiliza APIs oficiais de metadata, pesquisa e acesso a itens.
  - Itens públicos podem ter ficheiros de vídeo reproduzíveis, mas cada item deve ser tratado conforme a licença/metadata da fonte.
  - A integração atual usa Advanced Search e Item Metadata para descobrir ficheiros de vídeo públicos.

## Fontes não aprovadas para agregação automática

- Listas IPTV desconhecidas, domínios que prometem canais pagos sem licença e sites do tipo Cinegato/123Movies não devem ser incorporados automaticamente.
- Serviços como Netflix, Spotify e Apple Music podem ser usados para metadata, links ou playback autorizado quando credenciais e termos permitirem; não devem ser convertidos em download/streaming não autorizado.
- Não implementar bypass de DRM, paywall, login, geoblocking ou headers privados. Streams com requisitos `referrer`/`user_agent` ou labels de bloqueio devem ser sinalizadas e, quando possível, encaminhadas à fonte oficial ou a um player externo compatível.
