import {load} from 'cheerio';
import {chronologicalPosts} from '../public/analysis.mjs';
export {normalizeGallery,summarize} from '../public/analysis.mjs';

export function parsePage(html) {
  const $=load(html),posts=[];
  $('tr.ub-content').each((_,row)=>{
    const r=$(row),id=r.find('.gall_num').text().trim();
    if(!/^\d+$/.test(id) || r.hasClass('ub-notice') || /^(icon_notice|icon_recom)/.test(r.attr('data-type')||'') || /^(공지|AD|설문)$/.test(r.find('.gall_subject').text().trim())) return;
    const timestamp=r.find('.gall_date').attr('title');
    if(!timestamp || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) return;
    const time=Date.parse(timestamp.replace(' ','T')+'+09:00');
    if(Number.isFinite(time)) posts.push({id,time});
  });
  const heading=$('.page_head h2').first().clone();heading.find('.pagehead_titicon').remove();
  const name=heading.text().trim() || $('h2 a').first().text().trim() || '';
  return {...chronologicalPosts(posts),name};
}
