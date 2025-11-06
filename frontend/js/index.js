// Seleção de formato
const formatOptions = document.querySelectorAll(".format-option");
let selectedFormat = "mp4";
const urlBase = "https://tubematex-backend.onrender.com";
formatOptions.forEach(option => {
    option.addEventListener("click", () => {
        formatOptions.forEach(opt => opt.classList.remove("active"));
        option.classList.add("active");
        selectedFormat = option.dataset.format;
    });
});

// Validar URL
function isValidUrl(url) {
    // Regex aprimorado para validar URLs do YouTube, incluindo shorts
    const urlPattern =
        /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\/.+$/;
    return urlPattern.test(url);
}

// Iniciar download
async function startDownload() {
    const url = document.getElementById("videoUrl").value.trim();
    const progressContainer = document.getElementById("progressContainer");
    const status = document.getElementById("status");
    const downloadButton = document.querySelector("button");

    if (!url) {
        showNotification("Por favor, insira uma URL.", true);
        return;
    }

    if (!isValidUrl(url)) {
        showNotification("URL do YouTube inválida. Tente novamente!", true);
        return;
    }

    // Desabilita o botão e mostra o status
    downloadButton.disabled = true;
    downloadButton.textContent = "Baixando...";
    progressContainer.style.display = "block";
    status.textContent = "Preparando link de download... Por favor, aguarde.";

    try {
        showNotification("Solicitando link de download...");

        const response = await fetch(`${urlBase}/download`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, format: selectedFormat })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Erro desconhecido no servidor.");
        }

        const { downloadUrl, title } = result;

        // Cria um link de download e simula o clique
        const downloadLink = document.createElement("a");
        downloadLink.href = downloadUrl;
        downloadLink.download = title; // O backend já fornece o nome do arquivo com extensão
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        showNotification("Download iniciado com sucesso!");
        status.textContent = `Download de "${title}" iniciado!`;

        // Atualiza o histórico
        loadHistory();
    } catch (error) {
        console.error(error);
        showNotification(error.message, true);
        status.textContent = `Falha: ${error.message}`;
    } finally {
        // Reabilita o botão após um tempo
        setTimeout(() => {
            downloadButton.disabled = false;
            downloadButton.textContent = "Baixar";
            progressContainer.style.display = "none";
        }, 3000);
    }
}

// Carregar histórico
async function loadHistory() {
    try {
        const response = await fetch(`${urlBase}/history`);
        const history = await response.json();
        renderHistory(history);
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
    }
}

// Renderizar histórico
function renderHistory(history) {
    const historyContainer = document.getElementById("historyContainer");
    historyContainer.innerHTML = "";

    if (history.length === 0) {
        historyContainer.innerHTML = "<p>Nenhum download realizado ainda.</p>";
        document.getElementById("clearHistory").style.display = "none";
        return;
    }

    document.getElementById("clearHistory").style.display = "block";
    history.forEach(item => {
        renderHistoryItem(item);
    });
}

// Renderizar item no histórico
function renderHistoryItem({ title, format, date }) {
    const historyContainer = document.getElementById("historyContainer");
    const timestamp = new Date(date).toLocaleString();
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    historyItem.innerHTML = `
        <div class="history-info">
            <div class="history-title" title="${title}">${title}</div>
            <div class="history-meta">
                <span>${format.toUpperCase()}</span> • 
                <span>${timestamp}</span>
            </div>
        </div>
    `;
    historyContainer.appendChild(historyItem); // Usa appendChild para manter a ordem
}

// Mostrar notificação
function showNotification(message, isError = false) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${isError ? "error" : ""}`;
    notification.classList.add("show");

    setTimeout(() => {
        notification.classList.remove("show");
    }, 3000);
}

// Obter informações do vídeo
async function getVideoInfo() {
    const url = document.getElementById("videoUrl").value.trim();
    const videoInfoContainer = document.getElementById("videoInfo");

    if (!isValidUrl(url)) {
        videoInfoContainer.style.display = "none";
        return;
    }

    try {
        const response = await fetch(
            `${urlBase}/video-info?url=${encodeURIComponent(url)}`
        );
        if (!response.ok) {
            videoInfoContainer.style.display = "none";
            return;
        }

        const { title, thumbnail } = await response.json();
        videoInfoContainer.innerHTML = `
      <img src="${thumbnail}" alt="Thumbnail" class="video-thumbnail">
      <p class="video-title">${title}</p>
    `;
        videoInfoContainer.style.display = "flex";
    } catch (error) {
        console.error("Erro ao obter informações do vídeo:", error);
        videoInfoContainer.style.display = "none";
    }
}

// Limpar histórico
async function clearHistory() {
    if (
        !confirm(
            "Tem certeza de que deseja limpar todo o histórico de downloads?"
        )
    ) {
        return;
    }

    try {
        const response = await fetch(`${urlBase}/clear-history`, {
            method: "POST"
        });

        if (response.ok) {
            showNotification("Histórico limpo com sucesso!");
            loadHistory();
        } else {
            const result = await response.json();
            showNotification(
                result.error || "Erro ao limpar o histórico.",
                true
            );
        }
    } catch (error) {
        console.error("Erro ao limpar o histórico:", error);
        showNotification("Erro ao conectar ao servidor.", true);
    }
}

// Debounce para não sobrecarregar o servidor com requests de info
let debounceTimer;
function handleUrlInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        getVideoInfo();
    }, 500);
}

// --- Lógica de Autenticação do Frontend ---

// Atualiza a UI baseada no status de login do usuário
async function updateUserStatus() {
    // Tenta carregar o usuário do localStorage para uma UI mais rápida
    const cachedUser = localStorage.getItem("userProfile");
    if (cachedUser) {
        renderUserProfile(JSON.parse(cachedUser));
    }

    try {
        const response = await fetch(`${urlBase}/api/user`);
        if (response.ok) {
            const user = await response.json();
            // Armazena no localStorage para carregamentos futuros
            localStorage.setItem("userProfile", JSON.stringify(user));
            renderUserProfile(user);
        } else {
            // Limpa o cache se o usuário não estiver autenticado
            localStorage.removeItem("userProfile");
            renderLoginButton();
        }
    } catch (error) {
        console.error("Erro ao verificar status de login:", error);
        // Se a API falhar, confia no cache, mas eventualmente pode querer deslogar
        if (!cachedUser) {
            renderLoginButton();
        }
    }
}

// Renderiza o perfil do usuário logado
function renderUserProfile(user) {
    const profileContainer = document.getElementById("userProfile");
    profileContainer.innerHTML = `
        <a href="/profile" class="user-info-link">
            <div class="user-info">
                <img src="${user.avatar}" alt="Avatar" class="user-avatar">
                <span>${user.displayName}</span>
            </div>
        </a>
    `;
}

// Renderiza o botão de login
function renderLoginButton() {
    const profileContainer = document.getElementById("userProfile");
    profileContainer.innerHTML = `
        <a href="/auth/google" class="login-btn">
            <i class="fab fa-google"></i> Login
        </a>
    `;
}

// Executa o logout
async function logout() {
    try {
        await fetch(`${urlBase}/auth/logout`, { method: "POST" });
        localStorage.removeItem("userProfile"); // Limpa o cache
        showNotification("Logout bem-sucedido!");
        updateUserStatus(); // Atualiza a UI para o estado de deslogado
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        showNotification("Erro ao tentar fazer logout.", true);
    }
}

// Verifica se houve um redirecionamento do OAuth
function handleAuthRedirect() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("auth")) {
        const status = urlParams.get("auth");
        if (status === "success") {
            showNotification("Login bem-sucedido!");
        } else if (status === "failed") {
            showNotification("Falha no login com o Google.", true);
        }
        // Limpa os parâmetros da URL para não mostrar a notificação novamente no refresh
        window.history.replaceState({}, document.title, "/");
    }
}

// Inicializar eventos
document.addEventListener("DOMContentLoaded", () => {
    loadHistory();
    updateUserStatus(); // Verifica o status de login ao carregar a página
    handleAuthRedirect(); // Verifica se veio de um redirect do OAuth
});

document.querySelector("button").addEventListener("click", startDownload);
document.getElementById("videoUrl").addEventListener("input", handleUrlInput);
document.getElementById("clearHistory").addEventListener("click", clearHistory);
