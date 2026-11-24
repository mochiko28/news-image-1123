import { closeSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value;
});

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const a = Math.abs(estimate - left);
  const b = Math.abs(estimate - up);
  const c = Math.abs(estimate - upperLeft);
  if (a <= b && a <= c) return left;
  return b <= c ? up : upperLeft;
}

const predictors = [
  () => 0,
  left => left,
  (_left, up) => up,
  (left, up) => (left + up) >> 1,
  paeth,
];

function decode(png) {
  if (!png.subarray(0, 8).equals(signature) ||
      png.readUInt32BE(8) !== 13 || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Expected a PNG with an IHDR chunk');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  if (!width || !height || png[24] !== 8 || (colorType !== 2 && colorType !== 6) ||
      png[26] !== 0 || png[27] !== 0 || png[28] !== 0) {
    throw new Error('Expected an 8-bit non-interlaced RGB or RGBA PNG');
  }

  const idat = [];
  let transparent;
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 8 + length;
    if (end + 4 > png.length) throw new Error('Truncated PNG chunk');
    const data = png.subarray(offset + 8, end);
    if (type === 'IDAT') idat.push(data);
    if (type === 'tRNS' && colorType === 2) {
      transparent = [data.readUInt16BE(0), data.readUInt16BE(2), data.readUInt16BE(4)];
    }
    if (type === 'IEND') break;
    offset = end + 4;
  }

  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const rawLength = height * (stride + 1);
  const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: rawLength });
  if (raw.length !== rawLength) throw new Error('Unexpected PNG scanline length');

  let previous = Buffer.alloc(stride);
  let row = Buffer.alloc(stride);
  const pixels = new Uint32Array(width * height);
  const histogram = new Map();
  for (let y = 0, offset = 0; y < height; y++) {
    const predict = predictors[raw[offset++]];
    if (!predict) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      row[x] = (raw[offset++] + predict(left, previous[x], upperLeft)) & 255;
    }
    for (let x = 0, i = 0; x < width; x++, i += channels) {
      let r = row[i], g = row[i + 1], b = row[i + 2];
      if (channels === 4 && row[i + 3] !== 255) {
        const alpha = row[i + 3] / 255;
        r = Math.round(255 + (r - 255) * alpha);
        g = Math.round(255 + (g - 255) * alpha);
        b = Math.round(255 + (b - 255) * alpha);
      } else if (transparent && r === transparent[0] && g === transparent[1] && b === transparent[2]) {
        r = g = b = 255;
      }
      const key = (r << 16) | (g << 8) | b;
      pixels[y * width + x] = key;
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
    [previous, row] = [row, previous];
  }
  return { width, height, pixels, histogram };
}

function distanceSquared(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function colorBox(colors) {
  const sums = [0, 0, 0];
  let count = 0;
  for (const { rgb, weight } of colors) {
    count += weight;
    for (let axis = 0; axis < 3; axis++) sums[axis] += rgb[axis] * weight;
  }
  const mean = sums.map(sum => sum / count);
  let best = { gain: 0 };
  // A split's gain is the reduction in weighted squared error about the mean.
  for (let axis = 0; axis < 3 && colors.length > 1; axis++) {
    const bins = Array.from({ length: 256 }, () => [0, 0, 0, 0]);
    for (const { rgb, weight } of colors) {
      const bin = bins[rgb[axis]];
      bin[0] += weight;
      for (let channel = 0; channel < 3; channel++) bin[channel + 1] += rgb[channel] * weight;
    }
    let leftCount = 0;
    const leftSums = [0, 0, 0];
    for (let cut = 0; cut < 255; cut++) {
      const [weight, r, g, b] = bins[cut];
      if (!weight) continue;
      leftCount += weight;
      if (leftCount === count) break;
      leftSums[0] += r;
      leftSums[1] += g;
      leftSums[2] += b;
      const scaledMean = mean.map(channel => channel * leftCount);
      const gain = distanceSquared(leftSums, scaledMean) * count / (leftCount * (count - leftCount));
      if (gain > best.gain) best = { gain, axis, cut };
    }
  }
  return { colors, rgb: mean.map(Math.round), ...best };
}

function indexColors(histogram, pixels) {
  const colors = Array.from(histogram, ([key, weight]) => ({
    key, weight, rgb: [key >>> 16, (key >>> 8) & 255, key & 255],
  }));
  let palette;
  if (colors.length <= 256) {
    palette = colors.map(color => color.rgb);
  } else {
    const boxes = [colorBox(colors)];
    while (boxes.length < 256) {
      let best = 0;
      for (let i = 1; i < boxes.length; i++) {
        if (boxes[i].gain > boxes[best].gain) best = i;
      }
      const { colors: members, axis, cut } = boxes[best];
      const left = [];
      const right = [];
      for (const color of members) (color.rgb[axis] <= cut ? left : right).push(color);
      boxes[best] = colorBox(left);
      boxes.push(colorBox(right));
    }
    palette = boxes.map(box => box.rgb);
  }

  const indexes = new Map();
  for (const [i, { key, rgb }] of colors.entries()) {
    let closest = i;
    if (colors.length > 256) {
      let bestDistance = Infinity;
      for (const [index, candidate] of palette.entries()) {
        const distance = distanceSquared(rgb, candidate);
        if (distance < bestDistance) {
          bestDistance = distance;
          closest = index;
        }
      }
    }
    indexes.set(key, closest);
  }
  const indexed = Buffer.allocUnsafe(pixels.length);
  for (let i = 0; i < pixels.length; i++) indexed[i] = indexes.get(pixels[i]);
  return { palette, indexed };
}

function compressRows(indexed, width, height) {
  const stride = width + 1;
  const unfiltered = Buffer.alloc(stride * height);
  const adaptive = Buffer.allocUnsafe(unfiltered.length);
  const candidate = Buffer.allocUnsafe(stride);
  for (let y = 0; y < height; y++) {
    const start = y * width;
    const offset = y * stride;
    indexed.copy(unfiltered, offset + 1, start, start + width);
    let bestScore = Infinity;
    for (const [type, predict] of predictors.entries()) {
      let score = 0;
      candidate[0] = type;
      for (let x = 0; x < width; x++) {
        const left = x ? indexed[start + x - 1] : 0;
        const up = y ? indexed[start + x - width] : 0;
        const upperLeft = x && y ? indexed[start + x - width - 1] : 0;
        const residual = (indexed[start + x] - predict(left, up, upperLeft)) & 255;
        candidate[x + 1] = residual;
        score += Math.min(residual, 256 - residual);
      }
      if (score < bestScore) {
        bestScore = score;
        candidate.copy(adaptive, offset);
      }
    }
  }
  const plain = deflateSync(unfiltered, { level: 9 });
  const filtered = deflateSync(adaptive, { level: 9 });
  return filtered.length < plain.length ? filtered : plain;
}

function chunk(type, data) {
  const result = Buffer.allocUnsafe(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < data.length + 8; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ result[i]) & 255];
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return result;
}

function encode({ width, height, pixels, histogram }) {
  const { palette, indexed } = indexColors(histogram, pixels);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 3;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('PLTE', Buffer.from(palette.flat())),
    chunk('IDAT', compressRows(indexed, width, height)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [input, output] = process.argv.slice(2);
if (process.argv.length !== 4 || !input || !output) {
  console.error('Usage: node tools/quantize.mjs <in.png> <out.png>');
  process.exit(1);
}

const png = encode(decode(readFileSync(input)));
const temporary = `${output}.${globalThis.crypto.randomUUID()}.tmp`;
const fd = openSync(temporary, 'wx');
try {
  try {
    writeFileSync(fd, png);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, output);
} catch (error) {
  unlinkSync(temporary);
  throw error;
}
