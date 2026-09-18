import {normalizeGallery,parsePage,summarize} from './core.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function collect(options,{signal,onProgress=()=>{},fetchPage=fetch}={}) {
  const gallery=normalizeGallery(options.url);
  const count=options.count??2500,page=options.page??1,minutes=options.minutes??60;
  for(const [value,min,max,label] of [[count,1,10000,'수집 글 수'],[page,1,100000,'시작 페이지'],[minutes,1,1440,'집계 간격']]) if(!Number.isInteger(value)||value<min||value>max) throw new Error(`${label}는 ${min.toLocaleString()}~${max.toLocaleString()} 사이의 정수여야 합니다.`);
  const unique=new Map();let name=gallery.id,lastPage=page,warning='',emptyPages=0;
  const beganAt=Date.now();
  for(let current=page;current<page+Math.ceil(count/20)+20;current++) {
    signal?.throwIfAborted();
    if(current>page) await pause(350);
    const u=new URL(gallery.url);u.searchParams.set('page',String(current));u.searchParams.set('list_num','50');
    let parsed;
    try {
      const response=await fetchPage(u,{headers:{'User-Agent':'Mozilla/5.0 (compatible; GalleryPulse/1.0)','Referer':gallery.url},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`원본 서버 응답 ${response.status}`);
      const html=await response.text();
      if(html.length>4000000) throw new Error('원본 페이지가 너무 큽니다.');
      parsed=parsePage(html);
      if(!parsed.posts.length && !html.includes('gall_list')) throw new Error('갤러리를 찾을 수 없거나 원본 서버가 요청을 제한했습니다.');
    } catch(error) {
      if(signal?.aborted) throw error;
      if(!unique.size) throw error;
      warning=`${current}페이지 수집이 중단되었습니다. 수집된 글만 표시합니다. ${error.message}`; break;
    }
    lastPage=current;name=parsed.name||name;
    let added=0;
    for(const p of parsed.posts) if(!unique.has(p.id) && unique.size<count) {unique.set(p.id,p);added++;}
    onProgress({collected:unique.size,target:count,page:current,name});
    if(unique.size>=count) break;
    if(!added) emptyPages++;else emptyPages=0;
    if(emptyPages>=2) {warning='더 이상 읽을 수 있는 일반 게시글이 없어 수집을 마쳤습니다.';break;}
  }
  if(unique.size<count&&!warning) warning='탐색 한도에 도달해 수집된 글만 표시합니다.';
  return {...summarize([...unique.values()],minutes,beganAt),name,gallery:gallery.url,requested:count,startPage:page,lastPage,observedAt:beganAt,completedAt:Date.now(),warning};
}
