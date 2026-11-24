import { readFileSync, writeFileSync } from 'node:fs';
import { fontFor } from './font-metrics.mjs';

const stories = JSON.parse(readFileSync(new URL('./stories.json', import.meta.url), 'utf8'));
const pageSize = 1024;
const margin = 24;
const pageWidth = pageSize - 2 * margin;
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
  'SOUTH ASIA': ['#9a5a12', '#f6ecdd'],
  'EAST ASIA': ['#006b73', '#dff0f0'],
  'SOUTH-EAST ASIA': ['#366123', '#e8f0df'],
  OCEANIA: ['#9b2f67', '#f6e5ef'],
  'NORTH AMERICA': ['#583987', '#eee5f3'],
  'LATIN AMERICA': ['#414959', '#e8ebf0'],
};
const placeRegions = {
  UKRAINE: 'EUROPE',
  'NATO · FINLAND': 'EUROPE',
  'GERMANY · SPACE': 'EUROPE',
  BRAZIL: 'LATIN AMERICA',
  'DR CONGO': 'AFRICA',
  IRAN: 'MIDDLE EAST',
  GAZA: 'MIDDLE EAST',
  'SOUTH KOREA': 'EAST ASIA',
  USA: 'NORTH AMERICA',
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
  const [dayOfMonth, month, year] = date.split(' ');
  const stats = `${allStories.length} STORIES · ${presentRegions.size} REGIONS · ${fieldCount} FIELDS · ALL NEW ON ${day} ${dayOfMonth} ${month.slice(0, 3)} ${year}`;

  rect(24, 14, pageWidth, 101, ink);
  rect(24, 14, 5, 101, '#d75450');
  label(kicker, box(41, 17, 942, 15), '#d8e5ed');
  text(day + ' ' + date, box(39, 31, 945, 68), {
    size: 64, min: 60, weight: 700, fill: '#ffffff', vertical: 'middle', maxLines: 1,
  });
  label(stats, box(41, 99, 942, 13), '#d8e5ed');
}

function strips() {
  const timelineSize = 12.5;
  const timelineLineHeight = 14;
  const timelineOptions = { size: timelineSize, min: timelineSize, maxLines: 1, inset: 0 };
  const timelineWidths = stories.timeline.map(({ t, text: event }) =>
    Math.max(fontFor(700).width(t, timelineSize), fontFor(400).width(event, timelineSize)),
  );
  const extraWidth = (pageWidth - timelineWidths.reduce((sum, width) => sum + width, 0)) /
    timelineWidths.length;
  const padding = Math.min(4, Math.max(0, extraWidth / 2));
  label('THE DAY IN UTC', box(24, 117, 230, 14));
  line(24, 133, 1000, 133, ink);
  let timelineX = margin;
  for (const [index, { t, text: event }] of stories.timeline.entries()) {
    const width = timelineWidths[index] + extraWidth;
    if (index) line(timelineX, 136, timelineX, 158);
    text(t, box(timelineX + padding, 134, width - 2 * padding, timelineLineHeight), {
      ...timelineOptions, weight: 700, fill: '#174985', vertical: 'middle',
    });
    text(event, box(timelineX + padding, 134 + timelineLineHeight, width - 2 * padding, timelineLineHeight),
      timelineOptions);
    timelineX += width;
  }

  rect(24, 163, pageWidth, 36, '#e5ebed');
  text('THE DAY IN NUMBERS', box(32, 163, 94, 36), {
    size: 13, min: 13, weight: 700, vertical: 'middle',
  });
  const numberWidth = (pageWidth - 106) / stories.numbers.length;
  for (const [index, { v, l }] of stories.numbers.entries()) {
    const x = 130 + index * numberWidth;
    line(x, 167, x, 195, '#aab8bf');
    const valueWidth = Math.ceil(fontFor(700).width(v, 30)) + 6;
    text(v, box(x + 9, 163, valueWidth, 36), {
      size: 30, min: 30, weight: 700, vertical: 'middle', maxLines: 1,
    });
    text(l, box(x + 13 + valueWidth, 163, numberWidth - 16 - valueWidth, 36), {
      size: 12.5, min: 12.5, vertical: 'middle', maxLines: 2,
    });
  }
}

const scenes = {
  warship: `
    <rect width="320" height="70" fill="#dce8e9"/>
    <path d="M0 34H320V70H0Z" fill="#83b2be"/>
    <path d="M0 50H320V70H0Z" fill="#568693"/>
    <path d="M11 42h42m-14 15h49m151-15h67m-32 17h35M7 64h115m100-1h42"
          fill="none" stroke="#b6d4d8" stroke-width="2"/>
    <path d="M66 40h164l26-8-13 19-14 6H94L79 51Z" fill="#182f45"/>
    <path d="M90 52h151l-12 5H94Z" fill="#ad4b4a"/>
    <path d="M96 40v-7h23l12-10h56l13 17zm58-17v-7h19v7zm61 17v-6h11v6z" fill="#466273"/>
    <path d="M163 21V7m-10 6h19m51 22 11-7" fill="none" stroke="#182f45" stroke-width="2"/>
    <path d="M134 30h11m5 0h11m5 0h11" fill="none" stroke="#dce8e9" stroke-width="2"/>`,
  chart: `
    <rect width="320" height="70" fill="#f2e5e2"/>
    <path d="M24 14h274M24 26h274M24 38h274M24 50h274M24 62h274
             M55 8v54M96 8v54M137 8v54M178 8v54M219 8v54M260 8v54"
          fill="none" stroke="#d8c2bd"/>
    <path d="m26 17 36-4 34 12 33-5 33 21 25-7 39 17 24-3 39 10v4H26Z" fill="#edcdca"/>
    <path d="m26 17 36-4 34 12 33-5 33 21 25-7 39 17 24-3 39 10"
          fill="none" stroke="#af313b" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="289" cy="58" r="4" fill="#af313b"/>`,
  chartup: `
    <rect width="320" height="70" fill="#e5efe5"/>
    <path d="M24 14h274M24 26h274M24 38h274M24 50h274M24 62h274
             M55 8v54M96 8v54M137 8v54M178 8v54M219 8v54M260 8v54"
          fill="none" stroke="#c2d6c5"/>
    <path d="M26 58 62 54 96 57 129 49 162 51 187 43 226 45 252 37 278 36 289 10V62H26Z"
          fill="#cce4ce"/>
    <path d="M26 58 62 54 96 57 129 49 162 51 187 43 226 45 252 37 278 36 289 10
             M282 16l7-6 6 8"
          fill="none" stroke="#1f7a3a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  plane: `
    <rect width="320" height="70" fill="#deeaee"/>
    <path d="M0 52H320V70H0Z" fill="#8e9fa8"/>
    <path d="M0 52h320" stroke="#556a78" stroke-width="2"/>
    <path d="M8 62h35m18 0h35m18 0h35m18 0h35m18 0h35m18 0h35" stroke="#edf1e9" stroke-width="2"/>
    <path d="M30 29h10l15 9h48L89 19h13l29 19h46q15 0 23 7-2 5-16 5H63L42 43Z" fill="#233d55"/>
    <path d="M119 44h25l-24 14h-13Z" fill="#577585"/>
    <path d="M99 48v5m69-5v5" stroke="#14243b" stroke-width="2"/>
    <circle cx="99" cy="53" r="2.5" fill="#14243b"/><circle cx="168" cy="53" r="2.5" fill="#14243b"/>
    <path d="M151 42h27m5 0h6" stroke="#d9e8ea" stroke-width="2" stroke-dasharray="3 3"/>
    <circle cx="260" cy="32" r="22" fill="#ad2f39" stroke="#fffefa" stroke-width="2"/>
    <rect x="246" y="28" width="28" height="8" rx="1" fill="#fffefa"/>`,
};

function leadPanel(story, index) {
  const x = 24 + index * 328;
  const y = 205;
  const w = index === 2 ? 320 : 318;
  const contentX = x + 11;
  const contentWidth = w - 22;
  const names = regionNames(story);
  const tagY = y + 31;
  const sceneHeight = tagY - y - 3;
  const statusX = x + w - 91;
  const headlineY = tagY + 17;
  const headlineHeight = 51;
  const bodyY = headlineY + headlineHeight;
  const sourceY = y + 157;
  const sourceGap = 4;

  rect(x, y, w, 171, white, `stroke="${rule}"`);
  add(`<g transform="translate(${x} ${y}) scale(${w / 320} ${sceneHeight / 70})">${scenes[story.scene]}</g>`);
  const bandWidth = w / names.length;
  for (const [i, region] of names.entries()) {
    rect(x + i * bandWidth, y, bandWidth, 3, regionPalette(region)[0]);
  }

  badge(index + 1, contentX, tagY, 19, 16);
  let tagX = contentX + 24;
  for (const region of names) {
    tagX += pill(region, tagX, tagY, regionPalette(region)) + 4;
  }
  label(story.field, box(tagX + 2, tagY, statusX - tagX - 6, 16), muted);
  pill(story.status, statusX, tagY, statuses[story.status], 80);
  text(story.head, box(contentX, headlineY, contentWidth, headlineHeight), {
    size: 23, min: 20, weight: 700, maxLines: 2, gap: 0.3,
  });
  text(story.sub, box(contentX, bodyY, contentWidth, sourceY - sourceGap - bodyY), {
    size: 12, min: 12, maxLines: 4, gap: 0.2,
  });
  sourceLine(story, box(contentX, sourceY, contentWidth, 13), 'Source: ');
}

const cardScenes = {
  rubble: `
    <rect width="190" height="70" fill="#e1d1c5"/>
    <path d="M0 44h190v26H0Z" fill="#b49b8c"/>
    <path d="M92 49c-9-6-3-15 5-16-10-10 2-19 10-16-3-12 14-17 22-8
             7-7 20 0 18 7 15-1 20 14 6 19 3 9-9 14-20 11Z" fill="#847a79"/>
    <path d="M14 59V19h37v8l-8 7 17 5-7 9 13 11ZM119 59V32l13 5 8-13 11 8 10-6v33Z" fill="#473947"/>
    <path d="M21 25h8v8h-8zm13 0h7v8h-7zM21 38h8v8h-8zm15 2h7v7h-7zm92 4h7v7h-7zm17-7h8v8h-8z" fill="#dfb79d"/>
    <path d="m53 57 22-15 12 9 10-15 17 17 12 5 17-6 25 4 9-8 13 8v14H49Z" fill="#775b55"/>
    <path d="m127 63 12-5 11 4m16 3 10-5 10 3m-98 4 10-8 13 4" stroke="#daa790" stroke-width="2" fill="none"/>`,
  nato: `
    <rect width="190" height="70" fill="#15365c"/>
    <path d="m84 31 11-16 24-7 16 2 8-8 22-2 11 6-6 13 8 8-5 10-18-3-15 9
             -14 4-7-8-18 11-9-9-12 3-8-8Zm74 18 9-10 14 5-1 10-10 8-16-5Z" fill="#39668a"/>
    <path d="M22 24h151M22 48h151M95 6v57m25-57v57m25-57v57m25-57v57" stroke="#85b6d1" opacity=".34"/>
    <circle cx="145" cy="32" r="19" fill="none" stroke="#a4c9df" stroke-width="1.5"/>
    <path d="m145 5 5 22 22 5-22 5-5 22-5-22-22-5 22-5Z" fill="#f8faf5"/>
    <path d="m145 12 3 17-3 3Zm20 20-17 3-3-3Zm-20 20-3-17 3-3Zm-20-20 17-3 3 3Z" fill="#5284a6"/>`,
  storm: `
    <rect width="190" height="70" fill="#9bbdc7"/>
    <path d="M0 43 30 34l23 8 31-10 38 8 28-10 40 10v30H0Z" fill="#527e87"/>
    <path d="M25 27c-2-6 4-11 12-10 1-8 13-12 23-8 8-9 28-8 32 0 12-4 26 0 27 8
             15-3 28 3 27 11Z" fill="#314456"/>
    <path d="m35 31-7 9m21-9-8 12m23-12-8 12m23-12-5 7m22-7-9 12m24-12-8 12m22-12-5 7"
          stroke="#e1edf0" stroke-width="2.3" stroke-linecap="round"/>
    <path d="M15 47v-8l11-8 11 8v8m93 0V36l12-9 13 9v11m5 0v-9l12-9 12 9v9" fill="#ecb987"/>
    <path d="m12 40 14-11 14 11m87-3 15-11 16 11m-1 2 15-11 15 11" stroke="#553e48" stroke-width="2.5" fill="none"/>`,
  virus: `
    <rect width="190" height="70" fill="#f2dfbc"/>
    <path d="M0 58 49 50l53 6 49-10 39 9v15H0Z" fill="#d3b17e"/>
    <path d="m31 8 3 8m14-7-4 10m14 3-10 4m9 11-10-3m3 14-8-9m-9 13 2-11m-16 6 7-10m-14 0 12-6m-11-9 12 2m-6-12 10 9"
          stroke="#80374b" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="36" cy="29" r="15" fill="#80374b"/>
    <path d="M31 23h.1m11 3h.1m-5 9h.1" stroke="#f0ad8d" stroke-width="4" stroke-linecap="round"/>
    <path d="m80 53 26-35h55l24 35Z" fill="#faf4df"/>
    <path d="m106 18 21 35H80Z" fill="#a86e55"/>
    <path d="m107 31 12 22H94Z" fill="#653f42"/>
    <path d="M146 28h6v6h6v6h-6v6h-6v-6h-6v-6h6Z" fill="#a13d47"/>`,
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
    <path d="M30 0h32L40 70H0Zm65 0h31l12 70H93Zm64 0h31v70h-8Z" fill="#44845a"/>
    <path d="M0 36h190M29 0 12 57h166l-17-57" stroke="#a4c49a" stroke-width="1.5" fill="none"/>
    <ellipse cx="90" cy="42" rx="31" ry="3" fill="#2f6044"/>
    <path d="M76 11H62c0 10 6 16 17 16m25-16h14c0 10-6 16-17 16"
          stroke="#efbd57" stroke-width="4" stroke-linejoin="round" fill="none"/>
    <path d="M72 5h36v7c0 10-6 17-14 19v5l9 3v4H77v-4l9-3v-5c-8-2-14-9-14-19Z"
          fill="#f5ca61"/>
    <path d="M90 32c9-4 12-12 12-27h6v7c0 10-6 17-14 19v5l9 3v4H90Z" fill="#dca248"/>
    <path d="M74 7h32" stroke="#fff0a0" stroke-width="3" stroke-linecap="round"/>
    <circle cx="147" cy="27" r="13" fill="#fff9e8" stroke="#213c37" stroke-width="2"/>
    <path d="m147 21 6 4-2 7h-8l-2-7Zm-9-3 4 1-3 6-4-1Zm18 0 3 6-4 1-3-6Zm-17 15 5 2 1 4-6-2Zm16 0v4l-6 2 1-4Z"
          fill="#213c37"/>`,
  chartdown: `
    <rect width="190" height="70" fill="#f4e0dd"/>
    <path d="M9 13h171M9 25h171M9 37h171M9 49h171M9 61h171
             M22 7v54M47 7v54M72 7v54M97 7v54M122 7v54M147 7v54M172 7v54"
          fill="none" stroke="#dec0c0"/>
    <path d="m13 14 28 5 24-9 24 22 20-8 22 16 19-7 10 14 20 10v5H13Z" fill="#e9b8b6"/>
    <path d="m13 14 28 5 24-9 24 22 20-8 22 16 19-7 10 14 20 10m-12 3 12-3-4-12"
          fill="none" stroke="#982c42" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  roadstorm: `
    <rect width="190" height="70" fill="#a6b8c8"/>
    <path d="M0 44 40 26l32 13 48-14 70 16v29H0Z" fill="#758da0"/>
    <path d="m79 70 58-38h12l41 38Z" fill="#354452"/>
    <path d="m148 67-2-10m-2-6-1-5m-1-4-1-4" stroke="#eddbab" stroke-width="2" fill="none"/>
    <path d="M22 24c-4-7 5-13 16-11 4-13 27-15 36-5 13-6 29 3 27 13l14 3Z" fill="#34465b"/>
    <path d="m33 28-8 10m23-10-10 13m26-13-8 10m24-10-8 11m23-11-8 10m24-10-6 9"
          stroke="#ecf3f8" stroke-width="2.4" fill="none"/>
    <path d="m131 44 6-8h20l7 8 5 3v10h-42V47Z" fill="#e7a467"/>
    <path d="m135 44 4-6h15l5 6Z" fill="#20364b"/>
    <path d="M130 50h7m22 0h7" stroke="#fff9d6" stroke-width="3"/>
    <path d="M132 57v4m32-4v4" stroke="#202c3c" stroke-width="5"/>`,
  toxic: `
    <rect width="190" height="70" fill="#e6dea9"/>
    <path d="M0 42 33 35l26 7 41-5 44 3 46-7v37H0Z" fill="#b6a977"/>
    <path d="m54 42-7 9 22 5-8 14m99-28 8 9 22 2m-22-2-8 7 6 12m-79-23 7 6-7 7"
          stroke="#776c51" stroke-width="2" fill="none"/>
    <path d="M110 45c15-7 25-3 36-7 15-6 19 2 29 4 7 2 4 7-5 8-18 4-38-1-57 3-11 1-13-5-3-8Z" fill="#688443"/>
    <g transform="translate(8 -5) rotate(16 133 29)">
      <path d="M109 12h45v33c0 9-45 9-45 0Z" fill="#37494a"/>
      <path d="M109 22h45m-45 17h45" stroke="#71807a" stroke-width="3"/>
      <ellipse cx="131.5" cy="12" rx="22.5" ry="6" fill="#657971"/>
      <path d="m132 21 10 14h-20Z" fill="#f5d270"/>
      <path d="M132 26v4m0 2v1" stroke="#37494a" stroke-width="2"/>
    </g>
    <path d="M159 36c1 4 5 7 5 10a5 5 0 0 1-10 0c0-3 4-6 5-10Z" fill="#b4c766"/>`,
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
  const gap = 6;
  const w = (pageWidth - 4 * gap) / 5;
  const x = margin + index % 5 * (w + gap);
  const y = 381 + Math.floor(index / 5) * 176;
  const h = 170;
  const sceneHeight = 68;
  const [color] = regionPalette(regionNames(story)[0]);
  rect(x, y, w, h, white, `stroke="${rule}"`);
  add(`<g transform="translate(${n(x)} ${y}) scale(${w / 190} ${sceneHeight / 70})">${cardScenes[story.art]}</g>`);

  const captionFont = fontFor(700);
  const captionSpace = w - 8;
  const captionSize = Math.max(15, Math.min(21, Math.floor(captionSpace / captionFont.width(story.label, 1) / 0.85)));
  const captionAdvance = captionFont.width(story.label, captionSize);
  const captionScale = Math.max(0.85, Math.min(1, Math.floor(1000 * captionSpace / captionAdvance) / 1000));
  const captionWidth = Math.min(w, Math.ceil(captionAdvance * captionScale) + 10);
  const captionY = y + sceneHeight - 24;
  rect(x, captionY, captionWidth, 24, ink);
  text(story.label, box(x, captionY, captionWidth, 24), {
    size: captionSize, min: 15, weight: 700, fill: '#ffffff',
    align: 'middle', vertical: 'middle', maxLines: 1, inset: 4, widthScales: [captionScale],
  });

  const tagY = y + sceneHeight + 2;
  const statusWidth = Math.ceil(fontFor(700).width(story.status, 11)) + 5;
  const statusX = x + w - 3 - statusWidth;
  badge(index + stories.leads.length + 1, x + 3, tagY, 18, 16);
  text(story.region, box(x + 24, tagY, statusX - x - 26, 16), {
    weight: 700, fill: color, vertical: 'middle', maxLines: 1, inset: 0, widthScales: [1, 0.92],
  });
  pill(story.status, statusX, tagY, statuses[story.status], statusWidth);

  const headY = tagY + 18;
  const headHeight = text(story.head, box(x + 4, headY, w - 8, 41), {
    size: 18, min: 16, weight: 700, maxLines: 2, inset: 0, gap: 0.5,
    widthScales: [1, 0.89],
  });
  const subY = headY + headHeight + 0.3;
  const sourceY = y + 156;
  text(story.sub, box(x + 4, subY, w - 8, sourceY - subY), {
    size: 12, min: 12, maxLines: 2, inset: 0, gap: 0.2,
  });

  sourceLine(story, box(x + 4, sourceY, w - 8, 13));
}

function sourceLine(story, { x, y, w, h }, prefix = '') {
  const reportTime = story.t ? `${story.t} UTC` : '';
  const timeWidth = Math.ceil(fontFor(400).width(reportTime, 11));
  const timeX = x + w - timeWidth;
  const sourceRight = reportTime ? timeX - 4 : timeX;
  text(prefix + story.src, box(x, y, sourceRight - x, h), {
    fill: muted, maxLines: 1, inset: 0, widthScales: [1, 0.96],
  });
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

function worldMap({ x, y, w, h }) {
  const sea = '#eef3f2';
  const legend = [...Object.keys(regions), 'OTHER'].filter(region => presentRegions.has(region))
    .map(region => ({ region, title: region.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase()) }));
  const legendColumns = 3;
  const legendRowHeight = 14;
  const legendHeight = Math.ceil(legend.length / legendColumns) * legendRowHeight + 5;
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
  const placed = [];
  // Try the nearest offsets first, keeping label circles clear of dots and leaders.
  const offsets = [14, 17, 20, 24, 29, 35, 42, 50, 60, 72].flatMap(radius =>
    Array.from({ length: 24 }, (_, step) => {
      const angle = -Math.PI / 3 + step * Math.PI / 12;
      return [radius * Math.cos(angle), radius * Math.sin(angle)];
    }),
  );
  const candidates = pins.map(pin => {
    const [px, py] = pin.point;
    const centers = offsets.map(([dx, dy]) => [px + dx, py + dy]).filter(center =>
      center[0] >= mapLeft + 10 && center[0] <= mapRight - 10 &&
      center[1] >= mapTop + 10 && center[1] <= mapBottom - 10 &&
      pins.every(other => distance(center, other.point) >= 11 &&
        (distance(pin.point, other.point) < 2 ||
          distanceToSegment(other.point, pin.point, center) >= 1.5)),
    );
    return { pin, centers };
  });
  // Give pins with fewer available positions first choice in crowded areas.
  candidates.sort((a, b) => a.centers.length - b.centers.length);
  for (const { pin, centers } of candidates) {
    pin.center = centers.find(center =>
      placed.every(other => distance(center, other.center) >= 2 * labelRadius + 2 &&
        distanceToSegment(center, other.point, other.center) >= labelRadius + 1 &&
        distanceToSegment(other.center, pin.point, center) >= labelRadius + 1),
    );
    if (!pin.center) throw new Error('Could not place map pin ' + pin.index);
    placed.push(pin);
  }

  for (const { point: [px, py], center: [cx, cy], colors: [color] } of pins) {
    add(`<path d="M${n(px)} ${n(py)}L${n(cx)} ${n(cy)}" stroke="${color}" stroke-width=".75"/>`);
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
      weight: 700, fill: '#ffffff', align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    });
  }

  rect(mapLeft, mapBottom, mapRight - mapLeft, legendHeight, '#f7f9f6');
  line(mapLeft, mapBottom, mapRight, mapBottom, '#d4dfdd');
  const legendPadding = 6;
  const labelOffset = 9;
  const columnWidths = Array(legendColumns).fill(0);
  for (const [index, { title }] of legend.entries()) {
    const column = index % legendColumns;
    const width = Math.ceil(fontFor(700).width(title, 11)) + labelOffset + 3;
    columnWidths[column] = Math.max(columnWidths[column], width);
  }
  const extraWidth = (w - 2 * legendPadding - columnWidths.reduce((sum, width) => sum + width, 0)) / legendColumns;
  for (const [index, { region, title }] of legend.entries()) {
    const column = index % legendColumns;
    const columnX = x + legendPadding + column * extraWidth +
      columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const rowY = mapBottom + 2 + Math.floor(index / legendColumns) * legendRowHeight;
    const color = regionPalette(region)[0];
    rect(columnX, rowY + 3.75, 6.5, 6.5, color);
    label(title, box(columnX + labelOffset, rowY, columnWidths[column] - labelOffset, legendRowHeight), color);
  }
}

function briefs({ x, y, w, h }) {
  const headerHeight = 20;
  const rows = Math.ceil(stories.briefs.length / 2);
  const rowHeight = (h - headerHeight - 2) / rows;
  const columnWidth = w / 2;
  const sourceOptions = { size: 11, fill: '#6b7280', align: 'end', vertical: 'middle', maxLines: 1, inset: 0 };
  const regularFont = fontFor(400);
  const sourceNote = 'AJ = Al Jazeera · F24 = France 24';
  const noteWidth = Math.ceil(regularFont.width(sourceNote, sourceOptions.size));
  const noteX = x + w - 8 - noteWidth;
  rect(x, y, w, h, white, `stroke="${rule}"`);
  rect(x, y, w, headerHeight, '#e2e9e9');
  label('ALSO ON ' + stories.day, box(x + 8, y + 2, noteX - x - 14, 16));
  text(sourceNote, box(noteX, y + 2, noteWidth, 16), sourceOptions);
  line(x + columnWidth, y + headerHeight, x + columnWidth, y + h - 1);

  for (const [index, brief] of stories.briefs.entries()) {
    const columnX = x + Math.floor(index / rows) * columnWidth;
    const row = index % rows;
    const rowY = y + headerHeight + row * rowHeight;
    if (row % 2 === 0) rect(columnX + 1, rowY, columnWidth - 2, rowHeight, '#f3f5f3');
    const size = 12.5;
    const place = brief.place + ':';
    const placeX = columnX + 26;
    const placeWidth = fontFor(700).width(place + ' ', size);
    const options = { size, min: size, vertical: 'middle', maxLines: 1, inset: 0 };
    text(mappedStories.length + index + 1, box(columnX + 5, rowY, 16, rowHeight), {
      ...options, weight: 700, align: 'middle', fill: muted,
    });
    text(place, box(placeX, rowY, placeWidth, rowHeight), {
      ...options, weight: 700, fill: regionPalette(regionNames(brief)[0])[0],
    });
    const source = brief.src?.trim();
    const right = columnX + columnWidth - 2;
    const sourceWidth = source ? Math.ceil(regularFont.width(source, sourceOptions.size)) : 0;
    const sourceX = right - sourceWidth;
    const textX = placeX + placeWidth;
    const textWidth = sourceX - textX - (source ? 7 : 0);
    const body = brief.text.trim().replace(/\s+/g, ' ');
    const excess = regularFont.width(body, size) - textWidth;
    const gaps = Math.max(1, [...body].length - 1);
    const letterSpacing = Math.min(0, Math.floor(-1000 * excess / gaps) / 1000);
    text(body, box(textX, rowY, textWidth, rowHeight), { ...options, letterSpacing });
    if (source) text(source, box(sourceX, rowY, sourceWidth, rowHeight), sourceOptions);
  }
}

function dateCheck({ x, y, w, h }) {
  rect(x, y, w, h, '#fff8f5', `stroke="${red}" stroke-width="1.5"`);
  rect(x + 1, y + 1, w - 2, 17, '#f3dedd');

  const separator = stories.datecheck.title.indexOf(':');
  const title = stories.datecheck.title.slice(0, separator + 1);
  const subtitle = stories.datecheck.title.slice(separator + 1).trim();
  const titleWidth = Math.ceil(fontFor(700).width(title, 14)) + 4;
  text(title, box(x + 6, y + 1, titleWidth, 17), {
    size: 14, min: 14, weight: 700, fill: red, vertical: 'middle', maxLines: 1,
  });
  label(subtitle, box(x + 12 + titleWidth, y + 1, w - 18 - titleWidth, 17), red);

  const itemWidth = w / stories.datecheck.items.length;
  for (const [index, item] of stories.datecheck.items.entries()) {
    const itemX = x + index * itemWidth;
    if (index) line(itemX, y + 20, itemX, y + h - 3, '#dcb2b1');
    text(item, box(itemX + 6, y + 18, itemWidth - 9, h - 19), {
      vertical: 'middle', maxLines: 2, inset: 0,
    });
  }
}

function footer() {
  text('Editor’s note: ' + stories.note, box(24, 974, pageWidth, 16), { maxLines: 1 });
  rect(24, 994, pageWidth, 20, ink);
  text(stories.footer, box(30, 995, pageWidth - 12, 18), {
    align: 'middle', vertical: 'middle', fill: '#ffffff', maxLines: 1,
  });
}

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${pageSize}" height="${pageSize}" viewBox="0 0 ${pageSize} ${pageSize}" font-family="FreeSans" font-kerning="none">`);
rect(0, 0, pageSize, pageSize, paper);
masthead();
strips();
stories.leads.forEach(leadPanel);
stories.cards.forEach(storyCard);
const lowerY = 733;
const lowerHeight = 190;
const mapWidth = 269;
const panelGap = 8;
worldMap(box(margin, lowerY, mapWidth, lowerHeight));
briefs(box(margin + mapWidth + panelGap, lowerY, pageWidth - mapWidth - panelGap, lowerHeight));
dateCheck(box(margin, lowerY + lowerHeight + 5, pageWidth, 44));
footer();
add('</svg>');

writeFileSync(new URL('./entry.svg', import.meta.url), svg.join('\n') + '\n');
