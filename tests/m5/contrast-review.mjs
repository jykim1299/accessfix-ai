// Inspect actual rendered product states. No inference or mutating API calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const base=process.argv[2]||'http://127.0.0.1:8804';
const out=path.resolve(process.argv[3]);await fs.mkdir(out,{recursive:false});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
const page=await context.newPage(),rows=[],posts=[];
await page.route('**/*',r=>r.request().method()==='GET'?r.continue():(posts.push(r.request().url()),r.abort()));
const save=(n,v)=>fs.writeFile(path.join(out,n),JSON.stringify(v,null,2));
async function audit(name){
 await page.addScriptTag({content:axe});
 const a=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
 await save(name+'.axe.json',a);
 // Deterministic WCAG sRGB contrast calculation from browser computed styles.
 // Unknown images/gradients/opacity are flagged, never counted as a pass.
 const colors=await page.evaluate(()=>{
  const rgb=s=>{const v=s.match(/[\d.]+/g)?.map(Number);return v&&v.length>=3?[...v.slice(0,3),v[3]??1]:null;};
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  const selectors=['.proof-diagram span','.proof-diagram strong','.proof-diagram p','.artifact-row strong','.artifact-row code','.artifact-row a','.diff-scroll pre>span','.table-scroll th','.table-scroll td'];
  return [...document.querySelectorAll(selectors.join(','))].map(e=>{
   const s=getComputedStyle(e),fg=rgb(s.color),r=e.getBoundingClientRect();let bg=null,unknown=[],anc=e;
   while(anc){const c=getComputedStyle(anc),v=rgb(c.backgroundColor);if(c.backgroundImage!=='none')unknown.push('background-image');if(Number(c.opacity)!==1)unknown.push('opacity');for(const pseudo of ['::before','::after']){const p=getComputedStyle(anc,pseudo);if(!['none','normal','""'].includes(p.content)||p.backgroundImage!=='none')unknown.push('pseudo-element');}if(v&&v[3]===1){bg=v;break;}if(v&&v[3]>0)unknown.push('translucent-background');anc=anc.parentElement;}
   if(!bg)bg=[255,255,255,1];if(fg?.[3]!==1)unknown.push('translucent-text');
   const ratio=fg?(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05):null;
   const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700);
   return {text:e.textContent?.trim().slice(0,100),tag:e.tagName,class:e.className,foreground:s.color,background:bg.slice(0,3),font_px:parseFloat(s.fontSize),ratio,minimum:large?3:4.5,meets_computed_contrast:unknown.length===0&&ratio>=(large?3:4.5),manual_review_reasons:[...new Set(unknown)],viewport_visible:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth};
  });
 });
 await save(name+'.computed-colors.json',colors);await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});
 rows.push({name,violations:a.violations.map(r=>({id:r.id,nodes:r.nodes.length})),incomplete:a.incomplete.map(r=>({id:r.id,nodes:r.nodes.length,reasons:[...new Set(r.nodes.flatMap(n=>n.any.map(c=>c.data?.messageKey)))]})),computed_nodes:colors.length,computed_failures:colors.filter(c=>c.manual_review_reasons.length===0&&!c.meets_computed_contrast).length,unknown_backgrounds:colors.filter(c=>c.manual_review_reasons.length).length});
 await save('summary.json',{rows,mutating_requests:posts,actual_model_requests:0});
}
try{
 for(const width of [1440,320]){
  await page.setViewportSize({width,height:1000});await page.goto(base);await expect(page.getByRole('link',{name:'Recorded Meta demo',exact:true})).toBeVisible();await audit('dashboard-'+width);
  for(const key of ['m3-meta','m4-meta-holdout-switch']){
   await page.goto(base+'/#/runs/'+key);await expect(page.getByRole('tab',{name:'Evidence & safety',exact:true})).toBeVisible();await page.getByRole('tab',{name:'Evidence & safety',exact:true}).click();await expect(page.locator('.artifact-row').first()).toBeVisible();
   await audit(key+'-evidence-top-'+width);
   const next=page.getByRole('button',{name:'Next evidence page',exact:true});
   let n=1;while(await next.count()&&await next.isEnabled()){
    await next.click();await page.locator('.artifact-row').first().scrollIntoViewIfNeeded();await audit(key+'-evidence-page-'+(++n)+'-'+width);
   }
   if(!await next.count())await page.locator('.artifact-list').evaluate(e=>e.scrollTop=e.scrollHeight);
   await page.locator('.artifact-row').last().scrollIntoViewIfNeeded();await audit(key+'-evidence-end-'+width);
  }
  await page.goto(base+'/#/runs/m3-meta');await page.getByRole('tab',{name:'Code diff',exact:true}).click();await expect(page.locator('.diff-scroll')).toBeVisible();await page.locator('.diff-scroll').scrollIntoViewIfNeeded();await audit('diff-top-'+width);
  await page.locator('.diff-scroll').evaluate(e=>{e.scrollTop=e.scrollHeight;e.scrollLeft=e.scrollWidth;});await audit('diff-end-'+width);
 }
 assert.equal(posts.length,0);
}finally{await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();console.log(JSON.stringify({states:rows.length,violation_states:rows.filter(r=>r.violations.length).length,incomplete_states:rows.filter(r=>r.incomplete.length).length,computed_failures:rows.reduce((n,r)=>n+r.computed_failures,0),actual_model_requests:0}));}
