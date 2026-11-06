// Test de fumée (non inclus dans l'exe) : charge app/index.html dans Electron,
// parcourt les 6 étapes, relève les erreurs de console et vérifie la sauvegarde.
// Usage : npx electron scripts/smoke.js <app_dir> <dossier_captures>
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app'));
const outDir = path.resolve(process.argv[3] || path.join(__dirname, '..', '.cache', 'smoke'));
fs.mkdirSync(outDir, { recursive: true });
app.setPath('userData', path.join(outDir, 'userdata'));

const errors = [];
const wait = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  const [W, H] = (process.env.SMOKE_SIZE || "1280x720").split("x").map(Number); // résolution type projecteur
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.on('console-message', (e) => { const lvl = e.level ?? e; if (lvl === 'error' || lvl === 3) errors.push(e.message ?? String(e)); });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => errors.push(`load fail ${code} ${desc} ${url}`));
  const blocked = [];
  win.webContents.session.webRequest.onBeforeRequest((d, cb) => { if (!d.url.startsWith('file://') && !d.url.startsWith('data:') && !d.url.startsWith('devtools:')) blocked.push(d.url); cb({}); });

  await win.loadFile(path.join(appDir, 'index.html'));
  await wait(800);
  const js = s => win.webContents.executeJavaScript(s);

  const report = { libs: await js('({ d3: typeof d3, confetti: typeof confetti })') };
  report.fonts = await js(`document.fonts.ready.then(() => ['Bricolage Grotesque','Source Sans 3','JetBrains Mono'].map(f => f + ':' + document.fonts.check('16px "' + f + '"')))`);

  for (let s = 0; s <= 5; s++) {
    await js(`document.querySelector('[data-go="${s}"]').click()`);
    await wait(800);
    const visible = await js(`[...document.querySelectorAll('.page')].filter(p => !p.hidden).map(p => p.dataset.step).join(',')`);
    const svgs = await js(`document.querySelectorAll('.page:not([hidden]) svg.dia path').length`);
    report['step' + s] = { visible, diagramPaths: svgs };
    // le document ne doit pas défiler : tout tient dans la fenêtre (seuls les onglets défilent)
    report["step" + s].pageOverflow = await js("document.documentElement.scrollHeight - innerHeight");
    const tabs = await js(`[...document.querySelectorAll(".page:not([hidden]) .tab")].map(b => b.dataset.tab)`);
    if (!tabs.length) fs.writeFileSync(path.join(outDir, `step${s}.png`), (await win.webContents.capturePage()).toPNG());
    for (const t of tabs) {
      await js(`document.querySelector(".page:not([hidden]) .tab[data-tab=\\"${t}\\"]").click()`);
      await wait(250);
      fs.writeFileSync(path.join(outDir, `step${s}-${t}.png`), (await win.webContents.capturePage()).toPNG());
    }
  }

  // interactions : lancer une expérience, vérifier le tableau, le quiz
  await js(`document.querySelector('[data-go="1"]').click()`);
  await js(`document.getElementById('runBtn').click()`);
  await wait(2500);
  report.runAdded = await js(`document.querySelectorAll('#runsBody tr').length`);
  await js(`document.querySelector('[data-go="2"]').click()`);
  await js(`document.getElementById('checkPts').click()`);
  report.tableFeedback = await js(`document.getElementById('ptsFb').className`);

  // persistance : l'étape et un réglage doivent survivre au rechargement
  await js(`document.querySelector('[data-go="3"]').click(); document.getElementById('themeBtn').click();`);
  await wait(400);
  win.webContents.reload();
  await new Promise(r => win.webContents.once('did-finish-load', r));
  await wait(800);
  report.afterReload = await js(`({ step: [...document.querySelectorAll('.page')].find(p => !p.hidden)?.dataset.step, theme: document.documentElement.dataset.theme })`);

  report.consoleErrors = errors;
  report.remoteRequests = blocked;
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(errors.length || blocked.length ? 1 : 0);
});
