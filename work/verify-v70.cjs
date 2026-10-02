'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v70 runs the v64 regression list against the v70 build (update tests: v69 -> v70), plus the
// v70 asset-store, v69 save-stability, v68 previous-copy, v67 sync and v66 save-recovery suites. The v60 worker-failure
// expectation stays replaced as in the v66 runner (a new worker continues from this tab's own write).
const file=path.join(__dirname,'verify-v64.cjs');
let code=fs.readFileSync(file,'utf8').replaceAll('v64','v70').replaceAll("'v63'","'v69'")
 .replace("const suites=['","const suites=['verify-v70-assets.cjs','verify-v69-save.cjs','verify-v68-previous.cjs','verify-v67-sync.cjs','verify-v66-save-recovery.cjs','");
const v60From="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),true);assert.equal(await stored(p),before);";
const v60To="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),false);assert.equal(JSON.parse(await stored(p)).pages.find(x=>x.id===JSON.parse(before).active).title,'AFTER_WORKER_FAILURE');";
const v60PassFrom='after a worker failure the next save stops as a conflict and leaves disk unchanged',v60PassTo="after a worker failure a new worker continues from this tab's own last write";
// v69/v70: the local save text escapes characters above U+00FF (one-byte string); sync uses plain
// JSON.stringify. The invariant becomes: save text equals the stored form (escaped, image keys) of the notebook.
// The v69 suite checks the diagnostic file's app version.
const v69From="assert.equal(report.app,'v69')",v69To="assert.equal(report.app,'v70')";
const v61From="return serializeNotebook(snap)===JSON.stringify(snap)",v61To="return serializeNotebook(snap)===storedText(snap)";
code=code.replace("const mapping={","const mapping={'verify-v60-save.cjs':[["+JSON.stringify(v60From)+","+JSON.stringify(v60To)+"],["+JSON.stringify(v60PassFrom)+","+JSON.stringify(v60PassTo)+"]],'verify-v61-save.cjs':[["+JSON.stringify(v61From)+","+JSON.stringify(v61To)+"]],'verify-v69-save.cjs':[["+JSON.stringify(v69From)+","+JSON.stringify(v69To)+"]],");
if(!code.includes("'verify-v60-save.cjs':[[")||!code.includes("'verify-v70-assets.cjs'"))throw Error('v70 runner rewrite failed');
if(!fs.readFileSync(path.join(__dirname,'verify-v60-save.cjs'),'utf8').includes(v60From))throw Error('v60 expectation moved; update the v70 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v69-save.cjs'),'utf8').includes(v69From))throw Error('v69 expectation moved; update the v70 mapping');
if(!fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').includes(v61From))throw Error('v61 expectation moved; update the v70 mapping');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
