document.addEventListener('DOMContentLoaded', () => {
    fetchUserAndHistory();
});

async function fetchUserAndHistory() {
    try {
        // Fetch user info
        const userResponse = await fetch('/api/user');
        if (!userResponse.ok) {
            if (userResponse.status === 401) {
                window.location.href = '/?auth=required';
            }
            throw new Error('Falha ao buscar dados do usuário.');
        }
        const user = await userResponse.json();

        // Fetch download history
        const historyResponse = await fetch('/api/user/downloads');
        if (!historyResponse.ok) {
            throw new Error('Falha ao buscar histórico de downloads.');
        }
        const history = await historyResponse.json();

        populateProfile(user, history);

    } catch (error) {
        console.error('Erro:', error);
        document.body.innerHTML = `<p style="color: red; text-align: center;">${error.message}</p>`;
    }
}

function populateProfile(user, history) {
    // Populate header
    document.getElementById('user-avatar').src = user.avatar || 'https://via.placeholder.com/150';
    document.getElementById('user-display-name').textContent = user.displayName || 'Usuário';
    document.getElementById('user-email').textContent = user.email || 'Nenhum e-mail fornecido';

    // Calculate and populate stats
    const totalDownloads = history.length;
    const mp4Downloads = history.filter(item => item.format === 'mp4').length;
    const mp3Downloads = history.filter(item => item.format === 'mp3').length;

    document.getElementById('total-downloads').textContent = totalDownloads;
    document.getElementById('mp4-downloads').textContent = mp4Downloads;
    document.getElementById('mp3-downloads').textContent = mp3Downloads;

    // Populate history
    const historyContainer = document.getElementById('download-history');
    historyContainer.innerHTML = ''; // Clear existing
    if (history.length === 0) {
        historyContainer.innerHTML = '<p>Nenhum download encontrado.</p>';
        return;
    }

    history.slice(0, 10).forEach(item => { // Mostra apenas os 10 mais recentes
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        const title = document.createElement('div');
        title.className = 'history-title';
        title.textContent = item.title;
        title.title = item.title;

        const meta = document.createElement('div');
        meta.className = 'history-meta';
        const format = item.format.toUpperCase();
        const date = new Date(item.date).toLocaleDateString();
        meta.textContent = `${format} - ${date}`;

        historyItem.appendChild(title);
        historyItem.appendChild(meta);
        historyContainer.appendChild(historyItem);
    });
}
