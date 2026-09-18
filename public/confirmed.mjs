export function cachedTail(posts,intervals,target,minutes){
 if(!posts.length||posts.length>=target)return [];
 const oldest=Math.min(...posts.map(p=>p.time)),width=minutes*60000,offset=9*3600000;
 let time=Math.floor((oldest+offset)/width)*width-offset;
 const map=new Map(intervals.map(b=>[b.time,b])),seen=new Set(posts.map(p=>p.id)),tail=[];
 while(map.has(time)){
  const bin=map.get(time);if(!Array.isArray(bin.posts)||bin.posts.length!==bin.count)break;
  for(const p of [...bin.posts].sort((a,b)=>b.time-a.time||Number(b.id)-Number(a.id)))if(p.time<=oldest&&!seen.has(p.id)){seen.add(p.id);tail.push(p);}
  if(posts.length+tail.length>=target)return tail;
  time-=width;
 }
 return [];
}
export function applyConfirmed(report,intervals){
 const map=new Map(intervals.map(b=>[b.time,b]));let cachedIntervals=0,delta=0;
 const buckets=report.buckets.map(b=>{const cached=map.get(b.time);if(!b.complete||b.ongoing||!cached)return b;cachedIntervals++;delta+=cached.count-b.count;return {...b,count:cached.count,cached:true};});
 const complete=buckets.filter(b=>b.complete);
 return {...report,buckets,count:report.count+delta,cachedIntervals,average:complete.length?complete.reduce((n,b)=>n+b.count,0)/complete.length:null,peak:complete.length?Math.max(...complete.map(b=>b.count)):null};
}
