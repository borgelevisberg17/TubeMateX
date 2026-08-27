# Auditoria de plugins yt-dlp

O yt-dlp possui um sistema oficial de plugins Python. Plugins de extractor são carregados automaticamente quando instalados no namespace `yt_dlp_plugins.extractor`; não precisam de uma flag especial na linha de comando. Plugins podem ter prioridade sobre extractors nativos, portanto instalar um pacote de terceiros altera o comportamento de resolução e deve ser uma decisão explícita do administrador.

A documentação oficial recomenda criar/instalar plugins como pacotes Python, manter o código em `yt_dlp_plugins/<type>` e configurar o diretório via ambiente/PYTHONPATH ou instalação do pacote. O projeto também informa que plugins podem falhar sem interromper completamente o yt-dlp, mas não existe isolamento de segurança automático para código Python arbitrário.

Aplicação prevista no TubeMateX: plugins ficam fora do upload público e são habilitados por configuração administrativa (`YT_DLP_PLUGIN_DIR` ou `YT_DLP_PLUGIN_PACKAGES`), com catálogo somente leitura, validação de nome/versão, execução em processo separado quando possível e logs sem credenciais. O sistema não deve baixar nem executar um pacote remoto a partir do navegador sem revisão e aprovação do administrador.

Fontes oficiais:
- https://github.com/yt-dlp/yt-dlp/wiki/Plugins
- https://github.com/yt-dlp/yt-dlp/wiki/Plugin-Development
- https://github.com/yt-dlp/yt-dlp
