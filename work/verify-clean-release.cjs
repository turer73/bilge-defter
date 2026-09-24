const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict'),{spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),root=path.join(__dirname,'bilge-defter-invited-v52');
const expected='ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9';
function run(file){const r=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:root,BILGE_TEST_OUTPUT:path.join(repo,'outputs/v52')},stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(file+' failed: '+r.status)}
run('build-invited.cjs');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'SHA256SUMS'))).digest('hex'),expected,'Clean build must match deployed v52');
run('prepare-clean-baselines.cjs');run('audit-v52.cjs');run('verify-v51-login.cjs');run('verify-v52-performance.cjs');
console.log('PASS Clean source build matches deployed v52; all release suites completed');
