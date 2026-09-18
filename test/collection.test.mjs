import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectRemote} from '../public/collect.mjs';
const base='https://collector.example';
const options={url:'https://gall.dcinside.com/mgallery/board/lists/?id=gov',count:3,page:8,minutes:60,autoExpand:false};
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
test('emits immutable chart snapshots after each page before collection completes',async()=>{
 const snapshots=[];let calls=0;
 const r=await collectRemote(base,options,{delay:0,fetchPage:async()=>{
  calls++;
  if(calls===2)assert.equal(snapshots[0]?.count,2);
  return Response.json({posts:calls===1?[p(4,'12'),p(3,'11')]:[p(2,'10')]});
 },onProgress:message=>snapshots.push(message.snapshot)});
 assert.deepEqual(snapshots.map(s=>s.count),[2,3]);
 assert.equal(snapshots[0].buckets.reduce((n,b)=>n+b.count,0),2);
 assert.equal(r.count,3);
});
test('defers bumped posts until their original time has actually been traversed',async()=>{
 const pages={1:{posts:[p(5,'12'),p(4,'11')],bumpedPosts:[p(1,'08')]},2:{posts:[p(3,'10'),p(2,'09')]},3:{posts:[p(1,'08'),p(0,'07')]}};
 const run=count=>collectRemote(base,{...options,page:1,count},{delay:0,fetchPage:async u=>Response.json(pages[+u.searchParams.get('page')]||{posts:[]})});
 const short=await run(3);assert.equal(short.oldest,p(3,'10').time);assert.equal(short.count,3);assert.equal(short.bumpedCount,0);
 const long=await run(5);assert.equal(long.count,5);assert.equal(long.buckets.find(b=>b.time===p(1,'08').time).count,1);
});
test('counts a deferred bumped post once its timestamp is within the traversed range',async()=>{
 const pages={1:{posts:[p(5,'12'),p(4,'11')],bumpedPosts:[p(1,'08')]},2:{posts:[p(3,'09'),p(2,'07')]}};
 const r=await collectRemote(base,{...options,page:1,count:4},{delay:0,fetchPage:async u=>Response.json(pages[+u.searchParams.get('page')]||{posts:[]})});
 assert.equal(r.count,5);assert.equal(r.bumpedCount,1);assert.equal(r.buckets.find(b=>b.time===p(1,'08').time).count,1);
});
test('expands both edges to full intervals and excludes boundary-crossing evidence',async()=>{
 const post=(id,t)=>({id:String(id),time:Date.parse(`2026-09-18T${t}:00+09:00`)});
 const pages={8:[post(6,'12:40'),post(5,'12:20'),post(4,'11:50')],9:[post(3,'11:30'),post(2,'11:00'),post(1,'10:55')],7:[post(8,'13:00'),post(7,'12:55')]};
 const visited=[];
 const r=await collectRemote(base,{...options,autoExpand:true},{delay:0,fetchPage:async u=>{const page=+u.searchParams.get('page');visited.push(page);return Response.json({posts:pages[page]||[]});}});
 assert.equal(r.count,6);assert.equal(r.expandedCount,3);assert.equal(r.completeIntervals,2);assert.equal(r.average,3);
 assert.deepEqual(r.buckets.map(b=>b.count),[3,3]);assert.deepEqual(visited,[8,9,7]);
});
test('default expansion keeps the current interval ongoing instead of complete',async()=>{
 const now=Date.parse('2026-09-18T12:45:00+09:00');
 const r=await collectRemote(base,{...options,page:1,count:1,autoExpand:undefined},{now:()=>now,delay:0,fetchPage:async()=>Response.json({posts:[p(3,'12'),p(2,'11')]})});
 assert.equal(r.count,1);assert.equal(r.buckets[0].complete,false);assert.equal(r.buckets[0].ongoing,true);assert.equal(r.average,null);
});
test('failed edge expansion does not claim full coverage',async()=>{
 const r=await collectRemote(base,{...options,count:1,autoExpand:true},{delay:0,fetchPage:async u=>+u.searchParams.get('page')===8?Response.json({posts:[p(4,'12')]}):Response.json({message:'blocked'},{status:502})});
 assert.equal(r.buckets[0].complete,false);assert.match(r.warning,/확장/);
});
test('expansion across midnight uses KST boundaries and drops newer-than-snapshot posts',async()=>{
 const at=t=>Date.parse(t+'+09:00');
 const now=at('2026-09-19T00:45:00');
 const pages={1:[{id:'9',time:at('2026-09-19T00:46:00')},{id:'8',time:at('2026-09-19T00:10:00')},{id:'7',time:at('2026-09-18T23:55:00')}],2:[{id:'6',time:at('2026-09-18T23:05:00')},{id:'5',time:at('2026-09-18T22:59:00')}]};
 const r=await collectRemote(base,{...options,count:2,page:1,autoExpand:true},{now:()=>now,delay:0,fetchPage:async u=>Response.json({posts:pages[+u.searchParams.get('page')]||[]})});
 assert.equal(r.count,3);assert.deepEqual(r.buckets.map(b=>[b.count,b.complete,b.ongoing]),[[2,true,false],[1,false,true]]);
});

test('bumped posts cannot prove an expansion boundary or extend its range',async()=>{
 const at=t=>Date.parse(`2026-09-18T${t}:00+09:00`);
 const pages={1:{posts:[{id:'5',time:at('12:30')}],bumpedPosts:[{id:'1',time:at('08:00')},{id:'2',time:at('12:05')}]},2:{posts:[{id:'4',time:at('12:10')},{id:'3',time:at('11:59')}]}};
 const visited=[];
 const r=await collectRemote(base,{...options,page:1,count:1,autoExpand:true},{delay:0,fetchPage:async u=>{const page=+u.searchParams.get('page');visited.push(page);return Response.json(pages[page]||{posts:[]});}});
 assert.deepEqual(visited,[1,2]);assert.equal(r.count,3);assert.equal(r.bumpedCount,1);assert.equal(r.buckets.length,1);assert.equal(r.buckets[0].complete,true);
});
