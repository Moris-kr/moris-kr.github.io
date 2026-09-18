import {cachedTail,applyConfirmed} from './confirmed.mjs';
import {normalizeGallery,summarize,chronologicalPosts} from './analysis.mjs';

export function abortableWait(ms,signal){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  signal?.addEventListener('abort',abort,{once:true});
 });
}
export async function collectRemote(base,options,{signal,onProgress=()=>{},delay=350,fetchPage=fetch,now=Date.now,sleep=abortableWait,maxRetries=Infinity,getConfirmed=null,includePosts=false,emitSnapshots=true}={}) {
 const gallery=normalizeGallery(options.url),posts=new Map(),startedAt=now();
 const {count=2500,page=1,minutes=60,autoExpand=true}=options;
 for(const [n,min,max]of [[count,1,10000],[page,1,100000],[minutes,1,1440]])if(!Number.isInteger(n)||n<min||n>max)throw new Error('분석 설정의 입력 범위를 확인해 주세요.');
 let name=gallery.id,lastPage=page,firstPage=page,warning='',empty=0,requests=0;
 let confirmed=[],confirmedLoaded=false;
 const pages=new Map(),deferredBumps=new Map(),coverage={};
 const collectedSummary=(withPosts=false)=>{
  const merged=new Map(posts),times=[...posts.values()].map(p=>p.time);
  const start=coverage.start??Math.min(...times),end=coverage.end??Math.max(...times);
  let bumpedCount=0;
  for(const p of deferredBumps.values())if(!merged.has(p.id)&&p.time>=start&&(coverage.end===undefined?p.time<=end:p.time<end)){
   merged.set(p.id,p);bumpedCount++;
  }
  return {...applyConfirmed(summarize([...merged.values()],minutes,startedAt,coverage),confirmed),bumpedCount,...(withPosts?{_posts:[...merged.values()]}:{})};
 };
 const snapshot=()=>({...collectedSummary(),name,gallery:gallery.url,requested:count,startPage:page,firstPage,lastPage,observedAt:startedAt,warning,autoExpand,expandedCount:Math.max(0,posts.size-count)});
 async function read(current){
  signal?.throwIfAborted();
  if(requests++&&delay)await sleep(delay,signal);
  signal?.throwIfAborted();
  const u=new URL(base+'/api/page');u.searchParams.set('url',gallery.url);u.searchParams.set('page',current);
  let data;
  for(let attempt=0;;attempt++){
   signal?.throwIfAborted();
   let retryAfter=0;
   try{
    const response=await fetchPage(u,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    const header=response.headers.get('Retry-After');
    if(header)retryAfter=Math.max(0,/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now())||0;
    if(!response.ok){
     let message;try{message=(await response.json()).message;}catch{}
     const error=new Error(message||`수집 서버 오류 (${response.status})`);
     error.retryable=response.status===408||response.status===429||response.status>=500;throw error;
    }
    data=await response.json();
    if(!Array.isArray(data.posts))throw new Error('수집 서버의 응답 형식이 올바르지 않습니다.');
    break;
   }catch(error){
    if(signal?.aborted)throw signal.reason;
    if(error.retryable===false||attempt>=maxRetries)throw error;
    const waitMs=Math.min(2147483647,Math.max(retryAfter,Math.min(30000,2000*2**Math.min(attempt,4))));
    onProgress({collected:posts.size,target:count,page:current,name,phase:'retry',attempt:attempt+1,waitMs,message:error.message,snapshot:posts.size&&emitSnapshots?snapshot():null});
    await sleep(waitMs,signal);
   }
  }
  if(!confirmedLoaded&&data.posts.length&&getConfirmed){confirmedLoaded=true;try{confirmed=await getConfirmed(Math.max(...data.posts.map(p=>p.time)));}catch(error){if(signal?.aborted)throw error;}}
  name=data.name||name;lastPage=Math.max(lastPage,current);firstPage=Math.min(firstPage,current);
  const isValid=p=>p&&/^\d+$/.test(p.id)&&Number.isFinite(p.time)&&p.time<=startedAt;
  const checked=chronologicalPosts(data.posts.filter(isValid));
  for(const p of [...checked.bumpedPosts,...(Array.isArray(data.bumpedPosts)?data.bumpedPosts:[])].filter(isValid))deferredBumps.set(p.id,p);
  const valid=checked.posts;
  pages.set(current,valid);return valid;
 }
 const progress=(current,phase)=>onProgress({collected:posts.size,target:count,page:current,name,phase,snapshot:posts.size&&emitSnapshots?snapshot():null});
 for(let current=page;current<page+Math.ceil(count/20)+20;current++){
  let data;
  try{data=await read(current);}catch(error){
   if(signal?.aborted)throw error;
   if(!posts.size)throw error;
   warning=`${current}페이지에서 수집이 중단되어 ${posts.size.toLocaleString()}개만 분석했습니다. ${error.message}`;break;
  }
  let added=0;
  for(const p of data)if(!posts.has(p.id)&&posts.size<count){posts.set(p.id,p);added++;}
  const tail=cachedTail([...posts.values()],confirmed,count,minutes);
  for(const p of tail)if(posts.size<count)posts.set(p.id,p);
  progress(current,'sample');
  if(posts.size===count)break;
  empty=added?0:empty+1;
  if(empty>=2){warning='더 이상 읽을 수 있는 일반 게시글이 없어 수집을 마쳤습니다.';break;}
 }
 if(posts.size<count&&!warning)warning='탐색 한도에 도달해 수집된 글만 표시합니다.';
 const sampleCount=posts.size;
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
  for(const bin of confirmed)if(bin.time>=start&&bin.time<end&&Array.isArray(bin.posts)){
   accept(bin.posts);if(bin.time===start)lower=true;if(bin.time+width===end)upper=true;
  }
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
 return {...collectedSummary(includePosts),name,gallery:gallery.url,requested:count,startPage:page,firstPage,lastPage,observedAt:startedAt,completedAt:now(),warning,autoExpand,expandedCount:posts.size-sampleCount};
}
