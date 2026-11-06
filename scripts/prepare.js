// Prépare le dossier app/ à partir de la page HTML source :
// - remplace les CDN (D3, confetti, Google Fonts) par des copies locales -> fonctionne hors ligne
// - ajoute une politique de sécurité (CSP) adaptée à Electron
// - génère l'icône de l'application (build/icon.png)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SOURCE = process.env.APP_SOURCE || path.join(ROOT, 'src', 'fusion-peridotite-app.html');
const APP = path.join(ROOT, 'app');
const NM = path.join(ROOT, 'node_modules');

// Lire la source AVANT d'effacer app/ : si elle manque, on s'arrête sans rien détruire.
if (!fs.existsSync(SOURCE)) throw new Error('Source introuvable : ' + SOURCE);
let html = fs.readFileSync(SOURCE, 'utf8');

fs.rmSync(APP, { recursive: true, force: true });
fs.mkdirSync(path.join(APP, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(APP, 'fonts', 'files'), { recursive: true });

// ---------- bibliothèques ----------
fs.copyFileSync(path.join(NM, 'd3/dist/d3.min.js'), path.join(APP, 'vendor/d3.min.js'));
fs.copyFileSync(path.join(NM, 'canvas-confetti/dist/confetti.browser.js'), path.join(APP, 'vendor/confetti.browser.js'));

// ---------- polices (sous-ensemble latin uniquement) ----------
const FONT_CSS = [
  ['bricolage-grotesque', ['latin-500', 'latin-700']],
  ['source-sans-3', ['latin-400', 'latin-600', 'latin-700', 'latin-400-italic']],
  ['jetbrains-mono', ['latin-400', 'latin-600']],
];
let fontsCss = '';
for (const [pkg, files] of FONT_CSS) {
  for (const f of files) {
    const css = fs.readFileSync(path.join(NM, '@fontsource', pkg, f + '.css'), 'utf8');
    for (const m of css.matchAll(/url\(\.\/files\/([^)]+)\)/g)) {
      fs.copyFileSync(path.join(NM, '@fontsource', pkg, 'files', m[1]), path.join(APP, 'fonts/files', m[1]));
    }
    fontsCss += css + '\n';
  }
}
fs.writeFileSync(path.join(APP, 'fonts/fonts.css'), fontsCss);

// ---------- page ----------
// La source peut citer les CDN ou déjà les copies locales : chaque remplacement est facultatif,
// et la vérification qui suit garantit qu'aucune ressource distante ne subsiste.
const replace = (pattern, value) => { html = html.replace(pattern, value); };
replace(/<link rel="preconnect"[^>]*>\s*/g, '');
replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/d3\/[^"]+"><\/script>/, '<script src="vendor/d3.min.js"></script>');
replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/canvas-confetti\/[^"]+"><\/script>/, '<script src="vendor/confetti.browser.js"></script>');
if (!html.includes('Content-Security-Policy')) replace('<meta charset="UTF-8">', `<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`);
if (/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/xmlns="[^"]*"/g, ''))) {
  const left = html.match(/https?:\/\/[^\s"')]+/g).filter(u => !u.includes('w3.org'));
  if (left.length) throw new Error('Ressources distantes restantes : ' + left.join(', '));
}
fs.writeFileSync(path.join(APP, 'index.html'), html);

// ---------- icône 512x512 (même logo que l'en-tête de la page) ----------
const S = 512, SS = 4, pad = 40;
const polys = [
  { c: [0x4f, 0x7a, 0x28], p: [[4, 7], [13, 3], [19, 9], [15, 17], [6, 15]] },
  { c: [0xa0, 0x62, 0x2a], p: [[19, 9], [27, 7], [26, 17], [15, 17]] },
  { c: [0xd2, 0x46, 0x1b], p: [[6, 15], [15, 17], [26, 17], [22, 27], [9, 26]] },
].map(o => ({ c: o.c, p: o.p.map(([x, y]) => [pad + (x - 3) / 25 * (S - 2 * pad), pad + (y - 2.5) / 25 * (S - 2 * pad)]) }));
const inside = (x, y, p) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
      const hit = polys.find(o => inside(px, py, o.p));
      if (hit) { r += hit.c[0]; g += hit.c[1]; b += hit.c[2]; a++; }
    }
    const o = y * (S * 4 + 1) + 1 + x * 4;
    if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; raw[o + 3] = 255 * a / (SS * SS); }
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/icon.png'), png);

console.log('app/ prêt :', fs.readdirSync(path.join(APP, 'fonts/files')).length, 'fichiers de police, icône générée.');
