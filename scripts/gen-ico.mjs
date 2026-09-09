/**
 * Creates build/icon.ico from build/icon.png
 * ICO format: 16x16, 32x32, 48x48, 256x256 (PNG embedded for 256)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPortusIcon } from './icon-design.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '../..');

function crc32(buf) {
  const table = new Int32Array(256);
  for (let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);table[i]=c;}
  let crc=0xFFFFFFFF;
  for (const b of buf) crc=table[(crc^b)&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function makePng(pixels, W, H) {
  function chunk(type, data) {
    const t=Buffer.from(type,'ascii');
    const l=Buffer.alloc(4);l.writeUInt32BE(data.length);
    const cb=Buffer.concat([t,data]);
    const cv=Buffer.alloc(4);cv.writeUInt32BE(crc32(cb));
    return Buffer.concat([l,t,data,cv]);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);
  ihdr[8]=8;ihdr[9]=6;
  const raw=Buffer.alloc(H*(1+W*4));
  for(let y=0;y<H;y++){
    raw[y*(1+W*4)]=0;
    for(let x=0;x<W;x++){
      const si=(y*W+x)*4,di=y*(1+W*4)+1+x*4;
      raw[di]=pixels[si];raw[di+1]=pixels[si+1];raw[di+2]=pixels[si+2];raw[di+3]=pixels[si+3];
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',deflateSync(raw,{level:6})),
    chunk('IEND',Buffer.alloc(0)),
  ]);
}

// ICO format: header + directory + image data
const sizes = [16, 32, 48, 256];
const images = sizes.map(s => {
  const pixels = renderPortusIcon(s);
  // For 256x256 use PNG embedded format (modern ICO)
  if (s === 256) {
    return makePng(pixels, s, s);
  }
  // For smaller sizes use BMP DIB format
  const rowSize = Math.ceil(s * 3 / 4) * 4;
  const xorSize = rowSize * s;
  const andSize = Math.ceil(s / 8) * 4 * s;
  const bmpSize = 40 + xorSize + andSize;
  const bmp = Buffer.alloc(bmpSize);
  // BITMAPINFOHEADER
  bmp.writeInt32LE(40, 0);
  bmp.writeInt32LE(s, 4);
  bmp.writeInt32LE(s * 2, 8); // height * 2 for ICO
  bmp.writeInt16LE(1, 12);    // planes
  bmp.writeInt16LE(24, 14);   // bpp
  bmp.writeInt32LE(0, 16);    // compression
  bmp.writeInt32LE(xorSize, 20);
  // XOR (BGR, bottom-up)
  const px = renderPortusIcon(s);
  for (let y = s-1; y >= 0; y--) {
    const row = (s-1-y);
    for (let x = 0; x < s; x++) {
      const si = (y*s+x)*4;
      const di = 40 + row*rowSize + x*3;
      bmp[di]   = px[si+2]; // B
      bmp[di+1] = px[si+1]; // G
      bmp[di+2] = px[si];   // R
    }
  }
  // AND mask: 0 = opaque
  // already zeroed
  return bmp;
});

const count = sizes.length;
const headerSize = 6 + count * 16;
let offset = headerSize;
const header = Buffer.alloc(6);
header.writeInt16LE(0, 0);     // reserved
header.writeInt16LE(1, 2);     // ICO type
header.writeInt16LE(count, 4);

const dirs = [];
for (let i = 0; i < count; i++) {
  const s = sizes[i];
  const dir = Buffer.alloc(16);
  dir[0] = s === 256 ? 0 : s;  // width (0 = 256)
  dir[1] = s === 256 ? 0 : s;  // height
  dir[2] = 0;   // color count
  dir[3] = 0;   // reserved
  dir.writeInt16LE(1, 4);  // planes
  dir.writeInt16LE(s === 256 ? 32 : 24, 6);  // bpp
  dir.writeInt32LE(images[i].length, 8);
  dir.writeInt32LE(offset, 12);
  offset += images[i].length;
  dirs.push(dir);
}

const ico = Buffer.concat([header, ...dirs, ...images]);
const outPath = join(ROOT, 'build', 'icon.ico');
writeFileSync(outPath, ico);
console.log(`✓ icon.ico written (${sizes.join(',')}px) to ${outPath}`);
