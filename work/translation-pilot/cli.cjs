'use strict';
// This CLI has no network mode. It exports requests or scores separately obtained outputs.
const fs=require('node:fs'),path=require('node:path');
const {requests,template,evaluate}=require('./audit.cjs');
function read(file) {
  if(fs.statSync(file).size>512*1024) throw Error('Input exceeds 512 KiB');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function write(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
}
function main(args) {
  if(args[0]==='prepare'&&args.length===2) {
    const out=path.resolve(args[1]),a=path.join(out,'requests.json'),b=path.join(out,'response-template.json');
    if(fs.existsSync(a)||fs.existsSync(b)) throw Error('Output exists; choose a new directory');
    write(a,requests());write(b,template());
    console.log(JSON.stringify({prepared:30,networkRequests:0,modelRuns:0,requests:a,template:b}));return;
  }
  if(args[0]==='score'&&args.length===3) {
    const report=evaluate(read(path.resolve(args[1])));write(path.resolve(args[2]),report);
    console.log(JSON.stringify({counts:report.counts,kind:report.kind,publicationReady:false,semanticAccuracy:null}));return;
  }
  throw Error('Usage: node cli.cjs prepare OUTPUT_DIR | score RESPONSES_JSON NEW_REPORT_JSON');
}
if(require.main===module) {try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={main};
