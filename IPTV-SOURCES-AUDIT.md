# Auditoria de fontes IPTV

Gerado em 2026-08-28. Esta auditoria separa **canal catalogado**, **URL de stream publicada** e **stream online no momento do teste**. A presença de uma URL pública não prova licença de redistribuição; por isso, o TubeMateX usa a fonte oficial iptv-org como catálogo público e não importa automaticamente listas M3U de terceiros.

## Fonte oficial iptv-org

Foram analisadas as playlists oficiais de Angola (`ao.m3u`), Brasil (`br.m3u`), Portugal (`pt.m3u`), Estados Unidos (`us.m3u`) e Reino Unido (`uk_*.m3u`) no repositório [iptv-org/iptv](https://github.com/iptv-org/iptv), cruzadas com os dados de canais, feeds, streams, logos e blocklist publicados pelo projeto.

A verificação HTTP foi feita com deduplicação por URL, timeout de oito segundos, concorrência limitada, rejeição de hosts privados e tentativa `HEAD` seguida de `GET` com `Range` apenas quando o servidor não suporta `HEAD`.

| País | URLs únicas auditadas | Online | Offline | Host bloqueado |
|---|---:|---:|---:|---:|
| Angola | 3 | 3 | 0 | 0 |
| Brasil | 532 | 353 | 154 | 25 |
| Portugal | 58 | 38 | 20 | 0 |
| Estados Unidos | 962 | 770 | 188 | 4 |
| Reino Unido | 593 | 336 | 253 | 4 |

Os resultados são uma fotografia temporal: streams HLS/DASH podem mudar, expirar, exigir geoblocking, depender de headers ou ficar offline. A auditoria não afirma que todo stream online pode ser redistribuído.

## Repositórios externos analisados

Os repositórios abaixo foram clonados ou inspecionados de forma passiva. Foram extraídos os formatos M3U/M3U8/CSV/JSON e deduplicadas as URLs por país. `iptv-org/epg` e `iptv-org/database` são fontes de apoio/metadata, não substitutos do catálogo de streams.

| Repositório | Países encontrados | URLs extraídas no inventário |
|---|---|---:|
| [Free-TV/IPTV](https://github.com/Free-TV/IPTV) | BR, PT, US, GB | 278 |
| [HerbertHe/iptv-sources](https://github.com/HerbertHe/iptv-sources) | sem país explícito nos ficheiros analisados | não contabilizado por país |
| [Ramys/Iptv-Brasil-2026](https://github.com/Ramys/Iptv-Brasil-2026) | BR | 30.988 |
| [joaoguidugli/FTA-IPTV-Brasil](https://github.com/joaoguidugli/FTA-IPTV-Brasil) | BR | 208 |
| [jhonatadev/Iptv-Brasil-2022](https://github.com/jhonatadev/Iptv-Brasil-2022) | BR | 6.064 |
| [iptv-com/iptv](https://github.com/iptv-com/iptv) | — | sem inventário relevante por país |
| [isactrue/iptv-brasil](https://github.com/isactrue/iptv-brasil) | BR, AO | 41.484 |
| [25011966V/iptv](https://github.com/25011966V/iptv) | — | sem inventário relevante por país |
| [iptvbrazil/iptvbrazil](https://github.com/iptvbrazil/iptvbrazil) | BR | 2.210 |
| [diogo464/iptv-pt](https://github.com/diogo464/iptv-pt) | PT, BR | 287 |
| [abp1989/Portuguese](https://github.com/abp1989/Portuguese) | — | sem inventário relevante por país |
| [Rodri200906/IPTV-Rodri](https://github.com/Rodri200906/IPTV-Rodri) | PT | 1 |
| [herme10/iptv-angola-global](https://github.com/herme10/iptv-angola-global) | AO | 28 |
| [adrielsoi909-ai/Iptv-Angola](https://github.com/adrielsoi909-ai/Iptv-Angola) | AO | 3 |

Os inventários externos incluem grande quantidade de duplicações, hosts dinâmicos, endereços IP, domínios sem relação clara com a emissora, URLs de serviços pagos e entradas que não demonstram autorização de redistribuição. Por esse motivo, eles foram usados para auditoria e comparação, mas não foram incorporados automaticamente ao catálogo público.

## Política aplicada no TubeMateX

O endpoint público `/api/iptv/channels` agora remove qualquer canal que não possua pelo menos uma URL HTTP/HTTPS publicada em `streams.json`. A API não apresenta mais itens `CATÁLOGO` sem stream como se fossem canais ao vivo.

A existência de uma URL ainda não equivale a disponibilidade em tempo real. O player testa a origem durante a abertura e apresenta erros de offline, geoblocking, headers, codec ou incompatibilidade. A consola administrativa permite cadastrar fontes próprias autorizadas e executar health checks com allowlist de domínios antes da aprovação manual.

As entradas com marcação `dmca` ou `nsfw` continuam excluídas. O TubeMateX não agrega streams piratas, conteúdo sexual explícito, IPTV pago vazado, DRM, paywalls ou URLs que exijam contornar autenticação e restrições de terceiros.

## Artefactos locais da auditoria

Os inventários brutos e resultados completos de health check foram guardados fora do repositório em `/home/ubuntu/iptv-audit`. Eles não são publicados porque contêm milhares de URLs de terceiros e podem ficar obsoletos rapidamente. O relatório versionado mantém apenas as métricas, critérios e decisões de integração.
