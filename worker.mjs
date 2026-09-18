import {normalizeGallery} from './public/analysis.mjs';
export async function parseResponse(response){
 const posts=[];let row=null,name='',found=false;
 const rewriter=new HTMLRewriter()
 .on('.gall_list',{element(){found=true;}})
 .on('.page_head h2 > a',{text(t){name+=t.text;}})
 .on('tr.ub-content',{element(e){
  const type=e.getAttribute('data-type')||'';
  row={id:'',subject:'',time:null,skip:/^(icon_notice|icon_recom)/.test(type)||(e.getAttribute('class')||'').includes('ub-notice')};
  e.onEndTag(()=>{if(row&&!row.skip&&/^\d+$/.test(row.id.trim())&&!/^(공지|AD|설문)$/.test(row.subject.trim())&&Number.isFinite(row.time))posts.push({id:row.id.trim(),time:row.time});row=null;});
 }})
 .on('tr.ub-content .gall_num',{text(t){if(row)row.id+=t.text;}})
 .on('tr.ub-content .gall_subject',{text(t){if(row)row.subject+=t.text;}})
 .on('tr.ub-content .gall_date',{element(e){const time=e.getAttribute('title');if(row&&time&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(time))row.time=Date.parse(time.replace(' ','T')+'+09:00');}});
 const transformed=rewriter.transform(response),reader=transformed.body.getReader();let bytes=0;
 while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4000000){await reader.cancel();throw new Error('원본 응답 크기가 너무 큽니다.');}}
 if(!found&&!posts.length)throw new Error('갤러리를 찾을 수 없거나 원본 서버가 요청을 제한했습니다.');
 return {posts,name:name.replace(/(갤러리)(마이너|미니)$/,'$1').trim()};
}
export default {async fetch(request,env,ctx){
 const u=new URL(request.url),origin=request.headers.get('Origin');
 const allowed='https://moris-kr.github.io';
 const headers={'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':allowed,'Vary':'Origin'};
 const json=(body,status=200)=>Response.json(body,{status,headers});
 if(origin&&origin!==allowed&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))return json({message:'허용되지 않은 출처입니다.'},403);
 if(origin&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))headers['Access-Control-Allow-Origin']=origin;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
 if(request.method!=='GET')return json({message:'GET 요청만 지원합니다.'},405);
 if(u.pathname==='/api/health')return json({ok:true});
 if(u.pathname!=='/api/page')return json({message:'요청한 API가 없습니다.'},404);
 let gallery,page;
 try{gallery=normalizeGallery(u.searchParams.get('url')||'');page=Number(u.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100520)throw new Error('페이지 번호가 올바르지 않습니다.');}catch(error){return json({message:error.message},400);}
 const upstream=new URL(gallery.url);upstream.searchParams.set('page',page);upstream.searchParams.set('list_num','50');
 const cacheUrl=new URL('/_cache',u.origin);cacheUrl.searchParams.set('source',upstream.href);
 const cache=caches.default,key=new Request(cacheUrl),cached=await cache.match(key);
 if(cached){const data=await cached.json();return json({...data,cached:true});}
 try{
  const response=await fetch(upstream,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; GalleryPulse/1.0)','Referer':gallery.url},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return json({message:`원본 서버에서 수집을 제한했습니다. (${response.status})`},502);
  const data=await parseResponse(response);
  ctx.waitUntil(cache.put(key,Response.json(data,{headers:{'Cache-Control':'public, max-age=30'}})));
  return json(data);
 }catch(error){console.error(JSON.stringify({event:'page_collection_failed',name:error.name,message:error.message}));return json({message:'갤러리에 연결하지 못했습니다. 주소를 확인하거나 잠시 후 다시 시도해 주세요.'},502);}
}};
