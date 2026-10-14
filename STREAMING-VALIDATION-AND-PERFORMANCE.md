# TubeMateX — validação e desempenho de streaming

## Objetivo e escopo

As secções de reprodução devem apresentar **apenas media que passou por uma verificação técnica recente**. Catálogos que só descrevem títulos não são tratados como fontes de streams. A base atual abrange o catálogo IPTV-org (todos os géneros, idioma português ou inglês), itens públicos do Internet Archive encontrados por pesquisa e fontes administradas que tenham URL de media, estado `online` e idioma suportado.

## Fontes e contratos

| Fonte | Função | Regra de apresentação |
|---|---|---|
| IPTV-org | Feeds públicos de canais ao vivo | Só `por`/`eng`, qualquer categoria, HTTPS e stream aprovada pelo validador. |
| Internet Archive | Pesquisa de media VOD pública | Só resultados com ficheiro de vídeo, idioma PT/EN e ficheiro/manifesto acessível na verificação. |
| Catálogo administrado | Streams autorizadas pelo proprietário | Exige aprovação, `mediaUrl`, idioma PT/EN e saúde `online`. |
| TMDB, AniList, TVmaze | Metadata | Continuam visíveis no estado de fontes como `metadata-only`; não alimentam botões ou rails de reprodução. |

`GET /api/entertainment/sources/health` verifica a reachability das APIs e cacheia a resposta por cinco minutos. Esse estado não comprova a disponibilidade de cada item. `/api/iptv/channels` fornece `validation` por canal — idioma, categorias, estado, rótulo, instante e latência — sem devolver URLs no relatório de saúde. Os resultados em `results` contêm somente streams aprovadas.

## Estados do validador

- **`online`**: resposta HTTPS válida durante a sondagem. Para HLS e DASH, o validador verifica o manifesto e tenta uma amostra inicial de segmento; para ficheiros, usa um pedido `Range` curto. É um sinal técnico, não uma promessa de reprodução contínua.
- **`restricted`**: requer acesso adicional, a origem recusou o pedido, sinalizou uma restrição legal/regional (`451`) ou aplicou limite temporário (`429`).
- **`drm-protected` / `protected-unverified`**: proteção declarada ou chave HLS cuja autorização não foi comprovada.
- **`insecure` / `unsafe`**: HTTP simples, destino privado/reservado ou destino inseguro após redirecionamento.
- **`offline`, `timeout`, `incompatible`, `unsupported`**: stream inacessível, demasiado lenta, formato não reconhecido ou dependência incompatível com o player web.
- **`checking` / `unverified`**: ainda não testada. Não é apresentada como reproduzível.

A sonda limita bytes e duração, valida DNS público e cada redirecionamento, e usa concorrência limitada. O estado IPTV fica em cache por 30 minutos; reiniciar o backend invalida esse cache. A interface valida em lotes pequenos, anuncia progresso e só oferece “Validar mais fontes” depois de terminar o lote atual.

## Relatório completo do catálogo IPTV

Com o backend a correr, numa segunda consola:

```bash
npm run validate:iptv
```

O comando percorre todos os canais elegíveis PT/EN em todas as categorias, aguarda os lotes, consulta também a saúde das APIs e grava `backend/data/iptv-validation-report.json`. O polling padrão é de 15 segundos, respeita `Retry-After` em HTTP 429 e não altera o rate limit normal do backend. Sobrescreve o caminho com `IPTV_REPORT_PATH=/caminho/relatorio.json`; define o limite (padrão: 60 minutos) com `IPTV_VALIDATION_MAX_MINUTES=45`. O relatório contém resumo por estado e resultados por canal, sem URLs ou credenciais.

O catálogo público é dinâmico: o relatório representa o instante da sondagem. Canais podem mudar, ficar offline, funcionar só nalgumas regiões ou deixar de ser compatíveis com um browser/dispositivo.

Este comando varre os canais IPTV elegíveis. Não enumera os milhões de registos do Internet Archive: a saúde da API Archive é reportada separadamente e cada resultado VOD é sondado quando entra na descoberta/pesquisa.

## Limites de acesso e direitos

O TubeMateX **não contorna DRM, autenticação, paywalls, geoblocking, CORS ou headers de sessão**. `401`, `403` ou `451` não autorizam uma tentativa de bypass. Para media legitimamente licenciada com restrições, o caminho é uma integração oficial com OAuth/autorização do titular, direitos territoriais apropriados e regras de reprodução fornecidas pelo provedor; um item só passa a reproduzível depois dessa integração e da validação normal.

A verificação técnica não substitui validação de direitos autorais/licenciamento. “Online” também não significa que o navegador consiga reproduzir todos os codecs ou que a stream continue disponível depois da amostra.

## Otimização do player

- Cancelar operações assíncronas antigas na troca de canal, para que uma resposta atrasada não substitua a reprodução atual.
- Limpar instâncias de HLS/DASH e listeners antigos antes de iniciar outro item.
- Manter o buffer HLS limitado e o carregamento de vídeo sob demanda; os limites devem ser ajustados por medições de latência/memória, não por preload indiscriminado.
- Quando uma stream falha, tentar apenas outra alternativa pública/browser-compatible já presente no mesmo item; nunca fabricar headers ou contornar autenticação.
- Medir latência, taxa de validação e estados por fonte; não guardar URLs privadas em logs ou relatórios.

## Testes

```bash
npm test
npm run test:entertainment
npm run test:contrast
npm run test:accessibility
```

Os testes unitários cobrem DNS/SSRF, HTTPS, Range, HLS/DASH, DRM, autenticação, redirecionamentos, cache, concorrência e indisponibilidade das APIs. E2E verifica que a home e a pesquisa nunca devolvem itens `metadata-only` ou sem stream validada.
