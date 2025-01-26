require('dotenv').config(); // Carrega as variáveis do arquivo .env
const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do front-end
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));

// Diretórios e arquivos
const downloadsDir = process.env.DOWNLOADS_DIR || path.join(__dirname, '/downloads');
const historyFile = process.env.HISTORY_FILE || path.join(__dirname, '/downloadHistory.json');

// Criar diretório de downloads
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Carregar histórico inicial
let history = [];
if (fs.existsSync(historyFile)) {
  history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
}

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Rota de download
app.post('/download', async (req, res) => {
  const { url, format } = req.body;

  if (!url || !format) {
    return res.status(400).json({ error: 'URL ou formato não fornecido.' });
  }

  if (!ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'URL inválida ou incompatível com o YouTube.' });
  }

  try {
    // Obter informações do vídeo
    const videoInfo = await ytdl.getInfo(url);

    // Nome do arquivo baseado no título
    const videoTitle = videoInfo.videoDetails.title.replace(/[<>:"\/\\|?*]/g, '');
    const fileName = `${videoTitle}.${format}`;
    const filePath = path.join(downloadsDir, fileName);

    const filter = format === 'mp3' ? 'audioonly' : 'videoandaudio';
    const videoStream = ytdl(url, {
      filter,
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
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

    videoStream.on('error', (error) => {
      console.error(`[Erro de Stream]: ${error.message}`);
      res.status(500).json({ error: 'Erro no stream do vídeo.' });
    });

    writeStream.on('error', (error) => {
      console.error(`[Erro de Escrita]: ${error.message}`);
      res.status(500).json({ error: 'Erro ao salvar o arquivo.' });
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