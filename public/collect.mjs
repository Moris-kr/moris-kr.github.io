import {normalizeGallery,summarize} from './analysis.mjs';
export async function collectRemote(base,options,{signal,onProgress=()=>{},delay=350,fetchPage=fetch}={}) {
 const gallery=normalizeGallery(options.url),posts=new Map(),startedAt=Date.now();
 const {count=2500,page=1,minutes=60}=options;
 for(const [n,min,max]of [[count,1,10000],[page,1,100000],[minutes,1,1440]])if(!Number.isInteger(n)||n<min||n>max)throw new Error('분석 설정의 입력 범위를 확인해 주세요.');
 let name=gallery.id,lastPage=page,warning='',empty=0;
 for(let current=page;current<page+Math.ceil(count/20)+20;current++){
  signal?.throwIfAborted();
  if(current>page&&delay)await new Promise(resolve=>setTimeout(resolve,delay));
  let data;
  try{
   const u=new URL(base+'/api/page');u.searchParams.set('url',gallery.url);u.searchParams.set('page',current);
   const response=await fetchPage(u,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
   data=await response.json();if(!response.ok)throw new Error(data.message||`수집 서버 오류 (${response.status})`);
   if(!Array.isArray(data.posts))throw new Error('수집 서버의 응답 형식이 올바르지 않습니다.');
  }catch(error){
   if(signal?.aborted)throw error;
   if(!posts.size)throw error;
   warning=`${current}페이지에서 수집이 중단되어 ${posts.size.toLocaleString()}개만 분석했습니다. ${error.message}`;break;
  }
  name=data.name||name;lastPage=current;let added=0;
  for(const p of data.posts)if(!posts.has(p.id)&&posts.size<count&&/^\d+$/.test(p.id)&&Number.isFinite(p.time)){posts.set(p.id,p);added++;}
  onProgress({collected:posts.size,target:count,page:current,name});
  if(posts.size===count)break;
  empty=added?0:empty+1;
  if(empty>=2){warning='더 이상 읽을 수 있는 일반 게시글이 없어 수집을 마쳤습니다.';break;}
 }
 if(posts.size<count&&!warning)warning='탐색 한도에 도달해 수집된 글만 표시합니다.';
 return {...summarize([...posts.values()],minutes,startedAt),name,gallery:gallery.url,requested:count,startPage:page,lastPage,observedAt:startedAt,completedAt:Date.now(),warning};
}
