const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = (process.env.BILGE_TEST_ORIGIN||'http://100.84.251.49:18788');
const live = process.argv.includes('--live');
const root = path.join(__dirname, 'bilge-defter-test');
const results = [];
let browser;
async function session(setup) {
  const c = await browser.newContext({serviceWorkers: 'block', viewport: { width: 1180, height: 820 }, hasTouch: true, deviceScaleFactor: 1 });
  if (!live) await c.route(origin + '/**', async r => {
    const name = new URL(r.request().url()).pathname.split('/').pop() || 'index.html';
    const allowed = { 'index.html': 'text/html', 'media-workspace.js': 'application/javascript', 'planner-workspace.js': 'application/javascript', 'ui-workspace.js': 'application/javascript', 'sync-workspace.js': 'application/javascript', 'dictionary-data.js': 'application/javascript', 'dictionary-workspace.js': 'application/javascript', 'ui.css': 'text/css', 'pwa.js': 'application/javascript', 'pdf-workspace.js': 'application/javascript', 'sw.js': 'application/javascript', 'manifest.webmanifest': 'application/manifest+json' };
    if (!allowed[name]) return r.fulfill({ status: 404, body: '' });
    await r.fulfill({ body: await fs.readFile(path.join(root, name)), contentType: allowed[name] });
  });
  if (setup) await c.addInitScript(setup);
  const p = await c.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(origin + '/?v=20');
  return { c, p, errors };
}
async function ready(p) {
  await p.waitForFunction(() => document.querySelector('#saveState').textContent === 'Bu cihazda kaydedildi');
}
async function openTools(p) {
  if (!await p.locator('#toolsDialog').evaluate(d => d.open)) await p.locator('#toolsToggle').tap();
  assert.equal(await p.locator('#toolsToggle').getAttribute('aria-expanded'), 'true');
}
async function closeTools(p) {
  if (await p.locator('#toolsDialog').evaluate(d => d.open)) await p.locator('#toolsClose').click();
  await p.waitForFunction(() => document.querySelector('#toolsToggle').getAttribute('aria-expanded') === 'false');
}
async function toolAction(p, id, action = 'click') {
  await openTools(p);
  await p.locator(id)[action]();
  await closeTools(p);
}
async function pageActions(p, index) {
  if (!await p.locator('#pageSidebar').isVisible()) await p.locator('#sidebarToggle').tap();
  await p.locator('.page-menu').nth(index).tap();
  assert.equal(await p.locator('#pageDialog').isVisible(), true);
}
async function data(p) {
  return p.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('bilge-defter-test-v1', 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction('state').objectStore('state').get('app');
      q.onsuccess = () => { db.close(); resolve(q.result); };
      q.onerror = () => { db.close(); reject(q.error); };
    };
  }));
}
async function pixels(p) {
  return p.locator('#canvas').evaluate(c => {
    const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < a.length; i += 4) if (a[i]) n++;
    return n;
  });
}
async function mouseStroke(p) {
  const r = await p.locator('#canvas').boundingBox();
  await p.mouse.move(r.x + 90, r.y + 110);
  await p.mouse.down();
  await p.mouse.move(r.x + 230, r.y + 180, { steps: 15 });
  await p.mouse.up();
  await ready(p);
}
async function pointer(p, events) {
  await p.locator('#canvas').evaluate((c, list) => {
    const r = c.getBoundingClientRect();
    for (const e of list) {
      const ev = new PointerEvent(e.type, {
        bubbles: true, cancelable: true, pointerId: e.id || 31,
        pointerType: e.kind || 'pen', isPrimary: true, button: 0,
        buttons: e.type === 'pointerup' ? 0 : 1, pressure: 0.5,
        clientX: r.x + e.x, clientY: r.y + e.y
      });
      if (e.empty) Object.defineProperty(ev, 'getCoalescedEvents', { value: () => [] });
      c.dispatchEvent(ev);
    }
  }, events);
}
(async () => {
  browser = await chromium.launch({ headless: true });
  const { c, p, errors } = await session();
  await ready(p);
  assert.equal(await p.evaluate(() => isSecureContext), origin.startsWith('https:'));
  assert.equal(await p.evaluate(() => typeof crypto.randomUUID), origin.startsWith('https:') ? 'function' : 'undefined');
  assert.equal(await p.locator('#pages .page-item').count(), 1);
  assert.match(await p.locator('.badge').innerText(), /v38/);
  assert.equal((await data(p)).pages.length, 1);
  results.push(origin.startsWith('https:') ? 'HTTPS secure context and randomUUID: first page created and committed' : 'HTTP + missing randomUUID: first page created and committed');
  const beforeTools = await p.locator('#canvas').boundingBox();
  const beforeToolsData = await data(p);
  assert.equal(await p.locator('#toolsDialog').isVisible(), false);
  assert.equal(await p.locator('.workspace [data-tool]').count(), 0);
  await openTools(p);
  assert.deepEqual(await p.locator('#canvas').boundingBox(), beforeTools);
  for (const id of ['color', 'width', 'penOnly', 'undo', 'clearPage', 'exportBtn', 'importBtn', 'searchBtn']) {
    assert.equal(await p.locator('#toolsDialog #' + id).isVisible(), true);
  }
  const toolGroup = p.getByRole('group', { name: 'Çizim araçları' });
  assert.equal(await toolGroup.getByRole('button').count(), 3);
  assert.ok((await toolGroup.boundingBox()).width <= 150);
  for (const name of ['Fosforlu', 'Silgi', 'Kalem']) {
    const button = toolGroup.getByRole('button', { name, exact: true });
    const box = await button.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44);
    await button.tap();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    assert.equal(await toolGroup.locator('[aria-pressed="true"]').count(), 1);
    assert.equal(await toolGroup.locator('.active').count(), 1);
  }
  results.push('Compact three-icon group retains 44px touch targets and one visibly/accessibly selected tool');
  for (const width of [1, 2, 4, 8, 12]) {
    const choice = p.locator(`[data-width="${width}"]`);
    await choice.tap();
    assert.equal(await p.locator('#width').inputValue(), String(width));
    assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke-width'), String(width));
    assert.equal(await choice.getAttribute('aria-pressed'), 'true');
    assert.equal(await p.locator('[data-width][aria-pressed="true"]').count(), 1);
  }
  await p.locator('#width').focus();
  await p.keyboard.press('ArrowRight');
  assert.equal(await p.locator('#width').inputValue(), '13');
  assert.equal(await p.locator('[data-width][aria-pressed="true"]').count(), 0);
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke-width'), '13');
  await p.locator('#color').fill('#be123c');
  await p.getByRole('button', { name: 'Fosforlu', exact: true }).tap();
  await p.locator('[data-width="8"]').tap();
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke-width'), '20');
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('opacity'), '0.25');
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke'), '#be123c');
  assert.equal(await p.locator('#widthValue').innerText(), 'Fosforlu · 20 px');
  await p.locator('#toolsDone').tap();
  assert.deepEqual(await p.locator('#canvas').boundingBox(), beforeTools);
  await mouseStroke(p);
  const previewStroke = (await data(p)).pages[0].strokes[0];
  assert.equal(previewStroke.width, 20); assert.equal(previewStroke.tool, 'marker'); assert.equal(previewStroke.color, '#be123c');
  await toolAction(p, '#undo'); await ready(p);
  await openTools(p);
  await p.getByRole('button', { name: 'Silgi', exact: true }).tap();
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke-width'), '12');
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('opacity'), '1');
  assert.equal(await p.locator('#widthPreviewLine').getAttribute('stroke'), '#657973');
  await p.getByRole('button', { name: 'Kalem', exact: true }).tap();
  await p.locator('#color').fill('#173b36');
  await p.locator('[data-width="4"]').tap();
  await p.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-tools-live.png' : 'bilge-defter-v38-tools-local.png'), fullPage: true });
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.querySelector('#toolsToggle').getAttribute('aria-expanded') === 'false');
  assert.equal(await p.locator('#toolsToggle').evaluate(e => e === document.activeElement), true);
  await openTools(p);
  await p.mouse.click(30, beforeTools.y + 30);
  await p.waitForFunction(() => !document.querySelector('#toolsDialog').open);
  assert.deepEqual(await p.locator('#canvas').boundingBox(), beforeTools);
  assert.deepEqual((await data(p)).pages[0].strokes, beforeToolsData.pages[0].strokes);
  results.push('Five selectable width samples, custom slider, color and marker opacity match actual saved stroke; eraser preview uses real width');
  results.push('Edge tools dialog contains all previous controls; Done, Escape and outside click close without canvas shifts or stray ink');
  assert.equal(await p.locator('#pageSidebar').isVisible(), false);
  const beforePanel = await p.locator('#canvas').boundingBox();
  await p.locator('#sidebarToggle').click();
  assert.equal(await p.locator('#sidebarToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await p.locator('#pageSidebar').isVisible(), true);
  assert.deepEqual(await p.locator('#canvas').boundingBox(), beforePanel);
  await p.mouse.move(beforePanel.x + 350, beforePanel.y + 110);
  await p.mouse.down();
  assert.equal(await p.locator('#pageSidebar').isVisible(), false);
  assert.equal(await p.locator('#sidebarToggle').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(await p.locator('#canvas').boundingBox(), beforePanel);
  await p.mouse.move(beforePanel.x + 490, beforePanel.y + 180, { steps: 10 });
  await p.mouse.up(); await ready(p);
  const firstStroke = (await data(p)).pages[0].strokes[0];
  assert.equal(firstStroke.points[0].x, 350);
  assert.equal(firstStroke.points[0].y, 110);
  assert.ok(await pixels(p) > 200);
  await toolAction(p, '#undo'); await ready(p);
  await p.locator('#sidebarToggle').click();
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('#pageSidebar').isVisible(), false);
  results.push('Sidebar auto-hides on first stroke without moving canvas or dropping initial coordinates; toggle and Escape work');
  await mouseStroke(p);
  const written = await data(p);
  const firstPixels = await pixels(p);
  assert.ok(firstPixels > 200);
  assert.equal(written.pages[0].strokes.length, 1);
  await p.reload(); await ready(p);
  assert.deepEqual(await data(p), written);
  assert.equal(await pixels(p), firstPixels);
  results.push('Actual mouse drag paints canvas; IndexedDB and pixels survive reload');
  await toolAction(p, '#penOnly', 'check');
  await pointer(p, [
    { type: 'pointerdown', x: 280, y: 130 },
    { type: 'pointermove', x: 320, y: 170, empty: true },
    { type: 'pointerdown', id: 32, kind: 'touch', x: 380, y: 220 },
    { type: 'pointerup', id: 32, kind: 'touch', x: 380, y: 220 },
    { type: 'pointermove', x: 380, y: 150 },
    { type: 'pointerup', x: 420, y: 190 }
  ]);
  await ready(p);
  const pen = (await data(p)).pages[0].strokes[1];
  assert.equal(pen.points.length, 4);
  assert.equal(pen.points[1].x, 320);
  assert.equal(pen.points[3].x, 420);
  assert.ok(await pixels(p) > firstPixels);
  results.push('Synthetic pen draws; empty coalesced array handled; separate palm pointer cannot end pen stroke');
  await toolAction(p, '#penOnly', 'uncheck');
  await pointer(p, [{ type: 'pointerdown', kind: 'touch', x: 460, y: 180 }, { type: 'pointermove', kind: 'touch', x: 500, y: 210 }, { type: 'pointerup', kind: 'touch', x: 540, y: 230 }]);
  await ready(p);
  assert.equal((await data(p)).pages[0].strokes.length, 3);
  results.push('Synthetic touch-compatible stylus writes with palm filter off');
  await toolAction(p, '#undo'); await ready(p);
  assert.equal((await data(p)).pages[0].strokes.length, 2);
  await p.locator('#sidebarToggle').click();
  await p.locator('#newPage').click(); await ready(p);
  assert.equal(await p.locator('#pageSidebar').isVisible(), false);
  let d = await data(p);
  assert.equal(d.pages.length, 2);
  assert.notEqual(d.pages[0].id, d.pages[1].id);
  assert.equal(await pixels(p), 0);
  await p.locator('#sidebarToggle').click();
  await p.getByRole('button', { name: 'Sayfa 1', exact: true }).click(); await ready(p);
  assert.equal(await p.locator('#pageSidebar').isVisible(), false);
  assert.ok(await pixels(p) > firstPixels);
  await p.reload(); await ready(p);
  assert.equal((await data(p)).active, d.pages[0].id);
  results.push('Undo, second-page creation and selected-page persistence work on the tested origin');
  const downloadP = p.waitForEvent('download');
  await toolAction(p, '#exportBtn');
  const download = await downloadP;
  const backup = await fs.readFile(await download.path());
  const exported = JSON.parse(backup);
  assert.equal(exported.pages[0].strokes.length, 2);
  await toolAction(p, '#undo'); await ready(p);
  await p.locator('#importFile').setInputFiles({ name: 'test-backup.json', mimeType: 'application/json', buffer: backup });
  await p.locator('#backupApply').click();
  await p.waitForFunction(() => document.querySelector('#saveState').textContent === 'Yedek geri yüklendi');
  assert.deepEqual((await data(p)).pages, exported.pages);
  await p.reload(); await ready(p);
  assert.deepEqual((await data(p)).pages, exported.pages);
  results.push('Downloaded JSON backup restores real strokes and survives reload');
  const beforeClear = await data(p);
  const pixelsBeforeClear = await pixels(p);
  p.once('dialog', dialog => dialog.dismiss());
  await toolAction(p, '#clearPage');
  assert.deepEqual(await data(p), beforeClear);
  assert.equal(await pixels(p), pixelsBeforeClear);
  p.once('dialog', dialog => dialog.accept());
  await toolAction(p, '#clearPage'); await ready(p);
  assert.equal((await data(p)).pages[0].strokes.length, 0);
  assert.equal(await pixels(p), 0);
  assert.deepEqual((await data(p)).pages[1], beforeClear.pages[1]);
  await p.locator('#sidebarToggle').click();
  await p.getByRole('button', { name: 'Sayfa 2', exact: true }).click(); await ready(p);
  await toolAction(p, '#undo'); await ready(p);
  assert.equal((await data(p)).pages[1].strokes.length, 0);
  await p.locator('#sidebarToggle').click();
  await p.getByRole('button', { name: 'Sayfa 1', exact: true }).click(); await ready(p);
  await mouseStroke(p);
  await toolAction(p, '#undo'); await ready(p);
  assert.equal((await data(p)).pages[0].strokes.length, 0);
  await toolAction(p, '#undo'); await ready(p);
  assert.deepEqual((await data(p)).pages[0].strokes, beforeClear.pages[0].strokes);
  assert.equal(await pixels(p), pixelsBeforeClear);
  results.push('Clear requires confirmation, affects only current page, and can be undone after page switching and a new stroke');
  const beforeBad = await data(p);
  p.once('dialog', dialog => dialog.accept());
  await p.locator('#importFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"pages":[]}') });
  await p.waitForFunction(() => !document.querySelector('#importFile').value);
  assert.deepEqual(await data(p), beforeBad);
  assert.deepEqual(errors, []);
  results.push('Malformed backup cannot replace saved pages; no page errors in normal flow');
  const beforeSearch = await data(p);
  const beforeSearchPixels = await pixels(p);
  await pointer(p, [
    { type: 'pointerdown', x: 450, y: 260 }, { type: 'pointerup', x: 450, y: 260 },
    { type: 'pointerdown', x: 451, y: 260 }, { type: 'pointerup', x: 451, y: 260 }
  ]);
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), false);
  await pointer(p, [{ type: 'pointerdown', x: 450, y: 261 }, { type: 'pointerup', x: 450, y: 261 }]);
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), false);
  await ready(p);
  const tapped = (await data(p)).pages[0].strokes;
  assert.equal(tapped.length, beforeSearch.pages[0].strokes.length + 3);
  assert.deepEqual(tapped.slice(0, -3), beforeSearch.pages[0].strokes);
  assert.ok(await pixels(p) > beforeSearchPixels);
  for (let i = 0; i < 3; i++) { await toolAction(p, '#undo'); await ready(p); }
  assert.deepEqual((await data(p)).pages[0].strokes, beforeSearch.pages[0].strokes);
  assert.equal(await pixels(p), beforeSearchPixels);
  await toolAction(p, '#searchBtn', 'tap');
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), true);
  assert.equal(await p.locator('#searchQuery').evaluate(e => getComputedStyle(e).userSelect), 'text');
  await p.locator('#searchQuery').fill('   ');
  await p.getByRole('button', { name: 'Google’da ara', exact: true }).click();
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), true);
  await p.locator('#cancelSearch').click();
  results.push('Repeated pen taps stay as ink without opening search; only the explicit search button opens the dialog');
  // Intercept the external search so this verification never sends a real query to Google.
  await c.route('https://www.google.com/search**', route => route.fulfill({ contentType: 'text/html', body: '<title>Intercepted search</title>' }));
  await toolAction(p, '#searchBtn');
  await p.locator('#searchQuery').fill('os temporale');
  const popupP = p.waitForEvent('popup');
  await p.getByRole('button', { name: 'Google’da ara', exact: true }).click();
  const popup = await popupP;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(new URL(popup.url()).searchParams.get('q'), 'os temporale');
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  await popup.close();
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), false);
  results.push('Search requires user-entered text and explicit submit; opens isolated tab with correct query (intercepted)');
  await toolAction(p, '#penOnly', 'check');
  for (let i = 0; i < 3; i++) await pointer(p, [{ type: 'pointerdown', kind: 'touch', x: 480, y: 240 }, { type: 'pointerup', kind: 'touch', x: 480, y: 240 }]);
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), false);
  assert.deepEqual((await data(p)).pages[0].strokes, beforeSearch.pages[0].strokes);
  await toolAction(p, '#penOnly', 'uncheck');
  await pointer(p, [{ type: 'pointerdown', x: 480, y: 240 }]);
  await p.waitForTimeout(400);
  await pointer(p, [{ type: 'pointerup', x: 480, y: 240 }]);
  await ready(p);
  assert.equal(await p.locator('#webSearch').evaluate(d => d.open), false);
  await toolAction(p, '#undo'); await ready(p);
  assert.deepEqual((await data(p)).pages[0].strokes, beforeSearch.pages[0].strokes);
  results.push('Repeated palm contacts and long pen press do not open search');
  // Long-press prevention must include rejected palms, without breaking toolbar touch.
  const beforeTouch = await data(p);
  await toolAction(p, '#penOnly', 'check');
  const blocked = await p.locator('#canvas').evaluate(canvas => {
    const result = { selection: getComputedStyle(canvas).userSelect };
    for (const type of ['contextmenu', 'selectstart', 'dragstart', 'touchstart', 'touchmove']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      canvas.dispatchEvent(event); result[type] = event.defaultPrevented;
    }
    const palm = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 50, pointerType: 'touch' });
    canvas.dispatchEvent(palm); result.palmDefault = palm.defaultPrevented;
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 50, pointerType: 'touch' }));
    const control = document.querySelector('#width');
    const event = new Event('touchstart', { bubbles: true, cancelable: true });
    control.dispatchEvent(event); result.toolbarTouchBlocked = event.defaultPrevented;
    return result;
  });
  assert.equal(blocked.selection, 'none');
  for (const type of ['contextmenu', 'selectstart', 'dragstart', 'touchstart', 'touchmove', 'palmDefault']) assert.equal(blocked[type], true);
  assert.equal(blocked.toolbarTouchBlocked, false);
  assert.deepEqual(await data(p), beforeTouch);
  await openTools(p);
  const checkbox = await p.locator('#penOnly').boundingBox();
  await p.touchscreen.tap(checkbox.x + checkbox.width / 2, checkbox.y + checkbox.height / 2);
  assert.equal(await p.locator('#penOnly').isChecked(), false);
  const markerButton = p.getByRole('button', { name: 'Fosforlu', exact: true });
  const buttonBox = await markerButton.boundingBox();
  await p.touchscreen.tap(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  assert.match(await markerButton.getAttribute('class'), /active/);
  await p.getByRole('button', { name: 'Kalem', exact: true }).click();
  await closeTools(p);
  results.push('Writing surface cancels selection/callout events including rejected palms; toolbar taps still work');
  // A real browser touch stream must still reach Pointer Events after touchstart is cancelled.
  const cdp = await p.context().newCDPSession(p);
  const paper = await p.locator('#canvas').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: paper.x + 100, y: paper.y + 260 }] });
  await p.waitForTimeout(1200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: paper.x + 250, y: paper.y + 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ready(p);
  const held = await data(p);
  assert.equal(held.pages[0].strokes.length, beforeTouch.pages[0].strokes.length + 1);
  assert.ok(held.pages[0].strokes.at(-1).points.length >= 2);
  assert.equal(await p.evaluate(() => window.getSelection().toString()), '');
  await toolAction(p, '#undo'); await ready(p);
  // Undo changes the updated timestamp, so compare document content here.
  assert.deepEqual((await data(p)).pages[0].strokes, beforeTouch.pages[0].strokes);
  const beforeAbort = await data(p);
  assert.deepEqual(errors, []);
  results.push('Browser touch held for 1.2 seconds still draws and saves, with no selected text');

  await p.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-live.png' : 'bilge-defter-v38-local.png'), fullPage: true });
  await p.locator('#sidebarToggle').click();
  await p.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-panel-live.png' : 'bilge-defter-v38-panel-local.png'), fullPage: true });
  await p.locator('#sidebarClose').click();
  // A commit that aborts must not be reported as a successful save.
  await p.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) {
      const request = original.apply(this, args); this.transaction.abort(); return request;
    };
  });
  await toolAction(p, '#undo');
  await p.waitForFunction(() => document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));
  assert.deepEqual(await data(p), beforeAbort);
  results.push('Aborted IndexedDB transaction shows save failure and leaves prior saved data intact');
  await c.close();
  const mobile = await session();
  await ready(mobile.p);
  await mobile.p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await mobile.p.locator('#toolsDialog').isVisible(), false);
  await openTools(mobile.p);
  const toolsBox = await mobile.p.locator('#toolsDialog').boundingBox();
  assert.ok(toolsBox.x >= 0 && toolsBox.x + toolsBox.width <= 390 && toolsBox.y >= 0 && toolsBox.y + toolsBox.height <= 844);
  for (const name of ['Kalem', 'Fosforlu', 'Silgi']) {
    const box = await mobile.p.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390);
  }
  const searchBox = await mobile.p.locator('#searchBtn').boundingBox();
  assert.ok(searchBox.x >= 0 && searchBox.x + searchBox.width <= 390);
  await mobile.p.locator('#searchBtn').tap();
  assert.equal(await mobile.p.locator('#webSearch').evaluate(d => d.open), true);
  await mobile.p.locator('#cancelSearch').tap();
  await mobile.p.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-narrow-live.png' : 'bilge-defter-v38-narrow-local.png'), fullPage: true });
  await openTools(mobile.p);
  await mobile.p.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-narrow-tools-live.png' : 'bilge-defter-v38-narrow-tools-local.png'), fullPage: true });
  await mobile.p.setViewportSize({ width: 844, height: 390 });
  const rotatedBox = await mobile.p.locator('#toolsDialog').boundingBox();
  assert.ok(rotatedBox.y >= 0 && rotatedBox.y + rotatedBox.height <= 390);
  assert.equal(await mobile.p.locator('#toolsDialog').evaluate(d => d.scrollWidth <= d.clientWidth), true);
  await mobile.p.locator('#toolsDone').tap();
  assert.equal(await mobile.p.locator('#toolsDialog').isVisible(), false);
  await mobile.p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await mobile.p.locator('#pageSidebar').isVisible(), false);
  const mobileToggle = await mobile.p.locator('#sidebarToggle').boundingBox();
  await mobile.p.touchscreen.tap(mobileToggle.x + mobileToggle.width / 2, mobileToggle.y + mobileToggle.height / 2);
  assert.equal(await mobile.p.locator('#pageSidebar').isVisible(), true);
  const mobilePanel = await mobile.p.locator('#pageSidebar').boundingBox();
  assert.ok(mobilePanel.x >= 0 && mobilePanel.x + mobilePanel.width <= 390);
  await mobile.p.locator('#newPage').click(); await ready(mobile.p);
  assert.equal((await data(mobile.p)).pages.length, 2);
  assert.equal(await mobile.p.locator('#pageSidebar').isVisible(), false);
  await mobile.p.locator('#sidebarToggle').click();
  await mobile.p.getByRole('button', { name: 'Sayfa 1', exact: true }).click(); await ready(mobile.p);
  assert.equal(await mobile.p.locator('#pageSidebar').isVisible(), false);
  assert.equal(await mobile.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(mobile.errors, []);
  await mobile.c.close();
  results.push('Narrow 390px touch viewport can open, create and switch pages; panel closes automatically');
  const management = await session();
  const q = management.p;
  await ready(q);
  const quick = q.locator('#quickTool');
  assert.equal(await quick.getAttribute('aria-label'), 'Silgiye geç');
  await mouseStroke(q);
  const quickPixels = await pixels(q);
  const quickWritten = await data(q);
  await quick.tap();
  assert.equal(await quick.getAttribute('data-current'), 'eraser');
  assert.equal(await quick.getAttribute('aria-label'), 'Kaleme geç');
  assert.equal(await q.locator('#toolsDialog').isVisible(), false);
  assert.equal(await q.locator('[data-tool="eraser"]').getAttribute('aria-pressed'), 'true');
  await openTools(q);
  await q.locator('[data-width="12"]').tap();
  await q.locator('#width').focus(); await q.keyboard.press('ArrowRight'); await q.keyboard.press('ArrowRight');
  assert.equal(await q.locator('#width').inputValue(), '14');
  await closeTools(q);
  await quick.tap();
  assert.equal(await q.locator('#width').inputValue(), '4');
  await openTools(q); await q.locator('[data-width="2"]').tap(); await closeTools(q);
  await quick.tap();
  assert.equal(await q.locator('#width').inputValue(), '14');
  await mouseStroke(q);
  assert.ok(await pixels(q) < quickPixels);
  const erased = (await data(q)).pages[0].strokes.at(-1);
  assert.equal(erased.tool, 'eraser'); assert.equal(erased.width, 14);
  await toolAction(q, '#undo'); await ready(q);
  assert.equal(await pixels(q), quickPixels);
  await quick.tap();
  assert.equal(await q.locator('#width').inputValue(), '2');
  await pointer(q, [{ type: 'pointerdown', x: 400, y: 120 }]);
  await quick.tap();
  assert.equal(await quick.getAttribute('data-current'), 'pen');
  await pointer(q, [{ type: 'pointermove', x: 450, y: 160 }, { type: 'pointerup', x: 490, y: 180 }]); await ready(q);
  assert.equal((await data(q)).pages[0].strokes.at(-1).tool, 'pen');
  await toolAction(q, '#undo'); await ready(q);
  await openTools(q); await q.getByRole('button', { name: 'Fosforlu', exact: true }).tap(); await closeTools(q);
  await quick.tap(); assert.equal(await quick.getAttribute('data-current'), 'eraser');
  await quick.tap(); assert.equal(await quick.getAttribute('data-current'), 'pen');
  assert.deepEqual((await data(q)).pages[0].strokes, quickWritten.pages[0].strokes);
  results.push('Quick pen/eraser switch keeps independent widths, actually erases, syncs tools UI and ignores switching during an active stroke');
  await pageActions(q, 0);
  assert.equal(await q.locator('#deletePage').isDisabled(), true);
  assert.equal(await q.locator('#movePageUp').isDisabled(), true);
  assert.equal(await q.locator('#movePageDown').isDisabled(), true);
  await q.locator('#pageName').fill('   ');
  await q.getByRole('button', { name: 'Adı kaydet', exact: true }).click();
  assert.equal(await q.locator('#pageDialog').isVisible(), true);
  assert.equal((await data(q)).pages[0].title, 'Sayfa 1');
  await q.locator('#pageName').fill('Vazgeçilen ad');
  await q.keyboard.press('Escape');
  assert.equal((await data(q)).pages[0].title, 'Sayfa 1');
  await pageActions(q, 0);
  await q.locator('#pageName').fill('Anatomi <b>not</b>');
  await q.getByRole('button', { name: 'Adı kaydet', exact: true }).click(); await ready(q);
  assert.equal(await q.locator('#pages b').count(), 0);
  assert.equal((await data(q)).pages[0].title, 'Anatomi <b>not</b>');
  await pageActions(q, 0); await q.locator('#pageName').fill('Anatomi');
  await q.getByRole('button', { name: 'Adı kaydet', exact: true }).click(); await ready(q);
  await q.reload(); await ready(q);
  assert.equal((await data(q)).pages[0].title, 'Anatomi');
  results.push('Page rename rejects blank text, cancellation preserves title, renders markup as plain text and survives reload');
  const source = (await data(q)).pages[0];
  await pageActions(q, 0); await q.locator('#duplicatePage').tap(); await ready(q);
  const copied = await data(q);
  assert.equal(copied.pages.length, 2); assert.equal(copied.active, copied.pages[1].id);
  assert.notEqual(copied.pages[1].id, source.id); assert.equal(copied.pages[1].title, 'Anatomi (kopya)');
  assert.deepEqual(copied.pages[1].strokes, source.strokes);
  assert.equal(await q.locator('#pageSidebar').isVisible(), false);
  await toolAction(q, '#undo'); await ready(q);
  assert.equal((await data(q)).pages[1].strokes.length, 0);
  assert.deepEqual((await data(q)).pages[0].strokes, source.strokes);
  await mouseStroke(q);
  assert.deepEqual((await data(q)).pages[0].strokes, source.strokes);
  await pageActions(q, 0); await q.locator('#duplicatePage').tap(); await ready(q);
  const twiceCopied = await data(q);
  assert.equal(new Set(twiceCopied.pages.map(p => p.title)).size, 3);
  assert.equal(new Set(twiceCopied.pages.map(p => p.id)).size, 3);
  const keptId = twiceCopied.active;
  const keptPixels = await pixels(q);
  await pageActions(q, 0); await q.locator('#movePageDown').tap(); await ready(q);
  assert.equal((await data(q)).pages[1].id, source.id);
  assert.equal((await data(q)).active, keptId);
  assert.equal(await pixels(q), keptPixels);
  await pageActions(q, 1); await q.locator('#movePageUp').tap(); await ready(q);
  assert.equal((await data(q)).pages[0].id, source.id);
  await pageActions(q, 2);
  assert.equal(await q.locator('#movePageDown').isDisabled(), true);
  q.once('dialog', d => d.dismiss()); await q.locator('#deletePage').click();
  assert.equal((await data(q)).pages.length, 3);
  q.once('dialog', d => d.accept()); await q.locator('#deletePage').click(); await ready(q);
  assert.equal((await data(q)).pages.length, 2);
  assert.equal((await data(q)).active, keptId);
  const managed = await data(q);
  await q.reload(); await ready(q);
  assert.deepEqual(await data(q), managed);
  results.push('Page copies have independent strokes and unique names/IDs; reorder preserves selection and ink; deletion is confirmed and last page is protected');
  const managedDownloadP = q.waitForEvent('download'); await toolAction(q, '#exportBtn');
  const managedBackup = await fs.readFile(await (await managedDownloadP).path());
  await pageActions(q, 0); await q.locator('#pageName').fill('Geçici ad');
  await q.getByRole('button', { name: 'Adı kaydet', exact: true }).click(); await ready(q);
  await openTools(q);
  const chooserP = q.waitForEvent('filechooser'); await q.locator('#importBtn').click();
  const chooser = await chooserP;
  await chooser.setFiles({ name: 'pages-backup.json', mimeType: 'application/json', buffer: managedBackup });
  await q.locator('#backupApply').click();
  await q.waitForFunction(() => document.querySelector('#saveState').textContent === 'Yedek geri yüklendi');
  await closeTools(q); await q.reload(); await ready(q);
  assert.deepEqual((await data(q)).pages, managed.pages);
  assert.equal((await data(q)).active, managed.active);
  results.push('Real import button file chooser restores renamed/reordered/copied pages and strokes from downloaded JSON backup');
  await q.locator('#sidebarToggle').tap();
  await q.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-management-live.png' : 'bilge-defter-v38-management-local.png'), fullPage: true });
  await pageActions(q, 0);
  await q.setViewportSize({ width: 390, height: 844 });
  const pageDialogBox = await q.locator('#pageDialog').boundingBox();
  assert.ok(pageDialogBox.x >= 0 && pageDialogBox.x + pageDialogBox.width <= 390);
  await q.screenshot({ path: path.join(__dirname, live ? 'bilge-defter-v38-page-dialog-live.png' : 'bilge-defter-v38-page-dialog-local.png'), fullPage: true });
  await q.locator('#pageDialogClose').tap();
  await q.locator('#sidebarClose').tap();
  const quickBox = await quick.boundingBox();
  assert.ok(quickBox.width >= 44 && quickBox.height >= 44 && quickBox.x + quickBox.width <= 390);
  await quick.tap(); assert.equal(await quick.getAttribute('data-current'), 'eraser');
  await quick.tap(); assert.equal(await quick.getAttribute('data-current'), 'pen');
  assert.deepEqual(management.errors, []);
  await management.c.close();
  const unavailable = await session(() => {
    Object.defineProperty(window, 'indexedDB', { value: { open() { throw new Error('Simulated storage unavailable'); } } });
  });
  await unavailable.p.waitForFunction(() => document.querySelector('#saveState').textContent.includes('Kayıt açılamadı'));
  await pointer(unavailable.p, [{ type: 'pointerdown', x: 200, y: 150 }, { type: 'pointermove', x: 250, y: 180 }, { type: 'pointerup', x: 280, y: 200 }]);
  await unavailable.p.locator('#sidebarToggle').click();
  await unavailable.p.locator('#newPage').click();
  await unavailable.p.locator('#sidebarClose').click();
  await toolAction(unavailable.p, '#undo');
  assert.deepEqual(unavailable.errors, []);
  assert.match(await unavailable.p.locator('#saveState').innerText(), /Kayıt açılamadı/);
  results.push('Unavailable storage blocks drawing cleanly, without cascaded errors or stuck saving');
  await unavailable.c.close();
  console.log(JSON.stringify({ mode: live ? 'live' : 'local-files-on-HTTP-origin', passed: results.length, results, physicalTabletTest: 'pending' }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
