# Notas da referência TubeMateX

Fonte publicada: https://tube-mate-x.vercel.app/

## Estrutura observada

- Página única com fundo escuro em tom azul-marinho/roxo.
- Interruptor de tema no canto superior direito.
- Cabeçalho centrado com a marca “TubeMateX” em gradiente azul-turquesa/roxo e subtítulo “Descarregue videos de diversas plataformas”.
- Cartão de download centrado, com fundo cinzento-escuro translúcido e cantos arredondados.
- Campo URL com placeholder “Cole o link do vídeo aqui...”.
- Botão “Download” alinhado à direita do campo.
- Dois seletores de formato lado a lado: MP4 e MP3, com ícones de vídeo e música; MP4 aparece selecionado em azul.
- Secção “Downloads Recentes” abaixo do cartão, com botão “Limpar Histórico” em vermelho/laranja à direita.
- Não há itens de histórico visíveis no estado inicial.

## Elementos funcionais expostos

- Input `#videoUrl` do tipo URL.
- Botão principal “Download”.
- Seleção de formato MP4/MP3.
- Botão `#clearHistory` para limpar o histórico.

## Estado do clone local

- Repositório clonado de `https://github.com/borgelevisberg17/TubeMateX.git`.
- Branch: `main`, sem alterações locais após a clonagem.
- Stack existente: frontend vanilla HTML/CSS/JavaScript e backend Node.js/Express.
- Frontend inclui `index.html`, páginas `privacy.html`, `terms.html`, `profile.html`, `settings.html`, CSS e JavaScript.
- Backend inclui `server.js`, autenticação Google, histórico SQLite e dependências de download.

## Validação visual local — 26/08/2026

A página local abriu corretamente em `http://127.0.0.1:3100`, com título “TubeMateX — Downloader multi-site”, formulário de URL, quatro formatos, painel de guia, histórico e navegação. O alternador de tema respondeu ao clique e atualizou a interface para o tema escuro, confirmando que a preferência visual funciona no cliente. O healthcheck respondeu com estado `ok` e a API de capacidades anunciou MP4, WEBM, melhor qualidade, MP3 e OPUS.

## Validação de formulário

O input aceita texto, mostra o controlo de limpeza e o botão permanece acessível. O teste com `nota-invalida` não iniciou o motor de download; a página manteve o estado inicial do formulário e não criou job, como esperado para uma entrada inválida.

## Validação da área de utilizador

As páginas `/profile` e `/settings` abriram corretamente em ambiente local. O perfil apresenta visitante, estatísticas de vídeo/áudio e estado vazio com ligação de retorno; as definições apresentam tema, idioma, sessão Google e eliminação do histórico. Ambas usam a folha visual partilhada e já não dependem do domínio remoto `tubematex-backend.onrender.com`.

## Validação da ronda de otimização

A instância otimizada abriu corretamente na porta 3104. A página inicial manteve a hierarquia visual, os quatro formatos, o formulário multi-site e a área de histórico. O alternador de tema voltou a responder e a interface permaneceu estável no tema escuro.

## Nota de validação da biblioteca

A instância local na porta 3106 foi criada antes da última alteração de `profile.html` e continua a servir o perfil anterior. A biblioteca nova está no código atualizado; a validação visual final deve usar uma instância reiniciada depois das alterações.

## Biblioteca pesquisável

A página `/profile` reiniciada apresenta a nova biblioteca com pesquisa, ordenação, filtros Tudo/Vídeo/Áudio, seletor de plataforma, checkbox Só favoritos e paginação. Ao ativar Só favoritos sem itens, a interface mostra um estado vazio contextualizado e mantém os restantes controlos utilizáveis.

## Pesquisa no browser

A homepage atualizada apresenta o painel “Pesquisa no browser” com consulta, tipo Tudo/Música/Vídeos, fonte Todas as fontes/YouTube/SoundCloud e ação de pesquisa. No teste com “ambient music”, a submissão alterou o estado para “A pesquisar em fontes públicas…” e mostrou o estado visual de carregamento no painel.
