#!/usr/bin/env node
/**
 * Generates tray icons for Keep Me Honest.
 * Pure Node.js — no external dependencies.
 */
const { writeFileSync, mkdirSync } = require('fs');
const { deflateSync } = require('zlib');
const { join } = require('path');

// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const td = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function createPNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const rows = [];
  for (let y = 0; y < h; y++) {
    rows.push(Buffer.from([0])); // filter: none
    rows.push(rgba.subarray(y * w * 4, (y + 1) * w * 4));
  }
  const compressed = deflateSync(Buffer.concat(rows));

  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

function drawIcon(size, color) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = size / 22; // scale relative to 22px base
  const cx = (size - 1) / 2;
  const r = color[0], g = color[1], b = color[2];

  function set(x, y, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b;
    rgba[i + 3] = Math.min(255, rgba[i + 3] + a);
  }

  function disc(px, py, rad) {
    const r0 = Math.floor(rad + 1);
    for (let dy = -r0; dy <= r0; dy++) {
      for (let dx = -r0; dx <= r0; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= rad - 0.5) set(px + dx, py + dy, 255);
        else if (d < rad + 0.5) set(px + dx, py + dy, Math.round(255 * (rad + 0.5 - d)));
      }
    }
  }

  function thickLine(x1, y1, x2, y2, t) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(Math.ceil(len * 3), 1);
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      disc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, t / 2);
    }
  }

  function thickArc(acx, acy, ar, startA, endA, t) {
    const steps = Math.ceil(ar * Math.abs(endA - startA) * 3);
    for (let i = 0; i <= steps; i++) {
      const a = startA + (endA - startA) * i / steps;
      disc(acx + ar * Math.cos(a), acy + ar * Math.sin(a), t / 2);
    }
  }

  // Mic capsule
  const mw = 3 * s, mTop = 3 * s, mBot = 10 * s;
  for (let y = Math.round(mTop); y <= Math.round(mBot); y++) {
    for (let x = Math.round(cx - mw); x <= Math.round(cx + mw); x++) {
      const dx = (x - cx) / mw;
      // top cap
      if (y < mTop + mw) {
        const dy = (y - (mTop + mw)) / mw;
        if (dx * dx + dy * dy <= 1) set(x, y, 255);
      }
      // body
      else if (y <= mBot - mw) {
        if (Math.abs(dx) <= 1) set(x, y, 255);
      }
      // bottom cap
      else {
        const dy = (y - (mBot - mw)) / mw;
        if (dx * dx + dy * dy <= 1) set(x, y, 255);
      }
    }
  }

  // U-arc
  const thick = 1.3 * s;
  thickArc(cx, 8 * s, 5.2 * s, 0.15 * Math.PI, 0.85 * Math.PI, thick);

  // Stem
  thickLine(cx, 13 * s, cx, 17 * s, thick);

  // Base
  thickLine(cx - 3.5 * s, 17 * s, cx + 3.5 * s, 17 * s, thick);

  return createPNG(size, size, rgba);
}

// --- Generate ---
const dir = join(__dirname, '..', 'assets');
mkdirSync(dir, { recursive: true });

// Template icons (black — macOS inverts in dark mode)
writeFileSync(join(dir, 'trayTemplate.png'), drawIcon(22, [0, 0, 0]));
writeFileSync(join(dir, 'trayTemplate@2x.png'), drawIcon(44, [0, 0, 0]));

// Recording icons (red)
writeFileSync(join(dir, 'trayRecording.png'), drawIcon(22, [255, 59, 48]));
writeFileSync(join(dir, 'trayRecording@2x.png'), drawIcon(44, [255, 59, 48]));

console.log('Tray icons generated in assets/');
