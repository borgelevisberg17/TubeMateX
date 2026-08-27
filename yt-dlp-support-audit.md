# Auditoria de suporte do yt-dlp

A lista oficial de sites suportados informa que existem milhares de extractors, mas nem todos são garantidos: as plataformas mudam e a única verificação definitiva é testar a URL real. A lista consultada inclui YouTube, SoundCloud, Vimeo, Twitch, Dailymotion, Bandcamp, Audiomack, Mixcloud, Apple Music Connect e Apple Podcasts. Spotify não aparece como extractor geral de catálogo no documento consultado.

A documentação oficial também informa que o YouTube pode exigir PO Token para determinados formatos/recursos e que conteúdos privados, com restrição de idade ou membros exigem autenticação/cookies. A própria documentação alerta para limites de taxa e recomenda intervalos entre downloads quando a sessão atingir rate limit.

No TubeMateX, o backend deve usar yt-dlp como motor de URL direta, expor o extractor retornado, distinguir erro de URL não suportada, autenticação, conteúdo indisponível, rate limit e ausência de URL de stream, e evitar declarar suporte universal baseado apenas no nome da plataforma.

Fontes oficiais:
- https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
- https://github.com/yt-dlp/yt-dlp/wiki/extractors
- https://github.com/yt-dlp/yt-dlp
