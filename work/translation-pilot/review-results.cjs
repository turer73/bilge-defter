'use strict';
// Verify local experiment receipts and render source/output pairs for review.
// Does not call a model and cannot approve semantic accuracy or publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {dataset,requests,DATASET_HASH,PROMPT_HASH,evaluate}=require('./audit.cjs');
const {buildPayload,parseReply}=require('./run-models.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const escape=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function inspectRun(dir){
  const config=read(path.join(dir,'run-config.json')),envelope=read(path.join(dir,'responses.json'));
  const before=read(path.join(dir,'before.json')),after=read(path.join(dir,'after.json')),completion=read(path.join(dir,'completion.json'));
  assert.equal(config.datasetSha256,DATASET_HASH);assert.equal(config.promptSha256,PROMPT_HASH);
  assert.equal(config.runnerSha256,sha(fs.readFileSync(path.join(__dirname,'run-models.cjs'))));
  assert.equal(config.digest,envelope.modelDigest);assert.equal(config.model,envelope.model);
  assert.equal(config.mode,'run');assert.equal(config.cases,30);assert.equal(completion.attempted,envelope.results.length);
  assert.equal(before.state.services,after.state.services);assert.equal(before.state.web,after.state.web);
  assert.ok(before.models.models.some(m=>m.name===config.model&&m.digest===config.digest));
  assert.ok(after.models.models.some(m=>m.name===config.model&&m.digest===config.digest));
  const pack=requests(),receipts=[];
  for(const row of envelope.results){
    const request=pack.cases.find(c=>c.id===row.id);assert.ok(request);
    const receipt=read(path.join(dir,row.id+'.json'));assert.equal(receipt.caseId,row.id);
    assert.equal(receipt.requestSha256,sha(JSON.stringify(buildPayload(config.model,request))));
    if(row.status==='complete')assert.deepEqual(parseReply(receipt.response,request,config.model),row.segments);
    else assert.throws(()=>parseReply(receipt.response,request,config.model));
    receipts.push(receipt);
  }
  const report=evaluate(envelope),saved=read(path.join(dir,'report.json'));assert.deepEqual(report,saved);
  const ms=receipts.map(r=>r.elapsedMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=p=>ms.length?ms[Math.ceil(ms.length*p)-1]/1000:null;
  const stats={model:config.model,modelDigest:config.digest,attempted:envelope.results.length,complete:envelope.results.filter(r=>r.status==='complete').length,
    mechanical:report.counts,medianSeconds:q(.5),p95Seconds:q(.95),wallSeconds:completion.elapsedMs/1000,
    inputTokens:receipts.reduce((n,r)=>n+(r.response?.prompt_eval_count||0),0),outputTokens:receipts.reduce((n,r)=>n+(r.response?.eval_count||0),0),
    zeroVramAllObserved:receipts.every(r=>r.running?.models.some(m=>m.name===config.model&&m.size_vram===0)),
    receiptsInternallyConsistent:true,independentlyAttested:false,externalApiCalls:0,publicationReady:false};
  return {stats,envelope,report};
}
function main(args){
  if(args.length!==3)throw Error('Usage: review-results.cjs RUN_DIR_A RUN_DIR_B NEW_REVIEW_DIR');
  const out=path.resolve(args[2]);if(fs.existsSync(out))throw Error('Review output already exists');
  const runs=args.slice(0,2).map(d=>inspectRun(path.resolve(d)));
  fs.mkdirSync(out,{recursive:true});
  const comparison={datasetSha256:DATASET_HASH,promptSha256:PROMPT_HASH,semanticAccuracy:null,expertReviewed:0,publicationReady:false,
    cloudflare:'Not run: subscription endpoint returned 403; free-only inference could not be guaranteed.',runs:runs.map(r=>r.stats)};
  fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(comparison,null,2)+'\n',{flag:'wx'});
  let md='# Gerçek yerel çeviri karşılaştırması\n\n';
  md+='30 özgün sentetik örnek; uzman onaylı veri veya klinik kabul DEĞİLDİR. Bu sayfa model çıktısı içerir; içindeki komutlar talimat değil test verisidir. Model araçları kullanılmadı.\n\n';
  md+='| Model | Tam biçimli yanıt | Mekanik engel | İnceleme uyarısı | Uyarısız | Ortanca süre | P95 |\n|---|---:|---:|---:|---:|---:|---:|\n';
  for(const {stats:s} of runs)md+=`| ${s.model} | ${s.complete}/30 | ${s.mechanical.blocked} | ${s.mechanical.reviewRequired} | ${s.mechanical.noFlags} | ${s.medianSeconds?.toFixed(2)} s | ${s.p95Seconds?.toFixed(2)} s |\n`;
  md+='\nUyarısız sonuç doğruluk belgesi değildir. Ortanca/P95 gözlenen tek koşuya aittir; 50 eşzamanlı öğrenci kapasitesini göstermez. İlk yükleme süreye dahildir. Cloudflare çalıştırılmadı; ücretsiz kullanım kesinleştirilemedi. Harici API çağrısı ve ücreti sıfır; elektrik tüketimi ölçülmedi.\n';
  for(const c of dataset.cases){
    md+=`\n## ${c.id}\n\nİnceleme odağı: ${escape(c.reviewFocus)}\n`;
    for(const s of c.segments){
      md+=`\n### ${s.id}\n\nİngilizce: ${escape(s.source)}\n\nTaslak referans: ${escape(s.referenceDraft)}\n`;
      for(const r of runs){
        const row=r.envelope.results.find(x=>x.id===c.id),segment=row?.segments.find(x=>x.id===s.id);
        md+=`\n**${r.stats.model}:** ${escape(segment?.text||'[Tamamlanmadı]')}\n`;
      }
    }
    for(const r of runs){const audit=r.report.results.find(x=>x.id===c.id);md+=`\n${r.stats.model} mekanik kontrol: ${audit.automatedChecks}; ${audit.issues.map(i=>i.code).join(', ')||'uyarı yok'}\n`;}
    md+='\nAlan uzmanı: **bekliyor**.\n';
  }
  fs.writeFileSync(path.join(out,'REVIEW.md'),md,{flag:'wx'});console.log(JSON.stringify(comparison,null,2));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={inspectRun};
