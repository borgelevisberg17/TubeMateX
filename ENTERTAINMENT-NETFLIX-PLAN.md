# Arquitetura TubeMateX Netflix

## Objetivo

A área Entretenimento será uma experiência de descoberta cinematográfica inspirada em serviços de streaming, mas sem se apresentar como Netflix nem importar catálogo proprietário. O TubeMateX exibirá apenas metadata, imagens e URLs de reprodução obtidos de fontes públicas, oficiais ou explicitamente auditadas.

## Hierarquia da página

| Camada | Função | Dados | Comportamento |
|---|---|---|---|
| Navegação contextual | Alternar Início, Filmes, Séries, Anime & Dorama, Ao vivo e Minha lista | Rotas/estado local | Fica acessível no topo e não cria becos sem saída |
| Hero | Apresentar um título real com imagem, origem, resumo, tipo e disponibilidade | YouTube, Internet Archive ou IPTV aprovado | Botões Ver agora, Mais informações e Minha lista; nunca inventa sinopse |
| Continue Watching | Retomar itens iniciados pelo utilizador | localStorage, apenas após ação de reprodução | Mostra progresso real, remove item e retoma a partir do ponto guardado |
| Rails editoriais | Organizar descoberta por intenção | Pesquisas YouTube, Internet Archive e IPTV filtrado | Cada rail desaparece quando não existem resultados; não há cards fake |
| Canais ao vivo | Acesso a streams públicos | iptv-org com blocklist DMCA/NSFW e metadata | Exibe país, idioma, categoria e disponibilidade; ação é Ver direto |
| Minha lista | Guardar itens para voltar depois | localStorage | Guarda somente itens vistos no catálogo; links metadata-only abrem a fonte |
| Detalhe | Inspecionar antes de reproduzir | Item selecionado | Drawer com origem, tipo, país, idioma, qualidade, disponibilidade e limitações |

## Contrato `GET /api/entertainment/home`

```json
{
  "hero": { "id": "...", "title": "...", "url": "...", "thumbnail": "...", "kind": "film", "site": "..." },
  "rows": [
    { "id": "featured", "title": "Em destaque agora", "kind": "mixed", "items": [] },
    { "id": "public-films", "title": "Filmes públicos", "kind": "film", "items": [] },
    { "id": "live-news", "title": "Notícias ao vivo", "kind": "live", "items": [] }
  ],
  "sources": {},
  "generatedAt": "..."
}
```

O endpoint agrega fontes em paralelo com limites pequenos e cache curto. Cada item mantém `site`, `externalUrl`, `thumbnail`, `duration`, `kind`, `live`, `directStream`, `country`, `languages`, `categories`, `quality` e `availabilityLabel` quando fornecidos pela origem. Uma falha de uma fonte remove apenas o rail afetado.

## Categorias honestas

“Filmes públicos” e “Vídeos longos” descrevem o tipo de resultado, não uma licença universal. Anime, dorama e séries provenientes do YouTube são rotulados como descoberta pública; só serão chamados de episódios quando a fonte fornecer essa informação. IPTV permanece “canal ao vivo público”, sem download e sem promessa de estabilidade.

## Estado local

A reprodução de vídeo grava `id`, `url`, título, thumbnail, origem, duração conhecida e `progressSeconds` em `tubematex-entertainment-progress`. A lista do utilizador grava os itens em `tubematex-entertainment-list`. Nenhum estado é fabricado: as duas filas só aparecem depois de uma ação explícita do utilizador.

## Regras de segurança

A API de home não carrega M3U arbitrária no browser. A fonte geral do iptv-org continua filtrada pelo catálogo oficial e pela blocklist DMCA/NSFW; a lista NSFW permanece bloqueada. M3U.cl continua não verificada e fora da ingestão automática. URLs diretos de YouTube, Internet Archive e canais aprovados passam pelo mesmo player e exibem origem e disponibilidade.

## Referências de UX

A inspiração funcional é a separação entre navegação superior, recomendações responsivas, hub pessoal, Continue Watching removível e detalhe rico antes do play, padrões descritos pela própria Netflix [1] [2] [3]. A implementação mantém identidade própria: vinho/preto cinematográfico, tipografia Space Grotesk, rails horizontais com scroll acessível e controles compactos, sem copiar logótipo, catálogo, artwork ou textos da Netflix.

## Referências

[1]: https://help.netflix.com/en/node/115312 "Netflix Help — Remove titles from Continue Watching"
[2]: https://help.netflix.com/en/node/321880164349028 "Netflix Help — Update to the TV experience and layout"
[3]: https://www.netflix.com/tudum/articles/netflix-new-tv-layout "Netflix Tudum — New TV layout"
