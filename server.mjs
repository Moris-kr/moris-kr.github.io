import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {collect} from './lib/collector.mjs';
import {normalizeGallery,parsePage} from './lib/core.mjs';
const port=Number(process.env.PORT||8787);
const origin=process.env.ALLOWED_ORIGIN||'https://moris-kr.github.io';
const cache=new Map();let active=0;
const files={'/comparison.mjs':['comparison.mjs','text/javascript; charset=utf-8'],'/charts.mjs':['charts.mjs','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/config.js':['config.js','text/javascript; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin===origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS') {res.writeHead(204,{'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if(u.pathname==='/api/health') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;}
  if(u.pathname==='/api/page'&&req.method==='GET'){
    res.setHeader('Content-Type','application/json; charset=utf-8');
    try{
      const gallery=normalizeGallery(u.searchParams.get('url')||''),page=Number(u.searchParams.get('page')||1);
      if(!Number.isInteger(page)||page<1||page>100520)throw new Error('페이지 번호가 올바르지 않습니다.');
      const upstream=new URL(gallery.url);upstream.searchParams.set('page',page);upstream.searchParams.set('list_num','50');
      const response=await fetch(upstream,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`원본 서버 오류 (${response.status})`);
      const html=await response.text();const data=parsePage(html);
      if(!data.posts.length&&!html.includes('gall_list'))throw new Error('갤러리를 찾을 수 없거나 요청이 제한되었습니다.');
      res.end(JSON.stringify(data));
    }catch(error){res.writeHead(400);res.end(JSON.stringify({message:error.message}));}
    return;
  }
  if(u.pathname==='/api/analyze'&&req.method==='POST') {
    if(req.headers.origin && req.headers.origin!==origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)) {res.writeHead(403);res.end('Origin not allowed');return;}
    if(active>=2) {res.writeHead(429);res.end('수집 서버가 사용 중입니다. 잠시 후 다시 시도해 주세요.');return;}
    let body='';
    try {for await(const chunk of req){body+=chunk;if(body.length>2048)throw new Error('요청이 너무 큽니다.');}} catch{res.writeHead(413);res.end();return;}
    let options;try{options=JSON.parse(body);}catch{res.writeHead(400);res.end('잘못된 요청입니다.');return;}
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
    const send=(type,data)=>{if(!res.destroyed)res.write(JSON.stringify({type,...data})+'\n');};
    const controller=new AbortController();res.on('close',()=>controller.abort());
    const key=JSON.stringify(options),hit=cache.get(key);
    if(hit&&Date.now()-hit.at<120000){send('result',{result:{...hit.result,cached:true}});res.end();return;}
    active++;
    const keepAlive=setInterval(()=>send('heartbeat',{}),8000);
    try {
      const result=await collect(options,{signal:controller.signal,onProgress:data=>send('progress',data)});
      if(cache.size>=30)cache.delete(cache.keys().next().value);
      cache.set(key,{at:Date.now(),result});send('result',{result});
    } catch(error){send('error',{message:error.message||'수집에 실패했습니다.'});}
    finally {active--;clearInterval(keepAlive);res.end();}
    return;
  }
  const file=files[u.pathname]||({'/analysis.mjs':['analysis.mjs','text/javascript; charset=utf-8'],'/collect.mjs':['collect.mjs','text/javascript; charset=utf-8']})[u.pathname];
  if(req.method!=='GET'||!file){res.writeHead(404);res.end();return;}
  try{res.setHeader('Content-Type',file[1]);res.end(await readFile(new URL('./public/'+file[0],import.meta.url)));}catch{res.writeHead(500);res.end();}
});
server.requestTimeout=300000;
server.listen(port,'0.0.0.0',()=>console.log(`Gallery Pulse: http://localhost:${port}`));
