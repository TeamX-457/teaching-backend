// Generates public/favicon.svg and public/favicon.ico (PNG-in-ICO) for the Voice Verse mark.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [0x1d, 0x44, 0x52];
const FG = [0xf7, 0xf5, 0xef];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1d4452"/><path d="M7 13v6M11 10v12M16 7v18M21 11v10M25 14v4" stroke="#f7f5ef" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>\n`;
writeFileSync("public/favicon.svg", svg);

// 32-unit design space rasterised at SIZE px with 4x4 supersampling.
const SIZE = 64, SS = 4;
const bars = [[7, 13, 19], [11, 10, 22], [16, 7, 25], [21, 11, 21], [25, 14, 18]]; // x, y1, y2
const inRoundRect = (x, y) => {
  const r = 7, cx = Math.min(Math.max(x, r), 32 - r), cy = Math.min(Math.max(y, r), 32 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inBar = (x, y) => bars.some(([bx, y1, y2]) => {
  const hw = 1.2, cy = Math.min(Math.max(y, y1), y2);
  return (x - bx) ** 2 + (y - cy) ** 2 <= hw * hw;
});

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    let a = 0, bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = ((px + (sx + 0.5) / SS) / SIZE) * 32, y = ((py + (sy + 0.5) / SS) / SIZE) * 32;
      if (inRoundRect(x, y)) { a++; if (inBar(x, y)) fg++; else bg++; }
    }
    const n = SS * SS, o = py * (SIZE * 4 + 1) + 1 + px * 4;
    const total = Math.max(a, 1);
    for (let c = 0; c < 3; c++) raw[o + c] = Math.round((BG[c] * bg + FG[c] * fg) / total);
    raw[o + 3] = Math.round((a / n) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
]);

const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = SIZE; header[7] = SIZE; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
writeFileSync("public/favicon.ico", Buffer.concat([header, png]));
console.log("favicon written", png.length, "bytes");
