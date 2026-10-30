const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const path = require('node:path');

const HOME = 'https://chatgpt.com/';
const BAR_HEIGHT = 64;
let win;
let tabs = [];
let activeId = null;
let nextId = 1;

function tabSnapshot() {
  return tabs.map(t => ({ id: t.id, title: t.title, url: t.view.webContents.getURL(), active: t.id === activeId, loading: t.loading }));
}
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('tabs:state', tabSnapshot());
}
function resizeActive() {
  if (!win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  const tab = tabs.find(t => t.id === activeId);
  if (tab) tab.view.setBounds({ x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) });
}
function activate(id) {
  const found = tabs.find(t => t.id === id);
  if (!found || !win) return;
  for (const t of tabs) {
    if (t.id !== id) win.contentView.removeChildView(t.view);
  }
  activeId = id;
  win.contentView.addChildView(found.view);
  resizeActive();
  found.view.webContents.focus();
  publish();
}
function createTab(url = HOME) {
  if (!win || win.isDestroyed()) return;
  const id = nextId++;
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:hexora-chatgpt',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      javascript: true
    }
  });
  const t = { id, view, title: 'ChatGPT', loading: true };
  tabs.push(t);
  const wc = view.webContents;
  wc.on('page-title-updated', (_event, title) => {
    t.title = (title || 'ChatGPT').slice(0, 64);
    publish();
  });
  wc.on('did-start-loading', () => { t.loading = true; publish(); });
  wc.on('did-stop-loading', () => { t.loading = false; publish(); });
  wc.on('did-navigate', publish);
  wc.on('did-navigate-in-page', publish);
  wc.on('render-process-gone', () => { t.title = 'Page crashed — reload'; publish(); });
  // Allow normal HTTPS popup sign-in windows. Google may nevertheless block an embedded Chromium client.
  wc.setWindowOpenHandler(({ url: popupUrl }) => {
    if (!popupUrl.startsWith('https://')) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 750,
        autoHideMenuBar: true,
        webPreferences: {
          partition: 'persist:hexora-chatgpt',
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true
        }
      }
    };
  });
  wc.loadURL(url).catch(err => { t.title = `Load failed: ${err.message}`; publish(); });
  activate(id);
  return id;
}
function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  if (index < 0 || !win) return;
  const t = tabs[index];
  win.contentView.removeChildView(t.view);
  tabs.splice(index, 1);
  t.view.webContents.close();
  if (activeId === id) {
    activeId = null;
    if (tabs.length) activate(tabs[Math.min(index, tabs.length - 1)].id);
    else createTab();
  } else publish();
}
function currentWC() { return tabs.find(t => t.id === activeId)?.view.webContents; }

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1360, height: 900, minWidth: 700, minHeight: 400,
    title: 'Hexora · ChatGPT Tabs Test',
    autoHideMenuBar: true,
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.loadFile('toolbar.html');
  win.on('resize', resizeActive);
  win.on('closed', () => { win = null; tabs = []; activeId = null; });
  win.webContents.on('did-finish-load', publish);
  createTab();
  ipcMain.handle('tabs:action', (_event, action, id) => {
    if (action === 'new') createTab();
    else if (action === 'activate') activate(id);
    else if (action === 'close') closeTab(id);
    else if (action === 'reload') currentWC()?.reload();
    else if (action === 'back' && currentWC()?.navigationHistory.canGoBack()) currentWC().navigationHistory.goBack();
    else if (action === 'forward' && currentWC()?.navigationHistory.canGoForward()) currentWC().navigationHistory.goForward();
    else if (action === 'open-external') shell.openExternal(currentWC()?.getURL() || HOME);
    publish();
  });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createTab(); });
