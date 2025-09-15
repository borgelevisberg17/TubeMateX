# 🎥 TubeMateX - Downloader de Vídeos

O TubeMateX é uma aplicação full-stack que permite o download de vídeos e áudios de plataformas como o YouTube. Construído com Node.js no backend e HTML/CSS/JS no frontend, ele oferece uma interface moderna e funcionalidades robustas, incluindo autenticação para vídeos restritos.

---

### ✨ Funcionalidades Principais

- **Download de Vídeo e Áudio**: Baixe vídeos em formato MP4 ou extraia o áudio em MP3.
- **Login com Google**: Autentique-se com sua conta do Google para baixar vídeos privados ou com restrição de idade.
- **Interface Moderna**: UI limpa e responsiva com tema claro e escuro.
- **Histórico de Downloads**: Acompanhe os vídeos que você já baixou (funcionalidade em desenvolvimento).
- **Fallback Inteligente**: Usa `play-dl` como motor principal e `yt-dlp` como fallback para máxima compatibilidade.

---

### 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Download**: `play-dl`, `yt-dlp-exec`
- **Autenticação**: Passport.js (`passport-google-oauth20`)
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)

---

### 🚀 Como Executar o Projeto

#### Pré-requisitos

- Node.js (versão 18 ou superior)
- Conta do Google Cloud Platform para configurar o login

#### 1. Clonar o Repositório

```bash
git clone https://github.com/borgelevisberg17/TubeMateX.git
cd TubeMateX
```

#### 2. Instalar as Dependências do Backend

```bash
cd backend
npm install
```

#### 3. Configurar as Variáveis de Ambiente

Para que o login com Google funcione, você precisa configurar as credenciais da API do Google.

1.  **Crie um arquivo `.env`** na pasta `backend`, copiando o exemplo:
    ```bash
    cp .env.example .env
    ```
2.  **Abra o arquivo `.env`** e preencha as seguintes variáveis:

    - `SESSION_SECRET`: Uma string longa e aleatória para proteger as sessões dos usuários.
    - `GOOGLE_CLIENT_ID`: O ID do cliente OAuth 2.0 do seu projeto no Google Cloud.
    - `GOOGLE_CLIENT_SECRET`: A chave secreta do cliente OAuth 2.0.
    - `BASE_URL`: A URL base da sua aplicação (para desenvolvimento, use `http://localhost:3000`).

#### Como Obter as Credenciais do Google

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie um novo projeto.
3.  No menu de navegação, vá para "APIs e Serviços" > "Credenciais".
4.  Clique em "Criar Credenciais" > "ID do cliente OAuth".
5.  Selecione "Aplicativo da Web" como o tipo de aplicativo.
6.  Em "URIs de redirecionamento autorizados", adicione a URL: `${BASE_URL}/auth/google/callback`.
    - Exemplo para desenvolvimento local: `http://localhost:3000/auth/google/callback`
7.  Copie o "ID do cliente" e a "Chave secreta do cliente" para o seu arquivo `.env`.

#### 4. Iniciar o Servidor

Com as variáveis de ambiente configuradas, inicie o servidor a partir da pasta `backend`:

```bash
node server.js
```

#### 5. Acessar no Navegador

Abra seu navegador e acesse `http://localhost:3000`.

---

### 📁 Estrutura do Projeto

```
TubeMateX/
├── backend/
│   ├── node_modules/
│   ├── .env.example      # Exemplo de variáveis de ambiente
│   ├── server.js         # Servidor principal (Express)
│   └── package.json      # Dependências do Node.js
├── frontend/
│   ├── css/
│   │   └── index.css     # Estilos da aplicação
│   ├── js/
│   │   └── index.js      # Lógica do frontend
│   └── index.html        # Estrutura da página
└── README.md             # Documentação
```

---

### ⚠️ Aviso Legal

Este projeto foi desenvolvido para fins educacionais. O download de vídeos ou áudios de plataformas como o YouTube pode violar seus Termos de Serviço. Use este software com responsabilidade e respeite os direitos autorais.

---

### 📞 Contato

Se tiver dúvidas ou sugestões, sinta-se à vontade para entrar em contato:

- **Autor**: Borge Levisberg
- **E-mail**: borgelevisberg@gmail.com
