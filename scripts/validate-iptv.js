'use strict';

const fs = require('node:fs');
const path = require('node:path');

const baseUrl = (process.env.TUBEMATEX_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const reportPath = path.resolve(process.env.IPTV_REPORT_PATH || path.join(__dirname, '../backend/data/iptv-validation-report.json'));
const pollMs = Math.max(5000, Number(process.env.IPTV_VALIDATION_POLL_MS) || 15000);
const maxMinutes = Math.max(1, Number(process.env.IPTV_VALIDATION_MAX_MINUTES) || 60);
const startedAt = Date.now();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(endpoint) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${endpoint}`, { signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get('retry-after') || '';
      const seconds = Number(retryAfter);
      const retryDate = Date.parse(retryAfter);
      const suggestedMs = Number.isFinite(seconds) && retryAfter.trim() ? seconds * 1000 : Number.isFinite(retryDate) ? retryDate - Date.now() : 30000 * (2 ** attempt);
      const waitMs = Math.max(1000, Math.min(120000, suggestedMs));
      process.stdout.write(`[IPTV] HTTP 429; a respeitar Retry-After e aguardar ${Math.ceil(waitMs / 1000)} s.\n`);
      await sleep(waitMs);
      continue;
    }
    if (!response.ok) throw new Error(payload.error || `API respondeu HTTP ${response.status}`);
    return payload;
  }
  throw new Error('A API continuou a limitar pedidos após as tentativas de espera.');
}

async function getPage(offset = 0) {
  const params = new URLSearchParams({ limit: '60', offset: String(offset), batchSize: '60' });
  return getJson(`/api/iptv/channels?${params}`);
}

async function getSourceHealth() {
  const payload = await getJson('/api/entertainment/sources/health');
  return payload.sources || [];
}

async function main() {
  const validation = new Map();
  const sourceHealth = await getSourceHealth();
  const iptvSource = sourceHealth.find(source => source.id === 'iptv-org');
  if (!iptvSource || iptvSource.status !== 'online') throw new Error('A API de catálogo IPTV-org não está acessível; não é possível garantir cobertura completa.');
  let candidateCount = 0;
  let lastProgress = '';
  while (true) {
    if (Date.now() - startedAt > maxMinutes * 60 * 1000) throw new Error(`Validação excedeu ${maxMinutes} minutos; relatório parcial não será marcado como completo.`);
    const payload = await getPage(0);
    candidateCount = Number(payload.candidateCount || 0);
    for (const entry of payload.validation || []) if (entry.channelId) validation.set(entry.channelId, entry);
    const progress = `candidatos=${candidateCount} | reproduzíveis=${payload.total || 0} | a verificar=${payload.pendingValidationCount || 0} | por iniciar=${payload.remainingValidationCount || 0} | excluídos=${payload.excludedCount || 0}`;
    if (progress !== lastProgress) { process.stdout.write(`[IPTV] ${progress}\n`); lastProgress = progress; }
    if (Number(payload.pendingValidationCount || 0) === 0 && Number(payload.remainingValidationCount || 0) === 0) break;
    await sleep(pollMs);
  }

  for (let offset = 0; offset < candidateCount; offset += 60) {
    const payload = await getPage(offset);
    for (const entry of payload.validation || []) if (entry.channelId) validation.set(entry.channelId, entry);
  }

  const channels = [...validation.values()].sort((a, b) => String(a.channelName).localeCompare(String(b.channelName), 'pt'));
  const byStatus = channels.reduce((summary, item) => { summary[item.status] = (summary[item.status] || 0) + 1; return summary; }, {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'iptv-org public catalogue',
    sourceHealth,
    rules: { languages: ['por', 'eng'], categories: 'all', requireHttps: true, requireReachableMediaOrManifest: true, bypassDrm: false, bypassAuthentication: false, bypassGeoblocks: false },
    summary: { candidateCount, checkedCount: channels.filter(item => item.status !== 'unverified' && item.status !== 'checking').length, playableCount: byStatus.online || 0, excludedCount: channels.filter(item => item.status !== 'online').length, byStatus },
    channels
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`[IPTV] Relatório completo: ${reportPath}\n`);
  process.stdout.write(`[IPTV] ${report.summary.playableCount}/${report.summary.candidateCount} canais tecnicamente reproduzíveis; a reprodução real ainda depende de CORS, disponibilidade regional e dispositivo.\n`);
}

main().catch(error => { console.error(`[IPTV] Falha: ${error.message}`); process.exitCode = 1; });
