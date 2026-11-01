'use strict';

// Isolated Windows taskbar proof-of-concept.
// npm run demo:taskbar
// Uses its own Electron profile; never reads or writes regular Hexora tabs.
const { app, BrowserWindow, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ID_PREFIX = 'app.hexora.taskbar-demo';
app.setName('Hexora Taskbar Demo');
app.setPath('userData', path.join(app.getPath('appData'), 'hexora-taskbar-demo'));
if (process.platform === 'win32') app.setAppUserModelId(ID_PREFIX);

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}
function rounded(x, y, left, top, right, bottom, radius) {
  const cx = clamp(x, left + radius, right - radius);
  const cy = clamp(y, top + radius, bottom - radius);
  return clamp(radius + 0.5 - Math.hypot(x - cx, y - cy));
}
function disk(x, y, cx, cy, radius) {
  return clamp(radius + 0.5 - Math.hypot(x - cx, y - cy));
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const value of buf) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, payload) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([length, name, payload, checksum]);
}
function iconPng(kind) {
  const n = 256;
  const pixels = Buffer.alloc((n * 4 + 1) * n);
  const base = kind === 'workspace' ? [102, 68, 220] : [12, 153, 168];

  for (let y = 0; y < n; y++) {
    const row = y * (n * 4 + 1);
    pixels[row] = 0; // PNG scanline filter: none.
    for (let x = 0; x < n; x++) {
      const p = row + 1 + x * 4;
      const background = rounded(x, y, 18, 18, 238, 238, 48);
      if (!background) continue;
      // Subtle diagonal gradient, deep blue/purple for Workspace and cyan for Ideas.
      const gradient = (x + y) / (n * 2);
      const shade = 0.78 + gradient * 0.27;
      let r = Math.round(base[0] * shade);
      let g = Math.round(base[1] * shade);
      let b = Math.round(base[2] * shade);

      let mark = 0;
      if (kind === 'workspace') {
        // Four distinctive workspace tiles.
        mark = Math.max(
          rounded(x, y, 68, 66, 119, 117, 12),
          rounded(x, y, 136, 66, 187, 117, 12),
          rounded(x, y, 68, 134, 119, 185, 12),
          rounded(x, y, 136, 134, 187, 185, 12)
        );
      } else {
        // Lightbulb: circular light and a base, a different silhouette.
        const outer = disk(x, y, 128, 115, 50);
        const inner = disk(x, y, 128, 115, 36);
        mark = Math.max(
          clamp(outer - inner),
          rounded(x, y, 111, 154, 145, 181, 6),
          rounded(x, y, 115, 189, 141, 198, 4),
          rounded(x, y, 122, 51, 134, 59, 4),
          rounded(x, y, 64, 111, 75, 123, 4),
          rounded(x, y, 181, 111, 192, 123, 4)
        );
      }
      r = Math.round(r + (255 - r) * mark);
      g = Math.round(g + (255 - g) * mark);
      b = Math.round(b + (255 - b) * mark);
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = Math.round(background * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(pixels, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}
function pngToIco(png) {
  // Windows ICO container with a 256px embedded PNG.
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);  // icon
  header.writeUInt16LE(1, 4);  // one image
  header[6] = 0;               // 0 means 256px
  header[7] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}
function htmlFor(kind) {
  const main = kind === 'workspace';
  const title = main ? 'Hexora Workspace' : 'Hexora Ideas Lab';
  const color = main ? '#ab91ff' : '#5be6dd';
  const subtitle = main ? 'Your main Hexora window' : 'Your independent second window';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;color:#f5f4ff;background:radial-gradient(ellipse at 18% 5%,#292939,#121218 68%);font-family:Segoe UI,system-ui,sans-serif;user-select:none}' +
    'main{max-width:440px;padding:36px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.22em;color:' + color + ';text-transform:uppercase}.glyph{display:grid;place-items:center;width:64px;height:64px;border:1px solid ' + color + ';border-radius:18px;font-size:29px;color:' + color + ';margin:18px 0;background:#ffffff09;box-shadow:0 15px 50px #0005}' +
    'h1{font-size:29px;letter-spacing:-.05em;margin:0 0 5px}h2{font-size:15px;color:#b6b4c6;font-weight:400;margin:0 0 25px}p{font-size:14px;line-height:1.75;color:#d1cedf;border-top:1px solid #ffffff20;padding-top:20px}strong{color:#fff}code{color:' + color + ';font-family:Consolas,monospace}' +
    '</style></head><body><main><div class="eyebrow">Windows Taskbar · Demo</div><div class="glyph">' +
    (main ? '▦' : '✦') + '</div><h1>' + title + '</h1><h2>' + subtitle + '</h2><p><strong>Look at your Windows taskbar.</strong> This window should have its own icon and its own taskbar button. Minimize both windows, then click each icon to restore the correct one.<br><br>This test does <strong>not</strong> touch your real Hexora tabs or saved layout.</p></main></body></html>';
}
function createDemoWindow(kind, position) {
  const main = kind === 'workspace';
  const display = screen.getPrimaryDisplay().workArea;
  const width = Math.min(570, Math.max(420, Math.floor((display.width - 70) / 2)));
  const height = Math.min(430, display.height - 80);
  const png = iconPng(kind);
  const iconDir = path.join(app.getPath('userData'), 'demo-icons');
  fs.mkdirSync(iconDir, { recursive: true });
  const icoPath = path.join(iconDir, kind + '.ico');
  fs.writeFileSync(icoPath, pngToIco(png));

  const window = new BrowserWindow({
    show: false,
    x: display.x + 20 + position * (width + 18),
    y: display.y + 70,
    width,
    height,
    minWidth: 380,
    minHeight: 280,
    autoHideMenuBar: true,
    backgroundColor: '#15151e',
    title: main ? 'Hexora Workspace · Taskbar Demo' : 'Hexora Ideas Lab · Taskbar Demo',
    icon: nativeImage.createFromBuffer(png),
    skipTaskbar: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  if (process.platform === 'win32') {
    window.setAppDetails({
      appId: ID_PREFIX + '.' + kind,
      appIconPath: icoPath,
      appIconIndex: 0
    });
  }
  window.once('ready-to-show', () => window.show());
  window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlFor(kind)));
  return window;
}
app.whenReady().then(() => {
  createDemoWindow('workspace', 0);
  createDemoWindow('ideas', 1);
});
app.on('window-all-closed', () => app.quit());
