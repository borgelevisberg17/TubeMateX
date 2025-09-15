document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const settingsThemeToggle = document.getElementById('settingsThemeToggle');
    const body = document.body;
    const logoutBtn = document.getElementById('logoutBtn');

    // --- Lógica de Tema ---
    function applyTheme(theme) {
        body.classList.remove('light-mode', 'dark-mode');
        body.classList.add(theme);
        if (themeToggle) themeToggle.checked = theme === 'dark-mode';
        if (settingsThemeToggle) settingsThemeToggle.checked = theme === 'dark-mode';
    }

    function toggleTheme(e) {
        const newTheme = e.target.checked ? 'dark-mode' : 'light-mode';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }

    const savedTheme = localStorage.getItem('theme') || 'dark-mode';
    applyTheme(savedTheme);

    if (themeToggle) themeToggle.addEventListener('change', toggleTheme);
    if (settingsThemeToggle) settingsThemeToggle.addEventListener('change', toggleTheme);


    // --- Lógica de Autenticação ---
    async function fetchUser() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const user = await response.json();
                populateUserData(user);
            } else {
                // Se não estiver autenticado, redireciona para a página inicial
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Erro ao buscar dados do usuário:', error);
            window.location.href = '/';
        }
    }

    function populateUserData(user) {
        document.getElementById('userAvatar').src = user.avatar || 'https://via.placeholder.com/100';
        document.getElementById('userName').textContent = user.displayName;
        // O e-mail não está no objeto de usuário, será necessário adicioná-lo
        document.getElementById('userEmail').textContent = user.email || 'E-mail não disponível';
    }

    async function logout() {
        try {
            await fetch('/auth/logout', { method: 'POST' });
            window.location.href = '/'; // Redireciona para a home após o logout
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
            alert('Erro ao tentar fazer logout.');
        }
    }

    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // --- Lógica de Downloads ---
    async function fetchDownloads() {
        try {
            const response = await fetch('/api/user/downloads');
            if (response.ok) {
                const downloads = await response.json();
                renderDownloads(downloads);
            } else {
                console.error('Erro ao buscar downloads');
            }
        } catch (error) {
            console.error('Erro ao buscar downloads:', error);
        }
    }

    function renderDownloads(downloads) {
        const container = document.getElementById('downloadedVideos');
        if (downloads.length === 0) {
            container.innerHTML = '<p>Nenhum vídeo baixado recentemente.</p>';
            return;
        }

        container.innerHTML = downloads.map(item => `
            <div class="download-item">
                <div class="download-info">
                    <div class="download-title">${item.title}</div>
                    <div class="download-meta">
                        <span>${item.format.toUpperCase()}</span> •
                        <span>${new Date(item.date).toLocaleString()}</span>
                    </div>
                </div>
                <a href="/downloads/${item.filename}" class="download-link" download="${item.filename}">
                    <i class="fas fa-download"></i>
                </a>
            </div>
        `).join('');
    }

    // Carregar dados do usuário e downloads ao carregar a página
    fetchUser();
    fetchDownloads();
});
