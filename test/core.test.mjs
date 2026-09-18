import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGallery, parsePage, summarize} from '../lib/core.mjs';
import {chronologicalPosts} from '../public/analysis.mjs';

test('only permits real gallery URLs and removes search filters',()=>{
  assert.equal(normalizeGallery('https://gall.dcinside.com/mgallery/board/lists/?id=gov&page=5&s_keyword=test').url,'https://gall.dcinside.com/mgallery/board/lists/?id=gov');
  for(const url of ['https://gall.dcinside.com.evil.com/?id=gov','http://127.0.0.1','https://gall.dcinside.com@evil.com/?id=gov']) assert.throws(()=>normalizeGallery(url));
});
test('extracts Korean timestamps and excludes announcements and ads',()=>{
 const html=`<h2><a>테스트 갤러리</a></h2><table><tr class="ub-content"><td class="gall_num">3</td><td class="gall_subject">일반</td><td class="gall_date" title="2026-09-19 09:30:00"></td></tr><tr class="ub-content"><td class="gall_num">2</td><td class="gall_subject">공지</td><td class="gall_date" title="2026-09-19 08:00:00"></td></tr><tr class="ub-content"><td class="gall_num">설문</td></tr></table>`;
 assert.deepEqual(parsePage(html).posts,[{id:'3',time:Date.parse('2026-09-19T09:30:00+09:00')}]);
});
test('zero-fills gaps and marks boundary intervals incomplete',()=>{
 const posts=['00:10','00:50','02:15'].map((t,i)=>({id:String(i),time:Date.parse(`2026-09-19T${t}:00+09:00`)}));
 const r=summarize(posts,60,Date.parse('2026-09-19T02:30:00+09:00'));
 assert.deepEqual(r.buckets.map(b=>b.count),[2,0,1]);
 assert.deepEqual(r.buckets.map(b=>b.complete),[false,true,false]);
 assert.equal(r.count,3);
});
test('deduplicates posts and handles a single timestamp without infinity',()=>{
 const p={id:'1',time:Date.parse('2026-09-19T00:10:00+09:00')};
 const r=summarize([p,p],60,p.time);
 assert.equal(r.count,1); assert.equal(r.average,null);
 assert.throws(()=>summarize([p],0,p.time));
});
test('excludes injected historical recommendations from latest sample',()=>{
 const html='<table><tr class="ub-content" data-type="icon_recomtxt"><td class="gall_num">90</td><td class="gall_subject">일반</td><td class="gall_date" title="2026-09-01 10:00:00"></td></tr></table>';
 assert.equal(parsePage(html).posts.length,0);
});
test('excludes an old ordinary post inserted between consecutive recent posts',()=>{
 const rows=[['6195054','2026-09-17 20:10:00'],['6120321','2026-09-05 00:40:52'],['6195053','2026-09-17 20:09:00'],['6195052','2026-09-17 20:08:00']];
 const html='<table>'+rows.map(([id,t])=>`<tr class="ub-content" data-type="icon_txt"><td class="gall_num">${id}</td><td class="gall_subject">일반</td><td class="gall_date" title="${t}"></td></tr>`).join('')+'</table>';
 const r=parsePage(html);assert.deepEqual(r.posts.map(p=>p.id),['6195054','6195053','6195052']);assert.equal(r.excludedCount,1);
 assert.equal(summarize(r.posts,60).buckets.length,1);
});
test('does not discard ordinary posts for small timestamp reversals',()=>{
 const rows=[{id:'3',time:1000},{id:'2',time:2000},{id:'1',time:500}];
 assert.deepEqual(chronologicalPosts(rows).posts,rows);
});
