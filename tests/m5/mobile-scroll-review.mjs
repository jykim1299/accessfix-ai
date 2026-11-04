import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const base=process.argv[2],out=process.argv[3];await fs.mkdir(out,{recursive:false});
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const rows=[];
await page.route('**/*',r=>r.request().method()==='GET'?r.continue():r.abort());
const save=(n,v)=>fs.writeFile(out+'/'+n,JSON.stringify(v,null,2));
async function audit(name){
 await page.addScriptTag({content:axe});
 const raw=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
 await save(name+'.axe.json',raw);await page.screenshot({path:out+'/'+name+'.png',fullPage:false});
 const colors=await page.locator('.table-scroll').evaluate(region=>{
  const rgb=s=>s.match(/[\d.]+/g).map(Number);
  const lum=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
  const boundary=region.getBoundingClientRect();
  return [...region.querySelectorAll('td.muted')].map(e=>{
   const style=getComputedStyle(e),fg=rgb(style.color);let bg=null,unknown=[];
   for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p),v=rgb(s.backgroundColor);if(s.backgroundImage!=='none'||Number(s.opacity)!==1)unknown.push('complex-background');if(v.length===3||v[3]===1){bg=v;break;}if(v[3]>0)unknown.push('translucent-background');}
   bg=bg||[255,255,255];const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
   return {text:e.textContent,foreground:style.color,background:bg,contrast_ratio:ratio,minimum:4.5,unknown,text_horizontally_visible:r.left>=boundary.left-1&&r.right<=boundary.right+1,meets_computed_contrast:ratio>=4.5&&unknown.length===0};
  });
 });
 assert.ok(colors.length>0&&colors.every(c=>c.meets_computed_contrast));
 rows.push({name,violations:raw.violations.map(r=>({id:r.id,nodes:r.nodes.length})),incomplete:raw.incomplete.map(r=>({id:r.id,nodes:r.nodes.length})),colors});await save('summary.json',{rows,actual_model_requests:0});return colors;
}
try{
 for(const width of [320,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/#/runs/m1-ai');await page.getByRole('tab',{name:'Before / After',exact:true}).click();
  const region=page.getByRole('region',{name:'User task results scroll region',exact:true});await expect(region).toBeVisible();await region.scrollIntoViewIfNeeded();
  await audit('compare-left-'+width);
  let reached=false;for(let i=0;i<40;i++){await page.keyboard.press('Tab');if(await region.evaluate(e=>e===document.activeElement)){reached=true;break;}}
  assert.ok(reached,'Scrollable task table must be keyboard reachable');
  for(let i=0;i<35;i++)await page.keyboard.press('ArrowRight');
  await expect.poll(()=>region.evaluate(e=>Math.round(e.scrollLeft))).toBeGreaterThan(0);
  // Wait for the browser's smooth key-scroll to reach a stable frame.
  await expect.poll(()=>region.evaluate(e=>Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft))).toBeLessThan(2);
  const colors=await audit('compare-right-'+width);assert.ok(colors.every(c=>c.meets_computed_contrast)); // Long code/action text may require horizontal scrolling; retain clipping flags.
  for(let i=0;i<35;i++)await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>region.evaluate(e=>Math.round(e.scrollLeft))).toBe(0);
 }
}finally{await browser.close();console.log(JSON.stringify({states:rows.length,computed_contrast_pass:rows.every(r=>r.colors.every(c=>c.meets_computed_contrast)),incomplete_states:rows.filter(r=>r.incomplete.length).length,actual_model_requests:0}));}
