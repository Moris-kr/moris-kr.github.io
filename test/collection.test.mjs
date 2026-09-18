import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectRemote} from '../public/collect.mjs';
const base='https://collector.example';
const options={url:'https://gall.dcinside.com/mgallery/board/lists/?id=gov',count:3,page:8,minutes:60};
const p=(id,hour)=>({id:String(id),time:Date.parse(`2026-09-18T${hour}:00:00+09:00`)});
test('starts on requested page, removes overlapping IDs and stops at exact target',async()=>{
 const visited=[];const pages=[[p(4,'12'),p(3,'11')],[p(3,'11'),p(2,'10'),p(1,'09')]];
 const r=await collectRemote(base,options,{delay:0,fetchPage:async u=>{visited.push(u.searchParams.get('page'));return Response.json({name:'테스트',posts:pages.shift()});}});
 assert.deepEqual(visited,['8','9']);assert.equal(r.count,3);assert.equal(r.oldest,p(2,'10').time);assert.equal(r.warning,'');
});
test('reports a partial result when an upstream page fails',async()=>{
 let calls=0;const r=await collectRemote(base,options,{delay:0,fetchPage:async()=>++calls===1?Response.json({posts:[p(3,'11')]}):Response.json({message:'수집 제한'},{status:502})});
 assert.equal(r.count,1);assert.match(r.warning,/중단/);assert.equal(r.average,null);
});
test('empty or invalid galleries are not fabricated as zero activity',async()=>{
 await assert.rejects(collectRemote(base,options,{delay:0,fetchPage:async()=>Response.json({posts:[]})}),/게시글이 없습니다/);
 await assert.rejects(collectRemote(base,{...options,count:-1}),/입력 범위/);
});
test('cancellation stops a collection',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(collectRemote(base,options,{signal:controller.signal}),{name:'AbortError'});
});
