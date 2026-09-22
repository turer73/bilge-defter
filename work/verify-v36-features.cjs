const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = path.join(__dirname, 'bilge-defter-test');
const origin = 'http://127.0.0.1:19899';
let browser, server;
const results = [];
const pass = s => { results.push(s); console.log('PASS: ' + s); };

(async () => {
  try {
    const http = require('node:http');
    server = http.createServer(async (req, res) => {
      try {
        const n = new URL(req.url, origin).pathname.slice(1) || 'index.html';
        const file = path.join(root, n);
        const data = await fs.readFile(file);
        const ext = path.extname(n);
        const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    await new Promise(r => server.listen(19899, '127.0.0.1', r));

    browser = await chromium.launch({ headless: true });
    const c = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const p = await c.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(origin);
    await p.waitForFunction(() => typeof ready !== 'undefined' && ready);

    // 1. Check Paper Patterns (Grid, Dotted, Lined, Blank)
    await p.locator('#toolsToggle').click();
    assert.equal(await p.locator('[data-paper-pattern="lined"]').isVisible(), true);
    assert.equal(await p.locator('[data-paper-pattern="grid"]').isVisible(), true);
    assert.equal(await p.locator('[data-paper-pattern="dotted"]').isVisible(), true);
    assert.equal(await p.locator('[data-paper-pattern="blank"]').isVisible(), true);

    // Switch to grid
    await p.locator('[data-paper-pattern="grid"]').click();
    let bgImage = await p.evaluate(() => document.querySelector('.paper').style.backgroundImage);
    assert.ok(bgImage.includes('linear-gradient'), 'Grid should apply linear gradients');
    let bgSize = await p.evaluate(() => document.querySelector('.paper').style.backgroundSize);
    assert.equal(bgSize, '32px 32px');
    pass('Paper pattern: Grid successfully applies 32px 32px orthogonal grid lines');

    // Switch to dotted
    await p.locator('[data-paper-pattern="dotted"]').click();
    bgImage = await p.evaluate(() => document.querySelector('.paper').style.backgroundImage);
    assert.ok(bgImage.includes('radial-gradient'), 'Dotted pattern should use radial gradient');
    pass('Paper pattern: Dotted successfully applies radial dots');

    // Switch to blank
    await p.locator('[data-paper-pattern="blank"]').click();
    bgImage = await p.evaluate(() => document.querySelector('.paper').style.backgroundImage);
    assert.equal(bgImage, 'none', 'Blank pattern should remove background image');
    pass('Paper pattern: Blank removes background image');

    // Close tools
    await p.locator('#toolsClose').click();

    // 2. Test Pressure Sensitivity on Pen Stroke
    // Simulate high pressure stroke vs low pressure stroke
    await p.evaluate(() => {
      state.pages[0].strokes.push({
        tool: 'pen',
        color: '#173b36',
        width: 10,
        points: [{ x: 50, y: 50, p: 0.1 }, { x: 100, y: 50, p: 0.1 }]
      });
      state.pages[0].strokes.push({
        tool: 'pen',
        color: '#173b36',
        width: 10,
        points: [{ x: 50, y: 150, p: 1.0 }, { x: 100, y: 150, p: 1.0 }]
      });
      drawAll();
    });

    // Check canvas pixels around the strokes: high pressure should be wider than low pressure
    const pixelAnalysis = await p.evaluate(() => {
      const cv = document.querySelector('#canvas');
      const ctx = cv.getContext('2d');
      // Low pressure y=50: scan y from 40 to 60 at x=75
      let lowThick = 0;
      for (let y = 40; y <= 60; y++) {
        if (ctx.getImageData(75, y, 1, 1).data[3] > 100) lowThick++;
      }
      // High pressure y=150: scan y from 135 to 165 at x=75
      let highThick = 0;
      for (let y = 135; y <= 165; y++) {
        if (ctx.getImageData(75, y, 1, 1).data[3] > 100) highThick++;
      }
      return { lowThick, highThick };
    });

    assert.ok(pixelAnalysis.highThick > pixelAnalysis.lowThick, `High pressure (${pixelAnalysis.highThick}px) must be visibly thicker than low pressure (${pixelAnalysis.lowThick}px)`);
    pass(`Pressure dynamics: Light touch is ${pixelAnalysis.lowThick}px, heavy press is ${pixelAnalysis.highThick}px (visibly distinct)`);

    // 3. Test Password confirmation dialog in sync-workspace
    await p.evaluate(() => {
      window.__syncInvited = true;
      renderSyncActions();
      document.querySelector('#backupDialog').showModal();
    });
    // Wait for syncUpload to be visible
    await p.locator('#syncUpload').waitFor({ state: 'visible' });
    await p.locator('#syncUpload').click();
    assert.equal(await p.locator('#syncPassConfirmLabel').isVisible(), true, 'Confirm password field must be visible on upload');
    await p.locator('#syncPassInput').fill('password123');
    await p.locator('#syncPassConfirm').fill('differentpassword');
    await p.locator('#syncPassSubmit').click();
    assert.equal(await p.locator('#syncPassDialog').isVisible(), true, 'Dialog must stay open on mismatch');
    assert.match(await p.locator('#syncPassError').textContent(), /Parolalar eşleşmiyor/, 'Mismatch error must be displayed');
    pass('Sync security: Password confirmation correctly catches and prevents mismatched password input');

    // 4. Test O(1) media validation
    const fastCheck = await p.evaluate(() => {
      const testStroke = {
        tool: 'image',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        imageWidth: 1,
        imageHeight: 1,
        width: 100,
        color: '#173b36',
        points: [{ x: 10, y: 10 }]
      };
      const t0 = performance.now();
      const valid = validMediaStroke(testStroke);
      const t1 = performance.now();
      return { valid, durationMs: t1 - t0 };
    });
    assert.equal(fastCheck.valid, true);
    assert.ok(fastCheck.durationMs < 5, 'Validation should be instantaneous');
    pass(`Fast image validation: Validated PNG stroke in ${fastCheck.durationMs.toFixed(3)} ms without regex lag`);

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  } finally {
    await browser?.close();
    if (server) await new Promise(r => server.close(r));
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
