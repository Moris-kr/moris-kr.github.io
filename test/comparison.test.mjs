import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alignReports,parseGalleryInputs,collectMany} from '../public/comparison.mjs';
const url=id=>`https://gall.dcinside.com/mgallery/board/lists/?id=${id}`;
const report=(buckets)=>({minutes:60,buckets});
test('comparison preserves missing coverage and compares only shared complete intervals',()=>{
 const a=report([{time:0,count:2,complete:true},{time:3600000,count:0,complete:true}]);
 const b=report([{time:3600000,count:4,complete:true},{time:7200000,count:7,complete:false}]);
 const aligned=alignReports([a,b]);
 assert.deepEqual(aligned.times,[0,3600000,7200000]);assert.equal(aligned.series[1][0],null);assert.equal(aligned.series[0][1].count,0);
 assert.equal(aligned.commonCount,1);assert.deepEqual(aligned.averages,[0,4]);
});
test('gallery inputs normalize and deduplicate and enforce five unique galleries',()=>{
 assert.deepEqual(parseGalleryInputs([url('gov'),url('gov')+'&page=2','']),[url('gov')]);
 assert.throws(()=>parseGalleryInputs(Array.from({length:6},(_,i)=>url('g'+i))),/5/);
 assert.throws(()=>parseGalleryInputs(['https://example.com/']),/갤러리/);
});
test('one failed gallery does not cancel others and all share an observation timestamp',async()=>{
 const times=[];let running=0,max=0;
 const states=await collectMany(['a','b','c'],{}, {now:()=>123,collector:async(base,opt,hooks)=>{
 running++;max=Math.max(max,running);times.push(hooks.now());await new Promise(r=>setTimeout(r,5));running--;
 if(opt.url==='b')throw new Error('blocked');hooks.onProgress({snapshot:{count:1}});return {count:2};
 }});
 assert.deepEqual(times,[123,123,123]);assert.ok(max<=2);assert.deepEqual(states.map(s=>s.status),['complete','error','complete']);assert.equal(states[2].report.count,2);
});
test('cancellation preserves partial reports and skips queued galleries',async()=>{
 const control=new AbortController();let calls=0;
 const states=await collectMany(['a','b','c'],{}, {signal:control.signal,collector:async(base,opt,hooks)=>{calls++;hooks.onProgress({snapshot:{count:3}});control.abort();throw control.signal.reason;}});
 assert.equal(calls,1);assert.equal(states[0].report.count,3);assert.deepEqual(states.map(s=>s.status),['stopped','stopped','stopped']);
});
test('common averages stay unavailable while a gallery has no data',()=>{
 const r=alignReports([report([{time:0,count:4,complete:true}]),null]);
 assert.equal(r.commonCount,0);assert.deepEqual(r.averages,[null,null]);
});
