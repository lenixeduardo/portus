/**
 * Generates build/icon.png (512x512) — PORTUS logo style:
 * dark background (#0f172a) with teal (#14b8a6) barcode stripes.
 * Uses only Node.js built-ins (zlib).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
mkdirSync(join(ROOT, 'build'), { recursive: true });

const W = 512, H = 512;

// Each pixel is [R, G, B, A]
const BG   = [15, 23, 42, 255];   // #0f172a
const TEAL = [20, 184, 166, 255];  // #14b8a6
const WHITE = [255, 255, 255, 255];

function px(img, x, y, color) {
  const i = (y * W + x) * 4;
  img[i]   = color[0];
  img[i+1] = color[1];
  img[i+2] = color[2];
  img[i+3] = color[3];
}

function rect(img, x, y, w, h, color) {
  for (let ry = y; ry < y + h; ry++)
    for (let rx = x; rx < x + w; rx++)
      if (rx >= 0 && rx < W && ry >= 0 && ry < H)
        px(img, rx, ry, color);
}

function roundRect(img, x, y, w, h, r, color) {
  for (let ry = y; ry < y + h; ry++) {
    for (let rx = x; rx < x + w; rx++) {
      const dx = Math.min(rx - x, x + w - 1 - rx);
      const dy = Math.min(ry - y, y + h - 1 - ry);
      if (dx < r && dy < r) {
        const dist = Math.sqrt((r - dx) ** 2 + (r - dy) ** 2);
        if (dist > r) continue;
      }
      if (rx >= 0 && rx < W && ry >= 0 && ry < H)
        px(img, rx, ry, color);
    }
  }
}

const img = new Uint8Array(W * H * 4);

// Fill background
rect(img, 0, 0, W, H, BG);

// Rounded card background
roundRect(img, 32, 64, 448, 384, 32, [26, 32, 56, 255]);

// Barcode border rectangle (teal outline)
const bx = 80, by = 120, bw = 352, bh = 200, bstroke = 4;
rect(img, bx, by, bw, bstroke, TEAL);               // top
rect(img, bx, by + bh - bstroke, bw, bstroke, TEAL); // bottom
rect(img, bx, by, bstroke, bh, TEAL);               // left
rect(img, bx + bw - bstroke, by, bstroke, bh, TEAL); // right

// Barcode stripes inside
const stripes = [
  { x: 96,  w: 6 },
  { x: 108, w: 14 },
  { x: 130, w: 6 },
  { x: 144, w: 20 },
  { x: 172, w: 8 },
  { x: 188, w: 6 },
  { x: 202, w: 18 },
  { x: 228, w: 6 },
  { x: 242, w: 14 },
  { x: 264, w: 6 },
  { x: 278, w: 22 },
  { x: 308, w: 8 },
  { x: 324, w: 6 },
  { x: 338, w: 16 },
  { x: 362, w: 6 },
  { x: 376, w: 10 },
  { x: 394, w: 6 },
];
for (const s of stripes) {
  rect(img, s.x, by + bstroke + 8, s.w, bh - bstroke * 2 - 16, TEAL);
}

// "PORTUS" text as pixel blocks below barcode
// Simple 5x7 pixel font for each letter
const font = {
  P: [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  O: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  R: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  U: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  S: [[0,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,0]],
};

const scale = 8;
const letters = ['P','O','R','T','U','S'];
const textW = letters.length * (5 * scale + scale) - scale;
const textX = Math.floor((W - textW) / 2);
const textY = by + bh + 24;

for (let li = 0; li < letters.length; li++) {
  const letter = font[letters[li]];
  const lx = textX + li * (5 * scale + scale);
  for (let row = 0; row < letter.length; row++) {
    for (let col = 0; col < letter[row].length; col++) {
      if (letter[row][col]) {
        rect(img, lx + col * scale, textY + row * scale, scale, scale, WHITE);
      }
    }
  }
}

// Subtitle dots
const subY = textY + 8 * scale + 12;
for (let i = 0; i < 5; i++) {
  rect(img, W/2 - 20 + i * 10, subY, 4, 4, TEAL);
}

// ─── PNG encoding ────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// IDAT: scanlines with filter byte 0
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter none
  for (let x = 0; x < W; x++) {
    const si = (y * W + x) * 4;
    const di = y * (1 + W * 4) + 1 + x * 4;
    raw[di]   = img[si];
    raw[di+1] = img[si+1];
    raw[di+2] = img[si+2];
    raw[di+3] = img[si+3];
  }
}
const compressed = deflateSync(raw, { level: 6 });

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = join(ROOT, 'build', 'icon.png');
writeFileSync(outPath, png);
console.log(`✓ icon.png (${W}x${H}) written to ${outPath}`);
