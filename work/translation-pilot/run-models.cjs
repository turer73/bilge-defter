'use strict';
// Explicitly authorized bounded remote experiment, never an application endpoint.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {requests,template,evaluate}=require('./audit.cjs');
const MODELS=['qwen2.5:7b','qwen3.5:9b'];
const OPTIONS={temperature:0.1,seed:42,num_ctx:2048,num_predict:512,num_thread:4};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const PYTHON=String.raw`
import json,sys,os,time,urllib.request,subprocess
task=json.load(sys.stdin)
base='http://127.0.0.1:11434'
def get(route):
    with urllib.request.urlopen(base+route,timeout=10) as r:return json.load(r)
def state():
    fields={}
    for line in open('/proc/meminfo'):
        k,v=line.split(':',1)
        if k in ('MemAvailable','SwapFree'):fields[k]=int(v.strip().split()[0])
    fields['load']=list(os.getloadavg())
    fields['services']=subprocess.check_output(['systemctl','show','ollama','linux-ai-server','-p','Id','-p','MainPID','-p','ActiveEnterTimestamp'],text=True).strip()
    fields['web']=subprocess.check_output(['docker','inspect','bilge-defter-invited-web','--format','{{.Id}} {{.State.StartedAt}}'],text=True).strip()
    return fields
if task['op']=='snapshot':
    print(json.dumps({'host':os.uname().nodename,'state':state(),'version':get('/api/version'),'models':get('/api/tags'),'running':get('/api/ps')}))
elif task['op']=='infer':
    model=task['payload']['model']
    assert model in ['qwen2.5:7b','qwen3.5:9b']
    before=state()
    if before['load'][0]>6 or before['MemAvailable']<4*1024*1024:
        print(json.dumps({'guard':'host-busy','state':before}));sys.exit(0)
    tags=get('/api/tags')['models']
    assert any(x['name']==model and x['digest']==task['digest'] for x in tags)
    started=time.monotonic()
    req=urllib.request.Request(base+'/api/chat',data=json.dumps(task['payload']).encode(),headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=150) as r:response=json.load(r)
        # Persist only the translation and documented metrics, never model thinking.
        selected={k:response.get(k) for k in ['model','created_at','done','done_reason','total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration']}
        selected['content']=response.get('message',{}).get('content','')
        selected['toolCallsPresent']=bool(response.get('message',{}).get('tool_calls'))
        print(json.dumps({'response':selected,'elapsedMs':round((time.monotonic()-started)*1000),'before':before,'after':state(),'running':get('/api/ps')},ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'failure':type(e).__name__,'elapsedMs':round((time.monotonic()-started)*1000)}))
else:raise ValueError('Unknown operation')
`;
function remote(task) {
  // Code is fixed, stdin is JSON data. No remote files, model pull, shell expansion of outputs.
  const command="python3 -c '"+PYTHON.replaceAll("'","'\\''")+"'";
  const r=spawnSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','-i','C:/Users/sevdi/.ssh/klipperos_key','klipperos@100.84.251.49',command],
    {input:JSON.stringify(task),encoding:'utf8',timeout:170000,maxBuffer:1024*1024,windowsHide:true});
  if(r.error||r.status!==0)throw Error('SSH experiment failed; no automatic retry');
  return JSON.parse(r.stdout);
}
function buildPayload(model,entry) {
  if(!MODELS.includes(model))throw Error('Model not allowed');
  const approved=requests().cases.find(c=>c.id===entry.id);
  if(!approved||JSON.stringify(approved)!==JSON.stringify(entry))throw Error('Only fixed synthetic cases allowed');
  const payload={model,stream:false,format:'json',keep_alive:'15s',options:OPTIONS,messages:[{role:'system',content:entry.system},{role:'user',content:entry.user}]};
  if(model==='qwen3.5:9b')payload.think=false;
  return payload;
}
function parseReply(response,entry,model) {
  if(!response||response.model!==model||response.done!==true||response.done_reason!=='stop'||response.toolCallsPresent)throw Error('Incomplete, unexpected model, or tool response');
  if(typeof response.content!=='string'||response.content.length>24000)throw Error('Invalid content length');
  const parsed=JSON.parse(response.content),source=JSON.parse(entry.user).segments;
  if(parsed.error||!Array.isArray(parsed.segments)||parsed.segments.length!==source.length)throw Error('Incomplete translation schema');
  if(parsed.segments.some((s,i)=>!s||s.id!==source[i].id||typeof s.text!=='string'||!s.text.trim()))throw Error('Invalid segment');
  return parsed.segments.map(s=>({id:s.id,text:s.text}));
}
function writeNew(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
function checkpoint(file,value){const temp=file+'.tmp';writeNew(temp,value);fs.renameSync(temp,file);}
async function run(args) {
  const [mode,model,dest]=args;
  if(!['probe','run'].includes(mode)||!MODELS.includes(model)||!dest||args.length!==3)throw Error('Usage: run-models.cjs probe|run qwen2.5:7b|qwen3.5:9b NEW_OUTPUT_DIR');
  const out=path.resolve(dest);if(fs.existsSync(out))throw Error('Output directory already exists');
  fs.mkdirSync(out,{recursive:true});
  const before=remote({op:'snapshot'});writeNew(path.join(out,'before.json'),before);
  const tag=before.models.models.find(m=>m.name===model);if(!tag)throw Error('Model not installed; downloading is forbidden');
  const pack=requests(),selected=mode==='probe'?pack.cases.slice(0,1):pack.cases;
  const envelope={...template(),provider:'ollama-klipper',model,recordedAt:new Date().toISOString(),modelDigest:tag.digest,options:OPTIONS,mode,results:[]};
  writeNew(path.join(out,'run-config.json'),{model,digest:tag.digest,mode,cases:selected.length,options:OPTIONS,datasetSha256:pack.datasetSha256,promptSha256:pack.promptSha256,runnerSha256:sha(fs.readFileSync(__filename)),externalApiCalls:0,estimatedExternalApiCost:0,energyMeasured:false});
  const start=Date.now();let failures=0,halt=null;
  for(const entry of selected) {
    if(Date.now()-start>45*60*1000){halt='time-budget';break;}
    const payload=buildPayload(model,entry);let receipt;
    try {receipt=remote({op:'infer',digest:tag.digest,payload});}
    catch {halt='transport-failure';break;}
    writeNew(path.join(out,entry.id+'.json'),{caseId:entry.id,requestSha256:sha(JSON.stringify(payload)),...receipt});
    if(receipt.guard){halt=receipt.guard;break;}
    const row={id:entry.id,status:'failed',segments:[],elapsedMs:receipt.elapsedMs};
    try {row.segments=parseReply(receipt.response,entry,model);row.status='complete';failures=0;}
    catch(error){row.error=error.message;failures++;}
    envelope.results.push(row);checkpoint(path.join(out,'responses.json'),envelope);
    console.log(JSON.stringify({model,case:entry.id,status:row.status,elapsedMs:row.elapsedMs,outputTokens:receipt.response?.eval_count,error:row.error}));
    if(receipt.after?.services!==before.state.services||receipt.after?.web!==before.state.web){halt='protected-service-changed';break;}
    if(receipt.failure){halt='inference-transport-failure';break;}
    if(failures>=3){halt='three-consecutive-invalid-responses';break;}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  const after=remote({op:'snapshot'});writeNew(path.join(out,'after.json'),after);
  const report=evaluate(envelope);writeNew(path.join(out,'report.json'),report);
  const completion={mode,attempted:envelope.results.length,planned:selected.length,halt,elapsedMs:Date.now()-start,protectedServicesUnchanged:before.state.services===after.state.services&&before.state.web===after.state.web,externalApiCalls:0,reportCounts:report.counts};
  writeNew(path.join(out,'completion.json'),completion);console.log(JSON.stringify(completion));
  if(halt||!completion.protectedServicesUnchanged)process.exitCode=2;
}
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={buildPayload,parseReply,MODELS,OPTIONS};
