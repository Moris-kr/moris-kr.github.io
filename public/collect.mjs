import {normalizeGallery,summarize} from './analysis.mjs';

export async function collectRemote(base,options,{signal,onProgress=()=>{},delay=350,fetchPage=fetch,now=Date.now}={}) {
 const gallery=normalizeGallery(options.url),posts=new Map(),startedAt=now();
 const {count=2500,page=1,minutes=60,autoExpand=true}=options;
 for(const [n,min,max]of [[count,1,10000],[page,1,100000],[minutes,1,1440]])if(!Number.isInteger(n)||n<min||n>max)throw new Error('분석 설정의 입력 범위를 확인해 주세요.');
 let name=gallery.id,lastPage=page,firstPage=page,warning='',empty=0,requests=0;
 const pages=new Map();
 async function read(current){
  signal?.throwIfAborted();
  if(requests++&&delay)await new Promise(resolve=>setTimeout(resolve,delay));
  signal?.throwIfAborted();
  const u=new URL(base+'/api/page');u.searchParams.set('url',gallery.url);u.searchParams.set('page',current);
  const response=await fetchPage(u,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  const data=await response.json();if(!response.ok)throw new Error(data.message||`수집 서버 오류 (${response.status})`);
  if(!Array.isArray(data.posts))throw new Error('수집 서버의 응답 형식이 올바르지 않습니다.');
  name=data.name||name;lastPage=Math.max(lastPage,current);firstPage=Math.min(firstPage,current);
  const valid=data.posts.filter(p=>/^\d+$/.test(p.id)&&Number.isFinite(p.time)&&p.time<=startedAt).sort((a,b)=>b.time-a.time);
  pages.set(current,valid);return valid;
 }
 const progress=(current,phase)=>onProgress({collected:posts.size,target:count,page:current,name,phase});
 for(let current=page;current<page+Math.ceil(count/20)+20;current++){
  let data;
  try{data=await read(current);}catch(error){
   if(signal?.aborted)throw error;
   if(!posts.size)throw error;
   warning=`${current}페이지에서 수집이 중단되어 ${posts.size.toLocaleString()}개만 분석했습니다. ${error.message}`;break;
  }
  let added=0;
  for(const p of data)if(!posts.has(p.id)&&posts.size<count){posts.set(p.id,p);added++;}
  progress(current,'sample');
  if(posts.size===count)break;
  empty=added?0:empty+1;
  if(empty>=2){warning='더 이상 읽을 수 있는 일반 게시글이 없어 수집을 마쳤습니다.';break;}
 }
 if(posts.size<count&&!warning)warning='탐색 한도에 도달해 수집된 글만 표시합니다.';
 const sampleCount=posts.size,coverage={};
 if(autoExpand&&sampleCount&&!warning){
  const times=[...posts.values()].map(p=>p.time),width=minutes*60000,offset=9*3600000;
  const floor=t=>Math.floor((t+offset)/width)*width-offset;
  const start=floor(Math.min(...times)),end=floor(Math.max(...times))+width;
  let lower=false,upper=page===1,extraPages=0;
  const accept=data=>{
   for(const p of data){
    if(p.time<start)lower=true;
    if(p.time>=end)upper=true;
    if(p.time>=start&&p.time<end&&posts.size<50000)posts.set(p.id,p);
   }
  };
  for(const data of pages.values())accept(data);
  async function expand(current,direction){
   let unchanged=0;
   while(current>=1&&current<=100520&&extraPages<200&&posts.size<50000){
    if(direction===1?lower:upper)break;
    extraPages++;
    const size=posts.size,data=await read(current);accept(data);
    if(direction===-1&&current===1)upper=true;
    progress(current,'expand');
    unchanged=posts.size===size?unchanged+1:0;
    if(!data.length||unchanged>=3)break;
    current+=direction;
   }
  }
  // Cross each time boundary before claiming the entire interval was observed.
  try{await expand(lastPage+1,1);}catch(error){if(signal?.aborted)throw error;warning=`과거 구간 확장을 완료하지 못했습니다. ${error.message}`;}
  try{await expand(page-1,-1);}catch(error){if(signal?.aborted)throw error;warning+=(warning?' ':'')+`시작 구간 확장을 완료하지 못했습니다. ${error.message}`;}
  if(posts.size>=50000){lower=false;upper=false;warning='확장 수집 한도 50,000개에 도달했습니다. 경계 구간은 일부 구간으로 표시합니다.';}
  if(lower)coverage.start=start;
  if(upper)coverage.end=Math.min(end,startedAt);
  if((!lower||!upper)&&!warning)warning='일부 구간은 확장 탐색 한도 또는 목록 끝에 도달해 전체 범위를 확인하지 못했습니다.';
 }
 return {...summarize([...posts.values()],minutes,startedAt,coverage),name,gallery:gallery.url,requested:count,startPage:page,firstPage,lastPage,observedAt:startedAt,completedAt:now(),warning,autoExpand,expandedCount:posts.size-sampleCount};
}
