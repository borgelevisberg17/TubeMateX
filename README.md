# 🎥 TubeMateX - YouTube Downloader

TubeMateX é uma aplicação Node.js para download de vídeos e áudios do YouTube. Ele suporta os formatos MP4 (vídeo) e MP3 (áudio) e inclui um histórico de downloads para rastrear suas atividades.

📋 Funcionalidades

Baixar vídeos do YouTube em formato MP4.

Baixar áudio de vídeos do YouTube em formato MP3.

Histórico de downloads salvo localmente.

Interface simples e fácil de usar.

Servidor configurado com PM2 para gerenciar e manter a aplicação em execução.


🛠️ Tecnologias Utilizadas

Node.js: Ambiente de execução do servidor.

Express.js: Framework para criar o servidor HTTP.

ytdl-core: Biblioteca para download de vídeos e áudios do YouTube.

PM2: Gerenciador de processos para manter o servidor ativo.

HTML/CSS/JavaScript: Interface front-end simples.



---

🚀 Como Usar

Pré-requisitos

Node.js instalado na máquina.

PM2 para gerenciar o servidor (opcional).


Passos de Instalação

1. Clone o repositório:

git clone https://github.com/borgelevisberg17/TubeMateX.git
cd TubeMateX


2. Instale as dependências:

npm install


3. Inicie o servidor:

Usando Node.js:

node server.js

Usando PM2:

pm2 start server.js --name "tubematex"
pm2 save



4. Acesse no navegador: Abra o navegador e digite: http://localhost:3000.



---

📁 Estrutura do Projeto

TubeMateX/
├── assets/              # Arquivos estáticos (imagens, etc.)
├── css/                 # Estilos CSS para a interface
├── downloads/           # Vídeos e áudios baixados
├── js/                  # Scripts JavaScript adicionais
├── server.js            # Servidor principal
├── package.json         # Dependências do Node.js
├── downloadHistory.json # Histórico de downloads
└── README.md            # Documentação do projeto


---

⚙️ Configuração no GitHub Actions

Este projeto inclui suporte para GitHub Actions. O arquivo node.js.yml automatiza a instalação, teste e inicialização do servidor.

Certifique-se de ajustar o workflow caso adicione testes ou precise de configurações adicionais.



⚠️ Aviso Legal

Este projeto foi desenvolvido para fins educacionais. O download de vídeos ou áudios do YouTube pode violar os Termos de Serviço da plataforma. Use este software com responsabilidade.



📞 Contato

Se tiver dúvidas ou sugestões, sinta-se à vontade para entrar em contato:
Autor: Borge Levisberg
E-mail: borgelevisberg@gmail.com

