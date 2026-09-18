import {parseGalleryInputs,collectMany,alignReports} from './comparison.mjs';
import {drawChart,colors} from './charts.mjs';
const $=id=>document.getElementById(id);
const number=(n,d=0)=>n==null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:d});
const date=(t,short=false)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(short?{}:{year:'numeric'})}).format(t);
let result=null,controller=null,shown=100,reportState='complete';
let collectionStates=[],detailIndex=0,recordIndex=0,chartType='bar';
const hiddenGalleries=new Set();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const counters=new Map(),counterValues=new Map();
function countUp(id,value,digits=0){
 const el=$(id);cancelAnimationFrame(counters.get(id));
 if(value==null||reducedMotion.matches){el.textContent=number(value,digits);counterValues.set(id,value??0);return;}
 const start=performance.now(),from=counterValues.get(id)||0;
 const frame=time=>{const t=Math.min(1,(time-start)/450),current=from+(value-from)*(1-Math.pow(1-t,4));counterValues.set(id,current);el.textContent=number(current,digits);if(t<1)counters.set(id,requestAnimationFrame(frame));};
 counters.set(id,requestAnimationFrame(frame));
}
const stateLabel=b=>b.ongoing?'진행 중':b.complete?'전체 구간':'일부 구간';
document.querySelectorAll('.demo-bars i,.collection-wave i').forEach((el,i)=>el.style.setProperty('--i',i));
const notice=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
function endpoint(){
 const configured=window.GALLERY_API_BASE?.replace(/\/$/,'');
 if(configured){const url=new URL(configured);if(url.protocol!=='https:')throw new Error('수집 서버는 HTTPS 주소여야 합니다.');return configured;}
 if(['localhost','127.0.0.1'].includes(location.hostname))return location.origin;
 throw new Error('공개 수집 서버가 아직 연결되지 않았습니다. 현재는 프로젝트에서 npm start로 실행한 로컬 사이트에서 분석할 수 있습니다.');
}
function setBusy(busy){$('submit-button').disabled=busy;$('download-button').disabled=busy;$('progress').hidden=!busy;document.body.classList.toggle('is-collecting',busy);for(const el of document.querySelectorAll('#extra-galleries input,#extra-galleries button,#add-gallery'))el.disabled=busy;for(const id of ['gallery-url','minutes','count','page','example-button','auto-expand'])$(id).disabled=busy;}
$('example-button').onclick=()=>{$('gallery-url').value='https://gall.dcinside.com/mgallery/board/lists/?id=gov';$('gallery-url').focus();};
for(const id of ['minutes','count','page'])$(id).addEventListener('input',()=>{$('settings-summary').textContent=`${$('minutes').value}분 · ${number(Number($('count').value))}개 · ${$('page').value}페이지부터`;});
$('analyze-form').addEventListener('submit',async event=>{
 event.preventDefault();notice('');let base;
 try{base=endpoint();}catch(error){notice(error.message);return;}
 let urls;try{urls=parseGalleryInputs([$('gallery-url').value,...[...document.querySelectorAll('#extra-galleries input')].map(el=>el.value)]);}catch(error){notice(error.message);return;}
 saveGalleryInputs();
 const options={minutes:Number($('minutes').value),count:Number($('count').value),page:Number($('page').value),autoExpand:$('auto-expand').checked};
 result=null;collectionStates=[];detailIndex=0;recordIndex=0;hiddenGalleries.clear();$('chart')._chartValues=new Map();$('chart-selection').textContent='구간을 선택해 주세요.';shown=100;counterValues.clear();for(const frame of counters.values())cancelAnimationFrame(frame);
 $('results').hidden=true;$('empty-state').hidden=false;
 controller=new AbortController();setBusy(true);$('progress-label').textContent='갤러리에 연결하고 있습니다.';
 if(urls.length>1)chartType='line';
 try{
  await collectMany(urls,options,{base,signal:controller.signal,onUpdate:states=>{
   collectionStates=states;
   const total=states.reduce((n,s)=>n+(s.report?.count||0),0),done=states.filter(s=>['complete','partial','error','stopped'].includes(s.status)).length;
   const retrying=states.filter(s=>s.status==='retrying').map(s=>`${s.report?.name||new URL(s.url).searchParams.get('id')}: ${s.retry.page}페이지 · ${s.retry.attempt}번째 재시도 · ${Math.ceil(s.retry.waitMs/1000)}초 대기`);
   $('progress-label').textContent=retrying.length?retrying.join(' / '):`${done} / ${states.length}개 갤러리 완료 · ${number(total)}개 수집`;
   $('progress-bar').max=Math.max(options.count*states.length,total);$('progress-bar').value=total;
   refreshResults();
  }});
 }finally{setBusy(false);controller=null;refreshResults();}
});
const statusNames={waiting:'대기 중',retrying:'자동 재시도 중',collecting:'수집 중',expanding:'구간 확장 중',complete:'수집 완료',partial:'부분 수집',error:'수집 실패',stopped:'수집 중지'};
function refreshResults(){
 const ready=collectionStates.map((s,i)=>({...s,index:i})).filter(s=>s.report);
 if(!ready.length){notice(collectionStates.filter(s=>s.error).map(s=>s.error).join(' · '));return;}
 if(!collectionStates[detailIndex]?.report)detailIndex=ready[0].index;
 result=collectionStates[detailIndex].report;
 const live=collectionStates.some(s=>['waiting','collecting','expanding','retrying'].includes(s.status));
 const state=live?'collecting':collectionStates.some(s=>s.status==='stopped')?'stopped':collectionStates.some(s=>s.status!=='complete')?'partial':'complete';
 const select=$('detail-gallery');select.replaceChildren(...ready.map(s=>{const o=document.createElement('option');o.value=s.index;o.textContent=s.report.name+' · '+new URL(s.url).searchParams.get('id');return o;}));select.value=detailIndex;
 const aligned=alignReports(collectionStates.map(s=>s.report));
 $('comparison-summary').hidden=collectionStates.length<2;
 $('common-caption').textContent=aligned.commonCount?`공통으로 온전히 수집된 ${number(aligned.commonCount)}개 구간 기준 · ${result.minutes}분당 평균`:'모든 갤러리에 온전히 수집된 공통 구간이 생기면 비교 평균을 표시합니다.';
 $('gallery-cards').replaceChildren(...collectionStates.map((s,i)=>{
  const card=document.createElement('article');card.className='gallery-card';card.style.setProperty('--series',colors[i]);
  const name=document.createElement('strong');name.textContent=(s.report?.name||new URL(s.url).searchParams.get('id'))+' · '+new URL(s.url).searchParams.get('id');
  const average=document.createElement('b');average.textContent=number(aligned.averages[i],1);const unit=document.createElement('small');unit.textContent=`개 / ${result.minutes}분 · 공통 구간 평균`;
  const info=document.createElement('p');info.textContent=`${statusNames[s.status]} · ${number(s.report?.count||0)}개`;
  card.append(name,average,unit,info);if(s.error||s.report?.warning){const error=document.createElement('p');error.className='series-error';error.textContent=s.error||s.report.warning;card.append(error);}return card;
 }));
 $('chart-legend').replaceChildren(...collectionStates.map((s,i)=>{const label=document.createElement('label'),input=document.createElement('input'),dot=document.createElement('i'),text=document.createElement('span');input.type='checkbox';input.checked=!hiddenGalleries.has(i);dot.style.background=colors[i];text.textContent=s.report?.name||new URL(s.url).searchParams.get('id');input.onchange=()=>{input.checked?hiddenGalleries.delete(i):hiddenGalleries.add(i);renderChart();};label.append(input,dot,text);return label;}));
 render(state);
 notice(collectionStates.filter(s=>s.error||s.report?.warning).map(s=>`${s.report?.name||new URL(s.url).searchParams.get('id')}: ${s.error||s.report.warning}`).join(' · '));
}
$('detail-gallery').onchange=()=>{detailIndex=Number($('detail-gallery').value);shown=100;refreshResults();};
function addGallery(value='',focus=true){
 if(document.querySelectorAll('#extra-galleries input').length>=4)return;
 const row=document.createElement('div');row.className='extra-gallery';const input=document.createElement('input');input.type='url';input.required=true;input.placeholder='비교할 갤러리 주소';input.setAttribute('aria-label','비교할 갤러리 주소');
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='삭제';remove.onclick=()=>{row.remove();$('add-gallery').hidden=false;saveGalleryInputs();};row.append(input,remove);$('extra-galleries').append(row);input.value=value;input.addEventListener('input',saveGalleryInputs);if(focus)input.focus();$('add-gallery').hidden=document.querySelectorAll('#extra-galleries input').length>=4;
};
$('add-gallery').onclick=()=>{addGallery();saveGalleryInputs();};
const addressKey='gallery-pulse-addresses-v1';
function saveGalleryInputs(){try{localStorage.setItem(addressKey,JSON.stringify([$('gallery-url').value,...[...document.querySelectorAll('#extra-galleries input')].map(el=>el.value)]));}catch{}}
$('gallery-url').addEventListener('input',saveGalleryInputs);
$('example-button').addEventListener('click',saveGalleryInputs);
try{const saved=JSON.parse(localStorage.getItem(addressKey)||'null');if(Array.isArray(saved)&&saved.length<=5&&saved.every(s=>typeof s==='string'&&s.length<2048)){$('gallery-url').value=saved[0]||'';saved.slice(1).forEach(value=>addGallery(value,false));}}catch{}
$('chart-expand').onchange=()=>{renderChart();$('chart-selection').textContent='구간을 선택해 주세요.';};
for(const button of document.querySelectorAll('[data-chart]'))button.onclick=()=>{chartType=button.dataset.chart;renderChart();};
$('cancel-button').onclick=()=>controller?.abort();
function render(state='complete'){
 const firstRender=$('results').hidden;reportState=state;
 $('empty-state').hidden=true;$('results').hidden=false;
 const live=state==='collecting'||state==='expanding';
 $('results').classList.toggle('live-results',live);
 $('live-status').textContent=state==='collecting'?'실시간 수집 중':state==='expanding'?'시간 구간 확장 중':state==='stopped'?'수집 중지 · 부분 결과':state==='partial'?'부분 수집 결과':'수집 완료';
 $('live-status').classList.toggle('active',live);
 $('live-caption').textContent=live?'페이지를 읽을 때마다 갱신됩니다. 수집이 끝나면 최종 통계가 확정됩니다.':state==='stopped'?'중지하기 전까지 수집된 게시글의 결과입니다.':state==='partial'?'수집된 범위만 표시합니다. 위 안내를 확인해 주세요.':'수집된 게시글과 시간 구간을 모두 반영했습니다.';
 $('gallery-name').textContent=result.name;$('date-range').textContent=`${date(result.oldest)} — ${date(result.newest)} · ${date(result.observedAt)} 수집${result.cached?' (캐시)':''}`;
 $('original-link').href=result.gallery;
 $('data-quality').hidden=!result.bumpedCount;
 $('data-quality').textContent=`탐색한 시간대의 끌올글 ${number(result.bumpedCount)}개를 원래 작성 시각에 합산했습니다.`;
 countUp('average',result.average,1);countUp('peak',result.peak);countUp('total',result.count);countUp('duration',(result.newest-result.oldest)/3600000,1);
 $('average-unit').textContent=$('peak-unit').textContent=`개 / ${result.minutes}분`;
 const peak=result.buckets.find(b=>b.complete&&b.count===result.peak);$('peak-time').textContent=peak?date(peak.time,true):'완전히 수집된 구간이 없습니다';
 $('pages-used').textContent=`${result.firstPage??result.startPage}~${result.lastPage}페이지 · 요청 ${number(result.requested)}개`;
 $('expansion-report').hidden=!result.autoExpand;
 $('expansion-report').textContent=`구간 자동확장 켜짐 · ${number(result.expandedCount)}개 추가 집계${result.buckets.some(b=>b.ongoing)?' · 현재 구간은 진행 중입니다.':''}`;
 $('complete-count').textContent=`완전한 구간 ${number(result.completeIntervals)}개`;
 $('chart-caption').textContent=`${result.minutes}분 단위 · 총 ${number(result.buckets.length)}개 구간`;
 notice(result.warning||'');renderTable();renderChart();
 if(firstRender&&!reducedMotion.matches)document.querySelectorAll('#results .metric,#results .chart-panel,#results .table-panel').forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:550,delay:i*45,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
}
function renderChart(){
 if(!result)return;
 for(const button of document.querySelectorAll('[data-chart]'))button.setAttribute('aria-pressed',String(button.dataset.chart===chartType));
 const entries=collectionStates.map((s,i)=>({...s,color:colors[i],index:i})).filter(s=>!hiddenGalleries.has(s.index)&&(!$('chart-expand').checked||s.report));
 const shared=!$('chart-expand').checked;
 drawChart($('chart'),entries,chartType,$('chart-selection'),{shared});
 const aligned=alignReports(entries.map(s=>s.report),{shared});
 $('chart-caption').textContent=`${shared?'공통 기간':'전체 기간'} · ${result.minutes}분 단위 · ${entries.length}개 갤러리 · ${number(aligned.times.length)}개 구간`;
}
function renderTable(){
 const ready=collectionStates.map((s,i)=>({...s,index:i})).filter(s=>s.report);
 if(!collectionStates[recordIndex]?.report)recordIndex=ready[0]?.index??0;
 const result=collectionStates[recordIndex]?.report;if(!result)return;
 const focused=document.activeElement?.id;
 $('record-tabs').replaceChildren(...ready.map(s=>{const b=document.createElement('button');b.type='button';b.id=`record-tab-${s.index}`;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(s.index===recordIndex));b.setAttribute('aria-controls','record-panel');b.tabIndex=s.index===recordIndex?0:-1;b.textContent=s.report.name;b.onclick=()=>{recordIndex=s.index;shown=100;renderTable();};b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const pos=ready.findIndex(r=>r.index===s.index);recordIndex=ready[e.key==='Home'?0:e.key==='End'?ready.length-1:(pos+(e.key==='ArrowRight'?1:-1)+ready.length)%ready.length].index;shown=100;renderTable();$(`record-tab-${recordIndex}`).focus();}};return b;}));
 $('record-panel').setAttribute('aria-labelledby',`record-tab-${recordIndex}`);
 if(focused?.startsWith('record-tab-'))$(focused)?.focus({preventScroll:true});
 const max=Math.max(1,...result.buckets.map(b=>b.count));const rows=[];
 for(const b of [...result.buckets].reverse().slice(0,shown)){
  const tr=document.createElement('tr');
  const texts=[`${date(b.time,true)} ~ ${date(b.time+result.minutes*60000,true)}`,`${number(b.count)}개`];
  for(const text of texts){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  const distribution=document.createElement('td'),bar=document.createElement('span');bar.className='table-bar';bar.style.width=`${b.count/max*100}%`;distribution.append(bar);tr.append(distribution);
  const state=document.createElement('td'),tag=document.createElement('span');tag.className='tag'+(b.complete?'':' partial')+(b.ongoing?' ongoing':'');tag.textContent=stateLabel(b);state.append(tag);tr.append(state);rows.push(tr);
 }
 $('data-table').replaceChildren(...rows);$('more-button').hidden=shown>=result.buckets.length;$('more-button').textContent=`다음 100개 보기 (${number(Math.min(shown,result.buckets.length))} / ${number(result.buckets.length)})`;
}
$('more-button').onclick=()=>{shown+=100;renderTable();};
$('download-button').onclick=()=>{
 const rows=[['갤러리','주소','시작(KST)','끝(KST)','게시글 수','수집 범위','분석 상태'],...collectionStates.flatMap(s=>s.report?s.report.buckets.map(b=>[s.report.name,s.url,date(b.time),date(b.time+s.report.minutes*60000),b.count,stateLabel(b),statusNames[s.status]]):[])];
 const csv='\uFEFF'+rows.map(r=>r.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=collectionStates.length>1?'gallery-pulse-comparison.csv':`gallery-pulse-${new URL(result.gallery).searchParams.get('id')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
