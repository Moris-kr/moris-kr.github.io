import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
const settings=new Map();globalThis.localStorage={getItem:k=>settings.get(k)??null,setItem:(k,v)=>settings.set(k,String(v))};
const {saveLocal,loadLocal,cacheSummary,clearLocal,setCacheLimit,cacheEpoch,cacheLimit}=await import('../public/local-cache.mjs');
const report=(minutes=60)=>({gallery:'https://gall.dcinside.com/mgallery/board/lists/?id=test',name:'test',minutes,_posts:[{id:'1',time:100},{id:'2',time:minutes*60000+100},{id:'3',time:minutes*120000+100}],buckets:[{time:0,count:1,complete:true},{time:minutes*60000,count:1,complete:false},{time:minutes*120000,count:1,complete:false,ongoing:true}]});
test('all interval lengths persist locally, but partial and ongoing data do not',async()=>{
 await clearLocal();assert.equal(cacheLimit(),5000);
 await saveLocal(report(60));await saveLocal(report(30));
 const summary=await cacheSummary();assert.equal(summary.count,2);assert.deepEqual(summary.groups.map(g=>g.minutes).sort(),[30,60]);
 assert.equal((await loadLocal(report().gallery,60,9999999)).length,1);
 const changed=report();changed._posts.push({id:'4',time:200});changed.buckets[0].count=2;await saveLocal(changed);
 assert.equal((await loadLocal(report().gallery,60,9999999))[0].count,1);
});
test('custom global cap trims oldest intervals and clear invalidates active writes',async()=>{
 await clearLocal();await setCacheLimit(2);
 for(let i=0;i<4;i++){const r=report();r.gallery+='x'+i;r._posts=[{id:'1',time:i*3600000+100}];r.buckets=[{time:i*3600000,count:1,complete:true}];await saveLocal(r);}
 const summary=await cacheSummary();assert.equal(summary.count,2);assert.equal(Math.min(...summary.groups.map(g=>g.start)),7200000);
 const epoch=cacheEpoch();await clearLocal();assert.equal(await saveLocal(report(),epoch),0);assert.equal((await cacheSummary()).count,0);
 await assert.rejects(setCacheLimit(0));await setCacheLimit(5000);
});
