import { readFileSync } from 'node:fs';
import { fontFor } from '../src/font-metrics.mjs';

const file = process.argv[2] ?? new URL('../src/entry.svg', import.meta.url);
const svg = readFileSync(file, 'utf8');
const tolerance = 0.002;
const errors = [];
const measured = [];
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)]
    .map(([, name, value]) => [name, value]));
}

function contains(outer, inner) {
  return inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance &&
    inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance;
}

function overlaps(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerance &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > tolerance;
}

function format(bounds) {
  const { left, top, right, bottom } = bounds;
  return [left, top, right, bottom].map(value => value.toFixed(2)).join(', ');
}

const root = attributes(svg.match(/<svg\b([^>]*)>/)?.[1] ?? '');
const [pageX, pageY, pageWidth, pageHeight] = (root.viewBox ?? '').split(/\s+/).map(Number);
const page = { left: pageX, top: pageY, right: pageX + pageWidth, bottom: pageY + pageHeight };
if (root['font-family'] !== 'FreeSans' ||
    ![pageX, pageY, pageWidth, pageHeight].every(Number.isFinite) ||
    pageWidth <= 0 || pageHeight <= 0) {
  errors.push('Expected a finite SVG viewBox and an inherited FreeSans font family.');
}

const tags = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)];
const textOpenings = [...svg.matchAll(/<text\b/g)].length;
if (!tags.length || tags.length !== textOpenings) {
  errors.push('Expected every SVG text element to contain a single auditable text line.');
}

for (const [, markup, content] of tags) {
  const value = content.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => entities[entity]);
  const attr = attributes(markup);
  const coordinates = (attr['data-box'] ?? '').trim().split(/\s+/).map(Number);
  const [left, top, width, height] = coordinates;
  const x = Number(attr.x);
  const baseline = Number(attr.y);
  const size = Number(attr['font-size']);
  const weight = Number(attr['font-weight']);
  const anchor = attr['text-anchor'];
  const scale = attr.transform === undefined ? 1
    : Number(attr.transform.match(/^scale\(([\d.]+) 1\)$/)?.[1]);

  if (coordinates.length !== 4 || ![...coordinates, x, baseline, size].every(Number.isFinite) ||
      !Number.isFinite(scale) || scale <= 0 || width <= 0 || height <= 0 || size < 11 || ![400, 700].includes(weight) ||
      !['start', 'middle', 'end'].includes(anchor)) {
    errors.push(`Invalid text box or font attributes for "${value}".`);
    continue;
  }

  const font = fontFor(weight);
  const advance = font.width(value, size) * scale;
  const start = x * scale - advance * { start: 0, middle: 0.5, end: 1 }[anchor];
  const bounds = { left, top, right: left + width, bottom: top + height };
  const extent = {
    left: start,
    top: baseline - size * font.ascent,
    right: start + advance,
    bottom: baseline + size * font.descent,
  };

  if (!contains(page, bounds)) errors.push(`Box for "${value}" extends outside the SVG viewBox.`);
  if (!contains(bounds, extent)) {
    errors.push(`Overflow for "${value}" (text ${format(extent)}, box ${format(bounds)}).`);
  }
  measured.push({ value, extent });
}

for (const [index, a] of measured.entries()) {
  for (let next = index + 1; next < measured.length; next++) {
    const b = measured[next];
    if (overlaps(a.extent, b.extent)) errors.push(`Overlap between "${a.value}" and "${b.value}".`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${measured.length} SVG text lines. No overflow or overlap.`);
}
