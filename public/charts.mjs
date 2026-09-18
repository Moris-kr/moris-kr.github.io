import {alignReports} from './comparison.mjs';
export const colors=['#b5d886','#e8b77c','#80c6cf','#e79eaa','#c3bb8c'];
const fmt=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t);
const status=b=>b.ongoing?'진행 중':b.complete?'전체 구간':'일부 구간';
export function drawChart(container,entries,type,selection,{shared=true}={}){
 const {times,series}=alignReports(entries.map(e=>e.report),{shared});
 if(!times.length){container.textContent=entries.length?'공통으로 수집된 시간 구간을 기다리고 있습니다. 전체 기간으로 확장하면 개별 수집 범위를 볼 수 있습니다.':'표시할 갤러리를 선택해 주세요.';return;}
 const stacked=type==='stack',width=Math.max(680,Math.min(12000,times.length*18+70)),height=290,left=48,top=20,bottom=38,plotH=height-top-bottom,plotW=width-left-14,interval=entries[0].report.minutes*60000,step=plotW/((times.at(-1)-times[0])/interval+1);
 const slot=i=>(times[i]-times[0])/interval;
 // Stacks exist only where every visible series has data; missing is never zero.
 const sums=times.map((_,i)=>series.every(s=>s[i])?series.reduce((n,s)=>n+s[i].count,0):null);
 const max=Math.max(1,...(stacked?sums.filter(v=>v!==null):series.flatMap(s=>s.filter(Boolean).map(b=>b.count))));
 const y=v=>top+plotH-v/max*plotH,x=i=>left+(slot(i)+.5)*step;
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.style.minWidth=width+'px';
 const add=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;svg.append(el);return el;};
 for(let i=0;i<=4;i++){const v=max*i/4;add('line',{x1:left,x2:width-14,y1:y(v),y2:y(v),stroke:'#ffffff12'});add('text',{x:left-8,y:y(v)+4,'text-anchor':'end'},Math.round(v).toLocaleString());}
 const previous=container._chartValues||new Map(),next=new Map(),animations=[];
 series.forEach((data,s)=>{
  const color=entries[s].color,key=entries[s].url;
  if(type==='bar')data.forEach((b,i)=>{if(!b)return;const h=Math.max(1,b.count/max*plotH),bw=step/series.length;
   const rect=add('rect',{x:left+slot(i)*step+s*bw+1,y:y(b.count),width:Math.max(.4,bw-2),height:h,rx:2,fill:color,opacity:b.complete?1:.45});
   rect.style.transformBox='fill-box';rect.style.transformOrigin='center bottom';const id=key+':'+b.time,old=previous.get(id);next.set(id,h);
   if(old!==h)animations.push(()=>rect.animate([{transform:`scaleY(${old?old/h:.02})`},{transform:'scaleY(1)'}],{duration:400,easing:'cubic-bezier(.16,1,.3,1)'}));
  });else{
   let segment=[];const flush=()=>{if(!segment.length)return;
    const upper=segment.map(i=>[x(i),y(stacked?series.slice(0,s+1).reduce((n,a)=>n+a[i].count,0):data[i].count)]);
    if(stacked){const lower=[...segment].reverse().map(i=>[x(i),y(series.slice(0,s).reduce((n,a)=>n+a[i].count,0))]);add('path',{d:'M'+[...upper,...lower].map(p=>p.join(',')).join(' L')+' Z',fill:color,opacity:.55});}
    add('path',{d:'M'+upper.map(p=>p.join(',')).join(' L'),fill:'none',stroke:color,'stroke-width':2.5,'stroke-linejoin':'round'});
    segment.forEach((i,j)=>add('circle',{cx:upper[j][0],cy:upper[j][1],r:data[i].complete?3:4,fill:data[i].complete?color:'#191d19',stroke:color,'stroke-width':1.5}));segment=[];
   };
   data.forEach((b,i)=>{if(!b||(stacked&&sums[i]===null)){flush();return;}if(segment.length&&times[i]-times[segment.at(-1)]!==entries[s].report.minutes*60000)flush();segment.push(i);});flush();
  }
 });
 const stride=Math.max(1,Math.ceil(times.length/(width/130)));
 times.forEach((t,i)=>{
  if(i%stride===0)add('text',{x:x(i),y:height-10,'text-anchor':'middle'},fmt(t));
  const label=fmt(t)+' · '+entries.map((e,s)=>`${e.report.name}: ${series[s][i]?series[s][i].count.toLocaleString()+'개 ('+status(series[s][i])+')':'미수집'}`).join(' / ');
  const hit=add('rect',{x:left+slot(i)*step,y:top,width:step,height:plotH,fill:'transparent',tabindex:i<300?0:-1,role:'button','aria-label':label});
  const title=document.createElementNS(ns,'title');title.textContent=label;hit.append(title);
  const select=()=>{selection.textContent=label;};hit.onclick=select;hit.onfocus=select;hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};
 });
 const scroll=container.scrollLeft;container.replaceChildren(svg);container.scrollLeft=scroll;container._chartValues=next;
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){animations.forEach(fn=>fn());if(type!=='bar')svg.animate([{opacity:.65},{opacity:1}],{duration:350});}
}
