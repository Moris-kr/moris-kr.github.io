import {collectRemote} from './collect.mjs';
import {loadLocal,saveLocal,cacheEpoch} from './local-cache.mjs';
import {normalizeGallery} from './analysis.mjs';
export async function collectWithConfirmed(base,options,hooks={}){
 const epoch=cacheEpoch(),gallery=normalizeGallery(options.url).url;let cacheUnavailable=false;
 const result=await collectRemote(base,options,{...hooks,includePosts:true,getConfirmed:async end=>{
  try{return await loadLocal(gallery,options.minutes??60,end);}catch{cacheUnavailable=true;return [];}
 }});
 if(!hooks.signal?.aborted&&epoch===cacheEpoch()){
  try{result.cacheSaved=await saveLocal(result,epoch);result.cacheStatus=cacheUnavailable?'unavailable':'saved';}catch{result.cacheStatus='unavailable';}
 }else result.cacheStatus='cleared';
 delete result._posts;return result;
}
