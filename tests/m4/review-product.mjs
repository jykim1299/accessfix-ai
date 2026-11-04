// Real product read-only review; no analyses, repairs, restores or inference.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium}=require('playwright');
const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const base=process.argv[2]||'http://127.0.0.1:8804';
const out=path.resolve(process.argv[3]||'artifacts/m4/product-review-v1');
await fs.mkdir(out,{recursive:false});
const save=(name,obj)=>fs.writeFile(path.join(out,name),JSON.stringify(obj,null,2));
const hash=b=>createHash('sha256').update(b).digest('hex');
const get=async p=>{const r=await fetch(base+p);assert.equal(r.status,200,p);return r.json();};
const history=await get('/api/history');await save('history.json',history);
const m4=history.runs.filter(r=>r.key.startsWith('m4-'));
const keys=['m3-meta','m1-ai','m1-control',...m4.map(r=>r.key)];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
const page=await context.newPage(),checks=[],audits=[],errors=[],posts=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{
 if(route.request().method()!=='GET'){posts.push({method:route.request().method(),url:route.request().url()});return route.abort();}
 return route.continue();
});
async function check(name,fn){try{await fn();checks.push({name,status:'pass'});}catch(e){checks.push({name,status:'fail',error:String(e.stack||e)});}await save('checks.json',checks);}
async function ready(){await page.getByRole('heading',{level:1}).waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('Loading the recorded run and verification evidence'));}
async function audit(name){
 await page.addScriptTag({content:axe});
 const a=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
 await save(name+'.axe.json',a);await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
 const row={name,violation_rules:a.violations.length,incomplete:a.incomplete.map(r=>({id:r.id,nodes:r.nodes.length})),review_required:a.incomplete.length>0};audits.push(row);
 assert.equal(a.violations.length,0,'Observed axe violations; incomplete kept separately');
}
try{
 await check('dashboard-model-free-demo-links',async()=>{
  await page.goto(base);await ready();
  assert.equal(await page.getByRole('link',{name:'Recorded Meta demo'}).getAttribute('href'),'#/runs/m3-meta');
  assert.equal(await page.getByRole('link',{name:'OpenAI M1 comparison'}).getAttribute('href'),'#/runs/m1-ai');
  await audit('dashboard');
 });
 for(const key of keys){
  const d=await get('/api/runs/'+key);await save(key+'.detail.json',d);
  await check(key+'-readonly-states',async()=>{
   assert.equal(d.read_only,true);assert.equal(d.actions.repair_url,null);assert.equal(d.actions.restore_url,null);
   await page.goto(base+'/#/runs/'+key);await ready();
   assert.equal(await page.getByRole('heading',{level:1}).innerText(),d.title);
   if(key.startsWith('m4-'))assert.ok(d.title.endsWith(d.analysis.title),'History title must preserve original UTF-8 case title');
   if(d.repair.decision?.manual_review)assert.equal(await page.getByText('The candidate has findings that still require manual review. Inspect the evidence below separately from the decision.',{exact:true}).isVisible(),true);
   assert.equal(await page.getByRole('button',{name:'Repair recorded'}).isDisabled(),true);
   assert.equal(await page.locator('.decision-strip').innerText().then(t=>t.includes('Original selected')),d.repair.selected==='original');
   if(d.repair.status==='restored')assert.match(await page.locator('.decision-strip').innerText(),/Restored/);
   if(d.analysis.metrics?.axe_zero_keyboard_failed)assert.equal(await page.getByText('The original had zero axe violations but failed keyboard tasks.',{exact:true}).isVisible(),true);
   await audit(key+'-overview');
  });
  await check(key+'-before-after',async()=>{
   await page.getByRole('tab',{name:'Before / After',exact:true}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(i=>i.complete&&i.naturalWidth>0));
   const images=await page.locator('figure img').count();
   const flow=await page.getByRole('combobox',{name:'User task',exact:true}).inputValue();
   const state=await page.getByRole('combobox',{name:'Screen state',exact:true}).inputValue();
   const suffix=`evidence/${flow}/${state}.png`;
   const expectedImages=d.artifacts.filter(a=>a.preview_url&&a.path.endsWith(suffix)&&(a.path.startsWith('baseline/')||a.path.startsWith('validation/'))).length;
   assert.equal(images,expectedImages,'Only actually measured screenshots may be shown');
   assert.ok(images>=1,'Original measurement should be available for an evaluated repair');
   assert.ok(await page.getByRole('combobox',{name:'User task',exact:true}).locator('option').count()>0);
   if(key==='m3-meta')assert.match(await page.getByRole('tabpanel').innerText(),/47 \/ 47/);
   await audit(key+'-compare');
  });
  await check(key+'-diff-download-and-evidence',async()=>{
   await page.getByRole('tab',{name:'Code diff',exact:true}).click();
   const artifact=d.artifacts.find(a=>a.path==='patch.diff');
   if(artifact){
    assert.ok((await page.locator('.diff-scroll').innerText()).length>20);
    const response=await fetch(base+artifact.url);assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());
    const sourcePath=d.archive_source.path.replace(/record\.json$/,'patch.diff');
    const original=await fs.readFile(path.resolve('artifacts',sourcePath));assert.equal(hash(bytes),hash(original));
   }else{
    assert.equal(await page.locator('.diff-scroll').count(),0,'Unapplied proposals must not display a fake Diff');
    assert.ok(!d.repair.candidate_hashes,'Missing applied patch must be reported as unbuilt');
   }
   await page.getByRole('tab',{name:'Evidence & safety',exact:true}).click();
   const text=await page.getByRole('tabpanel').innerText();
   assert.match(text,/SHA-256/);assert.ok(text.includes(d.archive_source.sha256));
   if(key==='m3-meta'){assert.ok(text.includes('muse-spark-1.3-contributor'));assert.ok(text.includes('3,365 / 5,188'));assert.ok(text.includes('42.531 s'));}
   assert.equal(await page.getByRole('button',{name:d.repair.status==='restored'?'Original restored':'Restore original',exact:true}).isDisabled(),true);
   await audit(key+'-evidence');
  });
 }
 await check('refresh-and-keyboard-tab-navigation',async()=>{
  await page.goto(base+'/#/runs/m3-meta');await ready();await page.reload();await ready();
  assert.match(await page.getByRole('heading',{level:1}).innerText(),/Meta/);
  // Keyboard-only traversal from page heading focus to the active details tab.
  let reached=false;for(let n=0;n<35;n++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.getAttribute('role')==='tab')){reached=true;break;}}
  assert.ok(reached,'Tab reaches the detail tab control');await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Before / After',exact:true}).getAttribute('aria-selected'),'true');
  await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'Evidence & safety',exact:true}).getAttribute('aria-selected'),'true');
 });
 await check('mobile-320-meta-comparison',async()=>{
  await page.setViewportSize({width:320,height:844});await page.goto(base+'/#/runs/m3-meta');await ready();
  await page.getByRole('tab',{name:'Before / After',exact:true}).click();
  const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(size.document<=size.width+1,JSON.stringify(size));
  await audit('mobile-320-meta');
 });
 await check('no-mutating-requests',async()=>assert.deepEqual(posts,[]));
 await check('no-browser-errors',async()=>assert.deepEqual(errors,[]));
}finally{
 await save('summary.json',{time:new Date().toISOString(),purpose:'Read-only stored M1/M3/M4 product review; no model requests',checks:checks.length,passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,m4_archive_count:m4.length,checks_detail:checks,audits,incomplete_manual_review:audits.some(a=>a.review_required),mutating_requests:posts,browser_errors:errors});
 await context.tracing.stop({path:path.join(out,'product-trace.zip')});await browser.close();
 console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.status==='pass').length,failed:checks.filter(c=>c.status==='fail').length,m4_archive_count:m4.length,incomplete_manual_review:audits.some(a=>a.review_required)}));
 if(checks.some(c=>c.status==='fail'))process.exitCode=1;
}
