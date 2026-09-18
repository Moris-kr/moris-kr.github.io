import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachedTail,applyConfirmed} from '../public/confirmed.mjs';
const bin=(time,ids)=>({time,count:ids.length,complete:true,ongoing:false,posts:ids.map((id,i)=>({id:String(id),time:time+100+i}))});
test('cached tail requires contiguous intervals and enough posts',()=>{
 const a=bin(3600000,[5,4]),b=bin(0,[3,2]);const posts=[{id:'6',time:3600200}];
 assert.equal(cachedTail(posts,[a,b],4,60).length,4);
 assert.equal(cachedTail(posts,[a],4,60).length,0);
 assert.equal(cachedTail(posts,[a,bin(-3600000,[3,2])],4,60).length,0);
});
test('only complete bins reuse canonical counts, incomplete bins stay transient',()=>{
 const report={count:10,buckets:[{time:0,count:3,complete:true},{time:3600000,count:7,complete:false}],average:3,peak:3};
 const r=applyConfirmed(report,[bin(0,[1,2,3,4]),bin(3600000,[5])]);
 assert.equal(r.count,11);assert.equal(r.buckets[1].count,7);assert.equal(r.average,4);assert.equal(r.cachedIntervals,1);
});
import {collectRemote} from '../public/collect.mjs';
test('confirmed cache skips past pages and preserves an ongoing interval',async()=>{
 const at=t=>Date.parse('2026-09-18T'+t+':00+09:00');
 const posts=[{id:'8',time:at('12:50')},{id:'7',time:at('12:40')},{id:'6',time:at('12:30')},{id:'5',time:at('12:20')}];
 let calls=0;
 const r=await collectRemote('https://test.example',{url:'https://gall.dcinside.com/mgallery/board/lists/?id=gov',count:4,page:1,minutes:60,autoExpand:true},{now:()=>at('13:30'),delay:0,getConfirmed:async()=>[{time:at('12:00'),count:4,posts}],fetchPage:async()=>{calls++;return Response.json({posts:[{id:'9',time:at('13:10')},posts[0]]});}});
 assert.equal(calls,1);assert.equal(r.count,5);assert.equal(r.cachedIntervals,1);assert.equal(r.buckets[0].count,4);assert.equal(r.buckets[1].ongoing,true);
});
