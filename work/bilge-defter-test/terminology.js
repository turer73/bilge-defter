(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory;else root.BilgeTerminology=factory(root.BILGE_TERMINOLOGY_DATA);
})(typeof window==='object'?window:globalThis,function(data){
  'use strict';
  // Locale-specific exact matching first; diacritic folding is a fallback, never a rewrite.
  const exact=(value,lang='tr')=>String(value||'').normalize('NFC').toLocaleLowerCase(lang==='tr'?'tr-TR':'en-US').trim().replace(/\s+/g,' ');
  const fold=value=>exact(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
  const records=(data?.concepts||[]).map(concept=>({concept,terms:[...['tr','en','la'].flatMap(lang=>[concept.labels[lang],...(concept.aliases[lang]||[])].filter(Boolean).map(text=>({text,lang,kind:'term',key:exact(text,lang),folded:fold(text)}))),...(concept.abbreviations||[]).map(text=>({text,lang:'en',kind:'abbreviation',key:exact(text,'en'),folded:fold(text)}))]}));
  function distance(a,b){
    if(Math.abs(a.length-b.length)>2)return 3;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=row;}return prev[b.length];
  }
  function search(input,limit=20){
    const original=String(input||'').trim();if(!original||original.length>120)return [];
    const q=fold(original),hits=[];
    for(const {concept,terms} of records){
      let best=null;
      for(const term of terms){
        let score=-1,kind='';
        if(term.key===exact(original,term.lang)){score=0;kind=term.kind==='abbreviation'?'abbreviation':'exact';}
        else if(term.folded===q){score=1;kind='normalized';}
        else if(q.length>=2&&term.folded.startsWith(q)){score=2;kind='prefix';}
        else if(q.length>=3&&term.folded.includes(q)){score=3;kind='contains';}
        if(score>=0&&(!best||score<best.score))best={concept,score,match:kind,matchedText:term.text,matchedLanguage:term.lang};
      }
      if(best)hits.push(best);
    }
    // Suggestions remain explicit and are used only when literal/normalized matches are absent.
    if(!hits.length&&q.length>=4&&q.length<=48){
      const threshold=q.length>=8?2:1;
      for(const {concept,terms} of records){
        let best=null;for(const term of terms){if(term.kind==='abbreviation')continue;const d=distance(q,term.folded);if(d>0&&d<=threshold&&(!best||d<best.distance))best={concept,score:4+d,distance:d,match:'suggestion',matchedText:term.text,matchedLanguage:term.lang};}if(best)hits.push(best);
      }
    }
    const bounded=Number.isFinite(limit)?Math.max(1,Math.min(50,Math.floor(limit))):20;
    return hits.sort((a,b)=>a.score-b.score||a.concept.labels.tr.localeCompare(b.concept.labels.tr,'tr')).slice(0,bounded);
  }
  function expansion(conceptId,original){
    const concept=records.find(r=>r.concept.id===conceptId)?.concept;
    if(!concept)return null;
    return {original:String(original||'').slice(0,120),conceptId,terms:[...new Set(['tr','en','la'].flatMap(lang=>[concept.labels[lang],...(concept.aliases[lang]||[])]).filter(Boolean))],reviewStatus:concept.reviewStatus,requiresConfirmation:true};
  }
  return Object.freeze({search,expansion,version:data?.version,count:records.length,sources:data?.sources||[]});
});
