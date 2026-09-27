// Generates the app icon, Android adaptive icon foreground and splash image into ../assets.
// Built-ins only: a tiny PNG encoder (node:zlib) and a supersampled shape rasterizer.
// Run: node scripts/icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ORANGE = [0xea, 0x28, 0x04];
const WHITE = [255, 255, 255];
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** px is RGBA; `rgb` drops alpha (App Store icons must not have an alpha channel). */
function png(size, px, rgb = false) {
  const ch = rgb ? 3 : 4;
  const raw = Buffer.alloc((size * ch + 1) * size); // filter byte 0 per row
  for (let i = 0; i < size * size; i++) px.copy(raw, Math.floor(i / size) * (size * ch + 1) + 1 + (i % size) * ch, i * 4, i * 4 + ch);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = rgb ? 2 : 6; // RGB : RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
/** Building glyph in unit box: body, 3x4 windows and a door cut out. */
function building(u, v) {
  if (!inRect(u, v, 0.18, 0.06, 0.82, 0.96)) return false;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) if (inRect(u, v, 0.28 + c * 0.16, 0.16 + r * 0.15, 0.4 + c * 0.16, 0.25 + r * 0.15)) return false;
  return !inRect(u, v, 0.42, 0.76, 0.58, 0.96);
}
function roundRect(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r), cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** tile: "square" (iOS masks it), "round" (splash) or null (transparent, adaptive foreground). glyph: fraction of size. */
function render(size, { tile, glyph }) {
  const px = Buffer.alloc(size * size * 4);
  const g0 = (size * (1 - glyph)) / 2, gs = size * glyph, N = 3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const sx = x + (i + 0.5) / N, sy = y + (j + 0.5) / N;
          const onTile = tile === "square" || (tile === "round" && roundRect(sx, sy, size, size * 0.22));
          const c = building((sx - g0) / gs, (sy - g0) / gs) ? WHITE : onTile ? ORANGE : null;
          if (c) (r += c[0]), (g += c[1]), (b += c[2]), (a += 1);
        }
      const o = (y * size + x) * 4;
      if (a) (px[o] = r / a), (px[o + 1] = g / a), (px[o + 2] = b / a), (px[o + 3] = (255 * a) / (N * N));
    }
  return png(size, px, tile === "square");
}

const out = new URL("../assets/", import.meta.url);
writeFileSync(new URL("icon.png", out), render(1024, { tile: "square", glyph: 0.5 }));
writeFileSync(new URL("adaptive-icon.png", out), render(1024, { tile: null, glyph: 0.4 })); // inside the 66% safe zone
writeFileSync(new URL("splash-icon.png", out), render(512, { tile: "round", glyph: 0.5 }));
console.log("wrote assets/icon.png, adaptive-icon.png, splash-icon.png");
