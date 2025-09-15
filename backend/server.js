require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ytdlp = require('yt-dlp-exec');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

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
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    res.json({ title: info.title, thumbnail: info.thumbnail });
  } catch (err) {
    console.error(`[Erro ao obter informações]: ${err.message}`);
    res.status(500).json({ error: 'Erro ao obter informações do vídeo.' });
  }
});

// Rota de download
app.post('/download', async (req, res) => {
  const { url, format } = req.body;
  if (!url || !format) {
    return res.status(400).json({ error: 'URL ou formato não fornecido.' });
  }

  try {
    const result = await ytdlp(url, {
      getUrl: true,
      format: format === 'mp3' ? 'bestaudio' : 'best',
    });

    const directUrl = (Array.isArray(result) ? result[0] : result).trim();

    // Salvar histórico
    const downloadInfo = { url, format, directUrl, date: new Date().toISOString() };
    history.push(downloadInfo);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

    // Redireciona o user para o link direto
    res.redirect(directUrl);
  } catch (err) {
    console.error(`[Erro no download]: ${err.message}`);
    res.status(500).json({ error: 'Erro ao gerar link de download.' });
  }
});

// Limpar histórico
app.post('/clear-history', (req, res) => {
  history = [];
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  res.json({ message: 'Histórico limpo com sucesso!' });
});

// Inicializar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});