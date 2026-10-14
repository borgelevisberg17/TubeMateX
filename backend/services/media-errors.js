function errorCode(error) {
  const raw = String(error?.stderr || error?.message || error || '');
  if (/Sign in|not a bot|age-restricted|login required|members-only/i.test(raw)) return 'authentication-required';
  if (/Requested format is not available|format.*not available/i.test(raw)) return 'format-unavailable';
  if (/DRM|protected content/i.test(raw)) return 'drm-protected';
  if (/copyright|blocked in your country|not available in your country/i.test(raw)) return 'region-blocked';
  if (/Unsupported URL|no suitable extractor/i.test(raw)) return 'unsupported-url';
  if (/Video unavailable|removed|private video/i.test(raw)) return 'content-unavailable';
  if (/File is larger than/i.test(raw)) return 'file-too-large';
  return 'processing-error';
}

function translateError(error) {
  const code = errorCode(error);
  if (code === 'unsupported-url') return 'Este site ou URL não é suportado pelo motor de download.';
  if (code === 'content-unavailable') return 'O conteúdo não está disponível, foi removido ou é privado.';
  if (code === 'authentication-required') return 'O YouTube bloqueou esta sessão por verificação anti-bot. O TubeMateX não pode contornar esse bloqueio automaticamente: configura um cookies.txt local em YTDLP_COOKIES_FILE ou YTDLP_COOKIES_FROM_BROWSER no servidor, sem o comitar, e tenta novamente.';
  if (code === 'format-unavailable') return 'A qualidade pedida não existe neste conteúdo. Escolhe Automática ou tenta outra qualidade.';
  if (code === 'drm-protected') return 'Este catálogo usa DRM e não pode ser descarregado pelo TubeMateX.';
  if (code === 'region-blocked') return 'O conteúdo está bloqueado por direitos ou região.';
  if (code === 'file-too-large') return 'O ficheiro excede o limite de tamanho permitido.';
  return 'Não foi possível processar este download. Confirma o link e tenta novamente.';
}

module.exports = { errorCode, translateError };
