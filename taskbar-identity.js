'use strict';
// Windows taskbar identities for real Hexora BrowserWindows.
// Each detached tab has a persistent AppUserModelID, so Windows can display
// its window separately from the primary Hexora taskbar button.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const APP_ID = 'app.hexora.workspace';
const PALETTE = [
  [9, 153, 166],   // Teal
  [54, 105, 232],  // Blue
  [221, 92, 121],  // Rose
  [225, 141, 49],  // Amber
  [100, 99, 231],  // Indigo
  [68, 168, 125],  // Emerald
  [177, 82, 208],  // Orchid
  [210, 84, 78]    // Coral
];

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
function rounded(x, y, left, top, right, bottom, radius) {
  const cx = clamp(x, left + radius, right - radius);
  const cy = clamp(y, top + radius, bottom - radius);
  return clamp(radius + 0.5 - Math.hypot(x - cx, y - cy));
}
function disk(x, y, cx, cy, radius) {
  return clamp(radius + 0.5 - Math.hypot(x - cx, y - cy));
}
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function pngBytes(kind, id) {
  const n = 256;
  const pixels = Buffer.alloc((n * 4 + 1) * n);
  const main = kind === 'main';
  const color = main ? [110, 73, 216] : PALETTE[(id - 1) % PALETTE.length];
  for (let y = 0; y < n; y++) {
    const row = y * (n * 4 + 1);
    pixels[row] = 0; // Scanline has no PNG filter.
    for (let x = 0; x < n; x++) {
      const pixel = row + 1 + x * 4;
      const bg = rounded(x, y, 17, 17, 239, 239, 46);
      if (!bg) continue;
      const shade = 0.81 + 0.25 * (x + y) / 512;
      let mark;
      if (main) {
        // The main window's recognizable four-tile Hexora mark.
        mark = Math.max(
          rounded(x, y, 66, 66, 119, 119, 12),
          rounded(x, y, 137, 66, 190, 119, 12),
          rounded(x, y, 66, 137, 119, 190, 12),
          rounded(x, y, 137, 137, 190, 190, 12)
        );
      } else {
        // Detached windows use a distinct H/portal symbol.
        // The small indicator changes with the tab identity.
        mark = Math.max(
          rounded(x, y, 69, 75, 93, 184, 9),
          rounded(x, y, 163, 75, 187, 184, 9),
          rounded(x, y, 91, 118, 165, 143, 7),
          disk(x, y, 198, 55, 6 + (id % 3) * 2)
        );
      }
      for (let channel = 0; channel < 3; channel++) {
        const base = color[channel] * shade;
        pixels[pixel + channel] = Math.round(base + (250 - base) * mark);
      }
      pixels[pixel + 3] = Math.round(bg * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // 8-bit samples
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function icoBytes(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(1, 4); // One image
  header[6] = 0; // 256 pixels
  header[7] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}
function iconFile(userData, kind, id) {
  const folder = path.join(userData, 'taskbar-icons');
  const filename = kind === 'main' ? 'hexora-main-v1.ico' : 'hexora-tab-' + id + '-v1.ico';
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, filename);
  if (!fs.existsSync(target)) fs.writeFileSync(target, icoBytes(pngBytes(kind, id)));
  return target;
}
function taskbarIdentity(userData, tabId = null) {
  if (process.platform !== 'win32') return null;
  const kind = tabId === null ? 'main' : 'tab';
  const id = kind === 'main' ? 0 : Number(tabId);
  if (kind === 'tab' && (!Number.isSafeInteger(id) || id < 1)) throw Error('Invalid taskbar window tab');
  return {
    appId: kind === 'main' ? APP_ID : APP_ID + '.tab.' + id,
    iconPath: iconFile(userData, kind, id)
  };
}
function applyTaskbarIdentity(window, identity) {
  if (!identity || process.platform !== 'win32' || window.isDestroyed()) return;
  // Windows recognizes different taskbar groups via per-window AppUserModelIDs.
  window.setAppDetails({ appId: identity.appId, appIconPath: identity.iconPath, appIconIndex: 0 });
  // Explicitly update the live HWND's small/large icon too.
  window.setIcon(identity.iconPath);
}
module.exports = { APP_ID, taskbarIdentity, applyTaskbarIdentity };
