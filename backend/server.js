require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const ytdlp = require('yt-dlp-exec');
const play = require('play-dl');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração de Autenticação (OAuth com Passport) ---

if (!process.env.SESSION_SECRET || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[FATAL] Variáveis de ambiente para OAuth (SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) não estão definidas.');
    // Em um ambiente de produção real, você poderia querer encerrar aqui: process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: true, // Alterado para true para facilitar o login com Google
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});


// --- Fim da Configuração de Autenticação ---

// Middleware
app.use(cors({
    origin: true, // Refletir a origem da requisição
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Rotas de Autenticação ---

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: (process.env.BASE_URL || `http://localhost:${PORT}`) + '/auth/google/callback'
},
(accessToken, refreshToken, profile, done) => {
    // Neste callback, você normalmente salvaria o usuário no banco de dados.
    // Para este exemplo, vamos apenas passar o perfil do usuário para a próxima etapa.
    // O `accessToken` pode ser usado para fazer chamadas à API do Google em nome do usuário.
    // Também pode ser armazenado para fazer o play-dl funcionar com o login do user
    profile.accessToken = accessToken;
    return done(null, profile);
}));

// Rota para iniciar a autenticação com o Google
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/youtube.readonly'] }));

// Rota de callback que o Google chama após o login do usuário
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/?auth=failed' }), // Redireciona em caso de falha
    (req, res) => {
        // Login bem-sucedido, redireciona para a página principal.
        res.redirect('/?auth=success');
    });

// Rota de logout
app.post('/auth/logout', (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.status(200).json({ message: 'Logout bem-sucedido' });
    });
});

// Rota para verificar o status do usuário
app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            id: req.user.id,
            displayName: req.user.displayName,
            avatar: req.user.photos && req.user.photos.length > 0 ? req.user.photos[0].value : null
        });
    } else {
        res.status(401).json({ message: 'Não autenticado' });
    }
});

// --- Fim das Rotas de Autenticação ---


// Servir frontend
// O ideal é que o frontend seja servido por um servidor web como Nginx em produção,
// mas para simplicidade, o Express pode servi-lo.
app.use(express.static(path.join(__dirname, '../frontend')));

// Histórico
const historyFile = process.env.HISTORY_FILE || path.join(__dirname, '/downloadHistory.json');
let history = [];
if (fs.existsSync(historyFile)) {
  history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
}

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Obter info do vídeo
app.get('/video-info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL não fornecida.' });

  try {
    // Primeiro tenta com play-dl (agora com suporte a cookies)
    const info = await play.video_info(url);
    res.json({ title: info.video_details.title, thumbnail: info.video_details.thumbnails[0].url });
  } catch (err) {
    console.warn(`[play-dl falhou]: ${err.message}, tentando com yt-dlp...`);
    try {
      // Fallback para yt-dlp com as opções de cookie
      const info = await ytdlp(url, {
        ...ytdlpOptions,
        dumpSingleJson: true,
      });
      res.json({ title: info.title, thumbnail: info.thumbnail });
    } catch (err2) {
      console.error(`[Erro ao obter informações]: ${err2.message}`);
      res.status(500).json({ error: 'Erro ao obter informações do vídeo.' });
    }
  }
});

// Rota de download
app.post('/download', async (req, res) => {
    const { url, format } = req.body;
    if (!url || !format) {
        return res.status(400).json({ error: 'URL ou formato não fornecido.' });
    }

    try {
        // Objeto de opções para o play-dl, a ser preenchido se o usuário estiver autenticado
        const playDlOptions = {};

        if (req.isAuthenticated() && req.user.accessToken) {
            console.log('[Auth] Usuário autenticado. Tentando usar o token de acesso para o play-dl.');
            // Define o token de autorização para o play-dl.
            // Esta é a maneira correta de usar um token de acesso OAuth com a biblioteca.
            play.setToken({
                youtube: {
                    access_token: req.user.accessToken
                }
            });
        } else {
            // Garante que nenhum token antigo seja usado para usuários não autenticados
            play.setToken({ youtube: {} });
        }

        let info;
        try {
            info = await play.video_info(url);
        } catch (infoErr) {
            // Se a obtenção de informações falhar com um erro de autenticação, informa o frontend.
            if (infoErr.message.includes('Sign in') || infoErr.message.includes('age-restricted')) {
                return res.status(401).json({ error: 'Este vídeo é restrito. Por favor, faça login para continuar.', requiresAuth: true });
            }
            // Para outros erros, apenas loga e continua para o yt-dlp
            console.warn(`[play-dl falhou ao obter info]: ${infoErr.message}, tentando com yt-dlp...`);
            info = await ytdlp(url, { dumpSingleJson: true, noCheckCertificates: true, noWarnings: true });
        }

        const title = info.title.replace(/[<>:"/\\|?*]+/g, '');
        let directUrl;

        try {
            const stream = await play.stream_from_info(info, { quality: format === 'mp3' ? 1 : 2 });
            directUrl = stream.url;
        } catch(streamErr) {
            console.warn(`[play-dl falhou no stream]: ${streamErr.message}, usando yt-dlp como fallback...`);
            directUrl = await ytdlp(url, {
                getUrl: true,
                format: format === 'mp3' ? 'bestaudio' : 'best',
            });
        }

        // Salva no histórico (simplificado)
        history.unshift({ url, format, title, date: new Date().toISOString() });
        if (history.length > 20) history.pop();

        res.json({ downloadUrl: directUrl, title: `${title}.${format === 'mp3' ? 'mp3' : 'mp4'}` });

    } catch (err) {
        const errorMessage = err.stderr || err.message;
        console.error(`[Erro no download]: ${errorMessage}`);
        if (errorMessage.includes('Sign in') || errorMessage.includes('age-restricted')) {
            res.status(401).json({ error: 'Este vídeo é restrito. Por favor, faça login para continuar.', requiresAuth: true });
        } else {
            res.status(500).json({ error: 'Erro ao gerar link de download. Verifique a URL e tente novamente.' });
        }
    }
});

// Rota para obter histórico
app.get('/history', (req, res) => {
    res.json(history);
});

// Limpar histórico
app.post('/clear-history', (req, res) => {
  history = [];
  if (fs.existsSync(historyFile)) {
    fs.unlinkSync(historyFile); // Remove o arquivo para limpar completamente
  }
  res.json({ message: 'Histórico limpo com sucesso!' });
});

// Inicializar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});