import {collectRemote} from './collect.mjs';
const $=id=>document.getElementById(id);
const number=(n,d=0)=>n==null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:d});
const date=(t,short=false)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(short?{}:{year:'numeric'})}).format(t);
let result=null,controller=null,shown=100;
const notice=message=>{$('notice').textContent=message;$('notice').hidden=!message;};
function endpoint(){
 const configured=window.GALLERY_API_BASE?.replace(/\/$/,'');
 if(configured){const url=new URL(configured);if(url.protocol!=='https:')throw new Error('수집 서버는 HTTPS 주소여야 합니다.');return configured;}
 if(['localhost','127.0.0.1'].includes(location.hostname))return location.origin;
 throw new Error('공개 수집 서버가 아직 연결되지 않았습니다. 현재는 프로젝트에서 npm start로 실행한 로컬 사이트에서 분석할 수 있습니다.');
}
function setBusy(busy){$('submit-button').disabled=busy;$('progress').hidden=!busy;for(const id of ['gallery-url','minutes','count','page','example-button'])$(id).disabled=busy;}
$('example-button').onclick=()=>{$('gallery-url').value='https://gall.dcinside.com/mgallery/board/lists/?id=gov';$('gallery-url').focus();};
for(const id of ['minutes','count','page'])$(id).addEventListener('input',()=>{$('settings-summary').textContent=`${$('minutes').value}분 · ${number(Number($('count').value))}개 · ${$('page').value}페이지부터`;});
$('analyze-form').addEventListener('submit',async event=>{
 event.preventDefault();notice('');let base;
 try{base=endpoint();}catch(error){notice(error.message);return;}
 const options={url:$('gallery-url').value.trim(),minutes:Number($('minutes').value),count:Number($('count').value),page:Number($('page').value)};
 try{const url=new URL(options.url);if(url.hostname!=='gall.dcinside.com'||url.protocol!=='https:')throw new Error();}catch{notice('https://gall.dcinside.com으로 시작하는 갤러리 주소를 입력해 주세요.');return;}
 controller=new AbortController();setBusy(true);$('progress-label').textContent='갤러리에 연결하고 있습니다.';$('progress-bar').max=options.count;$('progress-bar').value=0;
 try{
  result=await collectRemote(base,options,{signal:controller.signal,onProgress:message=>{$('progress-label').textContent=`${message.name} · ${number(message.collected)} / ${number(message.target)}개 · ${message.page}페이지`;$('progress-bar').value=message.collected;}});
  render();
 }catch(error){notice(error.name==='AbortError'?'수집을 중지했습니다.':error.message==='Failed to fetch'?'수집 서버에 연결할 수 없습니다. 서버 실행 상태와 주소를 확인해 주세요.':error.message);}
 finally{setBusy(false);controller=null;}
});
$('cancel-button').onclick=()=>controller?.abort();
function render(){
 $('empty-state').hidden=true;$('results').hidden=false;
 $('gallery-name').textContent=result.name;$('date-range').textContent=`${date(result.oldest)} — ${date(result.newest)} · ${date(result.observedAt)} 수집${result.cached?' (캐시)':''}`;
 $('original-link').href=result.gallery;
 $('average').textContent=number(result.average,1);$('peak').textContent=number(result.peak);$('total').textContent=number(result.count);$('duration').textContent=number((result.newest-result.oldest)/3600000,1);
 $('average-unit').textContent=$('peak-unit').textContent=`개 / ${result.minutes}분`;
 const peak=result.buckets.find(b=>b.complete&&b.count===result.peak);$('peak-time').textContent=peak?date(peak.time,true):'완전히 수집된 구간이 없습니다';
 $('pages-used').textContent=`${result.startPage}~${result.lastPage}페이지 · 요청 ${number(result.requested)}개`;
 $('complete-count').textContent=`완전한 구간 ${number(result.completeIntervals)}개`;
 $('chart-caption').textContent=`${result.minutes}분 단위 · 총 ${number(result.buckets.length)}개 구간`;
 notice(result.warning||'');shown=100;renderTable();renderChart();
}
function renderChart(){
 if(!result)return;
 const bins=result.buckets,max=Math.max(1,...bins.map(b=>b.count));
 const width=Math.max(640,Math.min(12000,bins.length*12+70)),height=260,left=42,right=12,top=20,bottom=35,plotW=width-left-right,plotH=height-top-bottom;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=Math.min(width,12000)+'px';
 const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;};
 for(let i=0;i<=4;i++){const y=top+plotH*i/4;add('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#ffffff0a'});add('text',{x:left-8,y:y+4,'text-anchor':'end'},number(Math.round(max*(1-i/4))));}
 bins.forEach((b,i)=>{
  const x=left+i*plotW/bins.length,h=Math.max(1,b.count/max*plotH),step=plotW/bins.length;
  const label=`${date(b.time,true)} ~ ${date(b.time+result.minutes*60000,true)} · ${number(b.count)}개 · ${b.complete?'완전한 구간':'일부 수집 구간'}`;
  const bar=add('rect',{x:x+1,y:top+plotH-h,width:Math.max(.3,step-2),height:h,rx:Math.min(2,step/4),class:`bar${b.complete?'':' partial'}`,tabindex:i<300?'0':'-1',role:'button','aria-label':label});
  const title=document.createElementNS(ns,'title');title.textContent=label;bar.append(title);
  const select=()=>{$('chart-selection').textContent=label;};bar.addEventListener('click',select);bar.addEventListener('focus',select);bar.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
  const stride=Math.max(1,Math.ceil(bins.length/(width/120)));if(i%stride===0)add('text',{x:x+3,y:height-10},date(b.time,true));
 });
 $('chart').replaceChildren(svg);$('chart').setAttribute('aria-label',`${result.minutes}분 단위 게시글 ${result.buckets.length}개 구간. 자세한 수치는 아래 표에 있습니다.`);$('chart-selection').textContent='구간을 선택해 주세요.';
}
function renderTable(){
 const max=Math.max(1,...result.buckets.map(b=>b.count));const rows=[];
 for(const b of [...result.buckets].reverse().slice(0,shown)){
  const tr=document.createElement('tr');
  const texts=[`${date(b.time,true)} ~ ${date(b.time+result.minutes*60000,true)}`,`${number(b.count)}개`];
  for(const text of texts){const td=document.createElement('td');td.textContent=text;tr.append(td);}
  const distribution=document.createElement('td'),bar=document.createElement('span');bar.className='table-bar';bar.style.width=`${b.count/max*100}%`;distribution.append(bar);tr.append(distribution);
  const state=document.createElement('td'),tag=document.createElement('span');tag.className='tag'+(b.complete?'':' partial');tag.textContent=b.complete?'전체 구간':'일부 구간';state.append(tag);tr.append(state);rows.push(tr);
 }
 $('data-table').replaceChildren(...rows);$('more-button').hidden=shown>=result.buckets.length;$('more-button').textContent=`다음 100개 보기 (${number(Math.min(shown,result.buckets.length))} / ${number(result.buckets.length)})`;
}
$('more-button').onclick=()=>{shown+=100;renderTable();};
$('download-button').onclick=()=>{
 const rows=[['시작(KST)','끝(KST)','게시글 수','완전한 구간'],...result.buckets.map(b=>[date(b.time),date(b.time+result.minutes*60000),b.count,b.complete?'예':'아니오'])];
 const csv='\uFEFF'+rows.map(r=>r.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`gallery-pulse-${new URL(result.gallery).searchParams.get('id')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
