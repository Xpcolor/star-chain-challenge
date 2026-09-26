import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const files=process.argv.slice(2);
if(!files.length)throw Error('node tests/summarize-ladder.mjs games.jsonl[.gz] ...');
const rows=files.flatMap(file=>{const bytes=readFileSync(file);return (file.endsWith('.gz')?gunzipSync(bytes):bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse);});
const keys=rows.map(r=>[r.seed,r.first,r.attention,r.level].join(':'));assert.equal(new Set(keys).size,keys.length,'Duplicate games');
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const round=x=>Math.round(x*100)/100;
const ci=xs=>{const m=mean(xs),se=Math.sqrt(xs.reduce((a,x)=>a+(x-m)**2,0)/(xs.length-1)/xs.length);return[m-1.96*se,m+1.96*se].map(x=>round(100*x));};
const clustered=group=>{const pairs=new Map();for(const r of group){const a=pairs.get(r.seed)||[];a.push(r.score);pairs.set(r.seed,a);}return [...pairs.values()].map(mean);};
const levels=[...new Set(rows.map(r=>r.level))].sort((a,b)=>a-b),curves={};
for(const attention of [...new Set(rows.map(r=>r.attention))].sort((a,b)=>a-b)){
 const groups=levels.map(level=>rows.filter(r=>r.attention===attention&&r.level===level));
 const values=groups.map((group,i)=>({level:levels[i]+1,games:group.length,referenceWins:group.filter(r=>r.winner===0).length,draws:group.filter(r=>r.winner==='draw').length,referenceScorePct:round(100*mean(group.map(r=>r.score))),approx95ClusterCI:ci(clustered(group)).map(x=>Math.max(0,Math.min(100,x)))}));
 const drops=groups.slice(0,-1).map((group,i)=>{const next=new Map(groups[i+1].map(r=>[[r.seed,r.first].join(':'),r.score]));const ds=group.map(r=>({...r,score:r.score-next.get([r.seed,r.first].join(':'))}));assert.ok(ds.every(r=>Number.isFinite(r.score)),'Unpaired scenarios');return {from:levels[i]+1,to:levels[i+1]+1,dropPP:round(100*mean(ds.map(r=>r.score))),approx95ClusterCI:ci(clustered(ds))};});
 curves[attention]={levels:values,adjacentDrops:drops};
}
console.log(JSON.stringify({games:rows.length,metric:'reference wins + 0.5 draws, not human win rate',curves},null,2));
