import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const projectRoot = path.resolve(import.meta.dirname, '..');
const zafDir = path.join(projectRoot, 'zaf');
const distDir = path.join(projectRoot, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const distTranslationsDir = path.join(distDir, 'translations');

fs.mkdirSync(distAssetsDir, { recursive: true });
fs.mkdirSync(distTranslationsDir, { recursive: true });

// Copy manifest.json
fs.copyFileSync(path.join(zafDir, 'manifest.json'), path.join(distDir, 'manifest.json'));

// Copy translations
for (const file of fs.readdirSync(path.join(zafDir, 'translations'))) {
  if (file.endsWith('.json')) {
    fs.copyFileSync(
      path.join(zafDir, 'translations', file),
      path.join(distTranslationsDir, file)
    );
  }
}

// Copy nav_bar SVG icon
fs.copyFileSync(
  path.join(zafDir, 'assets', 'icon_nav_bar.svg'),
  path.join(distAssetsDir, 'icon_nav_bar.svg')
);

// Pure Node PNG generator for required ZAF logo.png (320x320) and logo-small.png (128x128)
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function createShieldPng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);

  // Zendesk Garden Kale 800 background (#03363D) + Mint 400 shield accent (#5AEBC0)
  const bg = [3, 54, 61, 255];
  const shield = [90, 235, 192, 255];
  const inner = [3, 54, 61, 255];

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.32;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const inOuterShield =
        dy >= -0.95 &&
        dy <= 1.0 &&
        Math.abs(dx) <= (dy < 0.1 ? 0.85 : Math.max(0, 0.85 * (1 - (dy - 0.1) / 0.95)));
      const inInnerShield =
        dy >= -0.68 &&
        dy <= 0.72 &&
        Math.abs(dx) <= (dy < 0.1 ? 0.58 : Math.max(0, 0.58 * (1 - (dy - 0.1) / 0.68)));
      const inCheck =
        Math.abs(dy - (dx * 0.95 + 0.15)) < 0.14 && dx >= -0.35 && dx <= -0.02 ||
        Math.abs(dy - (-dx * 1.05 + 0.12)) < 0.14 && dx >= -0.05 && dx <= 0.42;

      let color = bg;
      if (inOuterShield) {
        color = inInnerShield ? (inCheck ? shield : inner) : shield;
      }

      const px = rowStart + 1 + x * 4;
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
      raw[px + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync(path.join(distAssetsDir, 'logo.png'), createShieldPng(320));
fs.writeFileSync(path.join(distAssetsDir, 'logo-small.png'), createShieldPng(128));

console.log('Prepared ZAF dist bundle at:', distDir);
