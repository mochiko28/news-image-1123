import { readFileSync, writeFileSync } from 'node:fs';
import { fontFor } from './font-metrics.mjs';

const stories = JSON.parse(readFileSync(new URL('./stories.json', import.meta.url), 'utf8'));
const pageSize = 1024;
const margin = 24;
const pageWidth = pageSize - 2 * margin;
const leadTop = 141;
const leadHeight = 203;
const cardTop = leadTop + leadHeight + 5;
const cardHeight = 195;
const cardColumns = 4;
const panelGap = 6;
const cardWidth = (pageWidth - (cardColumns - 1) * panelGap) / cardColumns;
const ink = '#14243b';
const muted = '#46566a';
const paper = '#f7f5ef';
const white = '#fffefa';
const rule = '#c8ced0';
const red = '#a52e37';
const statuses = {
  OFFICIAL: ['#174985', '#e3eefb'],
  CONFIRMED: ['#185741', '#deefe5'],
  REPORTED: ['#734400', '#fbedd1'],
  CLAIM: ['#475365', '#e8ebee'],
};
const regions = {
  EUROPE: ['#245794', '#e5edf8'],
  AFRICA: ['#9d3e23', '#f5e6df'],
  'MIDDLE EAST': ['#765600', '#f8ecd5'],
  'CENTRAL ASIA': ['#575c26', '#eaeddb'],
  'SOUTH ASIA': ['#9a5a12', '#f6ecdd'],
  'EAST ASIA': ['#006b73', '#dff0f0'],
  'SOUTH-EAST ASIA': ['#366123', '#e8f0df'],
  OCEANIA: ['#9b2f67', '#f6e5ef'],
  'NORTH AMERICA': ['#583987', '#eee5f3'],
  'LATIN AMERICA': ['#414959', '#e8ebf0'],
};
const placeRegions = {
  'NATO · EUROPE': 'EUROPE',
  'AFRICA · DR CONGO': 'AFRICA',
  BANGLADESH: 'SOUTH ASIA',
  BELGIUM: 'EUROPE',
  IRAN: 'MIDDLE EAST',
  'ASIA · US': 'EAST ASIA · NORTH AMERICA',
  AUSTRALIA: 'OCEANIA',
  US: 'NORTH AMERICA',
  UK: 'EUROPE',
  'UK · USA': 'EUROPE · NORTH AMERICA',
};
const neutralRegion = ['#525b66', '#eceef0'];
const regionPalette = region => Object.hasOwn(regions, region) ? regions[region] : neutralRegion;
const canonicalRegion = region => Object.hasOwn(regions, region) ? region : 'OTHER';
const regionNames = ({ region }) => (Object.hasOwn(placeRegions, region) ? placeRegions[region] : region)
  .split(' · ').map(canonicalRegion);
const mappedStories = [...stories.leads, ...stories.cards];
const allStories = [...mappedStories, ...stories.briefs];
const presentRegions = new Set(allStories.flatMap(regionNames));

// Each text line includes the intended layout box for the separate SVG audit.
const svg = [];
const add = markup => svg.push(markup);
const n = value => Number(value.toFixed(3));
const xml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);
const box = (x, y, w, h) => ({ x, y, w, h });

function rect(x, y, w, h, fill, attributes = '') {
  add(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${attributes}/>`);
}

function line(x1, y1, x2, y2, stroke = rule) {
  add(`<path d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}" stroke="${stroke}" fill="none"/>`);
}

function circle(x, y, radius, fill, attributes = '') {
  add(`<circle cx="${n(x)}" cy="${n(y)}" r="${radius}" fill="${fill}" ${attributes}/>`);
}

function wrap(value, maxWidth, measure) {
  const lines = [];
  let current = '';
  for (const word of value.trim().split(/\s+/)) {
    if (measure(word) > maxWidth) return null;
    const candidate = current ? current + ' ' + word : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  return [...lines, current];
}

function text(value, bounds, options = {}) {
  const { x, y, w, h } = bounds;
  const {
    size = 11, min = 11, weight = 400, fill = ink, align = 'start',
    vertical = 'top', maxLines = Infinity, inset = 1.2, gap = 0.7,
    widthScales = [1], letterSpacing = 0,
  } = options;
  const font = fontFor(weight);

  for (const scale of widthScales) {
    for (let fontSize = size; fontSize >= min; fontSize = fontSize === min ? -1 : Math.max(min, fontSize - 1)) {
      const lines = wrap(String(value), w - 2 * inset, line =>
        scale * (font.width(line, fontSize) + letterSpacing * Math.max(0, [...line].length - 1)),
      );
      if (!lines || lines.length > maxLines) continue;
      const lineHeight = (font.ascent + font.descent) * fontSize;
      const height = lines.length * lineHeight + (lines.length - 1) * gap;
      if (height > h + 0.001) continue;

      const start = y + (vertical === 'middle' ? (h - height) / 2 : 0);
      const anchorX = { start: x + inset, middle: x + w / 2, end: x + w - inset }[align];
      const baseline = start + font.ascent * fontSize;
      const transform = scale === 1 ? '' : ` transform="scale(${scale} 1)"`;
      const spacing = letterSpacing ? ` letter-spacing="${letterSpacing}"` : '';
      for (const [index, content] of lines.entries()) {
        add(`<text x="${n(anchorX / scale)}" y="${n(baseline + index * (lineHeight + gap))}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${align}" fill="${fill}" data-box="${[x, y, w, h].map(n).join(' ')}"${transform}${spacing}>${xml(content)}</text>`);
      }
      return height;
    }
  }
  throw new Error(`Text cannot fit ${w}×${h} at ${x},${y}: ${value}`);
}

function label(value, bounds, fill = ink) {
  text(value, bounds, { weight: 700, fill, vertical: 'middle', maxLines: 1 });
}

function badge(value, x, y, w = 19, h = 16, fill = ink) {
  rect(x, y, w, h, fill, 'rx="2"');
  text(value, box(x, y, w, h), {
    weight: 700, fill: '#ffffff', align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
  });
}

function pill(value, x, y, palette, width) {
  const [color, background] = palette;
  const w = width ?? Math.ceil(fontFor(700).width(value, 11)) + 12;
  rect(x, y, w, 16, background, 'rx="8"');
  text(value, box(x, y, w, 16), {
    weight: 700, fill: color, align: 'middle', vertical: 'middle', maxLines: 1,
  });
  return w;
}

function masthead() {
  const { day, date, kicker } = stories;
  const fieldCount = new Set(allStories.map(story => story.field).filter(Boolean)).size;
  const [dayOfMonth, month] = date.split(' ');
  const stats = `${kicker} · ${allStories.length} STORIES · ${presentRegions.size} REGIONS · ${fieldCount} FIELDS · FIRST REPORTED ${day.slice(0, 3)} ${dayOfMonth} ${month.slice(0, 3)}`;

  rect(24, 6, pageWidth, 90, ink);
  rect(24, 6, 5, 90, '#d75450');
  text(day + ' ' + date, box(39, 7, 945, 71), {
    size: 64, min: 56, weight: 700, fill: '#ffffff', vertical: 'middle', maxLines: 1, inset: 4,
  });
  text(stats, box(39, 78, 945, 17), {
    size: 15, min: 13, weight: 700, fill: '#ffffff', vertical: 'middle', maxLines: 1, inset: 4,
  });
}

function timeline() {
  const timelineSize = 12.5;
  const timelineLineHeight = 14;
  const timelineOptions = { size: timelineSize, min: timelineSize, maxLines: 1, inset: 0 };
  const timelineWidths = stories.timeline.map(({ t, text: event }) =>
    Math.max(fontFor(700).width(t, timelineSize), fontFor(400).width(event, timelineSize)),
  );
  const extraWidth = (pageWidth - timelineWidths.reduce((sum, width) => sum + width, 0)) /
    timelineWidths.length;
  const padding = Math.min(4, Math.max(0, extraWidth / 2));
  label('THE DAY IN UTC', box(24, 97, 230, 14));
  line(24, 111, 1000, 111, ink);
  const timelineY = 112;
  let timelineX = margin;
  for (const [index, { t, text: event }] of stories.timeline.entries()) {
    const width = timelineWidths[index] + extraWidth;
    if (index) line(timelineX, timelineY + 2, timelineX, timelineY + 24);
    text(t, box(timelineX + padding, timelineY, width - 2 * padding, timelineLineHeight), {
      ...timelineOptions, weight: 700, fill: '#174985', vertical: 'middle',
    });
    text(event, box(timelineX + padding, timelineY + timelineLineHeight, width - 2 * padding, timelineLineHeight),
      timelineOptions);
    timelineX += width;
  }
}

const leadSceneHeight = 70;
const natoSceneHeight = 60;
const scenes = {
  nato: `
    <rect width="320" height="${natoSceneHeight}" fill="#15365c"/>
    <path d="M320 0h-66l-5 8 4 7 5 5-7 8-12 1-5 7 6 6-5 9 8 9h77Z"
          fill="#3b5574" stroke="#83a2bd"/>
    <path d="m236 3 18-3-5 8 4 7 5 5-7 8-12 1-9-3-1-5 5-5-3-5Z"
          fill="#8abbd0" stroke="#d1e4ed" stroke-linejoin="round"/>
    <path d="m213 29 7-2 9 2 10 0-5 7-10 2-11-3Z" fill="#8abbd0" stroke="#d1e4ed"/>
    <path d="m212 45 10-4 10 2 3 8-7 6-12-1-7-5Z" fill="#8abbd0" stroke="#d1e4ed"/>
    <path d="M205 13h24m-39 22h20m25 16h8" stroke="#b6cedf"/>
    <path d="M257 20 249 34 209 49h-6" fill="none" stroke="#ffcb80" stroke-width="1.4"/>
    <circle cx="257" cy="20" r="4" fill="#ffcb80" stroke="#15365c" stroke-width="1.5"/>
    <g transform="translate(107 2) scale(.22)" fill="#d1e4ed" aria-label="Radar plane">
      <path d="M0 34h13l12 9h22L36 28h9l18 15h35q11 0 17 6-5 5-16 5H29L9 48Z"/>
      <path d="M61 43V32m-18 0h36M40 23q20-18 41 0" fill="none" stroke="#d1e4ed"
            stroke-width="4" stroke-linecap="round"/>
    </g>
    <rect x="4" y="43" width="201" height="15" rx="2" fill="#102a47"/>`,
  aidmap: `
    <rect width="320" height="${leadSceneHeight}" fill="#143f48"/>
    <path d="M219 13h94m-94 15h94m-94 15h94m-94 15h94M239 4v62m23-62v62m23-62v62"
          stroke="#8ab4b2" opacity=".35"/>
    <path d="m243 7 10-3 6 5-2 5 6 6 9 7 12 3 6-4 8 1 5-7 9-3 5 4-6 5-2 7-5 2-4 8-6-3-2-7
             -9 4-6 7-7 2-4 10-7 8-5-4-4-11-6-10-3-9-7 1-7-7 6-3 5-10Z"
          fill="#88b8b3" stroke="#c4dcce" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="m263 20 7 2 7 4 9 2-2 5-8-2-7-3-6-5Z" fill="#ffcb80" stroke="#fff0b2"/>
    <path d="m285 17-4 9m-50 30 14-4" fill="none" stroke="#c4dcce"/>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M247 53q14-1 26-22m-10 3 10-3-1 10" stroke="#0e3037" stroke-width="6"/>
      <path d="M247 53q14-1 26-22m-10 3 10-3-1 10" stroke="#ffcb80" stroke-width="3"/>
    </g>
    <rect x="4" y="15" width="207" height="33" rx="3" fill="#0e3037"/>
    <rect x="269" y="43" width="46" height="17" rx="3" fill="#0e3037"/>`,
  ebola: `
    <rect width="320" height="${leadSceneHeight}" fill="#f3e5cf"/>
    <path d="M0 35Q66 12 147 32T320 28V70H0Z" fill="#dac097"/>
    <path d="M0 44Q77 30 153 42T320 36V70H0Z" fill="#bf9c70"/>
    <path d="M30 37V25a7 7 0 0 1 14 0v12Zm43-7V18a6 6 0 0 1 12 0v12Zm42 7V24a7 7 0 0 1 14 0v13Zm42-5V20a6 6 0 0 1 12 0v12Zm40 6V24a7 7 0 0 1 14 0v14Z"
          fill="#795b50" stroke="#f3e5cf" stroke-width="1.5"/>
    <g transform="translate(207 0) scale(0.8)">
      <path d="m31 8 3 8m14-7-4 10m14 3-10 4m9 11-10-3m3 14-8-9m-9 13 2-11m-16 6 7-10m-14 0 12-6m-11-9 12 2m-6-12 10 9"
            stroke="#80374b" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="36" cy="29" r="15" fill="#80374b"/>
      <path d="M31 23h.1m11 3h.1m-5 9h.1" stroke="#f0ad8d" stroke-width="4" stroke-linecap="round"/>
    </g>
    <rect x="251" y="7" width="65" height="16" rx="2" fill="#f3e5cf" stroke="#bf9c70"/>
    <rect x="4" y="41" width="312" height="26" rx="3" fill="#673c31"/>`,
};

const sceneLabels = {
  nato: [
    { value: 'URGENT', x: 5, y: 3, w: 105, h: 19, size: 17, fill: white },
    { value: 'NATO TALKS', x: 5, y: 22, w: 143, h: 22, size: 20, fill: white },
    { value: 'SUSPECTED AIRSPACE VIOLATION', x: 4, y: 43, w: 201, h: 15, size: 11, fill: '#ffcb80' },
    { value: 'Finland', x: 161, y: 6, w: 45, h: 13, size: 11, fill: white },
    { value: 'Estonia', x: 147, y: 28, w: 45, h: 13, size: 11, fill: white },
    { value: 'Poland', x: 243, y: 45, w: 44, h: 13, size: 11, fill: white },
    { value: 'Russia', x: 271, y: 15, w: 43, h: 14, size: 12, fill: white },
  ],
  aidmap: [
    { value: '$1.6BN TO NEPAL', x: 4, y: 15, w: 207, h: 33, size: 23, fill: '#fff0b2' },
    { value: 'India', x: 192, y: 47, w: 40, h: 16, size: 12, fill: white },
    { value: 'Nepal', x: 264, y: 3, w: 45, h: 16, size: 12, fill: '#fff0b2' },
    { value: '$1.6bn', x: 269, y: 43, w: 46, h: 17, size: 12, fill: '#fff0b2' },
  ],
  ebola: [
    { value: 'DR CONGO', x: 251, y: 7, w: 65, h: 16, size: 11, fill: '#673c31' },
    { value: 'HIDDEN EBOLA DEATHS', x: 4, y: 41, w: 312, h: 26, size: 22, fill: '#fffefa' },
  ],
};

function leadPanel(story, index) {
  const x = 24 + index * 328;
  const y = leadTop;
  const w = index === 2 ? 320 : 318;
  const sceneScale = w / 320;
  const contentX = x + 11;
  const contentWidth = w - 22;
  const names = regionNames(story);
  const isNato = story.scene === 'nato';
  const tagY = y + (isNato ? natoSceneHeight : leadSceneHeight) + 3;
  const statusX = x + w - 91;
  const headlineY = tagY + 17;
  const headlineHeight = 67;
  const bodyY = headlineY + headlineHeight;
  const sourceY = y + leadHeight - 14;
  const sourceGap = isNato ? 1 : 4;

  rect(x, y, w, leadHeight, white, `stroke="${rule}"`);
  add(`<g transform="translate(${x} ${y}) scale(${sceneScale} 1)">${scenes[story.scene]}</g>`);
  for (const { value, x: offsetX, y: offsetY, w: width, h, size, fill } of sceneLabels[story.scene] ?? []) {
    text(value, box(x + offsetX * sceneScale, y + offsetY, width * sceneScale, h), {
      size, min: size, fill, weight: 700, align: 'middle', vertical: 'middle', maxLines: 1,
    });
  }
  const bandWidth = w / names.length;
  for (const [i, region] of names.entries()) {
    rect(x + i * bandWidth, y, bandWidth, 3, regionPalette(region)[0]);
  }

  badge(index + 1, contentX, tagY, 19, 16);
  let tagX = contentX + 24;
  for (const region of names) {
    tagX += pill(names.length === 1 ? story.region : region, tagX, tagY, regionPalette(region)) + 4;
  }
  label(story.field, box(tagX + 2, tagY, statusX - tagX - 6, 16), muted);
  pill(story.status, statusX, tagY, statuses[story.status], 80);
  text(story.head, box(contentX, headlineY, contentWidth, headlineHeight), {
    size: 30, min: 28, weight: 700, maxLines: 2, inset: 1, gap: 0.3,
  });
  const subWidth = story.scene === 'aidmap' ? 230 : contentWidth;
  text(story.sub, box(contentX, bodyY, subWidth, sourceY - sourceGap - bodyY), {
    size: 12, min: 12, maxLines: isNato ? 3 : 2, gap: 0.2,
  });
  sourceLine(story, box(contentX, sourceY, contentWidth, 13), 'Source: ');
}

const cardScenes = {
  plane: `<g transform="scale(${190 / 320} 1)">
    <rect width="320" height="${leadSceneHeight}" fill="#deeaee"/>
    <g transform="scale(1 0.74)">
      <path d="M163 4v43" stroke="#a8bdc5"/>
      <path d="M10 44h143" stroke="#748c98" stroke-width="3"/>
      <path d="M17 44h129" stroke="#fffefa" stroke-dasharray="10 6"/>
      <g transform="translate(-4 0) scale(1.29)">
        <path d="M15 10h10l10 10h31L52 7h12l24 13h22q11 0 17 6-3 4-13 4H45L25 24Z" fill="#233d55"/>
        <path d="M88 24h24" stroke="#deeaee" stroke-width="2" stroke-dasharray="3 3"/>
        <path d="M58 28h27L73 34H61Z" fill="#536b7b"/>
        <circle cx="45" cy="32" r="2.5" fill="#14243b"/>
        <circle cx="106" cy="32" r="2.5" fill="#14243b"/>
      </g>
      <path d="M171 43h139m-139 4h139" stroke="#748c98" stroke-width="2"/>
      <path d="M178 45h125" stroke="#748c98" stroke-width="6" stroke-dasharray="2 8"/>
      <g transform="translate(-49 1) scale(1.25)">
        <path d="M178 16q0-4 5-4h43v19h-48ZM232 12h33q13 0 18 15l-6 4h-45Z" fill="#233d55"/>
        <path d="M178 27h103" stroke="#54788e" stroke-width="3"/>
        <path d="M184 19h36m18 0h32" stroke="#deeaee" stroke-width="5" stroke-dasharray="8 4"/>
        <circle cx="192" cy="31" r="3" fill="#14243b"/>
        <circle cx="218" cy="31" r="3" fill="#14243b"/>
        <circle cx="239" cy="31" r="3" fill="#14243b"/>
        <circle cx="263" cy="31" r="3" fill="#14243b"/>
      </g>
      <g fill="#ad2f39" stroke="#fffefa" stroke-width="1.5">
        <circle cx="147" cy="17" r="13"/>
        <circle cx="298" cy="17" r="13"/>
      </g>
      <path d="M140 17h14m137 0h14" stroke="#fffefa" stroke-width="4"/>
    </g>
  </g>`,
  cyberdeal: `
    <rect width="190" height="70" fill="#e6e0f2"/>
    <path d="M0 21h25l11 13h20m-56 6h31l14 13h28m117-36h-22l-11 15h-21m54 9h-28l-17 16h-26"
          stroke="#9c86b4" stroke-width="2" fill="none"/>
    <path d="M39 6c15 0 25 0 40 8v14q0 16-20 26-20-10-20-26Z" fill="#544079"/>
    <path d="M111 14c15-8 25-8 40-8v22q0 16-20 26-20-10-20-26Z" fill="#325674"/>
    <path d="M51 26l7 7 11-13m54 6 7 7 11-13" fill="none" stroke="#fffefa" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M83 29h24m-6-6 6 6-6 6" fill="none" stroke="#544079" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24" cy="20" r="3" fill="#544079"/>
    <circle cx="180" cy="17" r="3" fill="#325674"/>`,
  sewing: `
    <rect width="190" height="70" fill="${regions['SOUTH ASIA'][1]}"/>
    <path d="M50 35h46l10-4h15v9H50Z" fill="#be6468"/>
    <path d="M56 37h39" stroke="#fffefa" stroke-dasharray="3 2"/>
    <path d="M66 18q0-8 8-8h51q11 0 11 11v18h-21V23H83v5H66Z" fill="#235451"/>
    <path d="M75 28v7m41-25V5" stroke="#235451" stroke-width="2.5"/>
    <rect x="109" y="4" width="14" height="5" rx="2" fill="#be6468"/>
    <circle cx="128" cy="21" r="5" fill="#f0cb86"/>
    <rect x="56" y="36" width="88" height="5" rx="2" fill="#235451"/>`,
  iowa: `
    <rect width="190" height="70" fill="#ede7cc"/>
    <path d="M0 37 39 26l30 7 36-13 28 10 30-8 27 5v43H0Z" fill="#b9b47c"/>
    <path d="M0 43q44-10 85 3t105-2v26H0Z" fill="#8b9867"/>
    <path d="M9 43h103m-95-9v18m19-18v18m19-18v18m19-18v18m19-18v18"
          fill="none" stroke="#666345" stroke-width="2"/>
    <path d="m54 26 21-12 21 12v13H54Z" fill="#5c6257"/>
    <path d="M62 29h26v10H62Z" fill="#c9c7a1"/>
    <circle cx="147" cy="26" r="20" fill="#a52e37" stroke="#fffefa" stroke-width="2"/>
    <path d="M141 17v18m12-18v18" stroke="#fffefa" stroke-width="5" stroke-linecap="round"/>`,
  markets: `
    <rect width="190" height="70" fill="#e5efe5"/>
    <path d="M0 0h92v70H0Z" fill="#f4e0dd"/>
    <path d="M9 13h171M9 25h171M9 37h171M9 49h171
             M22 6v44M45 6v44M68 6v44M92 6v44M116 6v44M140 6v44M164 6v44"
          fill="none" stroke="#aeb9b4" opacity=".65"/>
    <g fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 12l22 8 16-3 22 15 19 10" stroke="#a52e37"/>
      <path d="M92 42l19-13 17 2 20-13 13 1 16-11m-11 1 11-1-3 10" stroke="#1c7038"/>
    </g>
    <circle cx="92" cy="42" r="3" fill="#fffefa" stroke="#14243b" stroke-width="1.5"/>`,
  courts: `
    <rect width="190" height="70" fill="#ede2c8"/>
    <path d="M0 42h190v28H0Z" fill="#c5af82"/>
    <path d="m13 23 38-15 38 15ZM19 26h63v4H19Zm-3 17h70v5H16Z" fill="#765f3c"/>
    <path d="M26 31v11m12-11v11m13-11v11m13-11v11m12-11v11" stroke="#a58b5f" stroke-width="4"/>
    <path d="M137 10v34m-20 0h40m-46-26h52" stroke="#674b38" stroke-width="3" stroke-linecap="round"/>
    <path d="m116 18-10 16h20Zm42 0-10 16h20Z" stroke="#674b38" stroke-width="1.5" fill="none"/>
    <path d="M103 34h26q-3 8-13 8t-13-8Zm42 0h26q-3 8-13 8t-13-8Z" fill="#9b6547"/>
    <circle cx="137" cy="11" r="4" fill="#9b6547"/>`,
  blockade: `
    <rect width="190" height="70" fill="#d9e8e8"/>
    <path d="M0 25h190v45H0Z" fill="#689eac"/>
    <path d="M0 46h190v24H0Z" fill="#396e85"/>
    <path d="M4 36h31m21 5h26m55-7h39m-65 20h56m-30 8h51m-170-9h42"
          stroke="#b7d9dc" stroke-width="2" fill="none"/>
    <path d="M12 35h43l8-4-6 9H20Zm54 8h55l8-5-6 11H75Zm64 7h51l9-6-6 12h-42Z" fill="#1c334b"/>
    <path d="M21 35v-6h11l5-5h12v11Zm56 8v-7h12l6-6h15l5 13Zm66 7v-8h11l4-6h15l4 14Z" fill="#3b566a"/>
    <path d="M42 27V14m-6 5h12m56 13V17m-7 4h14m57 17V21m-7 6h14"
          stroke="#1c334b" stroke-width="2" fill="none"/>`,
  vinyl: `
    <rect width="190" height="70" fill="${regions.OCEANIA[1]}"/>
    <path d="M55 0h37l23 50H23ZM146 0h22l22 50h-72Z" fill="#ecd1e1"/>
    <path d="M0 46h190v24H0Z" fill="#dba8c6"/>
    <circle cx="78" cy="25" r="23" fill="${ink}"/>
    <path d="M61 22a17 17 0 0 1 14-14m6 34a17 17 0 0 0 14-14
             M65 22a13 13 0 0 1 10-10m6 26a13 13 0 0 0 10-10"
          fill="none" stroke="#a87c9f" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="78" cy="25" r="9" fill="${regions.OCEANIA[0]}"/>
    <circle cx="78" cy="25" r="2.6" fill="${white}"/>
    <g fill="${regions.OCEANIA[0]}">
      <path d="M23 15 43 9v17h-3V16l-14 4v12h-3Z"/>
      <ellipse cx="21" cy="32" rx="5" ry="3.5" transform="rotate(-20 21 32)"/>
      <ellipse cx="38" cy="26" rx="5" ry="3.5" transform="rotate(-20 38 26)"/>
      <path d="M121 18q4 1 9 6v5q-4-4-7-4v10h-3V18Z"/>
      <ellipse cx="118" cy="35" rx="5" ry="3.5" transform="rotate(-20 118 35)"/>
    </g>
    <path d="M143 20v3a12 12 0 0 0 24 0v-3m-12 15v8m-10 0h20"
          fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>
    <rect x="147" y="5" width="16" height="26" rx="8" fill="${ink}"/>
    <path d="M151 13h8m-8 5h8m-8 5h8" stroke="${white}" stroke-width="2" stroke-linecap="round"/>`,
  gas: `
    <rect width="190" height="70" fill="#cde4e5"/>
    <path d="M0 55h190v15H0Z" fill="#99c2c8"/>
    <path d="M8 56h25l9-12h19m-5 0h21" stroke="#6b979d" stroke-width="7" fill="none"/>
    <path d="M91 54c-15-4-17-16-10-25 0 7 5 8 5 8-1-14 11-16 12-30 12 10 8 21 10 25
             5-1 7-6 7-10 14 17 5 32-9 35Z" fill="#1d6184"/>
    <path d="M99 55c-11-6-3-13 1-20 1 7 6 9 8 6 4 5 3 11-3 14Z" fill="#5fcae7"/>
    <path d="m124 44 17-17 12 5 19-19m-14 0 14-1v14" stroke="#266946"
          stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  trophy: `
    <rect width="190" height="70" fill="#397650"/>
    <path d="M30 0h32L40 70H7Zm50 0h30l5 70H75Zm48 0h32l23 70h-33Z" fill="#44845a"/>
    <path d="M0 35h190" stroke="#a4c49a" opacity=".5"/>
    <rect x="5" y="13" width="70" height="26" rx="2" fill="#14243b"/>
    <rect x="115" y="13" width="70" height="26" rx="2" fill="#14243b"/>
    <g transform="translate(19 2) scale(1 0.55)">
      <rect width="42" height="18" fill="#fffefa"/>
      <path d="M0 0h42v2H0zm0 4h42v2H0zm0 4h42v2H0zm0 4h42v2H0zm0 4h42v2H0z" fill="#b63743"/>
      <rect width="18" height="10" fill="#253d67"/>
      <path d="M3 3h.1m5.9 0h.1m5.9 0h.1M6 7h.1m5.9 0h.1" stroke="#fffefa"
            stroke-width="1.8" stroke-linecap="round"/>
    </g>
    <g transform="translate(129 2) scale(1 0.55)">
      <rect width="42" height="18" fill="#253d67"/>
      <path d="M0 0h5l37 16v2h-5L0 2Zm42 0h-5L0 16v2h5L42 2Z" fill="#fffefa"/>
      <path d="m0 0 21 9h-4L0 2Zm42 0L21 9V7L38 0Zm0 18L21 9h4l17 7ZM0 18l21-9v2L4 18Z" fill="#b63743"/>
      <path d="M0 6h17V0h8v6h17v6H25v6h-8v-6H0Z" fill="#fffefa"/>
      <path d="M0 7.5h19V0h4v7.5h19v3H23V18h-4v-7.5H0Z" fill="#b63743"/>
    </g>
    <g transform="scale(1 0.85)">
      <ellipse cx="95" cy="43" rx="16" ry="2" fill="#2f6044"/>
      <path d="M86 38h18l4 5H82Z" fill="#775133"/>
      <path d="M87 36h16v4H87Z" fill="#efbd57"/>
      <path d="M91 36c0-6 1-14 4-21h4c-2 8-1 15 1 21Z" fill="#dca248"/>
      <path d="M90 16c-8 5-3 9 7 10 11 1 4 6-7 9" stroke="#f5ca61" stroke-width="4"
            stroke-linecap="round" fill="none"/>
      <path d="M90 15c-7 5-3 8 7 9" stroke="#fff0a0" stroke-width="1.5" stroke-linecap="round" fill="none"/>
      <circle cx="95" cy="10" r="7" fill="#f5ca61" stroke="#a66f35" stroke-width="1.5"/>
      <path d="m95 6 4 3-2 4h-4l-2-4Z" fill="#a66f35"/>
    </g>`,
  chartdown: `
    <rect width="190" height="70" fill="#f4e0dd"/>
    <path d="M9 13h171M9 25h171M9 37h171M9 49h171M9 61h171
             M22 7v54M47 7v54M72 7v54M97 7v54M122 7v54M147 7v54M172 7v54"
          fill="none" stroke="#dec0c0"/>
    <path d="m13 14 28 5 24-9 24 22 20-8 22 16 19-7 10 14 20 10v5H13Z" fill="#e9b8b6"/>
    <path d="m13 14 28 5 24-9 24 22 20-8 22 16 19-7 10 14 20 10m-12 3 12-3-4-12"
          fill="none" stroke="#982c42" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  satellite: `
    <rect width="190" height="70" fill="#222d4c"/>
    <path d="M6 66Q90 13 190 71Z" fill="#354763"/>
    <path d="M13 13h.1m18 22h.1m18-24h.1m15 15h.1m102 22h.1m15-35h.1m-53-5h.1"
          stroke="#d5e6ed" stroke-width="2.8" stroke-linecap="round"/>
    <g transform="rotate(-23 110 32)">
      <path d="M72 32h76" stroke="#f9edd0" stroke-width="3"/>
      <path d="M66 23h31v18H66Zm57 0h31v18h-31Z" fill="#4f9fcb" stroke="#adcfde" stroke-width="1.5"/>
      <path d="M76 23v18m10-18v18m47-18v18m10-18v18m-77-9h31m26 0h31" stroke="#263f61"/>
      <rect x="101" y="19" width="18" height="25" rx="2" fill="#f8d179"/>
      <path d="M110 19v-9m-11 2q11-11 22 0Z" fill="#f8d179" stroke="#f8d179" stroke-width="2"/>
    </g>
    <circle cx="168" cy="27" r="13" fill="#f2cb64"/>
    <path d="M168 24h.1m-3 5-6 4a10 10 0 0 1 0-10l6 4m6 2 6 4a10 10 0 0 0 0-10l-6 4m-7-8a9 9 0 0 1 8 0l-4 6Z" fill="#222d4c"/>
    <circle cx="168" cy="28" r="1.6" fill="#222d4c"/>`,
};

function storyCard(story, index) {
  const w = cardWidth;
  const x = margin + index % cardColumns * (w + panelGap);
  const y = cardTop + Math.floor(index / cardColumns) * (cardHeight + panelGap);
  const sceneHeight = 78;
  const sceneScaleX = w / 190;
  const sceneScaleY = sceneHeight / 70;
  const [color] = regionPalette(regionNames(story)[0]);
  rect(x, y, w, cardHeight, white, `stroke="${rule}"`);
  add(`<g transform="translate(${n(x)} ${y}) scale(${sceneScaleX} ${sceneScaleY})">${cardScenes[story.art]}</g>`);

  if (story.art === 'trophy') {
    const tagOptions = {
      weight: 700, fill: white, align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    };
    const tagBox = (offset, width) => box(x + offset * sceneScaleX, y + 13 * sceneScaleY,
      width * sceneScaleX, 26 * sceneScaleY);
    text('2031', tagBox(5, 70), { ...tagOptions, size: 22 });
    text('2035', tagBox(115, 50), { ...tagOptions, size: 22 });
    text('UK', tagBox(168, 18), { ...tagOptions, size: 12 });
  }

  const boldFont = fontFor(700);
  const captionSpace = w - 6;
  const minCaptionScale = 0.81;
  const captionSize = Math.max(15, Math.min(22,
    Math.floor(captionSpace / boldFont.width(story.label, 1) / minCaptionScale)));
  const captionAdvance = boldFont.width(story.label, captionSize);
  const captionScale = Math.max(minCaptionScale, Math.min(1, Math.floor(1000 * captionSpace / captionAdvance) / 1000));
  const captionWidth = Math.min(w, Math.ceil(captionAdvance * captionScale) + 8);
  const captionHeight = 26;
  const captionY = y + sceneHeight - captionHeight;
  rect(x, captionY, captionWidth, captionHeight, ink);
  text(story.label, box(x, captionY, captionWidth, captionHeight), {
    size: captionSize, min: 15, weight: 700, fill: '#ffffff',
    align: 'middle', vertical: 'middle', maxLines: 1, inset: 3, widthScales: [captionScale],
  });

  const tagY = y + sceneHeight + 1;
  const statusWidth = Math.ceil(fontFor(700).width(story.status, 11)) + 5;
  const statusX = x + w - 3 - statusWidth;
  badge(index + stories.leads.length + 1, x + 3, tagY, 18, 16);
  text(story.region, box(x + 24, tagY, statusX - x - 26, 16), {
    weight: 700, fill: color, vertical: 'middle', maxLines: 1, inset: 0, widthScales: [1, 0.92],
  });
  if (story.field === 'MARKETS') {
    const fieldX = x + 31 + boldFont.width(story.region, 11);
    label(story.field, box(fieldX, tagY, statusX - fieldX - 4, 16), muted);
  }
  pill(story.status, statusX, tagY, statuses[story.status], statusWidth);

  const headY = tagY + 17;
  const headWidth = w - 8;
  const sourceHeight = 13;
  const sourceY = y + cardHeight - sourceHeight;
  const subOptions = { size: 12, min: 12, maxLines: 3, inset: 0, gap: 0.2 };
  const subFont = fontFor(400);
  const subLines = wrap(story.sub, headWidth, content => subFont.width(content, subOptions.size));
  const subHeight = subLines.length * (subFont.ascent + subFont.descent) * subOptions.size +
    (subLines.length - 1) * subOptions.gap;
  const subGap = 0.3;
  const headHeight = text(story.head, box(x + 4, headY, headWidth, sourceY - headY - subHeight - subGap), {
    size: 26, min: 24, weight: 700, maxLines: 2, inset: 0, gap: 0.5,
    widthScales: [1, 0.97, 0.91, 0.84, 0.82],
  });
  const subY = headY + headHeight + subGap;
  text(story.sub, box(x + 4, subY, headWidth, sourceY - subY), subOptions);

  sourceLine(story, box(x + 4, sourceY, w - 8, sourceHeight));
}

function sourceLine(story, { x, y, w, h }, prefix = '') {
  const reportTime = story.t ? `${story.t} UTC` : '';
  const timeWidth = Math.ceil(fontFor(400).width(reportTime, 11));
  const timeX = x + w - timeWidth;
  const sourceRight = reportTime ? timeX - 4 : timeX;
  const options = { fill: muted, maxLines: 1, inset: 0, widthScales: [1, 0.96, 0.93, 0.92, 0.9] };
  text(prefix + story.src, box(x, y, sourceRight - x, h), options);
  if (reportTime) {
    text(reportTime, box(timeX, y, timeWidth, h), {
      fill: muted, align: 'end', maxLines: 1, inset: 0,
    });
  }
}

// Hand-drawn coastlines in longitude/latitude order. Europe and Asia share
// one outline so the fill has no seam across Russia.
const europeCoast = [
  [68,74], [59,69], [50,68], [48,66], [41,67], [40,64], [35,65], [32,69],
  [28,71], [22,70], [16,69], [13,67], [10,64], [5,62], [5,59], [8,58],
  [11,59], [12,56], [17,57], [19,61], [22,64], [24,66], [26,65], [22,61],
  [23,60], [29,60], [28,58], [23,57], [21,55], [15,54], [12,55], [10,58],
  [8,56], [8,54], [5,53], [3,51], [0,50], [-2,49], [-5,48], [-2,46],
  [-2,44], [-9,43], [-9,39], [-9,37], [-6,36], [-2,37], [0,39], [3,42],
  [6,43], [10,44], [12,42], [16,38], [17,40], [18,40], [13,45], [15,45],
  [19,42], [20,39], [23,37], [24,40], [27,41], [28,40],
];

const asiaCoast = [
  [26,39], [27,37], [34,36], [36,34], [34,31], [35,29], [39,20], [43,13],
  [48,14], [52,16], [59,22], [56,26], [52,24], [48,30], [53,27], [57,25],
  [67,24], [70,21], [73,16], [77,8], [80,11], [81,16], [90,22], [92,21],
  [94,16], [98,16], [98,10], [104,1], [104,4], [101,10], [100,13],
  [104,10], [107,10], [109,12], [109,17], [106,21], [113,22], [117,24],
  [121,29], [122,32], [120,35], [122,37], [119,38], [121,40], [125,39],
  [127,35], [129,36], [130,42], [141,49], [137,55], [143,59], [157,61],
  [163,60], [156,51], [162,54], [164,57], [177,62], [179,66], [185,66],
  [181,69], [171,70], [160,69], [142,72], [130,71], [123,73], [107,77],
  [97,77], [79,73],
];

const land = [
  // North America, including the Hudson Bay, the Gulf of Mexico and Panama
  [
    [-168,66], [-161,67], [-165,69], [-157,72], [-136,69], [-122,71],
    [-112,68], [-104,68], [-96,71], [-82,68],
    [-88,65], [-92,62], [-95,59], [-91,56], [-85,55], [-82,52], [-79,54],
    [-80,58], [-77,61], [-71,62], [-65,59], [-61,56], [-57,52], [-60,50],
    [-66,50], [-71,47], [-64,48], [-63,45], [-68,44], [-76,38], [-76,35],
    [-81,31], [-80,26], [-81,25], [-83,29], [-94,29],
    [-97,26], [-97,22], [-94,19], [-91,19], [-90,21], [-87,22], [-88,17],
    [-85,16], [-83,10], [-77,9], [-83,8], [-86,12], [-97,16],
    [-104,20], [-113,31], [-109,23], [-113,25], [-117,32], [-124,41],
    [-124,48], [-128,51], [-137,59], [-150,60], [-155,57],
    [-162,55], [-165,55], [-159,59], [-163,60], [-165,63], [-161,64],
  ],
  // Greenland and Baffin Island
  [
    [-73,79], [-68,82], [-59,83], [-45,83], [-34,83], [-23,82], [-15,81],
    [-18,78], [-20,75], [-22,73], [-24,72], [-22,71], [-25,70], [-30,69],
    [-32,67], [-37,66], [-40,65], [-42,62], [-44,60], [-46,60], [-49,62],
    [-51,64], [-54,67], [-51,69], [-55,71], [-56,74], [-61,76], [-68,76],
  ],
  [[-80,73], [-73,73], [-67,70], [-63,68], [-62,66], [-66,65], [-71,66],
   [-73,68], [-77,69], [-80,71]],
  [[-59,51], [-55,50], [-53,47], [-56,46], [-59,47]],
  // Cuba and Hispaniola
  [[-85,22], [-81,23], [-77,22], [-74,20], [-78,20], [-82,22]],
  [[-74,20], [-70,20], [-68,19], [-71,18], [-74,18]],
  // South America
  [
    [-77,9], [-75,11], [-71,12], [-70,10], [-66,10], [-62,11], [-60,9],
    [-57,7], [-54,6], [-51,4], [-49,0], [-46,-1], [-43,-2], [-39,-3],
    [-35,-6], [-35,-9], [-37,-13], [-39,-17], [-40,-21], [-43,-23],
    [-48,-25], [-49,-29], [-53,-33], [-56,-35], [-58,-35], [-57,-38],
    [-63,-40], [-64,-42], [-65,-44], [-66,-46], [-68,-47], [-68,-50],
    [-65,-54], [-70,-55], [-74,-52], [-75,-48], [-74,-44], [-73,-41],
    [-72,-37], [-72,-32], [-71,-28], [-70,-23], [-71,-19], [-75,-16],
    [-77,-12], [-79,-8], [-81,-5], [-80,-2], [-79,0], [-77,4], [-77,7],
  ],
  // Africa and Madagascar
  [
    [-6,36], [-2,35], [5,37], [10,37], [11,34], [15,33], [20,32], [23,33],
    [26,31], [31,31], [33,31], [34,28], [36,24], [38,20], [40,16], [43,12],
    [47,11], [51,12], [50,9], [48,5], [45,2], [42,-1], [40,-4], [40,-9],
    [41,-12], [40,-16], [36,-19], [35,-23], [35,-25], [32,-26], [31,-30],
    [28,-33], [25,-34], [20,-35], [18,-34], [17,-31], [16,-28], [15,-24],
    [13,-19], [12,-17], [13,-12], [13,-8], [12,-6], [9,-4], [9,0], [9,3],
    [5,5], [2,6], [-3,5], [-8,5], [-12,8], [-15,11], [-17,14], [-16,19],
    [-17,21], [-15,24], [-13,28], [-10,30], [-8,33],
  ],
  [[49,-12], [50,-15], [50,-17], [48,-21], [47,-24], [44,-26], [43,-24],
   [44,-21], [44,-19], [45,-16], [47,-15]],
  [...europeCoast, ...asiaCoast],
  // Great Britain, Ireland, Iceland and Sri Lanka
  [[-5,50], [-3,50], [0,51], [2,52], [0,53], [-1,55], [-2,56], [-2,57],
   [-4,58], [-5,59], [-6,57], [-5,55], [-3,54], [-5,53], [-4,52], [-5,51]],
  [[-10,51], [-10,53], [-9,54], [-8,55], [-6,55], [-6,53], [-7,52], [-9,51]],
  [[-24,65], [-22,66], [-19,66], [-16,67], [-14,66], [-14,64], [-18,63], [-22,64]],
  [[80,10], [82,7], [81,6], [80,6], [79,8]],
  // Japan and Taiwan
  [[140,42], [141,43], [142,45], [144,44], [146,44], [144,43], [143,42], [141,41]],
  [[140,41], [141,41], [142,39], [141,37], [141,35], [139,35], [137,34],
   [136,34], [135,33], [134,34], [131,34], [131,35], [134,36], [137,37],
   [138,38], [139,39]],
  [[131,34], [132,32], [131,31], [130,31], [129,33]],
  [[121,25], [122,24], [121,22], [120,22], [120,24]],
  // Sumatra, Java, Borneo, Sulawesi and New Guinea
  [[95,6], [98,5], [100,3], [101,2], [103,0], [105,-3], [106,-6],
   [104,-5], [102,-4], [100,-2], [99,1], [97,2]],
  [[105,-6], [107,-6], [109,-7], [111,-7], [114,-7], [115,-8], [111,-8], [108,-8]],
  [[109,2], [112,3], [115,5], [117,7], [118,6], [119,4], [117,2],
   [117,-1], [116,-3], [113,-4], [110,-3], [109,-1]],
  [[119,1], [122,1], [125,2], [124,0], [122,0], [121,-1], [123,-3],
   [122,-5], [121,-3], [120,-3], [120,-6], [119,-5], [120,-2], [119,-1]],
  [[131,-1], [133,0], [135,-2], [137,-1], [140,-3], [143,-3], [146,-6],
   [148,-9], [151,-10], [148,-10], [145,-8], [142,-9], [140,-7],
   [137,-5], [135,-4], [133,-4], [132,-3], [134,-2]],
  [[119,-9], [122,-8], [125,-8], [124,-10], [121,-10]],
  // Philippine islands
  [[119,16], [120,19], [122,18], [122,15], [124,13], [122,13], [121,14], [120,14]],
  [[122,9], [124,10], [126,10], [127,8], [125,6], [124,7], [122,7]],
  // Australia, Tasmania and New Zealand
  [
    [113,-22], [115,-21], [117,-20], [120,-20], [122,-18], [124,-17],
    [125,-15], [128,-14], [129,-15], [130,-13], [132,-12], [135,-12],
    [137,-13], [136,-15], [138,-17], [141,-18], [142,-16], [142,-13],
    [143,-11], [145,-15], [146,-19], [149,-22], [151,-24], [153,-27],
    [153,-30], [151,-33], [150,-36], [147,-39], [144,-38], [142,-38],
    [139,-36], [138,-35], [137,-33], [135,-35], [134,-33], [131,-32],
    [128,-32], [125,-33], [123,-34], [119,-35], [116,-35], [115,-34],
    [115,-31], [114,-29], [113,-26], [114,-24],
  ],
  [[144,-41], [147,-41], [148,-42], [147,-44], [145,-43]],
  [[173,-35], [175,-37], [178,-37], [178,-39], [175,-41], [174,-41], [175,-39], [173,-37]],
  [[174,-41], [173,-43], [171,-44], [170,-46], [167,-47], [166,-45], [169,-43], [172,-41]],
];

const inlandSeas = [
  // Black and Caspian seas
  [[28,41], [28,43], [31,45], [34,44], [37,45], [40,43], [41,42], [38,41], [34,42], [31,42]],
  [[47,45], [49,47], [52,47], [54,45], [52,43], [53,40], [54,37], [51,37], [49,38], [50,41]],
];

function distanceToSegment([x, y], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const fraction = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy);
  const t = Math.max(0, Math.min(1, fraction));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function leadersCross(a, b, c, d) {
  const side = ([ax, ay], [bx, by], [px, py]) =>
    (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function worldMap({ x, y, w, h }) {
  const sea = '#eef3f2';
  const legend = [...Object.keys(regions), 'OTHER'].filter(region => presentRegions.has(region))
    .map(region => ({ region, title: region.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase()) }));
  const legendColumns = 2;
  const legendRows = Math.ceil(legend.length / legendColumns);
  const legendRowHeight = 14;
  const legendHeight = legendRows * legendRowHeight + 5;
  const mapLeft = x + 1;
  const mapRight = x + w - 1;
  const mapTop = y + 20;
  const mapBottom = y + h - legendHeight - 1;
  const west = -174;
  const east = 180;
  const north = 72;
  const south = -48;
  // Give higher latitudes more room while keeping tropical coastlines in proportion.
  const latitude = lat => lat + 34 * Math.sin(lat * Math.PI / 180) ** 3;
  const topLatitude = latitude(north);
  const latitudeSpan = topLatitude - latitude(south);
  const project = (lon, lat) => [
    mapLeft + (lon - west) / (east - west) * (mapRight - mapLeft),
    mapTop + (topLatitude - latitude(lat)) / latitudeSpan * (mapBottom - mapTop),
  ];

  rect(x, y, w, h, sea, `stroke="${rule}"`);
  rect(x, y, w, 20, '#e2e9e9');
  label('WHERE IT HAPPENED', box(x + 8, y + 2, w - 16, 16));

  add('<clipPath id="map-window">');
  rect(mapLeft, mapTop, mapRight - mapLeft, mapBottom - mapTop, sea);
  add('</clipPath><g clip-path="url(#map-window)">');
  for (let lon = -150; lon <= 150; lon += 30) {
    const [px] = project(lon, 0);
    line(px, mapTop, px, mapBottom, '#e0e9e7');
  }
  for (const lat of [-30, 0, 30, 60]) {
    const [, py] = project(0, lat);
    line(mapLeft, py, mapRight, py, '#e0e9e7');
  }
  for (const [outlines, fill] of [[land, '#c9d5d2'], [inlandSeas, sea]]) {
    for (const outline of outlines) {
      const coordinates = outline.map(([lon, lat]) => project(lon, lat).map(n).join(','));
      add(`<polygon points="${coordinates.join(' ')}" fill="${fill}" stroke="#a1b4b6" stroke-width=".55" stroke-linejoin="round"/>`);
    }
  }
  add('</g>');

  const pins = mappedStories.map((story, index) => ({
    index: index + 1,
    point: project(story.lon, story.lat),
    colors: regionNames(story).map(region => regionPalette(region)[0]),
  }));
  const labelRadius = 8.5;
  const distance = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
  const offsetRadii = [14, 17, 20, 24, 29, 35, 42, 50, 60, 72];
  const offsets = offsetRadii.flatMap(radius =>
    Array.from({ length: 24 }, (_, step) => {
      const angle = -Math.PI / 3 + step * Math.PI / 12;
      return { radius, dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) };
    }),
  );
  const candidates = pins.map(pin => {
    const [px, py] = pin.point;
    const positions = offsets.map(({ radius, dx, dy }) => ({ radius, center: [px + dx, py + dy] }));
    const clearPositions = positions.filter(({ center }) =>
      center[0] >= mapLeft + 10 && center[0] <= mapRight - 10 &&
      center[1] >= mapTop + 10 && center[1] <= mapBottom - 10 &&
      pins.every(other => distance(center, other.point) >= 11 &&
        (distance(pin.point, other.point) < 2 ||
          distanceToSegment(other.point, pin.point, center) >= 1.5)),
    );
    return { pin, positions: clearPositions };
  });
  // Place the most constrained pin first and try another position when it blocks a neighbor.
  function placePins(remaining) {
    if (!remaining.length) return true;
    remaining.sort((a, b) => a.centers.length - b.centers.length);
    const [{ pin, centers }, ...others] = remaining;
    for (const center of centers) {
      const next = others.map(({ pin: other, centers: available }) => ({
        pin: other,
        centers: available.filter(otherCenter =>
          distance(center, otherCenter) >= 2 * labelRadius + 3 &&
          distanceToSegment(center, other.point, otherCenter) >= labelRadius + 1 &&
          distanceToSegment(otherCenter, pin.point, center) >= labelRadius + 1 &&
          !leadersCross(pin.point, center, other.point, otherCenter)),
      }));
      if (placePins(next)) {
        pin.center = center;
        return true;
      }
    }
    return false;
  }
  // Increase the maximum offset only when no complete placement fits with shorter leaders.
  const placed = offsetRadii.some(limit => placePins(candidates.map(({ pin, positions }) => ({
    pin,
    centers: positions.filter(({ radius }) => radius <= limit).map(({ center }) => center),
  }))));
  if (!placed) throw new Error('Could not place all map pins');

  for (const { point: [px, py], center: [cx, cy], colors: [color] } of pins) {
    const path = `M${n(px)} ${n(py)}L${n(cx)} ${n(cy)}`;
    add(`<path d="${path}" stroke="#fffefa" stroke-width="2"/>`);
    add(`<path d="${path}" stroke="${color}" stroke-width="1"/>`);
  }
  for (const { point, colors: [color] } of pins) {
    circle(...point, 1.1, color, 'stroke="#fffefa" stroke-width=".4"');
  }
  for (const { center: [cx, cy], index, colors: [color, secondColor] } of pins) {
    circle(cx, cy, labelRadius, color);
    if (secondColor) {
      add(`<path d="M${n(cx)} ${n(cy - labelRadius)}A${labelRadius} ${labelRadius} 0 0 1 ${n(cx)} ${n(cy + labelRadius)}Z" fill="${secondColor}"/>`);
    }
    circle(cx, cy, labelRadius, 'none', 'stroke="#fffefa" stroke-width="1"');
    text(index, box(cx - 8, cy - 7, 16, 14), {
      size: 12, weight: 700, fill: '#ffffff', align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    });
  }

  rect(mapLeft, mapBottom, mapRight - mapLeft, legendHeight, '#f7f9f6');
  line(mapLeft, mapBottom, mapRight, mapBottom, '#d4dfdd');
  const legendPadding = 4;
  const labelOffset = 9;
  const columnWidths = Array(legendColumns).fill(0);
  for (const [index, { title }] of legend.entries()) {
    const column = Math.floor(index / legendRows);
    const width = Math.ceil(fontFor(700).width(title, 11)) + labelOffset + 3;
    columnWidths[column] = Math.max(columnWidths[column], width);
  }
  const extraWidth = (w - 2 * legendPadding - columnWidths.reduce((sum, width) => sum + width, 0)) / legendColumns;
  for (const [index, { region, title }] of legend.entries()) {
    const column = Math.floor(index / legendRows);
    const columnX = x + legendPadding + column * extraWidth +
      columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const rowY = mapBottom + 2 + index % legendRows * legendRowHeight;
    const color = regionPalette(region)[0];
    rect(columnX, rowY + 3.75, 6.5, 6.5, color);
    label(title, box(columnX + labelOffset, rowY, columnWidths[column] - labelOffset, legendRowHeight), color);
  }
}

function briefs({ x, y, w, h }) {
  const headerHeight = 16;
  const columnCount = 2;
  const rows = Math.ceil(stories.briefs.length / columnCount);
  const columnWidth = w / columnCount;
  const rowHeight = (h - headerHeight - 2) / rows;
  const size = 13;
  const placeOffset = 25;
  const rightInset = 6;
  const sourceGap = 5;
  const options = { size, min: size, vertical: 'middle', maxLines: 1, inset: 0 };
  const sourceOptions = { ...options, fill: muted, align: 'end' };
  const noteOptions = { ...sourceOptions, size: 11, min: 11 };
  const regularFont = fontFor(400);
  const boldFont = fontFor(700);
  const sourceNote = 'AJ = Al Jazeera · F24 = France 24';
  const noteWidth = Math.ceil(regularFont.width(sourceNote, noteOptions.size));
  const noteX = x + w - 8 - noteWidth;
  rect(x, y, w, h, white, `stroke="${rule}"`);
  rect(x, y, w, headerHeight, '#e2e9e9');
  label('ALSO ON ' + stories.day, box(x + 8, y, noteX - x - 14, headerHeight));
  text(sourceNote, box(noteX, y, noteWidth, headerHeight), noteOptions);
  line(x + columnWidth, y + headerHeight, x + columnWidth, y + h - 1);
  for (const [index, brief] of stories.briefs.entries()) {
    const columnX = x + Math.floor(index / rows) * columnWidth;
    const row = index % rows;
    const rowY = y + headerHeight + row * rowHeight;
    if (row % 2 === 0) rect(columnX + 1, rowY, columnWidth - 2, rowHeight, '#f3f5f3');
    const place = brief.place + ':';
    const placeX = columnX + placeOffset;
    const placeWidth = boldFont.width(place + ' ', size);
    const textX = placeX + placeWidth;
    const source = brief.src?.trim();
    const sourceWidth = source ? Math.ceil(regularFont.width(source, size)) : 0;
    const sourceX = columnX + columnWidth - rightInset - sourceWidth;
    const textRight = source ? sourceX - sourceGap : sourceX;

    text(mappedStories.length + index + 1, box(columnX + 3, rowY, 18, rowHeight), {
      ...options, weight: 700, align: 'middle', fill: muted,
    });
    text(place, box(placeX, rowY, placeWidth, rowHeight), {
      ...options, weight: 700, fill: regionPalette(regionNames(brief)[0])[0],
    });
    text(brief.text, box(textX, rowY, textRight - textX, rowHeight), options);
    if (source) {
      text(source, box(sourceX, rowY, sourceWidth, rowHeight), sourceOptions);
    }
  }
}

function dateCheck({ x, y, w, h }) {
  const headerHeight = 16;
  rect(x, y, w, h, '#fff8f5', `stroke="${red}" stroke-width="1.5"`);
  rect(x + 1, y + 1, w - 2, headerHeight, '#f3dedd');

  const separator = stories.datecheck.title.indexOf(':');
  const title = stories.datecheck.title.slice(0, separator + 1);
  const subtitle = stories.datecheck.title.slice(separator + 1).trim();
  const titleWidth = Math.ceil(fontFor(700).width(title, 14)) + 4;
  text(title, box(x + 6, y + 1, titleWidth, headerHeight), {
    size: 14, min: 14, weight: 700, fill: red, vertical: 'middle', maxLines: 1,
  });
  label(subtitle, box(x + 12 + titleWidth, y + 1, w - 18 - titleWidth, headerHeight), red);

  const items = stories.datecheck.items;
  const itemWidths = items.map(item => Math.max(...item.map(event => fontFor(400).width(event, 11))) + 9);
  const extraWidth = (w - itemWidths.reduce((sum, width) => sum + width, 0)) / items.length;
  const itemY = y + 1 + headerHeight;
  let itemX = x;
  for (const [index, item] of items.entries()) {
    const itemWidth = itemWidths[index] + extraWidth;
    if (index) line(itemX, itemY + 1, itemX, y + h - 2, '#dcb2b1');
    const rowHeight = (y + h - itemY) / item.length;
    for (const [row, event] of item.entries()) {
      text(event, box(itemX + 6, itemY + row * rowHeight, itemWidth - 9, rowHeight), {
        vertical: 'middle', maxLines: 1, inset: 0,
      });
    }
    itemX += itemWidth;
  }
}

function footer() {
  text('Editor’s note: ' + stories.note, box(24, 976, pageWidth, 16), { maxLines: 1 });
  rect(24, 994, pageWidth, 20, ink);
  text(stories.footer, box(30, 995, pageWidth - 12, 18), {
    align: 'middle', vertical: 'middle', fill: '#ffffff', maxLines: 1,
  });
}

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${pageSize}" height="${pageSize}" viewBox="0 0 ${pageSize} ${pageSize}" font-family="FreeSans" font-kerning="none">`);
rect(0, 0, pageSize, pageSize, paper);
masthead();
timeline();
stories.leads.forEach(leadPanel);
stories.cards.forEach(storyCard);
const lowerY = cardTop + Math.ceil(stories.cards.length / cardColumns) * (cardHeight + panelGap);
const dateCheckY = 932;
const lowerHeight = dateCheckY - lowerY - 4;
const mapWidth = 260;
worldMap(box(margin, lowerY, mapWidth, lowerHeight));
briefs(box(margin + mapWidth + panelGap, lowerY, pageWidth - mapWidth - panelGap, lowerHeight));
dateCheck(box(margin, dateCheckY, pageWidth, 42));
footer();
add('</svg>');

writeFileSync(new URL('./entry.svg', import.meta.url), svg.join('\n') + '\n');
