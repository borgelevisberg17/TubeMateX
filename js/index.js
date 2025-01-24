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

  if (!url) {
    showNotification('Por favor, insira uma URL.', true);
    return;
  }

  if (!isValidUrl(url)) {
    showNotification('URL inválida. Tente novamente!', true);
    return;
  }

  try {
    showNotification('Preparando download...');
    const response = await fetch('http://localhost:3000/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: selectedFormat }),
    });

    const result = await response.json();

    if (response.ok) {
      showNotification(`Download concluído: ${result.fileName}`);
      addToHistory(url, selectedFormat);
    } else {
      showNotification(result.error || 'Erro ao baixar o vídeo.', true);
    }
  } catch (error) {
    console.error(error);
    showNotification('Erro ao conectar ao servidor.', true);
  }
}

// Adicionar ao histórico
function addToHistory(url, format) {
  const timestamp = new Date().toLocaleString();
  const historyItem = { url, format, timestamp };

  const savedHistory = JSON.parse(localStorage.getItem('history')) || [];
  savedHistory.push(historyItem);
  localStorage.setItem('history', JSON.stringify(savedHistory));

  renderHistoryItem(historyItem);
}

// Renderizar item no histórico
function renderHistoryItem({ url, format, timestamp }) {
  const historyContainer = document.getElementById('historyContainer');

  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  historyItem.innerHTML = `
        <div class="history-info">
            <div class="history-title">Download realizado</div>
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

// Inicializar eventos
document.getElementById('startDownload').addEventListener('click',
startDownload);