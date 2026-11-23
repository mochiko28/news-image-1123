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
    return;
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
  text(story.head, box(x + 7, y + 27, w - 13, 34), {
    size: 15, min: 15, weight: 700, maxLines: 2,
  });
  text(story.sub, box(x + 9, y + 61, w - 18, 13), { maxLines: 1 });
  text('Source: ' + story.src, box(x + 9, y + 74, w - 18, 13), {
    fill: muted, maxLines: 1,
  });
}

// The vertices are longitude/latitude pairs. The map uses the same
// degrees-to-pixels scale in both directions for land, grid and story anchors.
const continents = [
  // North America, Greenland and Central America
  [[-168,65],[-154,71],[-137,69],[-127,72],[-108,73],[-91,75],[-77,70],[-61,58],
   [-65,51],[-54,48],[-66,44],[-77,36],[-81,26],[-89,28],[-97,22],[-89,20],
   [-85,13],[-78,9],[-83,8],[-95,16],[-105,22],[-117,32],[-126,48],[-136,58],
   [-151,58],[-162,54],[-169,55],[-157,61]],
  [[-73,78],[-55,83],[-31,80],[-20,72],[-36,64],[-46,59],[-58,65]],
  // South America
  [[-81,9],[-71,12],[-62,9],[-51,5],[-49,-2],[-36,-6],[-35,-12],[-42,-23],
   [-50,-30],[-54,-36],[-62,-42],[-66,-54],[-73,-52],[-74,-40],[-71,-28],
   [-77,-17],[-81,-6],[-78,1]],
  // Eurasia
  [[-10,36],[-10,44],[-4,48],[5,52],[10,55],[6,59],[14,69],[25,71],[31,64],
   [43,68],[56,70],[69,74],[94,77],[113,73],[135,72],[156,65],[174,67],[178,62],
   [162,58],[157,52],[145,51],[140,44],[132,42],[126,34],[119,30],[121,23],[109,18],
   [105,10],[103,2],[99,6],[98,15],[90,22],[83,20],[76,8],[71,17],[66,24],
   [57,26],[54,16],[47,13],[43,14],[37,27],[33,31],[36,36],[28,41],[25,37],
   [22,40],[15,45],[11,43],[15,38],[11,38],[6,43],[1,43],[-2,36]],
  [[-10,51],[-8,58],[-3,58],[1,53],[-3,50]],
  [[-24,65],[-16,67],[-13,64],[-21,63]],
  [[130,31],[135,34],[141,42],[145,44],[143,38],[138,34],[134,31]],
  // Africa and Madagascar
  [[-17,15],[-13,27],[-5,35],[7,37],[14,33],[25,32],[32,31],[36,23],[44,12],
   [52,12],[46,4],[41,-4],[39,-14],[35,-23],[30,-32],[19,-35],[15,-27],
   [12,-17],[11,-7],[8,3],[-3,5],[-8,5],[-15,10]],
  [[48,-13],[51,-16],[47,-25],[44,-25],[44,-19]],
  // Island Southeast Asia, Australia and New Zealand
  [[95,5],[102,1],[106,-5],[114,-8],[110,-9],[101,-6]],
  [[109,1],[116,7],[119,4],[117,-3],[111,-3]],
  [[120,-7],[125,-7],[128,-9],[123,-10]],
  [[131,-2],[141,-3],[151,-6],[148,-10],[140,-8],[133,-5]],
  [[115,-22],[122,-18],[129,-15],[136,-12],[141,-17],[145,-11],[151,-23],
   [153,-28],[147,-37],[139,-39],[130,-32],[121,-34],[115,-34],[113,-28]],
  [[173,-35],[178,-38],[175,-42],[172,-40]],
  [[172,-41],[175,-43],[169,-47],[166,-46]],
  // Antarctica, drawn across the map seam
  [[-180,-78],[-155,-77],[-132,-74],[-107,-73],[-84,-73],[-70,-68],[-63,-64],
   [-58,-67],[-64,-75],[-42,-78],[-24,-73],[1,-70],[25,-70],[48,-67],
   [69,-68],[90,-66],[111,-68],[134,-67],[149,-71],[166,-72],[180,-78],
   [180,-84],[-180,-84]],
];

function worldMap() {
  const x = 24;
  const y = 766;
  const w = 306;
  const h = 204;
  const scale = 0.79;
  const project = (lon, lat) => [x + w / 2 + lon * scale, y + 116 - lat * scale];
  const [mapLeft, mapTop] = project(-180, 84);
  const [mapRight, mapBottom] = project(180, -84);

  rect(x, y, w, h, '#edf2f1', `stroke="${rule}"`);
  rect(x, y, w, 22, '#e2e9e9');
  label('WHERE IT HAPPENED', box(x + 8, y + 3, w - 16, 16));

  for (let lon = -180; lon <= 180; lon += 30) {
    const [px] = project(lon, 0);
    line(px, mapTop, px, mapBottom, '#d9e4e3');
  }
  for (const lat of [-84, -60, -30, 0, 30, 60, 84]) {
    const [, py] = project(0, lat);
    line(mapLeft, py, mapRight, py, '#d9e4e3');
  }
  for (const points of continents) {
    const coordinates = points.map(([lon, lat]) => project(lon, lat).map(n).join(','));
    add(`<polygon points="${coordinates.join(' ')}" fill="#cbd3d3" stroke="#aababe" stroke-width=".65" stroke-linejoin="round"/>`);
  }

  const pins = [...stories.leads, ...stories.cards].map((story, index) => ({
    index: index + 1,
    point: project(story.lon, story.lat),
    color: regions[story.region.split(' · ')[0]][0],
  }));
  const placed = [];
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  for (const pin of pins) {
    // Fan crowded pins out in rings while leaving space around every anchor.
    const radii = [0, 14, 22, 30, 38, 46, 54, 62, 70];
    const candidates = radii.flatMap(radius => Array.from(
      { length: radius ? 16 : 1 },
      (_, step) => {
        const angle = -Math.PI / 2 + step * Math.PI / 8;
        return [pin.point[0] + radius * Math.cos(angle), pin.point[1] + radius * Math.sin(angle)];
      },
    ));
    pin.label = candidates.find(candidate =>
      candidate[0] >= x + 13 && candidate[0] <= x + w - 13 &&
      candidate[1] >= y + 36 && candidate[1] <= y + h - 13 &&
      placed.every(other => distance(candidate, other) >= 20) &&
      pins.every(other => other === pin || distance(candidate, other.point) >= 11),
    );
    if (!pin.label) throw new Error('Could not place map pin ' + pin.index);
    placed.push(pin.label);
  }

  for (const { point, label: center, color } of pins) {
    if (distance(point, center) > 0.1) {
      line(...point, ...center, color);
      circle(...point, 2, color, 'stroke="#ffffff" stroke-width=".5"');
    }
  }
  for (const { label: [cx, cy], index, color } of pins) {
    circle(cx, cy, 8.7, color, 'stroke="#fffefa" stroke-width="1"');
    text(index, box(cx - 8, cy - 7, 16, 14), {
      weight: 700, fill: '#ffffff', align: 'middle', vertical: 'middle', maxLines: 1, inset: 0,
    });
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
