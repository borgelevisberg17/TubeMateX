require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SQLiteStore = require('connect-sqlite3')(session);

const ytdlp = require('yt-dlp-exec');
const play = require('play-dl');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração de Rate Limiting ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 requisições por IP
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Muitas requisições, tente novamente em 15 minutos.'
});

const downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 20, // Limite de 20 downloads por IP por hora
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Limite de downloads excedido, tente novamente em uma hora.'
});

// Aplicar a rotas específicas
app.use('/auth', apiLimiter);
app.use('/api', apiLimiter);
app.use('/video-info', apiLimiter);
app.use('/download', downloadLimiter);


// --- Configuração de Autenticação (OAuth com Passport) ---

if (!process.env.SESSION_SECRET || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[FATAL] Variáveis de ambiente para OAuth (SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) não estão definidas.');
    // Em um ambiente de produção real, você poderia querer encerrar aqui: process.exit(1);
}

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: '/tmp',
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
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
    // Neste callback, normalmente salvaria o usuário no banco de dados.
    // Fica pra depois, por enquanto apenas passa o perfil do usuário para a próxima etapa.
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
            email: req.user.emails && req.user.emails.length > 0 ? req.user.emails[0].value : null,
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
const historyDir = process.env.HISTORY_DIR || path.join(__dirname, 'history');
if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir);
}

function getUserHistoryPath(userId) {
    return path.join(historyDir, `${userId}.json`);
}

function loadUserHistory(userId) {
    const userHistoryPath = getUserHistoryPath(userId);
    if (fs.existsSync(userHistoryPath)) {
        return JSON.parse(fs.readFileSync(userHistoryPath, 'utf-8'));
    }
    return [];
}

function saveUserHistory(userId, history) {
    const userHistoryPath = getUserHistoryPath(userId);
    fs.writeFileSync(userHistoryPath, JSON.stringify(history, null, 2));
}

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Rotas para páginas legais
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/terms.html'));
});

app.get('/policy', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/privacy.html'));
});
app.get('/legacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/legacy.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/settings.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/profile.html'));
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
        // Se o usuário estiver autenticado, usar o token dele pode ajudar com vídeos privados/restritos
        if (req.isAuthenticated() && req.user.accessToken) {
            play.setToken({ youtube: { access_token: req.user.accessToken } });
        }

        const info = await play.video_info(url);
        const title = info.video_details.title.replace(/[<>:"/\\|?*]+/g, '');
        const filename = `${title}.${format}`;
        const outputPath = path.join(__dirname, 'downloads', filename);

        // Garante que o diretório de downloads exista
        if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
            fs.mkdirSync(path.join(__dirname, 'downloads'));
        }

        // O yt-dlp-exec retorna uma promessa que resolve quando o download é concluído.
        let formatOptions = {};
        switch (format) {
            case 'mp3':
                formatOptions = { format: 'bestaudio/best', extractAudio: true, audioFormat: 'mp3' };
                break;
            case 'opus':
                formatOptions = { format: 'bestaudio/best', extractAudio: true, audioFormat: 'opus' };
                break;
            case 'webm':
                formatOptions = { format: 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best' };
                break;
            case 'best':
                formatOptions = { format: 'best' };
                break;
            case 'mp4':
            default:
                formatOptions = { format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' };
                break;
        }

        await ytdlp.exec(url, {
            output: outputPath,
            ...formatOptions,
        });

        // Salva no histórico apenas se o usuário estiver logado
        if (req.isAuthenticated()) {
            const userId = req.user.id;
            let userHistory = loadUserHistory(userId);

            userHistory.unshift({
                filename,
                title: info.video_details.title,
                format,
                date: new Date().toISOString(),
                path: outputPath,
                expires: Date.now() + 3600000 // 1 hora a partir de agora
            });

            // Limpa o histórico antigo se exceder o limite
            if (userHistory.length > 20) {
                const oldestItem = userHistory.pop();
                if (fs.existsSync(oldestItem.path)) {
                    fs.unlinkSync(oldestItem.path);
                }
            }
            saveUserHistory(userId, userHistory);
        }

        res.json({ downloadUrl: `/downloads/${filename}`, title: filename });

    } catch (err) {
        const errorMessage = err.stderr || err.message;
        console.error(`[Erro no download]: ${errorMessage}`);

        if (errorMessage.includes('Unsupported URL')) {
            return res.status(400).json({ error: 'URL não suportada. Verifique o link e tente novamente.' });
        }
        if (errorMessage.includes('Sign in') || errorMessage.includes('age-restricted')) {
            return res.status(401).json({ error: 'Este vídeo é restrito. Por favor, faça login para continuar.', requiresAuth: true });
        }
        if (errorMessage.includes('Video unavailable')) {
            return res.status(404).json({ error: 'O vídeo não está disponível. Pode ter sido removido ou ser privado.' });
        }

        res.status(500).json({ error: 'Erro interno no servidor ao tentar baixar o vídeo.' });
    }
});

// Rota para servir arquivos baixados
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Limpeza de arquivos expirados
setInterval(() => {
    const now = Date.now();
    fs.readdir(historyDir, (err, files) => {
        if (err) {
            console.error('Erro ao ler o diretório de histórico:', err);
            return;
        }

        files.forEach(file => {
            if (path.extname(file) === '.json') {
                const userId = path.basename(file, '.json');
                let userHistory = loadUserHistory(userId);
                const updatedHistory = userHistory.filter(item => {
                    if (item.expires && item.expires < now) {
                        if (fs.existsSync(item.path)) {
                            console.log(`Excluindo arquivo expirado: ${item.path}`);
                            fs.unlinkSync(item.path);
                        }
                        return false;
                    }
                    return true;
                });

                if (updatedHistory.length < userHistory.length) {
                    saveUserHistory(userId, updatedHistory);
                }
            }
        });
    });
}, 3600000); // Executa a cada hora

// Rota para obter histórico
app.get('/history', (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id;
        const userHistory = loadUserHistory(userId);
        res.json(userHistory);
    } else {
        res.json([]);
    }
});

app.get('/api/user/downloads', (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id;
        const userHistory = loadUserHistory(userId);
        res.json(userHistory);
    } else {
        res.status(401).json({ message: 'Não autenticado' });
    }
});

// Limpar histórico
app.post('/clear-history', (req, res) => {
    if (req.isAuthenticated()) {
        const userId = req.user.id;
        const userHistoryPath = getUserHistoryPath(userId);
        if (fs.existsSync(userHistoryPath)) {
            fs.unlinkSync(userHistoryPath);
        }
        res.json({ message: 'Histórico limpo com sucesso!' });
    } else {
        res.status(401).json({ error: 'Não autenticado' });
    }
});

// Inicializar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});