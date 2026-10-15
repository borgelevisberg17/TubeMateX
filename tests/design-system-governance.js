const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const design = fs.readFileSync(path.join(root, 'frontend/css/design-system.css'), 'utf8');
const components = fs.readFileSync(path.join(root, 'frontend/css/components.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'frontend/js/components.js'), 'utf8');
const spaces = fs.readFileSync(path.join(root, 'frontend/css/spaces.css'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'DESIGN-SYSTEM-GOVERNANCE.md'), 'utf8');

for (const token of [
  '--tmx-color-navy-950:', '--tmx-color-white:', '--tmx-color-lime-400:',
  '--tmx-bg: var(--tmx-color-', '--tmx-surface: var(--tmx-color-',
  '--tmx-text-primary:', '--tmx-text-secondary:', '--tmx-state-error:',
  '--tmx-accent-entertainment:', '--tmx-accent-social:', '--tmx-accent-downloads:',
  '--tmx-focus-ring:', '--tmx-control-height:'
]) assert.ok(design.includes(token), 'missing design token layer: ' + token);

for (const selector of [
  '.tmx-btn {', '.tmx-btn--primary', '.tmx-btn--quiet', '.tmx-btn--danger',
  '.tmx-field {', '.tmx-card {', '.tmx-badge--success', '.tmx-badge--warning',
  '.tmx-badge--danger', '.tmx-state {', '.tmx-progress {', '.tmx-toast {', '.tmx-toast--success', '.tmx-toast--warning', '.tmx-toast--error',
  '.tmx-dialog {', '.tmx-pagination {', 'prefers-reduced-motion', 'max-width: 375px'
]) assert.ok(design.includes(selector), 'missing shared component/state rule: ' + selector);

for (const method of ['createButton', 'createState', 'createToast']) {
  assert.ok(js.includes('function ' + method + '('), 'missing vanilla component helper: ' + method);
}
assert.ok(js.includes('textContent'), 'component text should be inserted as text, not raw HTML');
assert.match(spaces, /--space-violet:var\(--tmx-accent-creative\)/, 'legacy space accent should alias a semantic token');
assert.match(components, /--tmx-header-accent: var\(--tmx-accent/);
assert.match(components, /color: var\(--tmx-fg, var\(--tmx-text-on-header/, 'shared header text must use on-header foreground tokens in both themes');
assert.ok(docs.includes('Legacy alias migration policy'), 'document alias policy');
assert.ok(docs.includes('Responsive and accessibility acceptance checklist'), 'document acceptance criteria');
assert.ok(/320 px/.test(docs) && /200%/.test(docs), 'include small-screen and zoom checks');

console.log('DESIGN_SYSTEM_GOVERNANCE_OK — tokens, component variants, alias policy and acceptance criteria');
