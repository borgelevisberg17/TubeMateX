# Plugins de extractors do yt-dlp

O TubeMateX suporta o sistema oficial de plugins Python do yt-dlp de forma opt-in. A aplicação não instala, baixa ou executa pacotes fornecidos pelo navegador.

## Configuração

Instala um pacote previamente revisado num diretório que contenha:

```text
<plugin-dir>/yt_dlp_plugins/extractor/*.py
```

Depois inicia o backend com:

```bash
YT_DLP_PLUGIN_DIR=/caminho/absoluto/para/plugins npm start
```

O backend adiciona esse diretório ao `PYTHONPATH` dos processos do yt-dlp. A descoberta pode ser consultada em:

```text
GET /api/plugins
```

A resposta inclui se a configuração está ativa, os extractors Python encontrados e a política de que plugins devem ser aprovados pelo administrador.

## Segurança e limitações

Plugins são código Python executado no mesmo ambiente do processo do yt-dlp. Por isso, devem ser instalados somente por um administrador, a partir de uma fonte confiável, com revisão de código e permissões restritas. A UI não oferece upload, instalação npm/pip, download remoto ou ativação dinâmica de plugin.

A existência de um plugin não garante que uma URL funcione. O extractor pode exigir cookies, tokens, autenticação, serviços externos ou sofrer mudanças na plataforma. O TubeMateX deve continuar exibindo o erro retornado pelo extractor e nunca declarar compatibilidade universal.

Referências oficiais:

- https://github.com/yt-dlp/yt-dlp/wiki/Plugins
- https://github.com/yt-dlp/yt-dlp/wiki/Plugin-Development
