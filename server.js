const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuração
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Diretórios e arquivos
const downloadsDir = path.join(__dirname, 'downloads');
const historyFile = path.join(__dirname, 'downloadHistory.json');

// Criar diretório de downloads
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Carregar histórico inicial
let history = [];
if (fs.existsSync(historyFile)) {
  history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
}

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota de download
app.post('/download', async (req, res) => {
  const { url, format } = req.body;

  if (!url || !format) {
    return res.status(400).json({ error: 'URL ou formato não fornecido.' });
  }

  if (!ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'URL inválida.' });
  }

  if (!['mp4', 'mp3'].includes(format)) {
    return res.status(400).json({ error: 'Formato não suportado.' });
  }

  try {
    const videoId = ytdl.getURLVideoID(url);
    const fileName = `video-${videoId}.${format}`;
    const filePath = path.join(downloadsDir, fileName);

    const filter = format === 'mp3' ? 'audioonly' : 'videoandaudio';
    const videoStream = ytdl(url, {
  filter,
  requestOptions: {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  },
});
    const writeStream = fs.createWriteStream(filePath);

    videoStream.pipe(writeStream);

    videoStream.on('progress', (chunkLength, downloaded, total) => {
      const percent = ((downloaded / total) * 100).toFixed(2);
      console.log(`[Progresso]: ${percent}%`);
    });

    writeStream.on('finish', () => {
      const downloadInfo = { url, format, fileName, date: new Date().toISOString() };
      history.push(downloadInfo);
      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

      res.json({ message: 'Download concluído!', fileName });
    });

    videoStream.on('error', (err) => {
      console.error(`[Erro de Stream]: ${err.message}`);
      res.status(500).json({ error: 'Erro no download do vídeo.' });
    });

    writeStream.on('error', (err) => {
      console.error(`[Erro de Escrita]: ${err.message}`);
      res.status(500).json({ error: 'Erro ao salvar o vídeo.' });
    });
  } catch (error) {
    console.error(`[Erro Geral]: ${error.message}`);
    res.status(500).json({ error: 'Erro inesperado no download.' });
  }
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});