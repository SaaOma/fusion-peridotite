const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Une seule instance : un second lancement remet la fenêtre existante au premier plan.
if (!app.requestSingleInstanceLock()) { app.quit(); }

app.setAppUserModelId('ma.svt.fusion-peridotite');

const boundsFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() {
  try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); } catch { return {}; }
}
function saveBounds(win) {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(boundsFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

let win;
function createWindow() {
  const saved = loadBounds();
  win = new BrowserWindow({
    width: saved.width || 1366,
    height: saved.height || 860,
    x: saved.x, y: saved.y,
    minWidth: 380, minHeight: 500,
    title: 'Fusion de la péridotite',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#f2f3ef',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveBounds(win));

  // La page ne doit jamais quitter l'application : les liens externes s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });

  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

const menu = Menu.buildFromTemplate([
  { label: 'Fichier', submenu: [{ role: 'quit', label: 'Quitter' }] },
  {
    label: 'Affichage',
    submenu: [
      { role: 'reload', label: 'Recharger' },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Zoom avant', accelerator: 'CmdOrCtrl+=' },
      { role: 'zoomOut', label: 'Zoom arrière' },
      { role: 'resetZoom', label: 'Taille réelle' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Plein écran' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Outils de développement' }]),
    ],
  },
]);

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  createWindow();
});
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.on('window-all-closed', () => app.quit());
