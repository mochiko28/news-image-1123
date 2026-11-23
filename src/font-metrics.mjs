import { readFileSync } from 'node:fs';

function readCmap(font, cmap) {
  const maps = [];
  const count = font.readUInt16BE(cmap + 2);
  for (let index = 0; index < count; index++) {
    const record = cmap + 4 + index * 8;
    const platform = font.readUInt16BE(record);
    const encoding = font.readUInt16BE(record + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue;
    const offset = cmap + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(offset);
    if ([4, 12].includes(format)) maps.push({ offset, format });
  }
  maps.sort((a, b) => b.format - a.format);
  if (!maps.length) throw new Error('Font has no supported Unicode cmap');

  return codePoint => {
    for (const { offset, format } of maps) {
      if (format === 12) {
        let start = 0;
        let end = font.readUInt32BE(offset + 12) - 1;
        while (start <= end) {
          const middle = (start + end) >> 1;
          const group = offset + 16 + middle * 12;
          const first = font.readUInt32BE(group);
          const last = font.readUInt32BE(group + 4);
          if (codePoint < first) end = middle - 1;
          else if (codePoint > last) start = middle + 1;
          else return font.readUInt32BE(group + 8) + codePoint - first;
        }
      } else if (codePoint <= 0xffff) {
        const segments = font.readUInt16BE(offset + 6) / 2;
        const ends = offset + 14;
        const starts = ends + 2 * segments + 2;
        const deltas = starts + 2 * segments;
        const ranges = deltas + 2 * segments;
        for (let index = 0; index < segments; index++) {
          if (codePoint > font.readUInt16BE(ends + index * 2)) continue;
          if (codePoint < font.readUInt16BE(starts + index * 2)) break;
          const delta = font.readInt16BE(deltas + index * 2);
          const rangeWord = ranges + index * 2;
          const range = font.readUInt16BE(rangeWord);
          if (!range) return (codePoint + delta) & 0xffff;
          const first = font.readUInt16BE(starts + index * 2);
          const glyph = font.readUInt16BE(rangeWord + range + 2 * (codePoint - first));
          return glyph ? (glyph + delta) & 0xffff : 0;
        }
      }
    }
    return 0;
  };
}

function readFont(file) {
  const font = readFileSync('/usr/share/fonts/gnu-free/' + file);
  const tableCount = font.readUInt16BE(4);
  const tables = new Map();
  for (let index = 0; index < tableCount; index++) {
    const record = 12 + index * 16;
    tables.set(font.toString('ascii', record, record + 4), font.readUInt32BE(record + 8));
  }

  const em = font.readUInt16BE(tables.get('head') + 18);
  const hhea = tables.get('hhea');
  const ascent = font.readInt16BE(hhea + 4) / em;
  const descent = -font.readInt16BE(hhea + 6) / em;
  const longMetrics = font.readUInt16BE(hhea + 34);
  const hmtx = tables.get('hmtx');
  const glyphFor = readCmap(font, tables.get('cmap'));
  const advances = new Map();

  return {
    ascent,
    descent,
    width(text, size) {
      let units = 0;
      for (const character of text) {
        if (!advances.has(character)) {
          const glyph = glyphFor(character.codePointAt(0));
          if (!glyph) throw new Error('FreeSans has no glyph for ' + JSON.stringify(character));
          advances.set(character, font.readUInt16BE(hmtx + 4 * Math.min(glyph, longMetrics - 1)));
        }
        units += advances.get(character);
      }
      return units * size / em;
    },
  };
}

const regular = readFont('FreeSans.otf');
const bold = readFont('FreeSansBold.otf');

export function fontFor(weight) {
  return weight === 700 ? bold : regular;
}
