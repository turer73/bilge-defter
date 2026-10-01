'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v68 runs the v64 regression list against the v68 build (update tests: v67 -> v68), plus the
// v68 previous-copy, v67 sync and v66 save-recovery suites. The v60 worker-failure expectation stays replaced as
// in the v66 runner (a new worker continues from this tab's own write; a stale tab is refused).
const file=path.join(__dirname,'verify-v64.cjs');
let code=fs.readFileSync(file,'utf8').replaceAll('v64','v68').replaceAll("'v63'","'v67'")
 .replace("const suites=['","const suites=['verify-v68-previous.cjs','verify-v67-sync.cjs','verify-v66-save-recovery.cjs','");
const v60From="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),true);assert.equal(await stored(p),before);";
const v60To="await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),false);assert.equal(JSON.parse(await stored(p)).pages.find(x=>x.id===JSON.parse(before).active).title,'AFTER_WORKER_FAILURE');";
const v60PassFrom='after a worker failure the next save stops as a conflict and leaves disk unchanged',v60PassTo="after a worker failure a new worker continues from this tab's own last write";
code=code.replace("const mapping={","const mapping={'verify-v60-save.cjs':[["+JSON.stringify(v60From)+","+JSON.stringify(v60To)+"],["+JSON.stringify(v60PassFrom)+","+JSON.stringify(v60PassTo)+"]],");
if(!code.includes("'verify-v60-save.cjs':[[")||!code.includes("'verify-v68-previous.cjs'"))throw Error('v68 runner rewrite failed');
if(!fs.readFileSync(path.join(__dirname,'verify-v60-save.cjs'),'utf8').includes(v60From))throw Error('v60 expectation moved; update the v68 mapping');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
