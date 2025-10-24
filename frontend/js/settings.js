document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const settingsThemeToggle = document.getElementById('settingsThemeToggle');
    const body = document.body;
    const logoutBtn = document.getElementById('logoutBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // --- Theme Logic ---
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


    // --- Authentication Logic ---
    async function fetchUser() {
        // Try to load from cache first
        const cachedUser = localStorage.getItem('userProfile');
        if (cachedUser) {
            populateUserData(JSON.parse(cachedUser));
        }

        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const user = await response.json();
                localStorage.setItem('userProfile', JSON.stringify(user)); // Cache user data
                populateUserData(user);
            } else if (!cachedUser) {
                // If not authenticated and no cache, redirect
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            if (!cachedUser) {
                window.location.href = '/';
            }
        }
    }

    function populateUserData(user) {
        document.getElementById('userAvatar').src = user.avatar || 'https://via.placeholder.com/100';
        document.getElementById('userName').textContent = user.displayName;
        document.getElementById('userEmail').textContent = user.email || 'E-mail not available';
    }

    async function logout() {
        try {
            await fetch('/auth/logout', { method: 'POST' });
            // Clear cached data on logout
            localStorage.removeItem('userProfile');
            localStorage.removeItem('downloadHistory');
            window.location.href = '/';
        } catch (error) {
            console.error('Error during logout:', error);
            alert('Error trying to logout.');
        }
    }

    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // --- Downloads Logic ---
    async function fetchDownloads() {
        // Try to load from cache first
        const cachedDownloads = localStorage.getItem('downloadHistory');
        if (cachedDownloads) {
            renderDownloads(JSON.parse(cachedDownloads));
        }

        try {
            const response = await fetch('/api/user/downloads');
            if (response.ok) {
                const downloads = await response.json();
                localStorage.setItem('downloadHistory', JSON.stringify(downloads)); // Cache downloads
                renderDownloads(downloads);
            } else {
                console.error('Error fetching downloads');
            }
        } catch (error) {
            console.error('Error fetching downloads:', error);
        }
    }

    function renderDownloads(downloads) {
        const container = document.getElementById('downloadedVideos');
        if (!downloads || downloads.length === 0) {
            container.innerHTML = '<p>No videos downloaded recently.</p>';
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

    function clearHistory() {
        localStorage.removeItem('downloadHistory');
        renderDownloads([]); // Re-render to show empty state
    }

    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);


    // Initial data load
    fetchUser();
    fetchDownloads();
});
