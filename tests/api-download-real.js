const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const cases = [
  { name:'TikTok MP4', url:'https://www.tiktok.com/@scout2015/video/6718335390845095173', format:'mp4', quality:'auto', expectedMime:'video/' },
  { name:'SoundCloud MP3', url:'https://soundcloud.com/kevin-manthei/egg-101-everything-is-going-wrong', format:'mp3', quality:'auto', expectedMime:'audio/' }
];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let cookie = '';
  const report = [];
  for (const item of cases) {
    try {
      const response = await fetch(`${base}/api/downloads`, { method:'POST', headers:{'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})}, body:JSON.stringify({url:item.url,format:item.format,quality:item.quality}) });
      const setCookie = response.headers.getSetCookie?.()?.[0] || response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || `POST ${response.status}`);
      const id = payload.job.id; let state = payload.job;
      for (let attempt=0; attempt<90; attempt += 1) { await wait(2000); const stateResponse = await fetch(`${base}/api/downloads/${encodeURIComponent(id)}`, {headers: cookie ? {Cookie:cookie} : {}}); state = await stateResponse.json().catch(() => ({})); if (['completed','failed','cancelled'].includes(state.status)) break; }
      if (state.status !== 'completed') throw new Error(`${state.status || 'sem estado'}: ${state.error || 'download não concluiu'}`);
      const fileResponse = await fetch(`${base}${state.downloadUrl || `/api/downloads/${id}/file`}`, {headers: cookie ? {Cookie:cookie} : {}}); const type = fileResponse.headers.get('content-type') || ''; if (!fileResponse.ok || !type.startsWith(item.expectedMime)) throw new Error(`ficheiro final inválido: HTTP ${fileResponse.status}, ${type}`);
      report.push({name:item.name,status:'download-ok',mimeType:type,jobStatus:state.status});
    } catch (error) { report.push({name:item.name,status:'failed',reason:error.message}); }
  }
  console.log(JSON.stringify(report,null,2)); if (report.some(item => item.status !== 'download-ok')) process.exit(1);
})().catch(error=>{console.error(error);process.exit(1)});
