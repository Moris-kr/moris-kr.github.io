import {normalizeGallery} from './analysis.mjs';
import {collectRemote} from './collect.mjs';
export function parseGalleryInputs(values){
 const urls=[...new Set(values.map(s=>s.trim()).filter(Boolean).map(s=>normalizeGallery(s).url))];
 if(!urls.length)throw new Error('갤러리 주소를 입력해 주세요.');
 if(urls.length>5)throw new Error('갤러리는 최대 5개까지 비교할 수 있습니다.');
 return urls;
}
export function alignReports(reports){
 const times=[...new Set(reports.flatMap(r=>r?.buckets.map(b=>b.time)||[]))].sort((a,b)=>a-b);
 const series=reports.map(r=>{const map=new Map(r?.buckets.map(b=>[b.time,b])||[]);return times.map(t=>map.get(t)||null);});
 const common=times.map((_,i)=>i).filter(i=>series.length&&series.every(s=>s[i]?.complete));
 return {times,series,commonCount:common.length,averages:series.map(s=>common.length?common.reduce((sum,i)=>sum+s[i].count,0)/common.length:null)};
}
export async function collectMany(urls,options,{base='',signal,onUpdate=()=>{},collector=collectRemote,now=Date.now}={}){
 const observedAt=now(),states=urls.map(url=>({url,status:'waiting',report:null,error:''}));let cursor=0;
 const emit=()=>onUpdate(states.map(s=>({...s})));
 async function work(){while(cursor<states.length){const state=states[cursor++];
  if(signal?.aborted){state.status='stopped';emit();continue;}
  state.status='collecting';emit();
  try{state.report=await collector(base,{...options,url:state.url},{signal,now:()=>observedAt,onProgress:m=>{state.report=m.snapshot;state.status=m.phase==='expand'?'expanding':'collecting';emit();}});state.status=state.report.warning?'partial':'complete';}
  catch(error){state.status=signal?.aborted?'stopped':'error';state.error=signal?.aborted?'수집 중지':error.message;}
  emit();
 }}
 await Promise.all(Array.from({length:Math.min(2,states.length)},work));return states;
}
