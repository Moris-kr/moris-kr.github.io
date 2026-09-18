export function normalizeGallery(input) {
  let u;
  try {u=new URL(input.trim());} catch {throw new Error('갤러리 전체 주소를 입력해 주세요.');}
  if(u.protocol!=='https:' || u.hostname!=='gall.dcinside.com' || u.port || u.username || u.password) throw new Error('https://gall.dcinside.com 갤러리 주소만 사용할 수 있습니다.');
  const match=u.pathname.match(/^\/(mgallery\/|mini\/)?board\/(lists|view)\/?$/);
  const id=u.searchParams.get('id');
  if(!match || !id || !/^[a-zA-Z0-9_]{1,80}$/.test(id)) throw new Error('갤러리 주소와 id를 확인해 주세요.');
  return {id,url:`https://gall.dcinside.com/${match[1]||''}board/lists/?id=${id}`};
}

// Keep the longest sequence in the list's actual newest-to-oldest order.
// Old posts can be inserted with ordinary icons, so icon filtering alone is insufficient.
export function chronologicalPosts(posts){
  const lengths=posts.map(()=>1),previous=posts.map(()=>-1);let best=-1;
  for(let i=0;i<posts.length;i++){
    for(let j=0;j<i;j++)if(Number(posts[j].id)>Number(posts[i].id)&&lengths[j]+1>lengths[i]){lengths[i]=lengths[j]+1;previous[i]=j;}
    if(best===-1||lengths[i]>lengths[best])best=i;
  }
  const accepted=[];for(let i=best;i!==-1;i=previous[i])accepted.push(posts[i]);
  accepted.reverse();const ids=new Set(accepted.map(p=>p.id));
  const bumpedPosts=posts.filter(p=>!ids.has(p.id));
  return {posts:accepted,bumpedPosts,excludedCount:bumpedPosts.length};
}

export function summarize(input,minutes,observedAt=Date.now(),coverage={}) {
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440) throw new Error('집계 간격은 1~1,440분으로 입력해 주세요.');
  const posts=[...new Map(input.map(p=>[p.id,p])).values()].sort((a,b)=>a.time-b.time);
  if(!posts.length) throw new Error('집계할 일반 게시글이 없습니다.');
  const oldest=posts[0].time,newest=posts.at(-1).time,width=minutes*60000,offset=9*3600000;
  const floor=t=>Math.floor((t+offset)/width)*width-offset;
  const start=floor(oldest),end=floor(newest);
  if((end-start)/width>20000) throw new Error('분석 기간이 너무 깁니다. 집계 간격을 늘려 주세요.');
  const counts=new Map();for(const p of posts) counts.set(floor(p.time),(counts.get(floor(p.time))||0)+1);
  const buckets=[];
  for(let time=start;time<=end;time+=width) {
    const lowerCovered=time>oldest || (Number.isFinite(coverage.start)&&coverage.start<=time);
    const upperCovered=time+width<=newest || (Number.isFinite(coverage.end)&&coverage.end>=time+width);
    const ongoing=time<=observedAt&&time+width>observedAt;
    buckets.push({time,count:counts.get(time)||0,complete:lowerCovered&&upperCovered&&!ongoing,ongoing});
  }
  const complete=buckets.filter(b=>b.complete);
  const average=complete.length?complete.reduce((sum,b)=>sum+b.count,0)/complete.length:null;
  return {count:posts.length,oldest,newest,minutes,buckets,average,peak:complete.length?Math.max(...complete.map(b=>b.count)):null,completeIntervals:complete.length};
}
