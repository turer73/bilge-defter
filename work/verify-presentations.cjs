'use strict';
// Browser contract tests only: mocked account and conversion endpoints, synthetic deck bytes.
// The returned one-slide PDF is valid and is rendered by the actual bundled PDF.js. These tests
// do not prove LibreOffice fidelity, production auth, physical iPad input or real PPT/PPTX parsing.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');

const releaseVersion = JSON.parse(fs.readFileSync(path.join(__dirname, 'bilge-defter-test/release.json'), 'utf8')).version;
assert.match(releaseVersion, /^v\d+$/);
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-invited-' + releaseVersion));
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build the current release before running presentation tests: ' + root);
const out = path.resolve(process.env.BILGE_TEST_OUTPUT || path.join(__dirname, '../outputs/presentations'));
const accountId = '11111111-1111-4111-8111-111111111111';
const changedId = '22222222-2222-4222-8222-222222222222';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PPT = 'application/vnd.ms-powerpoint';
const pptx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(600, 7)]);
const ppt = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600, 7)]);
const results = [];
const servers = new Set();
const startedAt = new Date().toISOString();
fs.mkdirSync(out, {recursive: true});

function slidePdfBytes(pageCount = 1) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({length: pageCount}, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`
  ];
  for (let i = 0; i < pageCount; i++) {
    // Distinct, reproducible pages: retain the original pixel probe and add a
    // seven-bit page marker. A 100-page test must not reuse two identical images.
    const marker = Array.from({length: 7}, (_, bit) =>
      `${(i + 1) & (1 << bit) ? '0 0 0' : '.8 .8 .8'} rg ${30 + bit * 35} 30 25 25 re f`).join('\n');
    const content = `${i % 2 ? '1 0 0' : '0 0 1'} rg 100 100 300 200 re f\n${marker}`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 540] /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let text = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, i) => { offsets.push(text.length); text += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(text, 'latin1');
}
const slidePdf = slidePdfBytes();
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const pass = name => { results.push(name); console.log('PASS ' + name); };
const posts = fixture => fixture.calls.filter(call => call.method === 'POST');
const memory = page => page.evaluate(() => JSON.stringify(state));
const stored = page => page.evaluate(() => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE), request = tx.objectStore(STORE).get('app');
  request.onsuccess = () => resolve(JSON.stringify(request.result));
  request.onerror = () => reject(request.error);
}));
const settled = page => page.waitForFunction(() => !isDirty() && !savePromise, null, {timeout: 20000});

async function fixture(browser, options = {}) {
  const calls = [], errors = [], hold = deferred(), reached = deferred();
  const errorStreamStarted = deferred(), errorStreamClosed = deferred();
  const errorStreamState = {chunksSent: 0, bytesSent: 0, ended: false, closed: false};
  let servingRoot = path.resolve(options.root || root);
  let identityChanged = false;
  // WebKit's interception API omits File bodies. A loopback mock observes the real raw upload
  // in both engines, without replacing fetch or assuming that a File was transmitted correctly.
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/v1/bilge-defter/pdf-tools/convert') {
      response.writeHead(404); response.end(); return;
    }
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', async () => {
      calls.push({method: 'POST', path: 'convert', headers: request.headers, body: Buffer.concat(chunks)});
      reached.resolve();
      if (options.holdConvert) await hold.promise;
      if (response.destroyed) return;
      if (options.errorStream) {
        // Real loopback HTTP chunks, deliberately without Content-Length. EOF
        // can be withheld to prove the client bounds/cancels a response rather
        // than succeeding only because our mock helpfully closes the stream.
        const config = options.errorStream;
        response.on('close', () => { errorStreamState.closed = true; errorStreamClosed.resolve(); });
        response.writeHead(config.status || 422, {'Content-Type': config.contentType || 'application/json'});
        response.flushHeaders();
        for (const part of config.chunks) {
          if (response.destroyed) break;
          const bytes = Buffer.from(part);
          response.write(bytes); errorStreamState.chunksSent++; errorStreamState.bytesSent += bytes.length;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        errorStreamStarted.resolve();
        if (config.hold) await hold.promise;
        if (!response.destroyed) {
          if (config.disconnect) response.destroy();
          else { errorStreamState.ended = true; response.end(); }
        }
        return;
      }
      response.writeHead(options.responseCode || 200, {
        'Content-Type': options.jsonResponse ? 'application/json' : options.html ? 'text/html' : 'application/pdf', 'X-Bilge-Pdf-Result': 'converted'
      });
      response.end(options.jsonResponse ? JSON.stringify(options.jsonResponse) : options.html ? '<html>login</html>' : options.badPdf ? Buffer.from('not a PDF') : options.slideCount ? slidePdfBytes(options.slideCount) : slidePdf);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  servers.add(server);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({
    viewport: options.mobile ? {width: 390, height: 844} : {width: 1180, height: 820},
    hasTouch: true, serviceWorkers: 'block', acceptDownloads: true
  });
  await context.addInitScript(({origin, required}) => {
    if (location.origin !== origin) return;
    window.__accountRequired = required;
    localStorage.setItem('bilge_defter_onboarding_v1', 'true');
  }, {origin, required: options.required !== false});
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.endsWith('/whoami')) return route.fulfill({json: {
      account_protocol: 'approval-v1',
      identity: {type: 'access', id: identityChanged ? changedId : accountId, status: 'approved', email: 'synthetic@example.test', role: 'student'}
    }});
    if (url.pathname.endsWith('/pdf-tools/status')) {
      calls.push({method: 'GET', path: 'status', headers: request.headers()});
      if (options.holdStatus) { reached.resolve(); await hold.promise; }
      return route.fulfill({status: options.statusCode || 200, json: {
        configured: options.enabled !== false,
        operations: options.noConvert ? ['compress'] : ['compress', 'convert'],
        consent_required: true, max_input_bytes: options.backendLimit || 20 * 1024 * 1024,
        max_slides: options.maxSlides || 100,
        worker_state: options.workerState || 'ready'
      }}).catch(() => {});
    }
    if (url.pathname.endsWith('/pdf-tools/convert')) {
      return route.continue();
    }
    if (url.pathname.includes('/api/')) return route.fulfill({status: 404, body: '{}'});
    const file = path.resolve(servingRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(servingRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status: 404, body: 'missing'});
    if (options.withoutReopenGuard && url.pathname.endsWith('/pdf-workspace.js')) {
      // Test-only negative control: restore the old close-listener behavior without editing disk.
      const source = fs.readFileSync(file, 'utf8'), guard = 'if(pdfDialog.open)return;';
      assert.equal(source.split(guard).length - 1, 1, 'the exact reopen guard must exist once before removing it');
      return route.fulfill({contentType: 'application/javascript', body: source.replace(guard, '')});
    }
    return route.fulfill({path: file});
  });
  const page = await context.newPage();
  await page.goto(origin);
  await page.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI, null, {timeout: 20000});
  if (options.seedInk) {
    await page.locator('#canvas').evaluate(canvas => {
      const r = canvas.getBoundingClientRect();
      for (const [type, dx] of [['pointerdown', 0], ['pointermove', 40], ['pointerup', 80]]) canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 17, pointerType: 'pen', clientX: r.x + 120 + dx, clientY: r.y + 120, pressure: .5
      }));
    });
    await page.waitForFunction(() => page().strokes.length > 0);
  }
  await page.evaluate(() => flushSave());
  await settled(page);
  const beforeMemory = await memory(page), beforeStored = await stored(page);
  const open = async () => {
    // HTMLDialogElement.close dispatches its close event asynchronously; wait for its cleanup.
    await page.waitForFunction(() => canEdit() && pdfPending === null && !pdfBusy);
    if (options.actualUI) {
      const ui = page.locator('bilge-defter-ui');
      await ui.locator('button[data-panel="insert"]').click();
      await ui.locator('#pptxOtherOptions > summary').click();
      await ui.locator('button[data-command="presentation.open"]').click();
    } else await page.evaluate(() => document.querySelector('#presentationOpen').click());
    await page.locator('#pdfDialog[open]').waitFor();
  };
  await open();
  const choose = async (name = 'ozel-ogrenci-sunum.pptx', buffer = pptx, mimeType = PPTX) => {
    await page.locator('#pdfPresentationFile').setInputFiles({name, mimeType, buffer});
    await page.waitForFunction(() => /seçildi|doğrulanamadı|20 MB|\.pptx|onaylı|desteklenmiyor|boş olmayan/.test(document.querySelector('#pdfProgress').textContent));
  };
  const consent = async () => { await page.locator('#pdfPresentationAgree').check(); await page.locator('#pdfPresentationSend').click(); };
  // The button is prepared before PDF.js worker cleanup completes. Wait for the
  // actual interactive state; a hidden input write must not bypass busy controls.
  const readyToApply = () => page.waitForFunction(() => !pdfBusy && !document.querySelector('#pdfApply').disabled, null, {timeout: 60000});
  const unchanged = async () => {
    assert.equal(await memory(page), beforeMemory, 'pending/cancelled import must not mutate notebook memory');
    assert.equal(await stored(page), beforeStored, 'pending/cancelled import must not mutate stored notebook');
  };
  const finish = async ({changed = false} = {}) => {
    hold.resolve();
    if (!changed) await unchanged();
    assert.deepEqual(errors, [], 'no uncaught page errors');
    await context.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    servers.delete(server);
  };
  return {context, page, calls, errors, open, choose, consent, readyToApply, unchanged, finish,
    beforeMemory, beforeStored,
    errorStreamState, errorStreamStarted: errorStreamStarted.promise, errorStreamClosed: errorStreamClosed.promise,
    switchRoot: next => {
      const candidate = path.resolve(next);
      assert.ok(fs.existsSync(path.join(candidate, 'index.html')), 'missing reader package: ' + candidate);
      servingRoot = candidate;
    },
    reached: reached.promise, release: () => hold.resolve(), changeIdentity: () => { identityChanged = true; }};
}

async function immediatelyReopenAndChoose(fixture) {
  return fixture.page.evaluate(async bytes => {
    let observed;
    const closed = new Promise(resolve => pdfDialog.addEventListener('close', () => {
      observed = {openAtOldClose: pdfDialog.open}; resolve();
    }, {once: true}));
    // Keep these operations in one JS task: the native old close event cannot be delivered
    // between close(), reopening and the new selection's first synchronous instructions.
    pdfDialog.close();
    document.querySelector('#presentationOpen').click();
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'hemen-yeni-sunum.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }));
    const input = document.querySelector('#pdfPresentationFile'); input.files = transfer.files;
    const selection = input.onchange();
    await Promise.all([closed, selection]);
    return {...observed, open: pdfDialog.open, consentShown: !document.querySelector('#pdfPresentationConsent').hidden,
      checked: document.querySelector('#pdfPresentationAgree').checked,
      message: document.querySelector('#pdfProgress').textContent};
  }, Array.from(pptx));
}
function assertNewSelectionSurvives(result) {
  assert.equal(result.openAtOldClose, true, 'the actual native close event must arrive after immediate reopen');
  assert.equal(result.open, true);
  assert.equal(result.consentShown, true, 'an old close event must not discard the newly selected presentation');
  assert.equal(result.checked, false);
  assert.match(result.message, /hemen-yeni-sunum\.pptx seçildi/);
}

async function run(browser, engine) {
  const ok = name => pass(`${engine}: ${name}`);
  {
    const f = await fixture(browser, {actualUI: true});
    ok('actual shadow-DOM Ekle > PowerPoint aç menu opens the import dialog');
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    await f.choose();
    assert.equal(f.calls.length, 0, 'opening and selection must not contact conversion API');
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(await f.page.locator('#pdfPresentationSend').isDisabled(), true);
    await f.page.locator('#pdfPresentationAgree').check();
    await f.choose('diger-sunum.pptx');
    await f.page.waitForFunction(() => !document.querySelector('#pdfPresentationAgree').checked);
    assert.equal(await f.page.locator('#pdfPresentationSend').isDisabled(), true);
    ok('selection stays local; a different deck resets explicit consent');
    await f.consent(); await f.readyToApply(); await f.unchanged();
    assert.equal(posts(f).length, 1);
    assert.equal(f.calls[0].path, 'status');
    const sent = posts(f)[0];
    assert.deepEqual(sent.body, pptx);
    assert.equal(sent.headers['content-type'], PPTX);
    assert.equal(sent.headers['x-bilge-pdf-consent'], '1');
    assert.equal(sent.headers['x-bilge-account'], accountId);
    assert.equal(sent.headers['x-bilge-request'], '1');
    assert.ok(!JSON.stringify(sent.headers).includes('diger-sunum'), 'source filename must not be transmitted in headers');
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.match(await f.page.locator('#pdfProgress').textContent(), /1 slayt hazır/);
    assert.equal(await f.page.locator('#presentationPreview').isVisible(), true);
    assert.equal(await f.page.locator('#presentationPreviewCount').textContent(), 'Slayt 1 / 1');
    await f.page.waitForFunction(() => document.querySelector('#presentationPreviewImage').naturalWidth === 1000);
    const pixel = await f.page.locator('#presentationPreviewImage').evaluate(image => {
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 750;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(300, 450, 1, 1).data);
    });
    // v70+ may store the rendered slide as JPEG; allow its small color-rounding error.
    assert.ok(pixel[0] < 5 && pixel[1] < 5 && pixel[2] > 245 && pixel[3] === 255, 'PDF.js must render the fixture content, not a blank slide');
    assert.equal(await f.page.locator('#presentationPreviewPrevious').isDisabled(), true);
    assert.equal(await f.page.locator('#presentationPreviewNext').isDisabled(), true);
    await f.page.locator('#presentationPreview').scrollIntoViewIfNeeded();
    await f.page.screenshot({path: path.join(out, `${engine}-presentation-pending-desktop.png`)});
    ok('approved upload uses raw bytes and consent/account headers; real PDF.js stages one slide without a notebook write');
    await f.page.locator('#pdfApply').click();
    await f.page.waitForFunction(() => !document.querySelector('#pdfDialog').open && pdfBackgroundReady() && canEdit());
    const slide = await f.page.evaluate(() => ({book: notebookTitle(activeNotebook), pdf: page().pdf, count: state.pages.length, id: page().id}));
    assert.equal(slide.book, 'diger-sunum');
    assert.equal(slide.pdf.name, 'diger-sunum.pptx');
    assert.equal(await f.page.evaluate(() => page().title), 'Sunum · Slayt 1');
    assert.deepEqual([slide.pdf.number, slide.pdf.total, slide.pdf.width, slide.pdf.height], [1, 1, 1000, 750]);
    assert.ok(slide.pdf.image.startsWith('data:image/'));
    await f.page.locator('#canvas').evaluate(canvas => {
      const r = canvas.getBoundingClientRect();
      for (const [type, dx] of [['pointerdown', 0], ['pointermove', 40], ['pointerup', 80]]) canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', clientX: r.x + 120 + dx, clientY: r.y + 120, pressure: .5
      }));
    });
    await f.page.waitForFunction(() => page().strokes.length > 0);
    await f.page.evaluate(() => flushSave()); await settled(f.page);
    const strokes = await f.page.evaluate(() => JSON.stringify(page().strokes));
    await f.page.reload();
    await f.page.waitForFunction(() => typeof ready !== 'undefined' && ready && pdfBackgroundReady());
    assert.equal(await f.page.evaluate(() => page().id), slide.id);
    assert.equal(await f.page.evaluate(() => JSON.stringify(page().strokes)), strokes);
    assert.equal(await f.page.evaluate(() => page().pdf.image), slide.pdf.image);
    const event = f.page.waitForEvent('download');
    await f.page.evaluate(() => exportNotebook());
    const download = await event, file = path.join(out, `${engine}-presentation-backup.json`);
    await download.saveAs(file);
    const backup = JSON.parse(fs.readFileSync(file, 'utf8')), restoredSlide = backup.pages.find(p => p.id === slide.id);
    assert.equal(backup.backupFormat, 'bilge-defter');
    assert.equal(restoredSlide.pdf.image, slide.pdf.image);
    assert.equal(JSON.stringify(restoredSlide.strokes), strokes);
    assert.ok(!JSON.stringify(backup).includes('"image":"asset:'), 'JSON backup must embed images, not device-local asset references');
    assert.equal(await f.page.evaluate(book => validState(parseBackup(book).book), backup), true);
    await f.page.screenshot({path: path.join(out, `${engine}-presentation-applied.png`)});
    ok('Apply creates a separate 4:3 slide notebook; pen ink, image, reload and self-contained JSON backup preserve content');
    await f.finish({changed: true});
  }
  for (const input of [
    {name: 'legacy.ppt', buffer: ppt, mimeType: PPT},
    {name: 'renamed.pptx', buffer: slidePdf},
    {name: 'notes.docx', buffer: pptx},
    {name: 'empty.pptx', buffer: Buffer.alloc(0)},
    {name: 'oversized.pptx', buffer: Buffer.concat([pptx, Buffer.alloc(20 * 1024 * 1024)])}
  ]) {
    const f = await fixture(browser);
    await f.choose(input.name, input.buffer, input.mimeType || PPTX);
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(f.calls.length, 0);
    ok(`invalid input rejected locally with no upload: ${input.name}`);
    await f.finish();
  }
  for (const options of [{enabled: false}, {noConvert: true}, {statusCode: 404}, {workerState: 'unknown'}]) {
    const f = await fixture(browser, options);
    await f.choose(); await f.consent();
    await f.page.waitForFunction(() => !pdfBusy && /eklenmedi|açılmadı|kullanılamıyor/.test(document.querySelector('#pdfProgress').textContent));
    assert.equal(posts(f).length, 0);
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    ok(`backend fails closed: ${JSON.stringify(options)}`);
    await f.finish();
  }
  {
    const f = await fixture(browser, {slideCount: 2});
    await f.choose(); await f.consent(); await f.readyToApply(); await f.unchanged();
    assert.equal(await f.page.locator('#presentationPreviewCount').textContent(), 'Slayt 1 / 2');
    const first = await f.page.locator('#presentationPreviewImage').getAttribute('src');
    assert.equal(await f.page.locator('#presentationPreviewPrevious').isDisabled(), true);
    await f.page.locator('#presentationPreviewNext').click();
    assert.equal(await f.page.locator('#presentationPreviewCount').textContent(), 'Slayt 2 / 2');
    assert.notEqual(await f.page.locator('#presentationPreviewImage').getAttribute('src'), first);
    assert.equal(await f.page.locator('#presentationPreviewNext').isDisabled(), true);
    await f.page.locator('#presentationPreviewPrevious').click();
    assert.equal(await f.page.locator('#presentationPreviewImage').getAttribute('src'), first);
    await f.page.locator('#pdfClose').click();
    await f.page.waitForFunction(() => canEdit() && pdfPending === null);
    assert.ok(await f.page.locator('#presentationPreviewImage').getAttribute('src') === null, 'closing must drop the staged preview image reference');
    await f.open();
    assert.equal(await f.page.locator('#presentationPreview').isVisible(), false);
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    ok('two real PDF.js slide previews navigate before Apply and cancellation removes the image reference');
    await f.finish();
  }
  {
    const f = await fixture(browser, {required: false});
    await f.choose();
    assert.match(await f.page.locator('#pdfProgress').textContent(), /onaylı|hesap/);
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.equal(f.calls.length, 0);
    ok('account-free local mode cannot upload a presentation');
    await f.finish();
  }
  for (const options of [{html: true}, {badPdf: true}, {responseCode: 422}, {responseCode: 429}, {responseCode: 503}]) {
    const f = await fixture(browser, options);
    await f.choose(); await f.consent();
    await f.page.waitForFunction(() => !pdfBusy && /eklenmedi/.test(document.querySelector('#pdfProgress').textContent));
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(await f.page.locator('#pdfChoose').isDisabled(), false);
    ok(`failed conversion leaves existing notes untouched: ${JSON.stringify(options)}`);
    await f.finish();
  }
  {
    const f = await fixture(browser);
    await f.choose('onceki-sunum.pptx');
    const result = await immediatelyReopenAndChoose(f);
    assertNewSelectionSurvives(result); await f.unchanged();
    assert.equal(f.calls.length, 0);
    await f.consent(); await f.readyToApply(); await f.unchanged();
    assert.equal(await f.page.evaluate(() => pdfPending.title), 'hemen-yeni-sunum');
    await f.page.locator('#pdfApply').click();
    await f.page.waitForFunction(() => !pdfDialog.open && !pdfBusy && pdfBackgroundReady());
    assert.equal(await f.page.evaluate(() => notebookTitle(activeNotebook)), 'hemen-yeni-sunum');
    assert.equal(await f.page.evaluate(() => page().pdf.name), 'hemen-yeni-sunum.pptx');
    assert.equal(posts(f).length, 1);
    await settled(f.page);
    ok('native close immediately followed by reopen preserves the new PPTX selection and applies that new import');
    await f.finish({changed: true});
  }
  {
    const f = await fixture(browser, {withoutReopenGuard: true});
    await f.choose('onceki-sunum.pptx');
    const result = await immediatelyReopenAndChoose(f);
    assert.equal(result.openAtOldClose, true);
    assert.equal(result.open, true);
    assert.equal(result.consentShown, false, 'old behavior must reproduce actual loss of the new selection');
    assert.throws(() => assertNewSelectionSurvives(result), {name: 'AssertionError'});
    assert.equal(f.calls.length, 0);
    ok('negative control: removing only the reopen guard reproduces loss of the new selection on the native old close event');
    await f.finish();
  }
  {
    const f = await fixture(browser);
    const result = await f.page.evaluate(async bytes => {
      let observed;
      const closed = new Promise(resolve => pdfDialog.addEventListener('close', () => {
        observed = {openAtOldClose: pdfDialog.open}; resolve();
      }, {once: true}));
      pdfDialog.close();
      document.querySelector('#presentationOpen').click();
      const importing = importPdfFile(new File([new Uint8Array(bytes)], 'hemen-yeni-cihaz.pdf', {type: 'application/pdf'}));
      await Promise.all([closed, importing]);
      return {...observed, open: pdfDialog.open, title: pdfPending?.title || null,
        disabled: document.querySelector('#pdfApply').disabled};
    }, Array.from(slidePdf));
    assert.deepEqual(result, {openAtOldClose: true, open: true, title: 'hemen-yeni-cihaz', disabled: false});
    await f.unchanged();
    await f.page.locator('#pdfApply').click();
    await f.page.waitForFunction(() => !pdfDialog.open && !pdfBusy && pdfBackgroundReady());
    assert.equal(await f.page.evaluate(() => page().pdf.name), 'hemen-yeni-cihaz.pdf');
    assert.equal(f.calls.length, 0);
    ok('native close immediately followed by reopen cannot cancel a new device-PDF render or its Apply');
    await f.finish({changed: true});
  }
  {
    const f = await fixture(browser, {holdConvert: true});
    await f.choose(); await f.consent(); await f.reached;
    assert.equal(await f.page.evaluate(() => canEdit()), false);
    await f.page.locator('#pdfClose').click(); await f.open();
    f.release(); await f.page.waitForTimeout(350);
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.equal(await f.page.evaluate(() => pdfBusy), false);
    ok('close and reopen invalidate a delayed conversion; no stale result or late notebook write');
    await f.finish();
  }
  {
    const f = await fixture(browser, {holdConvert: true});
    await f.choose(); await f.consent(); await f.reached;
    await f.page.locator('#pdfClose').click(); await f.open();
    await f.page.locator('#pdfFile').setInputFiles({name: 'cihaz.pdf', mimeType: 'application/pdf', buffer: slidePdf});
    await f.readyToApply(); f.release(); await f.page.waitForTimeout(350);
    assert.equal(await f.page.evaluate(() => pdfPending.title), 'cihaz');
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(await f.page.evaluate(() => pdfPending.pages[0].pdf.name), 'cihaz.pdf');
    ok('device PDF selected after cancellation wins over a late presentation response');
    await f.finish();
  }
  {
    const f = await fixture(browser);
    await f.page.locator('#pdfFile').setInputFiles({name: 'ilk.pdf', mimeType: 'application/pdf', buffer: slidePdf});
    await f.readyToApply();
    await f.choose();
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.evaluate(() => pdfPending), null);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(f.calls.length, 0);
    ok('choosing a presentation invalidates a staged device PDF before any upload');
    await f.finish();
  }
  {
    const f = await fixture(browser);
    await f.choose(); await f.consent(); await f.readyToApply();
    await f.page.locator('#pdfFile').setInputFiles({name: 'yenisi.pdf', mimeType: 'application/pdf', buffer: slidePdf});
    await f.page.waitForFunction(() => !document.querySelector('#pdfApply').disabled && pdfPending?.title === 'yenisi');
    assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), false);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(await f.page.evaluate(() => pdfPending.pages[0].pdf.name), 'yenisi.pdf');
    ok('a device PDF replaces a staged presentation and clears consent');
    await f.finish();
  }
  for (const during of ['status', 'convert']) {
    const f = await fixture(browser, during === 'status' ? {holdStatus: true} : {holdConvert: true});
    await f.choose(); await f.consent(); await f.reached;
    await f.context.setOffline(true); f.release(); await f.page.waitForTimeout(350);
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
    assert.equal(await f.page.evaluate(() => pdfBusy), false);
    if (during === 'status') assert.equal(posts(f).length, 0);
    ok(`going offline during ${during} cancels pending work without automatic upload or a late result`);
    await f.finish();
  }
  {
    const f = await fixture(browser);
    await f.choose(); await f.page.locator('#pdfPresentationAgree').check(); f.changeIdentity();
    await f.page.locator('#pdfPresentationSend').click();
    await f.page.locator('#accountGate[open]').waitFor();
    assert.equal(posts(f).length, 0);
    assert.equal(await f.page.locator('#pdfDialog').isVisible(), false);
    ok('identity change detected during preflight locks the page before upload');
    await f.finish();
  }
  {
    const f = await fixture(browser, {holdConvert: true});
    await f.choose(); await f.consent(); await f.reached;
    f.changeIdentity(); await f.page.evaluate(() => window.BilgeAccount.check());
    await f.page.locator('#accountGate[open]').waitFor();
    f.release(); await f.page.waitForTimeout(350);
    assert.equal(await f.page.locator('#pdfDialog').isVisible(), false);
    assert.equal(await f.page.evaluate(() => pdfPending), null);
    assert.equal(await f.page.evaluate(() => pdfBusy), false);
    ok('account lock while conversion is pending discards the response and protects stored notes');
    await f.finish();
  }
  {
    const f = await fixture(browser, {mobile: true});
    await f.choose();
    const bounds = await f.page.locator('#pdfDialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391, 'dialog must fit a 390px viewport');
    assert.equal(await f.page.evaluate(() => { const d = document.querySelector('#pdfDialog'); return d.scrollWidth <= d.clientWidth; }), true);
    await f.page.locator('#pdfPresentationSend').scrollIntoViewIfNeeded();
    assert.equal(await f.page.locator('#pdfPresentationSend').isVisible(), true);
    await f.page.screenshot({path: path.join(out, `${engine}-presentation-mobile.png`)});
    await f.consent(); await f.readyToApply();
    await f.page.waitForFunction(() => document.querySelector('#presentationPreviewImage').naturalWidth === 1000);
    assert.equal(await f.page.locator('#presentationPreview').isVisible(), true);
    assert.equal(await f.page.evaluate(() => { const d = document.querySelector('#pdfDialog'); return d.scrollWidth <= d.clientWidth; }), true);
    await f.page.locator('#pdfApply').scrollIntoViewIfNeeded();
    await f.page.screenshot({path: path.join(out, `${engine}-presentation-pending-mobile.png`)});
    ok('390px dialog keeps consent and action controls reachable without horizontal clipping');
    await f.finish();
  }
}

async function main() {
  let failed = null;
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      const browser = await engine.launch({headless: true});
      try { await run(browser, name); } finally { await browser.close(); }
    }
  } catch (error) { failed = error.stack || String(error); throw error; }
  finally {
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    fs.writeFileSync(path.join(out, 'presentation-contract-tests.json'), JSON.stringify({
      passed: results.length, failed: failed ? 1 : 0, failure: failed, results,
      startedAt, completedAt: new Date().toISOString(), testedRoot: root,
      mockedApi: true, syntheticDecks: true, actualBundledPdfJs: true, physicalDevice: false,
      realLibreOfficeConversion: false, productionAuthentication: false
    }, null, 2));
  }
  console.log(JSON.stringify({passed: results.length, failed: 0, mockedApi: true, physicalDevice: false}));
}

module.exports = {fixture, slidePdfBytes, pptx, PPTX, memory, stored, settled, servers, root, out};
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
