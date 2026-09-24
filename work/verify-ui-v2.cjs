const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

let browser, server;
const results = [];
const pass = s => { results.push(s); console.log('PASS ' + s); };

(async () => {
  try {
    const root = path.join(__dirname, 'bilge-defter-test');
    server = http.createServer(async (req, res) => {
      try {
        const urlPath = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html';
        const normPath = decodeURIComponent(urlPath).split('/').join(path.sep);
        const filePath = path.join(root, normPath);
        const data = await fs.readFile(filePath);
        const ext = path.extname(urlPath);
        const mime = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.webmanifest': 'application/manifest+json',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.wasm': 'application/wasm'
        }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
        res.end(data);
      } catch (err) {
        console.log('HTTP 404:', req.url);
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: 1180, height: 820 },
      hasTouch: true
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => {
      errors.push(e.message);
      console.error('PAGE ERROR:', e.message);
    });
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));

    await page.goto(origin + '/');
    await page.waitForFunction(() => typeof ready !== 'undefined' && ready);

    // 1. bilge-defter-ui Custom Element montaj kontrolü
    await page.waitForSelector('bilge-defter-ui');
    const uiTag = await page.locator('bilge-defter-ui');
    assert.ok(await uiTag.count() > 0, '<bilge-defter-ui> elementi sayfaya monte edilmedi');
    pass('Custom element <bilge-defter-ui> mounted successfully');

    // 2. Shadow DOM içindeki arayüz kontrolleri
    const shadowBrand = page.locator('bilge-defter-ui >> .brand');
    assert.match(await shadowBrand.innerText(), /Bilge Defter/);
    pass('V2.1 brand title rendered in shadow DOM');

    // 3. Menü butonları (+ Ekle, Çalışma, Sayfa, Dosya ve yedek, Ayarlar)
    const insertBtn = page.locator('bilge-defter-ui >> button[data-panel="insert"]');
    const studyBtn = page.locator('bilge-defter-ui >> button[data-panel="study"]');
    const pageBtn = page.locator('bilge-defter-ui >> button[data-panel="page"]');
    const fileBtn = page.locator('bilge-defter-ui >> button[data-panel="file"]');
    const settingsBtn = page.locator('bilge-defter-ui >> button[data-panel="settings"]');

    assert.ok(await insertBtn.isVisible(), '+ Ekle butonu görünür değil');
    assert.ok(await studyBtn.isVisible(), 'Çalışma butonu görünür değil');
    assert.ok(await pageBtn.isVisible(), 'Sayfa butonu görünür değil');
    assert.ok(await fileBtn.isVisible(), 'Dosya ve yedek butonu görünür değil');
    assert.ok(await settingsBtn.isVisible(), 'Ayarlar butonu görünür değil');
    pass('All 5 main navigation group buttons (+ Ekle, Çalışma, Sayfa, Dosya ve yedek, Ayarlar) are visible');

    // 4. Çizim araçları (Kalem, Vurgula, Silgi)
    const penBtn = page.locator('bilge-defter-ui >> button[data-v2-tool="pen"]');
    const markerBtn = page.locator('bilge-defter-ui >> button[data-v2-tool="marker"]');
    const eraserBtn = page.locator('bilge-defter-ui >> button[data-v2-tool="eraser"]');

    assert.ok(await penBtn.isVisible(), 'Kalem butonu görünür değil');
    assert.ok(await markerBtn.isVisible(), 'Vurgula butonu görünür değil');
    assert.ok(await eraserBtn.isVisible(), 'Silgi butonu görünür değil');

    // Silgiye geçiş testi
    await eraserBtn.click();
    assert.equal(await page.evaluate(() => tool), 'eraser');
    pass('Tool selection: Switching to eraser from V2.1 UI updates engine state');

    // Kaleme geri geçiş testi
    await penBtn.click();
    assert.equal(await page.evaluate(() => tool), 'pen');
    pass('Tool selection: Switching back to pen updates engine state');

    // 5. Tuval üzerinde gerçek çizim testi
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 300 && box.height > 300, 'Canvas boyutları uygun değil');

    await page.mouse.move(box.x + 100, box.y + 150);
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 180, { steps: 10 });
    await page.mouse.up();

    await page.waitForFunction(() => page() && page().strokes.length > 0);
    const strokeCount = await page.evaluate(() => page().strokes.length);
    assert.equal(strokeCount, 1);
    pass('Canvas drawing works smoothly inside V2.1 editor slot');

    // 6. Geri al (Undo) butonu testi
    const undoBtn = page.locator('bilge-defter-ui >> button[data-command="history.undo"]');
    await undoBtn.click();
    await page.waitForFunction(() => page().strokes.length === 0);
    assert.equal(await page.evaluate(() => page().strokes.length), 0);
    pass('Undo command from V2.1 UI successfully removes last stroke');

    // 7. Ayarlar paneli açılış testi (Buton temaları)
    await settingsBtn.click();
    const settingsDialog = page.locator('bilge-defter-ui >> dialog[data-panel="settings"]');
    assert.ok(await settingsDialog.evaluate(d => d.open), 'Ayarlar paneli açılmadı');
    pass('Settings panel opens with button theme configuration');

    // 8. Screenshot kaydet
    await page.screenshot({ path: path.join(__dirname, 'bilge-defter-v2-ui-verified.png'), fullPage: true });

    assert.deepEqual(errors, [], 'Sayfada beklenmeyen JavaScript hataları oluştu');
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));

  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(r => server.close(r));
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
