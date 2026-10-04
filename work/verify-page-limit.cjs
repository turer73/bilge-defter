'use strict';
// Local synthetic regressions. Real bundled PDF.js, real IndexedDB and downloads;
// mocked identity/conversion, no user presentation, LibreOffice or physical iPad.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const {chromium, webkit} = require('playwright');
const {fixture, slidePdfBytes, memory, stored, settled, servers, root} = require('./verify-presentations.cjs');
const output = path.resolve(process.env.BILGE_PAGE_LIMIT_OUTPUT || path.join(__dirname, '../outputs/page-limit'));
const rollbackRoot = path.resolve(process.env.BILGE_TEST_ROLLBACK_ROOT || path.join(__dirname, 'bilge-defter-invited-v74'));
const realPdf = process.env.BILGE_REAL_PDF ? path.resolve(process.env.BILGE_REAL_PDF) : null;
const results = [], measurements = [], startedAt = new Date().toISOString();
const selected = new Set((process.env.BILGE_PAGE_LIMIT_CASES || '').split(',').filter(Boolean));
const enabled = name => !selected.size || selected.has(name);
fs.mkdirSync(output, {recursive: true});

function pdfFromObjects(objects) {
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  let size = chunks[0].length;
  objects.forEach((object, index) => {
    const bytes = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from('\nendobj\n')]);
    offsets.push(size); chunks.push(bytes); size += bytes.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

function imageHeavyPdf(pageCount) {
  // One deterministic RGB raster shared by all pages keeps the input below
  // 20 MiB; each real PDF.js page render still consumes the 24 MiB image budget.
  const pixels = Buffer.alloc(720 * 540 * 3);
  let value = 0x12345678;
  for (let i = 0; i < pixels.length; i++) {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    pixels[i] = value & 255;
  }
  const compressed = zlib.deflateSync(pixels);
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({length: pageCount}, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 720 /Height 540 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from('\nendstream')])];
  for (let i = 0; i < pageCount; i++) {
    const content = `q 720 0 0 540 0 0 cm /Noise Do Q\n1 1 1 rg ${i * 3} 30 4 8 re f`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 540] /Resources << /XObject << /Noise 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  return pdfFromObjects(objects);
}

async function uploadPdf(f, count, buffer = slidePdfBytes(count)) {
  await f.page.locator('#pdfFile').setInputFiles({name: `sentetik-${count}.pdf`, mimeType: 'application/pdf', buffer});
}

async function addInk(page) {
  const before = await page.evaluate(() => page().strokes.length);
  await page.locator('#canvas').evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    for (const [type, dx] of [['pointerdown', 0], ['pointermove', 30], ['pointerup', 60]]) canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 37, pointerType: 'pen', pressure: .5,
      clientX: rect.x + 100 + dx, clientY: rect.y + 110
    }));
  });
  await page.waitForFunction(before => page().strokes.length > before, before);
  await page.evaluate(() => flushSave()); await settled(page);
}

async function selectLast(page) {
  // Use the real page button callback (old chrome is hidden by UI v2), not a
  // direct state rewrite. This runs the application's navigation/save path.
  await page.locator('#pages .page-item').last().locator('button').first().evaluate(button => button.click());
  await page.waitForFunction(() => pdfBackgroundReady() && page().pdf.number === page().pdf.total);
  await page.evaluate(() => flushSave()); await settled(page);
}

async function pagesDigest(page) {
  return page.evaluate(async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(state.pages)))), b => b.toString(16).padStart(2, '0')).join(''));
}

async function restore(page, book) {
  await page.locator('#importFile').setInputFiles({name: 'sentetik-yedek.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(book))});
  await page.locator('#backupDialog[open]').waitFor();
  await page.locator('#backupApply').click();
  await page.waitForFunction(() => !importing && !backupDialog.open && ready && !saveFailed && !saveConflict);
  await settled(page);
}

async function inspectExport(page, bytes) {
  return page.evaluate(async base64 => {
    const raw = atob(base64), data = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
    const lib = await import('./vendor/pdfjs/pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js';
    const task = lib.getDocument({data, isEvalSupported: false});
    try {
      const doc = await task.promise, probes = [];
      // Open every page dictionary; rasterize first and last for content/order.
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        if (n === 1 || n === doc.numPages) {
          const base = pg.getViewport({scale: 1}), view = pg.getViewport({scale: 1000 / base.width});
          const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = Math.ceil(view.height);
          const ctx = canvas.getContext('2d'); await pg.render({canvasContext: ctx, viewport: view}).promise;
          const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
          probes.push({number: n, color: pixel(300, 450), marker: Array.from({length: 7}, (_, bit) =>
            pixel(Math.floor((42 + bit * 35) * 1000 / 720), Math.floor(498 * 1000 / 720))[0] < 80)});
          canvas.width = canvas.height = 1;
        }
        pg.cleanup();
      }
      return {count: doc.numPages, probes};
    } finally { await task.destroy(); }
  }, bytes.toString('base64'));
}

async function run(browser, engine) {
  const pass = name => { results.push(`${engine}: ${name}`); console.log('PASS ' + results.at(-1)); };
  if (enabled('roundtrip')) {
    assert.ok(fs.existsSync(path.join(rollbackRoot, 'index.html')), 'Build the real v74 compatibility package first');
    const f = await fixture(browser, {seedInk: true, slideCount: 100});
    try {
      const began = Date.now();
      // Exercise the 100-slide conversion response through consent first. Then
      // explicitly replace that pending result with the local 100-page PDF.
      await f.choose('sentetik-100.pptx'); await f.consent(); await f.readyToApply();
      assert.equal(await f.page.evaluate(() => pdfPending.pages.length), 100); await f.unchanged();
      assert.equal(await f.page.locator('#presentationPreviewCount').textContent(), 'Slayt 1 / 100');
      await uploadPdf(f, 100); await f.readyToApply(); await f.unchanged();
      const pending = await f.page.evaluate(() => ({count: pdfPending.pages.length, unique: new Set(pdfPending.pages.map(p => p.pdf.image)).size,
        bytes: pdfPending.pages.reduce((n, p) => n + p.pdf.image.length, 0), totals: [...new Set(pdfPending.pages.map(p => p.pdf.total))]}));
      assert.deepEqual([pending.count, pending.unique, pending.totals], [100, 100, [100]]);
      assert.ok(pending.bytes < 24 * 1024 * 1024);
      await f.page.locator('#pdfApply').click();
      await f.page.waitForFunction(() => !pdfDialog.open && !pdfBusy && pdfBackgroundReady() && canEdit());
      assert.deepEqual(await f.page.evaluate(() => state.pages[0]), JSON.parse(f.beforeMemory).pages[0], 'existing ink page survives the added notebook');
      await addInk(f.page);
      await f.page.screenshot({path: path.join(output, `${engine}-100-first.png`)});
      await selectLast(f.page); await addInk(f.page);
      await f.page.screenshot({path: path.join(output, `${engine}-100-last.png`)});
      const expectedPages = await f.page.evaluate(() => state.pages);
      const active = await f.page.evaluate(() => activeId);
      await f.page.reload();
      await f.page.waitForFunction(() => ready && pdfBackgroundReady() && canEdit(), null, {timeout: 30000});
      assert.equal(await f.page.evaluate(() => activeId), active);
      assert.deepEqual(await f.page.evaluate(() => state.pages), expectedPages);
      const downloading = f.page.waitForEvent('download'); await f.page.evaluate(() => exportNotebook());
      const backupFile = path.join(output, `${engine}-100-backup.json`); await (await downloading).saveAs(backupFile);
      const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      assert.equal(backup.pages.filter(p => p.pdf).length, 100);
      assert.ok(!JSON.stringify(backup).includes('"image":"asset:'), 'backup must contain portable image bytes');
      await restore(f.page, {version: 1, pages: [{id: 'reset', title: 'Geçici test sayfası', strokes: []}], active: 'reset'});
      assert.equal(await f.page.evaluate(() => state.pages.length), 1);
      await restore(f.page, backup); await f.page.waitForFunction(() => pdfBackgroundReady());
      assert.deepEqual(await f.page.evaluate(() => state.pages), backup.pages);
      pass('100 distinct real PDF.js pages: PPTX preflight, local PDF Apply, existing ink, first/last ink, reload and JSON backup/restore');

      f.switchRoot(rollbackRoot); await f.page.reload();
      await f.page.waitForFunction(() => ready && pdfBackgroundReady() && canEdit(), null, {timeout: 30000});
      assert.equal(await f.page.evaluate(() => APP_VERSION), 'v74');
      assert.deepEqual(await f.page.evaluate(() => state.pages), backup.pages, 'the actual v74 reader must reopen the same IndexedDB, not a translated fixture');
      assert.equal(await f.page.evaluate(() => validState(parseBackup(notebookSnapshot()).book)), true);
      await addInk(f.page);
      const v74Pages = await f.page.evaluate(() => state.pages);
      await f.page.reload();
      await f.page.waitForFunction(() => ready && pdfBackgroundReady() && canEdit(), null, {timeout: 30000});
      assert.deepEqual(await f.page.evaluate(() => state.pages), v74Pages, 'v74 edits must survive its own save and reload');
      const v74Download = f.page.waitForEvent('download'); await f.page.evaluate(() => exportNotebook());
      const v74File = path.join(output, `${engine}-v74-100-backup.json`); await (await v74Download).saveAs(v74File);
      const v74Backup = JSON.parse(fs.readFileSync(v74File, 'utf8'));
      await restore(f.page, {version: 1, pages: [{id: 'v74-reset', title: 'Geçici v74 sayfası', strokes: []}], active: 'v74-reset'});
      await restore(f.page, v74Backup); await f.page.waitForFunction(() => pdfBackgroundReady());
      assert.deepEqual(await f.page.evaluate(() => state.pages), v74Backup.pages);
      const validation = await f.page.evaluate(() => {
        const book = structuredClone(notebookSnapshot()), archived = book.pages.pop();
        book.active = book.pages[0].id;
        book.trash = [{page: archived, notebookTitle: 'Sentetik', deletedAt: new Date().toISOString(), position: 100}];
        const first = [validState(book), validStateCached(book)];
        archived.pdf.total = 101;
        const mutated = [validState(book), validStateCached(book)];
        archived.pdf.total = 100;
        return {first, mutated, restored: [validState(book), validStateCached(book)]};
      });
      assert.deepEqual(validation, {first: [true, true], mutated: [false, false], restored: [true, true]}, 'trash metadata must not bypass validation through a cached 100-page verdict');
      const invalidBackup = JSON.parse(JSON.stringify(v74Backup)); invalidBackup.pages.find(p => p.pdf).pdf.total = 101;
      const beforeInvalid = await memory(f.page), beforeInvalidStored = await stored(f.page);
      const invalidDialog = f.page.waitForEvent('dialog');
      await f.page.locator('#importFile').setInputFiles({name: 'invalid-total-101.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalidBackup))});
      const alert = await invalidDialog; assert.match(alert.message(), /Geçerli/); await alert.accept();
      assert.equal(await memory(f.page), beforeInvalid); assert.equal(await stored(f.page), beforeInvalidStored);
      await f.page.evaluate(() => document.querySelector('#pdfOpen').click());
      await uploadPdf(f, 51);
      await f.page.waitForFunction(() => !pdfBusy && /50 sayfa/.test(document.querySelector('#pdfProgress').textContent));
      assert.equal(await f.page.locator('#pdfApply').isDisabled(), true, 'v74 may read saved total100 but must not create new 51-page imports');
      assert.equal(await memory(f.page), beforeInvalid); assert.equal(await stored(f.page), beforeInvalidStored);
      await f.page.locator('#pdfClose').click();
      await f.page.waitForFunction(() => canEdit());
      await f.page.evaluate(() => document.querySelector('#pdfExportOpen').click());
      await f.page.locator('#pdfExportScope').selectOption('notebook');
      assert.equal(await f.page.locator('#pdfExportStart').isDisabled(), true, 'v74 is compatibility-only; exporting 100 remains closed');
      await f.page.locator('#pdfExportClose').click();
      await f.page.evaluate(() => flushSave()); await settled(f.page);
      pass('real v74 reads/edits/reloads/backup-restores 100; cached trash total101, 51-page import and 100-page export remain rejected');

      f.switchRoot(root); await f.page.reload();
      await f.page.waitForFunction(() => ready && pdfBackgroundReady() && canEdit(), null, {timeout: 30000});
      assert.equal(await f.page.evaluate(() => APP_VERSION), 'v75');
      assert.deepEqual(await f.page.evaluate(() => state.pages), v74Backup.pages);
      await f.page.evaluate(() => document.querySelector('#pdfExportOpen').click());
      await f.page.locator('#pdfExportScope').selectOption('notebook');
      assert.equal(await f.page.locator('#pdfExportStart').isDisabled(), false);
      const beforeExport = await memory(f.page);
      await f.page.locator('#pdfExportStart').click();
      await f.page.locator('#pdfExportDownload').waitFor({state: 'visible', timeout: 120000});
      const exportEvent = f.page.waitForEvent('download'); await f.page.locator('#pdfExportDownload').click();
      const exportFile = path.join(output, `${engine}-100-notlu.pdf`); await (await exportEvent).saveAs(exportFile);
      const exported = fs.readFileSync(exportFile), inspected = await inspectExport(f.page, exported);
      assert.equal(inspected.count, 100);
      for (const probe of inspected.probes) assert.deepEqual(probe.marker, Array.from({length: 7}, (_, bit) => !!(probe.number & (1 << bit))), 'export must retain the first/last page marker and order');
      assert.ok(inspected.probes[0].color[2] > 240 && inspected.probes[1].color[0] > 240, 'first blue and last red page bodies survive export');
      assert.equal(await memory(f.page), beforeExport, 'PDF export must not modify the notebook');
      measurements.push({engine, case: '100-roundtrip', elapsedMs: Date.now() - began, imageDataUrlBytes: pending.bytes, exportedPdfBytes: exported.length});
      pass('v75 reopens after v74; all 100 exported PDF page dictionaries open and first/last page pixels/order survive');
      await f.finish({changed: true});
    } catch (error) { await f.context.close(); throw error; }
  }

  if (enabled('69')) {
    const f = await fixture(browser, {seedInk: true, slideCount: 69, actualUI: true});
    await f.choose('sentetik-69.pptx'); await f.consent(); await f.readyToApply(); await f.unchanged();
    assert.equal(await f.page.evaluate(() => pdfPending.pages.length), 69);
    await f.page.locator('#pdfApply').click();
    await f.page.waitForFunction(() => !pdfBusy && !pdfDialog.open && pdfBackgroundReady());
    await selectLast(f.page);
    assert.deepEqual(await f.page.evaluate(() => [page().pdf.number, page().pdf.total, notebookPages().length]), [69, 69, 69]);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
    pass('69-slide mocked conversion follows real menu, consent, real PDF.js, Apply and last-page navigation');
    await f.finish({changed: true});
  }

  if (enabled('101')) {
    const f = await fixture(browser, {seedInk: true});
    await uploadPdf(f, 101);
    await f.page.waitForFunction(() => !pdfBusy && /100 sayfa/.test(document.querySelector('#pdfProgress').textContent));
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.evaluate(() => pdfPending), null);
    assert.equal(f.calls.length, 0);
    pass('actual 101-page PDF fails at the 100-page boundary before writing any note'); await f.finish();
  }

  if (enabled('errors')) {
    for (const detail of [
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: 101},
      {code: 'other', max_slides: 100, actual_slides: 101, message: 'UNTRUSTED_DETAIL'},
      {code: 'presentation_slide_limit', max_slides: 'UNTRUSTED_DETAIL', actual_slides: 101},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: -1},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: '101'},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: 101.5},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: 1000001},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: Number.MAX_SAFE_INTEGER + 1},
      {code: 'presentation_slide_limit', max_slides: 100, actual_slides: 1000000}
    ]) {
      const f = await fixture(browser, {seedInk: true, responseCode: 422, jsonResponse: {detail}});
      await f.choose(); await f.consent();
      await f.page.waitForFunction(() => !pdfBusy && /eklenmedi/.test(document.querySelector('#pdfProgress').textContent));
      const message = await f.page.locator('#pdfProgress').textContent();
      assert.ok(!message.includes('UNTRUSTED_DETAIL'), 'backend details must not be shown verbatim');
      if (detail.code === 'presentation_slide_limit' && detail.max_slides === 100
          && Number.isSafeInteger(detail.actual_slides) && detail.actual_slides > 100 && detail.actual_slides <= 1000000) {
        assert.ok(message.includes(String(detail.actual_slides))); assert.match(message, /100/);
        assert.match(message, /slayt var/);
      } else assert.ok(!message.includes('slayt var'), 'non-whitelisted or invalid detail must use the safe generic message');
      assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
      assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
      pass(`structured 422 stays nonmutating and uses only safe slide-limit details: ${JSON.stringify(detail)}`);
      await f.finish();
    }
  }

  if (enabled('streams')) {
    const json = JSON.stringify({detail: {code: 'presentation_slide_limit', max_slides: 100, actual_slides: 101}});
    const exact = Buffer.from(json + ' '.repeat(4096 - Buffer.byteLength(json)));
    const oversized = Buffer.concat([exact, Buffer.from(' UNTRUSTED_DETAIL')]);
    for (const test of [
      {name: '4096-byte chunked JSON boundary accepted', chunks: [exact.subarray(0, 2048), exact.subarray(2048)], safe: true},
      {name: 'over-4096 chunked JSON cancels before withheld EOF', chunks: [oversized.subarray(0, 2048), oversized.subarray(2048)], hold: true},
      {name: 'incomplete JSON at EOF falls back safely', chunks: [json.slice(0, -2)]},
      {name: 'connection lost midway through JSON falls back safely', chunks: [json.slice(0, 36)], disconnect: true},
      {name: 'non-JSON error cancels before withheld EOF', chunks: ['UNTRUSTED_DETAIL'], contentType: 'text/html', hold: true},
      {name: 'non-422 error cancels before withheld EOF', chunks: ['UNTRUSTED_DETAIL'], status: 503, hold: true}
    ]) {
      const f = await fixture(browser, {seedInk: true, errorStream: test});
      await f.choose(); await f.consent(); await f.errorStreamStarted;
      await f.page.waitForFunction(() => !pdfBusy && /eklenmedi/.test(document.querySelector('#pdfProgress').textContent), null, {timeout: 12000});
      const message = await f.page.locator('#pdfProgress').textContent();
      assert.ok(!message.includes('UNTRUSTED_DETAIL'));
      assert.equal(message.includes('101 slayt var'), !!test.safe);
      assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
      assert.equal(await f.page.locator('#pdfChoose').isDisabled(), false);
      if (test.hold) {
        // Do not release the server's EOF gate: the client must close transport
        // itself. Checking before finish prevents context teardown masking leaks.
        await Promise.race([f.errorStreamClosed, new Promise((_, reject) => setTimeout(() => reject(Error('client left error body open: ' + test.name)), 6000))]);
        assert.equal(f.errorStreamState.ended, false, 'the server must not have supplied EOF');
      }
      if (test.name.startsWith('over-4096')) assert.ok(f.errorStreamState.bytesSent > 4096);
      pass(test.name + '; editor unlocked and stored ink unchanged'); await f.finish();
    }
    {
      const f = await fixture(browser, {seedInk: true, errorStream: {chunks: [json.slice(0, 36)], hold: true}});
      await f.choose(); await f.consent(); await f.errorStreamStarted;
      assert.equal(await f.page.evaluate(() => pdfBusy), true, 'reader must be awaiting the unfinished JSON body');
      await f.page.locator('#pdfClose').click();
      await f.page.waitForFunction(() => !pdfBusy && !pdfDialog.open);
      await Promise.race([f.errorStreamClosed, new Promise((_, reject) => setTimeout(() => reject(Error('cancelled JSON reader left transport open')), 6000))]);
      assert.equal(f.errorStreamState.ended, false);
      await f.unchanged(); await f.open(); await f.choose('iptalden-sonra.pptx');
      assert.equal(await f.page.locator('#pdfPresentationConsent').isVisible(), true);
      assert.match(await f.page.locator('#pdfProgress').textContent(), /iptalden-sonra\.pptx seçildi/);
      assert.equal(await f.page.locator('#pdfPresentationAgree').isChecked(), false);
      pass('closing during partial JSON read aborts transport; reopening preserves the new selection and existing ink'); await f.finish();
    }
  }

  if (enabled('cancel')) {
    const f = await fixture(browser, {seedInk: true});
    await f.page.evaluate(() => {
      window.__realPageImage = pdfPageImage; window.__renderedBeforeCancel = 0;
      pdfPageImage = surface => {
        const result = window.__realPageImage(surface);
        if (++window.__renderedBeforeCancel === 5) document.querySelector('#pdfClose').click();
        return result;
      };
    });
    await uploadPdf(f, 100);
    await f.page.waitForFunction(() => !pdfBusy && !pdfDialog.open && window.__renderedBeforeCancel >= 5);
    assert.equal(await f.page.evaluate(() => window.__renderedBeforeCancel), 5, 'cancel after five actual rasterized pages, not before parsing');
    assert.equal(await f.page.evaluate(() => pdfPending), null); await f.unchanged();
    await f.page.evaluate(() => { pdfPageImage = window.__realPageImage; });
    await f.open(); await uploadPdf(f, 1); await f.readyToApply(); await f.unchanged();
    assert.equal(await f.page.evaluate(() => pdfPending.pages.length), 1);
    pass('cancel after five real pages of a 100-page PDF leaves disk/ink intact and the next import usable'); await f.finish();
  }

  if (enabled('budget')) {
    const bytes = imageHeavyPdf(100); assert.ok(bytes.length < 20 * 1024 * 1024);
    const f = await fixture(browser, {seedInk: true});
    await uploadPdf(f, 100, bytes);
    await f.page.waitForFunction(() => !pdfBusy && /görüntüleri tablet test sınırını/.test(document.querySelector('#pdfProgress').textContent), null, {timeout: 70000});
    assert.equal(await f.page.locator('#pdfApply').isDisabled(), true);
    assert.equal(await f.page.evaluate(() => pdfPending), null);
    assert.equal(await f.page.evaluate(() => PDF_IMAGE_LIMIT), 24 * 1024 * 1024);
    assert.equal(await f.page.evaluate(() => NOTEBOOK_PDF_LIMIT), 96 * 1024 * 1024);
    assert.equal(f.calls.length, 0);
    pass('real image-heavy 100-page PDF remains subject to 24 MiB raster budget and preserves existing ink/disk'); await f.finish();
  }

  if (realPdf && enabled('real')) {
    // This is the already-converted, explicitly supplied local PDF, never the
    // source presentation. No upload or converter request occurs in this case.
    const original = fs.readFileSync(realPdf), sourceHash = crypto.createHash('sha256').update(original).digest('hex');
    const f = await fixture(browser, {seedInk: true});
    const began = Date.now();
    await uploadPdf(f, 69, original); await f.readyToApply(); await f.unchanged();
    assert.equal(await f.page.evaluate(() => pdfPending.pages.length), 69);
    const imageBytes = await f.page.evaluate(() => pdfPending.pages.reduce((n, p) => n + p.pdf.image.length, 0));
    await f.page.locator('#pdfApply').click();
    await f.page.waitForFunction(() => !pdfBusy && !pdfDialog.open && pdfBackgroundReady() && canEdit());
    for (const number of [1, 35, 69]) {
      await f.page.locator('#pages .page-item').nth(number - 1).locator('button').first().evaluate(button => button.click());
      await f.page.waitForFunction(number => pdfBackgroundReady() && page().pdf.number === number, number);
      await f.page.screenshot({path: path.join(output, `${engine}-provided-69-page-${number}.png`)});
    }
    await addInk(f.page); const expected = await pagesDigest(f.page);
    await f.page.reload();
    await f.page.waitForFunction(() => ready && pdfBackgroundReady() && canEdit(), null, {timeout: 30000});
    assert.equal(await pagesDigest(f.page), expected);
    assert.equal(await f.page.evaluate(() => page().pdf.number), 69);
    const event = f.page.waitForEvent('download'); await f.page.evaluate(() => exportNotebook());
    const backupFile = path.join(output, `${engine}-provided-69-backup.json`); await (await event).saveAs(backupFile);
    const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    assert.equal(backup.pages.filter(p => p.pdf).length, 69);
    assert.ok(!JSON.stringify(backup).includes('"image":"asset:'));
    assert.equal(f.calls.length, 0, 'provided local PDF must never contact the conversion API');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(realPdf)).digest('hex'), sourceHash, 'the supplied PDF is read-only');
    measurements.push({engine, case: 'provided-local-69', sourceSha256: sourceHash, sourceBytes: original.length,
      elapsedMs: Date.now() - began, imageDataUrlBytes: imageBytes, convertedByThisTest: false});
    pass('provided local 69-page PDF imports/applies/saves/reloads/backs up with first/middle/last screenshots and zero conversion requests');
    await f.finish({changed: true});
  }
}

(async () => {
  let failure = null;
  try {
    for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
      if (process.env.BILGE_TEST_ENGINE && process.env.BILGE_TEST_ENGINE !== name) continue;
      const browser = await engine.launch({headless: true});
      try { await run(browser, name); } finally { await browser.close(); }
    }
  } catch (error) { failure = error.stack || String(error); throw error; }
  finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.writeFileSync(path.join(output, 'page-limit-tests.json'), JSON.stringify({
      passed: results.length, failed: failure ? 1 : 0, failure, results, measurements, startedAt,
      completedAt: new Date().toISOString(), testedRoot: root, rollbackRoot, selectedCases: [...selected],
      suppliedLocalPdfTested: !!realPdf && enabled('real'),
      mockedApi: true, syntheticFixtures: true, allDocumentsSynthetic: !(realPdf && enabled('real')),
      actualBundledPdfJs: true, actualIndexedDb: true,
      physicalDevice: false, realLibreOfficeConversion: false, productionAuthentication: false
    }, null, 2));
  }
  console.log(JSON.stringify({passed: results.length, failed: 0, output}));
})().catch(error => { console.error(error); process.exitCode = 1; });
