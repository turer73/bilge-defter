'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v72 runs the v64 regression list against the v72 build (update tests: v71 -> v72), plus the
// v72 review fixes, v71 asset-writer, v70 asset-store, v69 save-stability, v68 previous-copy, v67 sync and v66 save-recovery suites. The v60 worker-failure
// expectation stays replaced as in the v66 runner (a new worker continues from this tab's own write).
const file=path.join(__dirname,'verify-v64.cjs');
let code=fs.readFileSync(file,'utf8').replaceAll('v64','v72').replaceAll("'v63'","'v71'")
 .replace("const suites=['","const suites=['verify-v72-fixes.cjs','verify-v71-assets.cjs','verify-v70-assets.cjs','verify-v69-save.cjs','verify-v68-previous.cjs','verify-v67-sync.cjs','verify-v66-save-recovery.cjs','");
const v60From="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),true);assert.equal(await stored(p),before);";
const v60To="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),false);assert.equal(JSON.parse(await stored(p)).pages.find(x=>x.id===JSON.parse(before).active).title,'AFTER_WORKER_FAILURE');";
const v60PassFrom='after a worker failure the next save stops as a conflict and leaves disk unchanged',v60PassTo="after a worker failure a new worker continues from this tab's own last write";
// v69/v70: the local save text escapes characters above U+00FF (one-byte string); sync uses plain
// JSON.stringify. The invariant becomes: save text equals the stored form (escaped, image keys) of the notebook.
// The v69 suite checks the diagnostic file's app version and the PDF cap (v71: images, 96 MB).
const v69CapFrom="lastSaveBytes=NOTEBOOK_PDF_LIMIT-10;",v69CapTo="notebookImageBytes=()=>NOTEBOOK_PDF_LIMIT-10;",v69MsgFrom="assert.match(msg,/sınır 48 MB/)",v69MsgTo="assert.match(msg,/sınır 96 MB/)";
// The v70 suite starts with the writer off (v71 default is on) and expects it on after reopening.
const v70OffFrom="assert.equal(await p.evaluate(()=>ASSET_WRITE),false,'v70 does not create assets by default');",v70OffTo="await p.evaluate(()=>{ASSET_WRITE=false});",v70ReopenFrom="valid:true,write:false}",v70ReopenTo="valid:true,write:true}";
const v69From="assert.equal(report.app,'v69')",v69To="assert.equal(report.app,'v72')";
// v71: the v61 blocking test measures cached vs full serialization of an inline PDF notebook; the
// writer (which would move its images to keys a few seconds later) is off there. Assets: v70/v71 suites.
const v61BlockFrom="const makePdf=eval(pdfPage),list=[];",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage),list=[];";
// The v71 suite checks it is back on the current version after the v70 rollback check.
const v71From="assert.equal(await p.evaluate(()=>APP_VERSION),'v71');",v71To="assert.equal(await p.evaluate(()=>APP_VERSION),'v72');";
const v61From="return serializeNotebook(snap)===JSON.stringify(snap)",v61To="return serializeNotebook(snap)===storedText(snap)";
code=code.replace("const mapping={","const mapping={'verify-v60-save.cjs':[["+JSON.stringify(v60From)+","+JSON.stringify(v60To)+"],["+JSON.stringify(v60PassFrom)+","+JSON.stringify(v60PassTo)+"]],'verify-v61-save.cjs':[["+JSON.stringify(v61From)+","+JSON.stringify(v61To)+"],["+JSON.stringify(v61BlockFrom)+","+JSON.stringify(v61BlockTo)+"]],'verify-v69-save.cjs':[["+JSON.stringify(v69From)+","+JSON.stringify(v69To)+"],["+JSON.stringify(v69CapFrom)+","+JSON.stringify(v69CapTo)+"],["+JSON.stringify(v69MsgFrom)+","+JSON.stringify(v69MsgTo)+"]],'verify-v71-assets.cjs':[["+JSON.stringify(v71From)+","+JSON.stringify(v71To)+"]],'verify-v70-assets.cjs':[["+JSON.stringify(v70OffFrom)+","+JSON.stringify(v70OffTo)+"],["+JSON.stringify(v70ReopenFrom)+","+JSON.stringify(v70ReopenTo)+"]],");
if(!code.includes("'verify-v60-save.cjs':[[")||!code.includes("'verify-v72-fixes.cjs'"))throw Error('v72 runner rewrite failed');
if(!fs.readFileSync(path.join(__dirname,'verify-v60-save.cjs'),'utf8').includes(v60From))throw Error('v60 expectation moved; update the v72 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v69-save.cjs'),'utf8').includes(v69From))throw Error('v69 expectation moved; update the v72 mapping');
for(const x of [v69CapFrom,v69MsgFrom])if(!fs.readFileSync(path.join(__dirname,'verify-v69-save.cjs'),'utf8').includes(x))throw Error('v69 cap expectation moved; update the v72 mapping');
for(const x of [v70OffFrom,v70ReopenFrom])if(!fs.readFileSync(path.join(__dirname,'verify-v70-assets.cjs'),'utf8').includes(x))throw Error('v70 expectation moved; update the v72 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v71-assets.cjs'),'utf8').includes(v71From))throw Error('v71 expectation moved; update the v72 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').includes(v61BlockFrom))throw Error('v61 blocking expectation moved; update the v72 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').includes(v61From))throw Error('v61 expectation moved; update the v72 mapping');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
