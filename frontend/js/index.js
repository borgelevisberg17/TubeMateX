// Seleção de formato
const formatOptions = document.querySelectorAll('.format-option');
let selectedFormat = 'mp4';

formatOptions.forEach((option) => {
  option.addEventListener('click', () => {
    formatOptions.forEach((opt) => opt.classList.remove('active'));
    option.classList.add('active');
    selectedFormat = option.dataset.format;
  });
});

// Validar URL
function isValidUrl(url) {
  const urlPattern = /^(https?:\/\/)?([\w.-]+)(\/[\w-./?%&=]*)?$/;
  return urlPattern.test(url);
}

// Iniciar download
async function startDownload() {
  const url = document.getElementById('videoUrl').value.trim();
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progress');
  const status = document.getElementById('status');

  if (!url) {
    showNotification('Por favor, insira uma URL.', true);
    return;
  }

  if (!isValidUrl(url)) {
    showNotification('URL inválida. Tente novamente!', true);
    return;
  }

  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  status.textContent = 'Preparando download...';

  try {
    showNotification('Iniciando download...');
    const response = await fetch('https://tube-mate-x.vercel.app/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: selectedFormat }),
    });

    if (!response.ok) {
      const result = await response.json();
      showNotification(result.error || 'Erro ao baixar o vídeo.', true);
      progressContainer.style.display = 'none';
      return;
    }

    const reader = response.body.getReader();
    const contentLength = +response.headers.get('Content-Length');
    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;

      const percent = ((receivedLength / contentLength) * 100).toFixed(2);
      const sizeInMB = (receivedLength / (1024 * 1024)).toFixed(2);
      progressBar.style.width = `${percent}%`;
      status.textContent = `Baixando... ${percent}% (${sizeInMB} MB)`;
    }

    const blob = new Blob(chunks);
    const urlBlob = window.URL.createObjectURL(blob);
    const disposition = response.headers.get('Content-Disposition');
    let fileName = 'video.' + selectedFormat;
    if (disposition && disposition.indexOf('attachment') !== -1) {
        var filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        var matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          fileName = matches[1].replace(/['"]/g, '');
        }
    }


    const downloadLink = document.createElement('a');
    downloadLink.href = urlBlob;
    downloadLink.download = fileName;
    downloadLink.click();

    showNotification('Download concluído com sucesso!');
    loadHistory();

    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      status.textContent = 'Preparando download...';
    }, 2000);
  } catch (error) {
    console.error(error);
    showNotification('Erro ao conectar ao servidor.', true);
    progressContainer.style.display = 'none';
  }
}

// Carregar histórico
async function loadHistory() {
  try {
    const response = await fetch('https://tube-mate-x.vercel.app/history');
    const history = await response.json();
    renderHistory(history);
  } catch (error) {
    console.error('Erro ao carregar histórico:', error);
  }
}

// Renderizar histórico
function renderHistory(history) {
  const historyContainer = document.getElementById('historyContainer');
  historyContainer.innerHTML = '';

  if (history.length === 0) {
    historyContainer.innerHTML = '<p>Nenhum download realizado ainda.</p>';
    return;
  }

  history.forEach((item) => {
    renderHistoryItem(item);
  });
}

// Renderizar item no histórico
function renderHistoryItem({ url, format, fileName, date }) {
  const historyContainer = document.getElementById('historyContainer');
  const timestamp = new Date(date).toLocaleString();
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  historyItem.innerHTML = `
        <div class="history-info">
            <div class="history-title">${fileName}</div>
            <div class="history-meta">
                <span>${format.toUpperCase()}</span> • 
                <span>${timestamp}</span>
            </div>
        </div>
    `;
  historyContainer.insertBefore(historyItem, historyContainer.firstChild);
}

// Mostrar notificação
function showNotification(message, isError = false) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${isError ? 'error' : ''}`;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Obter informações do vídeo
async function getVideoInfo() {
  const url = document.getElementById('videoUrl').value.trim();
  const videoInfoContainer = document.getElementById('videoInfo');

  if (!isValidUrl(url)) {
    videoInfoContainer.style.display = 'none';
    return;
  }

  try {
    const response = await fetch(`https://tube-mate-x.vercel.app/video-info?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      videoInfoContainer.style.display = 'none';
      return;
    }

    const { title, thumbnail } = await response.json();
    videoInfoContainer.innerHTML = `
      <img src="${thumbnail}" alt="Thumbnail" class="video-thumbnail">
      <p class="video-title">${title}</p>
    `;
    videoInfoContainer.style.display = 'flex';
  } catch (error) {
    console.error('Erro ao obter informações do vídeo:', error);
    videoInfoContainer.style.display = 'none';
  }
}

// Limpar histórico
async function clearHistory() {
  try {
    const response = await fetch('https://tube-mate-x.vercel.app/clear-history', {
      method: 'POST',
    });

    if (response.ok) {
      showNotification('Histórico limpo com sucesso!');
      loadHistory();
    } else {
      showNotification('Erro ao limpar o histórico.', true);
    }
  } catch (error) {
    console.error('Erro ao limpar o histórico:', error);
    showNotification('Erro ao conectar ao servidor.', true);
  }
}

// Theme switcher
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

function applyTheme(theme) {
  body.classList.remove('light-mode', 'dark-mode');
  body.classList.add(theme);
  themeToggle.checked = theme === 'dark-mode';
}

function toggleTheme() {
  const newTheme = themeToggle.checked ? 'dark-mode' : 'light-mode';
  localStorage.setItem('theme', newTheme);
  applyTheme(newTheme);
}

// Inicializar eventos
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  const savedTheme = localStorage.getItem('theme') || 'dark-mode';
  applyTheme(savedTheme);
});
document.querySelector("button").addEventListener('click', startDownload);
document.getElementById('videoUrl').addEventListener('paste', getVideoInfo);
document.getElementById('videoUrl').addEventListener('keyup', getVideoInfo);
document.getElementById('clearHistory').addEventListener('click', clearHistory);
themeToggle.addEventListener('change', toggleTheme);