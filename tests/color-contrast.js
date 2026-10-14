const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const designCss = fs.readFileSync(path.join(root, 'frontend/css/design-system.css'), 'utf8');
const componentCss = fs.readFileSync(path.join(root, 'frontend/css/components.css'), 'utf8');

function blockFor(css, selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `regra CSS ausente: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  assert.ok(open > start && close > open, `bloco CSS inválido: ${selector}`);
  return css.slice(open + 1, close);
}
function variable(block, name) {
  const match = block.match(new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*:\\s*([^;]+)`));
  assert.ok(match, `token ausente: ${name}`);
  return match[1].trim();
}
function rgb(value) {
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  assert.ok(match, `cor não hexadecimal suportada pelo validador: ${value}`);
  const hex = match[1].length === 3 ? [...match[1]].map(char => char + char).join('') : match[1];
  return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}
function luminance(color) {
  const [r, g, b] = rgb(color).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
function expectContrast(label, foreground, background, minimum = 4.5) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= minimum, `${label}: contraste ${ratio.toFixed(2)}:1 abaixo de ${minimum}:1 (${foreground} sobre ${background})`);
  console.log(`PASS ${label}: ${ratio.toFixed(2)}:1`);
}

const dark = blockFor(designCss, ':root');
const light = blockFor(designCss, 'html[data-theme="light"]');
for (const [name, palette] of [['escuro', dark], ['claro', light]]) {
  const bg = variable(palette, '--tmx-bg');
  const surface = variable(palette, '--tmx-surface');
  const fg = variable(palette, '--tmx-fg');
  const muted = variable(palette, '--tmx-fg-muted');
  const accent = variable(palette, '--tmx-accent');
  const accentContrast = variable(palette, '--tmx-accent-contrast');
  expectContrast(`${name}: texto/base`, fg, bg);
  expectContrast(`${name}: texto secundário/base`, muted, bg);
  expectContrast(`${name}: texto/superfície`, fg, surface);
  expectContrast(`${name}: texto secundário/superfície`, muted, surface);
  expectContrast(`${name}: texto/acento`, accentContrast, accent);
}

const header = blockFor(componentCss, '.tmx-app-header');
const headerFg = variable(header, '--tmx-fg');
const headerMuted = variable(header, '--tmx-fg-muted');
const lightHeader = blockFor(componentCss, 'html[data-theme="light"] .tmx-app-header');
const defaultHeaderAccent = variable(lightHeader, '--tmx-header-accent');
const headerVariants = [
  ['Início/Música/Downloads em tema claro', defaultHeaderAccent, '#081521'],
  ['Início em tema escuro', variable(dark, '--tmx-accent'), '#081521'],
  ['Cine', '#ff4c68', '#16090e'],
  ['Social', '#59d9e8', '#081521'],
  ['Downloads', '#ff5268', '#0b0b0e']
];
for (const [name, accent, background] of headerVariants) {
  expectContrast(`cabeçalho ${name}: rótulo em foco`, accent, background);
}
expectContrast('cabeçalho: navegação secundária', headerMuted, '#081521');
expectContrast('cabeçalho: ações primárias', headerFg, '#081521');
console.log('COLOR_CONTRAST_OK — tokens e acentos de navegação atendem WCAG AA para texto normal.');
