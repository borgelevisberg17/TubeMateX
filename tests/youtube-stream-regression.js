const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ids = ['Flxe9128nnU','roE1y3_G8-I','QlaOsE-vAYU','dhcDsNnbYw','tKqRz64eQD4','BcXcy2b1dRM','X3NTLCDQdVA'];
(async () => {
  const report = [];
  for (const id of ids) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    try {
      const response = await fetch(`${base}/api/media/stream?type=video&url=${encodeURIComponent(url)}`);
      const payload = await response.json().catch(() => ({}));
      report.push({ id, status: response.status, ok: response.ok && Boolean(payload.url), error: payload.error || null });
    } catch (error) { report.push({ id, status: 0, ok: false, error: error.message }); }
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.some(item => !item.ok)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
