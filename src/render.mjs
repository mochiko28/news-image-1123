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
  AFRICA: ['#8c3927', '#f5e6df'],
  EUROPE: ['#274d81', '#e5edf8'],
  ASIA: ['#10645d', '#dff0eb'],
  AMERICAS: ['#69447d', '#eee5f3'],
  'MIDDLE EAST': ['#805000', '#f8ecd5'],
};

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
  } = options;
  const font = fontFor(weight);

  for (let fontSize = size; fontSize >= min; fontSize--) {
    const lines = wrap(String(value), w - 2 * inset, line => font.width(line, fontSize));
    if (!lines || lines.length > maxLines) continue;
    const lineHeight = (font.ascent + font.descent) * fontSize;
    const height = lines.length * lineHeight + (lines.length - 1) * gap;
    if (height > h + 0.001) continue;

    const start = y + (vertical === 'middle' ? (h - height) / 2 : 0);
    const anchorX = align === 'middle' ? x + w / 2 : x + inset;
    const baseline = start + font.ascent * fontSize;
    for (const [index, content] of lines.entries()) {
      add(`<text x="${n(anchorX)}" y="${n(baseline + index * (lineHeight + gap))}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${align}" fill="${fill}" data-box="${[x, y, w, h].map(n).join(' ')}">${xml(content)}</text>`);
    }
    return height;
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
  const { day, date, kicker, leads, cards, briefs } = stories;
  const allStories = [...leads, ...cards, ...briefs];
  const regionCount = new Set(allStories.flatMap(story => story.region.split(' · '))).size;
  const fieldCount = new Set([...leads, ...cards].map(story => story.field)).size;
  const [dayOfMonth, month, year] = date.split(' ');
  const stats = `${allStories.length} STORIES · ${regionCount} REGIONS · ${fieldCount} FIELDS · ALL FROM ${day} ${dayOfMonth} ${month.slice(0, 3)} ${year}`;

  rect(24, 14, pageWidth, 113, ink);
  rect(24, 14, 5, 113, '#d75450');
  label(kicker, box(41, 21, 942, 17), '#d8e5ed');
  text(day + ' ' + date, box(39, 36, 945, 72), {
    size: 64, min: 60, weight: 700, fill: '#ffffff', vertical: 'middle', maxLines: 1,
  });
  label(stats, box(41, 107, 942, 15), '#d8e5ed');
}

function strips() {
  const timelineWidth = pageWidth / stories.timeline.length;
  label('THE DAY IN UTC', box(24, 132, 230, 16));
  line(24, 150, 1000, 150, ink);
  for (const [index, { t, text: event }] of stories.timeline.entries()) {
    const x = 24 + index * timelineWidth;
    if (index) line(x, 156, x, 185);
    label(t, box(x + 6, 154, timelineWidth - 12, 13), '#174985');
    text(event, box(x + 6, 169, timelineWidth - 12, 25), { maxLines: 2 });
  }

  rect(24, 198, pageWidth, 47, '#e5ebed');
  text('THE DAY IN NUMBERS', box(32, 202, 94, 39), {
    size: 13, min: 13, weight: 700, vertical: 'middle',
  });
  const numberWidth = (pageWidth - 106) / stories.numbers.length;
  for (const [index, { v, l }] of stories.numbers.entries()) {
    const x = 130 + index * numberWidth;
    line(x, 205, x, 238, '#aab8bf');
    const valueWidth = Math.ceil(fontFor(700).width(v, 30)) + 6;
    text(v, box(x + 9, 201, valueWidth, 40), {
      size: 30, min: 30, weight: 700, vertical: 'middle', maxLines: 1,
    });
    text(l, box(x + 17 + valueWidth, 202, numberWidth - 24 - valueWidth, 38), {
      size: 12, vertical: 'middle', maxLines: 3,
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
  const y = 254;
  const w = index === 2 ? 320 : 318;
  const contentX = x + 11;
  const contentWidth = w - 22;

  rect(x, y, w, 225, white, `stroke="${rule}"`);
  add(`<g transform="translate(${x} ${y}) scale(${w / 320} 1)">${scenes[story.scene]}</g>`);
  rect(x, y, w, 3, regions[story.region.split(' · ')[0]][0]);

  badge(index + 1, contentX, y + 79, 19, 16);
  let tagX = contentX + 24;
  for (const region of story.region.split(' · ')) {
    tagX += pill(region, tagX, y + 79, regions[region]) + 4;
  }
  label(story.field, box(tagX + 2, y + 79, 72, 16), muted);
  pill(story.status, x + w - 91, y + 79, statuses[story.status], 80);
  text(story.head, box(contentX, y + 100, contentWidth, 51), {
    size: 23, min: 20, weight: 700, maxLines: 2,
  });
  text(story.sub, box(contentX, y + 155, contentWidth, 53), {
    size: 12, maxLines: 4,
  });
  text('Source: ' + story.src, box(contentX, y + 209, contentWidth, 14), {
    fill: muted, maxLines: 1,
  });
}

const icons = {
  fire: '<path d="M10 2c2 4-1 6 2 7l2-3c4 4 6 12-3 12-6 0-8-5-5-9 0 3 2 3 2 3-1-4 2-6 2-10Z"/><path d="M9 16c0-2 2-3 3-4 1 2 2 3 0 5"/>',
  blast: '<path d="m10 2 2 5 5-2-2 5 3 2-5 1 1 5-4-3-4 3 1-5-5-1 4-2-2-5 5 2Z"/>',
  shield: '<path d="m10 2 7 3v5c0 4-4 7-7 8-3-1-7-4-7-8V5Z"/><path d="m7 10 2 2 4-4"/>',
  flame: '<path d="M10 2c1 5 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-7 0 3 1 4 2 4 1-2 2-5 1-8Z"/>',
  virus: '<circle cx="10" cy="10" r="5"/><path d="M10 2v3m0 10v3M2 10h3m10 0h3M4 4l2 2m8 8 2 2m0-12-2 2m-8 8-2 2m4-7h.1m3 2h.1"/>',
  chip: '<rect x="5" y="5" width="10" height="10" rx="1"/><rect x="8" y="8" width="4" height="4"/><path d="M8 2v3m4-3v3m-4 10v3m4-3v3M2 8h3m-3 4h3m10-4h3m-3 4h3"/>',
  handshake: '<path d="m2 8 4-5 4 2 4-2 4 5-4 5-3 3-5-2-4-3Zm8-3-3 4 2 1 2-2 4 4m-8 0 3 3"/>',
  lock: '<rect x="4" y="8" width="12" height="9" rx="1"/><path d="M7 8V5a3 3 0 0 1 6 0v3m-3 4v2"/>',
  gavel: '<path d="m6 4 4-2 5 6-4 3Zm7 6 5 5M2 17h10m-8-2h6"/>',
  drone: '<path d="m6 6 8 8m0-8-8 8"/><circle cx="4" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="4" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><rect x="8" y="8" width="4" height="4" rx="1"/>',
  drop: '<path d="M10 2c2 4 6 7 6 10a6 6 0 0 1-12 0c0-3 4-6 6-10Zm-3 10c0 2 1 3 2 3"/>',
  pillar: '<path d="M2 7h16l-8-5Zm2 9h12m-14 2h16M6 8v7m4-7v7m4-7v7"/>',
};

function storyCard(story, index) {
  const x = 24 + index % 4 * 246;
  const y = 487 + Math.floor(index / 4) * 92;
  const w = 238;
  const [color, tint] = regions[story.region];
  rect(x, y, w, 87, white, `stroke="${rule}"`);
  rect(x, y, 3, 87, color);
  rect(x + 9, y + 6, 21, 21, tint, 'rx="3"');
  add(`<g transform="translate(${x + 9.5} ${y + 6.5})" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[story.icon]}</g>`);
  badge(index + 4, x + 35, y + 9, 19, 15);
  label(story.region, box(x + 59, y + 8, 84, 16), color);
  pill(story.status, x + 150, y + 8, statuses[story.status], 79);
  const headY = y + 27;
  const headHeight = text(story.head, box(x + 7, headY, w - 13, 34), {
    size: 15, min: 15, weight: 700, maxLines: 2,
  });
  const subY = Math.ceil(headY + headHeight);
  text(story.sub, box(x + 9, subY, w - 18, 13), { maxLines: 1 });
  text('Source: ' + story.src, box(x + 9, subY + 13, w - 18, 13), {
    fill: muted, maxLines: 1,
  });
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

function worldMap() {
  const x = 24;
  const y = 766;
  const w = 306;
  const h = 204;
  const sea = '#eef3f2';
  const mapLeft = x + 1;
  const mapRight = x + w - 1;
  const mapTop = y + 22;
  const mapBottom = y + h - 19;
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
  rect(x, y, w, 22, '#e2e9e9');
  label('WHERE IT HAPPENED', box(x + 8, y + 3, w - 16, 16));

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

  const mapStories = [...stories.leads, ...stories.cards];
  const pins = mapStories.map((story, index) => ({
    index: index + 1,
    point: project(story.lon, story.lat),
    color: regions[story.region.split(' · ')[0]][0],
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
  for (const pin of pins) {
    const [px, py] = pin.point;
    pin.center = offsets.map(([dx, dy]) => [px + dx, py + dy]).find(center =>
      center[0] >= mapLeft + 10 && center[0] <= mapRight - 10 &&
      center[1] >= mapTop + 10 && center[1] <= mapBottom - 10 &&
      pins.every(other => distance(center, other.point) >= 11 &&
        (distance(pin.point, other.point) < 2 ||
          distanceToSegment(other.point, pin.point, center) >= 1.5)) &&
      placed.every(other => distance(center, other.center) >= 2 * labelRadius + 2 &&
        distanceToSegment(center, other.point, other.center) >= labelRadius + 1 &&
        distanceToSegment(other.center, pin.point, center) >= labelRadius + 1),
    );
    if (!pin.center) throw new Error('Could not place map pin ' + pin.index);
    placed.push(pin);
  }

  for (const { point: [px, py], center: [cx, cy], color } of pins) {
    add(`<path d="M${n(px)} ${n(py)}L${n(cx)} ${n(cy)}" stroke="${color}" stroke-width=".75"/>`);
  }
  for (const { point, color } of pins) {
    circle(...point, 1.1, color, 'stroke="#fffefa" stroke-width=".4"');
  }
  for (const { center: [cx, cy], index, color } of pins) {
    circle(cx, cy, labelRadius, color, 'stroke="#fffefa" stroke-width="1"');
    text(index, box(cx - 8, cy - 7, 16, 14), {
      weight: 700, fill: '#ffffff', align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    });
  }

  const presentRegions = new Set(mapStories.flatMap(story => story.region.split(' · ')));
  const legend = Object.keys(regions).filter(region => presentRegions.has(region)).map(region => {
    const name = region.toLowerCase().replace(/\b\w/g, initial => initial.toUpperCase());
    return { name, color: regions[region][0], width: Math.ceil(fontFor(700).width(name, 11)) };
  });
  const legendWidth = legend.reduce((total, { width }) => total + width + 10, 0) +
    (legend.length - 1) * 7;
  rect(mapLeft, mapBottom, mapRight - mapLeft, 18, '#f7f9f6');
  line(mapLeft, mapBottom, mapRight, mapBottom, '#d4dfdd');
  let legendX = x + (w - legendWidth) / 2;
  for (const { name, color, width } of legend) {
    circle(legendX + 3, mapBottom + 9, 3, color);
    text(name, box(legendX + 10, mapBottom + 2, width, 14), {
      weight: 700, fill: color, vertical: 'middle', maxLines: 1, inset: 0,
    });
    legendX += width + 17;
  }
}

function briefs() {
  const x = 341;
  const y = 766;
  const w = 409;
  const h = 204;
  rect(x, y, w, h, white, `stroke="${rule}"`);
  rect(x, y, w, 22, '#e2e9e9');
  label('ALSO ON MONDAY', box(x + 8, y + 3, w - 16, 16));

  const firstNumber = stories.leads.length + stories.cards.length + 1;
  for (const [index, brief] of stories.briefs.entries()) {
    const rowY = y + 22 + index * 13;
    if (index % 2 === 0) rect(x + 1, rowY, w - 2, 13, '#f3f5f3');
    text(firstNumber + index, box(x + 6, rowY, 18, 13), {
      weight: 700, align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    });
    label(brief.region, box(x + 30, rowY, 81, 13), regions[brief.region][0]);
    text(brief.text, box(x + 111, rowY, w - 117, 13), {
      vertical: 'middle', maxLines: 1,
    });
  }
}

function dateCheck() {
  const x = 761;
  const y = 766;
  const w = 239;
  const h = 204;
  rect(x, y, w, h, '#fff8f5', `stroke="${red}" stroke-width="1.5"`);
  rect(x + 1, y + 1, w - 2, 20, '#f3dedd');

  const separator = stories.datecheck.title.indexOf(':');
  const title = stories.datecheck.title.slice(0, separator + 1);
  const subtitle = stories.datecheck.title.slice(separator + 1).trim();
  text(title, box(x + 8, y + 2, w - 16, 18), {
    size: 14, min: 14, weight: 700, fill: red, vertical: 'middle', maxLines: 1,
  });
  text(subtitle, box(x + 8, y + 26, w - 16, 26), { weight: 700, fill: red });
  line(x + 9, y + 53, x + w - 9, y + 53, '#dcb2b1');

  for (const [index, item] of stories.datecheck.items.entries()) {
    const itemY = y + 59 + index * 28;
    circle(x + 11, itemY + 5.5, 2, red);
    text(item, box(x + 17, itemY, w - 27, 26), { maxLines: 2 });
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
worldMap();
briefs();
dateCheck();
footer();
add('</svg>');

writeFileSync(new URL('./entry.svg', import.meta.url), svg.join('\n') + '\n');
