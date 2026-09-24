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
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1180, height: 820 },
      hasTouch: true
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // 1. İlk açılışta otomatik karşılama testi
    await page.goto(origin + '/?onboarding=1');
    await page.waitForFunction(() => typeof ready !== 'undefined' && ready);

    await page.waitForSelector('bilge-defter-ui');
    pass('UI custom element mounted');

    const dialog = page.locator('bilge-defter-ui >> dialog.onboarding-dialog');
    await page.waitForFunction(() => {
      const d = document.querySelector('bilge-defter-ui')?.shadowRoot?.querySelector('dialog.onboarding-dialog');
      return d && d.open;
    });
    pass('Onboarding modal automatically opens on first visit');

    // 2. Başlık, slogan ve ilkeler kontrolü
    const title = page.locator('bilge-defter-ui >> #bdx-onboarding-title');
    assert.match(await title.innerText(), /Bilge Defter/);
    const subtitle = page.locator('bilge-defter-ui >> .onboard-subtitle');
    assert.equal(await subtitle.innerText(), 'Akıllı notlar ve çalışma planı');
    const pillars = page.locator('bilge-defter-ui >> .onboard-pillar');
    assert.equal(await pillars.count(), 3);
    pass('Branding, subtitle and 3 pillars rendered accurately');

    // 3. Adım 0: Ana Sayfa (Dashboard)
    const tab0 = page.locator('bilge-defter-ui >> button[data-onboard-step="0"]');
    assert.equal(await tab0.getAttribute('aria-selected'), 'true');
    const slide0 = page.locator('bilge-defter-ui >> #bdx-slide-0');
    assert.ok(await slide0.isVisible(), 'Slide 0 görünür değil');
    const prevBtn = page.locator('bilge-defter-ui >> button[data-onboard-action="prev"]');
    assert.ok(await prevBtn.isDisabled(), 'Geri butonu ilk adımda pasif olmalı');
    pass('Step 0 (Ana Sayfa / Dashboard) is active with disabled prev button');

    // 4. İlerleme -> Adım 1: Not Düzenleyici
    const nextBtn = page.locator('bilge-defter-ui >> button[data-onboard-action="next"]');
    await nextBtn.click();
    const tab1 = page.locator('bilge-defter-ui >> button[data-onboard-step="1"]');
    assert.equal(await tab1.getAttribute('aria-selected'), 'true');
    const slide1 = page.locator('bilge-defter-ui >> #bdx-slide-1');
    assert.ok(await slide1.isVisible(), 'Slide 1 görünür değil');
    assert.ok(!await prevBtn.isDisabled(), 'Geri butonu 2. adımda aktif olmalı');
    assert.match(await slide1.innerText(), /Basınç Duyarlı Kalem/);
    assert.match(await slide1.innerText(), /12\.000\+ Kelimelik TDK Sözlük/);
    pass('Step 1 (Not Düzenleyici) is active and displays drawing/tools highlights');

    // 5. İlerleme -> Adım 2: Çalışma Planı ve Takvim
    await nextBtn.click();
    const tab2 = page.locator('bilge-defter-ui >> button[data-onboard-step="2"]');
    assert.equal(await tab2.getAttribute('aria-selected'), 'true');
    const slide2 = page.locator('bilge-defter-ui >> #bdx-slide-2');
    assert.ok(await slide2.isVisible(), 'Slide 2 görünür değil');
    assert.ok(!await nextBtn.isVisible(), 'Son adımda İlerle butonu gizlenmeli');
    assert.match(await slide2.innerText(), /Haftalık Ders Takvimi/);
    pass('Step 2 (Çalışma Planı / Takvim) is active with planner highlights');

    // 6. Ekran görüntüsü kaydı (Onboarding açıkken)
    await page.screenshot({ path: path.join(__dirname, 'bilge-defter-onboarding-verified.png') });
    pass('Screenshot saved for visual verification');

    // 7. "Hemen Başla" butonu ile kapatma ve localStorage kontrolü
    const startBtn = page.locator('bilge-defter-ui >> button[data-onboard-action="start"]');
    await startBtn.click();
    assert.ok(!await dialog.evaluate(d => d.open), 'Modal kapanmadı');
    const seen = await page.evaluate(() => localStorage.getItem('bilge_defter_onboarding_v1'));
    assert.equal(seen, 'true', 'localStorage bilge_defter_onboarding_v1 true olarak kaydedilmedi');
    pass('Clicking "Hemen Başla" closes dialog and sets localStorage flag');

    // 8. Sayfa yenilendiğinde tekrar açılmama testi
    await page.reload();
    await page.waitForFunction(() => typeof ready !== 'undefined' && ready);
    await page.waitForTimeout(100);
    const dialogAfterReload = page.locator('bilge-defter-ui >> dialog.onboarding-dialog');
    assert.ok(!await dialogAfterReload.evaluate(d => d.open), 'Onboarding seen olmasına rağmen tekrar açıldı');
    pass('Onboarding does not pop up automatically after being seen');

    // 9. Ayarlar menüsünden tekrar açılabilme testi
    const settingsBtn = page.locator('bilge-defter-ui >> button[data-panel="settings"]');
    await settingsBtn.click();
    const guideBtn = page.locator('bilge-defter-ui >> button[data-command="study.guide"]');
    assert.ok(await guideBtn.isVisible(), 'Ayarlar panelinde Rehber & tanıtım butonu yok');
    await guideBtn.click();
    assert.ok(await dialog.evaluate(d => d.open), 'Ayarlardan rehber açılmadı');
    pass('Re-opening onboarding from Settings panel functions as expected');

    // 10. Kapatma [×] butonu kontrolü
    const closeBtn = page.locator('bilge-defter-ui >> button[data-close-onboarding]');
    await closeBtn.click();
    assert.ok(!await dialog.evaluate(d => d.open), 'Kapat butonu modalı kapatmadı');
    pass('Close button [×] successfully closes the dialog');

    assert.deepEqual(errors, [], 'Beklenmeyen JavaScript hatası oluştu');
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));

  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(r => server.close(r));
  }
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
