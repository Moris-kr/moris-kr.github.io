export const DEFAULT_LIMIT=5000,MAX_LIMIT=50000;
const LIMIT_KEY='gallery-pulse-cache-limit',EPOCH_KEY='gallery-pulse-cache-epoch';
let database;
export function cacheLimit(){try{const n=Number(localStorage.getItem(LIMIT_KEY));return Number.isInteger(n)&&n>=1&&n<=MAX_LIMIT?n:DEFAULT_LIMIT;}catch{return DEFAULT_LIMIT;}}
export function cacheEpoch(){try{return localStorage.getItem(EPOCH_KEY)||'0';}catch{return '0';}}
function open(){if(!database)database=new Promise((resolve,reject)=>{
 const request=indexedDB.open('gallery-pulse-confirmed-v1',1);
 request.onupgradeneeded=()=>{const store=request.result.createObjectStore('intervals',{keyPath:['gallery','minutes','time']});store.createIndex('time','time');};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=null;reject(request.error);};request.onblocked=()=>reject(new Error('다른 탭에서 저장소를 사용하고 있습니다.'));
});return database;}
function finished(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('저장이 취소되었습니다.'));});}
export async function loadLocal(gallery,minutes,end){
 const db=await open(),tx=db.transaction('intervals','readonly'),store=tx.objectStore('intervals');
 const rows=[];let posts=0;
 await new Promise((resolve,reject)=>{const request=store.openCursor(IDBKeyRange.bound([gallery,minutes,0],[gallery,minutes,end]),'prev');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor||posts>=50000){resolve();return;}rows.push(cursor.value);posts+=cursor.value.count;cursor.continue();};});return rows;
}
export async function trimLocal(limit=cacheLimit()){
 const db=await open(),tx=db.transaction('intervals','readwrite'),done=finished(tx);let count=0;
 tx.objectStore('intervals').index('time').openCursor(null,'prev').onsuccess=e=>{const cursor=e.target.result;if(!cursor)return;if(++count>limit)cursor.delete();cursor.continue();};await done;
}
export async function setCacheLimit(limit){
 if(!Number.isInteger(limit)||limit<1||limit>MAX_LIMIT)throw new Error('보관 한도는 1~50,000개로 입력해 주세요.');
 localStorage.setItem(LIMIT_KEY,String(limit));await trimLocal(limit);return limit;
}
export async function saveLocal(report,epoch=cacheEpoch()){
 if(epoch!==cacheEpoch())return 0;
 const width=report.minutes*60000,offset=9*3600000,groups=new Map();
 for(const p of report._posts||[]){const time=Math.floor((p.time+offset)/width)*width-offset;if(!groups.has(time))groups.set(time,[]);groups.get(time).push(p);}
 const rows=report.buckets.filter(b=>b.complete&&!b.ongoing&&(groups.get(b.time)||[]).length===b.count).sort((a,b)=>b.time-a.time).slice(0,cacheLimit());
 const db=await open();if(epoch!==cacheEpoch())return 0;
 const tx=db.transaction('intervals','readwrite'),done=finished(tx),store=tx.objectStore('intervals');let saved=0;
 for(const b of rows){const request=store.get([report.gallery,report.minutes,b.time]);request.onsuccess=()=>{if(!request.result){store.add({gallery:report.gallery,name:report.name,minutes:report.minutes,time:b.time,count:b.count,posts:groups.get(b.time)||[],confirmedAt:Date.now()});saved++;}};}
 await done;await trimLocal();return saved;
}
export async function cacheSummary(){
 const db=await open(),tx=db.transaction('intervals','readonly'),groups=new Map();let count=0;
 await new Promise((resolve,reject)=>{const request=tx.objectStore('intervals').openCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return;}const r=cursor.value,key=r.gallery+'|'+r.minutes;count++;const g=groups.get(key)||{name:r.name,gallery:r.gallery,minutes:r.minutes,count:0,start:r.time,end:r.time+r.minutes*60000};g.count++;g.start=Math.min(g.start,r.time);g.end=Math.max(g.end,r.time+r.minutes*60000);groups.set(key,g);cursor.continue();};});
 return {count,limit:cacheLimit(),groups:[...groups.values()]};
}
export async function clearLocal(){
 localStorage.setItem(EPOCH_KEY,String(Date.now())+'-'+Math.random());
 const db=await open(),tx=db.transaction('intervals','readwrite'),done=finished(tx);tx.objectStore('intervals').clear();await done;
}
