/**
 * Creates build/icon.ico from build/icon.png
 * ICO format: 16x16, 32x32, 48x48, 256x256 (PNG embedded for 256)
 */
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');

// Re-render the icon at multiple sizes from scratch (same design)
function renderIcon(size) {
  const W = size, H = size;
  const BG    = [15, 23, 42, 255];
  const TEAL  = [20, 184, 166, 255];
  const WHITE = [255, 255, 255, 255];

  const img = new Uint8Array(W * H * 4);

  function px(x, y, color) {
    const i = (y * W + x) * 4;
    img[i]=color[0]; img[i+1]=color[1]; img[i+2]=color[2]; img[i+3]=color[3];
  }
  function rect(x, y, w, h, color) {
    for (let ry=y; ry<y+h; ry++)
      for (let rx=x; rx<x+w; rx++)
        if (rx>=0&&rx<W&&ry>=0&&ry<H) px(rx,ry,color);
  }

  // Fill bg
  rect(0, 0, W, H, BG);

  if (size >= 32) {
    // Barcode border
    const bx=Math.round(W*0.1), by=Math.round(H*0.15);
    const bw=Math.round(W*0.8), bh=Math.round(H*0.5);
    const s=Math.max(1,Math.round(size*0.01));
    rect(bx,by,bw,s,TEAL); rect(bx,by+bh-s,bw,s,TEAL);
    rect(bx,by,s,bh,TEAL); rect(bx+bw-s,by,s,bh,TEAL);

    // Stripes
    const stripeCount = Math.floor(bw / 6);
    const gap = bw / stripeCount;
    for (let i=0; i<stripeCount; i++) {
      if (i % 3 !== 1) {
        const sx = bx + s + Math.round(i * gap);
        const sw = Math.max(1, Math.round(gap * 0.5));
        rect(sx, by+s+1, sw, bh-s*2-2, TEAL);
      }
    }
  } else {
    // Tiny: just a teal rect
    rect(2,2,W-4,H-4,TEAL);
    rect(4,4,W-8,H-8,BG);
    rect(6,6,W-12,H-12,TEAL);
  }

  return img;
}

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
  const pixels = renderIcon(s);
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
  const px = renderIcon(s);
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
