// Public-subset UI verification. Does not require excluded private raw traces.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const base=process.argv[2],out=path.resolve(process.argv[3]);await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});
const checks=[],audits=[],errors=[],mutations=[];
const save=(n,v)=>fs.writeFile(path.join(out,n),JSON.stringify(v,null,2));
const get=async p=>{const r=await fetch(base+p);assert.equal(r.status,200,p);return r.json();};
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>{if(r.request().method()!=='GET'){mutations.push(r.request().url());return r.abort();}return r.continue();});
async function check(name,fn){try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:String(e.stack||e)});}await save('checks.json',checks);}
async function scan(name){await page.addScriptTag({content:axe});const a=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));await save(name+'.axe.json',a);await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});audits.push({name,violations:a.violations.map(r=>({id:r.id,nodes:r.nodes.length})),incomplete:a.incomplete.map(r=>({id:r.id,nodes:r.nodes.length}))});assert.equal(a.violations.length,0);}
const expected={'m4-meta-dev-tabs':true,'m4-meta-holdout-menu':true,'m4-meta-holdout-switch':false,'m4-meta-holdout-action':true,'m3-meta':true,'m1-ai':true,'m1-control':false};
try{
 await check('public-history-and-no-live-provider',async()=>{const h=await get('/api/history');assert.equal(h.runs.filter(r=>r.read_only).length,11);assert.deepEqual(h.warnings,[]);const ps=await get('/api/providers');assert.ok(ps.length&&!ps.some(p=>p.available));await page.goto(base);await expect(page.getByRole('link',{name:'Tabs · Meta repair accepted',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Switch · Regression rejected',exact:true})).toBeVisible();await scan('dashboard');});
 for(const [key,accepted] of Object.entries(expected)){
  await check(key+'-reviewed-history',async()=>{
   const d=await get('/api/runs/'+key);assert.equal(d.repair.decision.accepted,accepted);assert.equal(d.repair.status,'restored');assert.equal(d.repair.selected,'original');assert.equal(d.archive_source.copied,true);assert.equal(d.archive_source.public_subset,true);assert.match(d.archive_source.source_sha256,/^[a-f0-9]{64}$/);assert.equal(d.actions.repair_url,null);assert.equal(d.actions.restore_url,null);
   assert.equal(d.artifacts.some(f=>/\.zip$|model\/(request|response)\.json$|\.log$/.test(f.path)),false);
   await page.goto(base+'/#/runs/'+key);await expect(page.getByRole('heading',{level:1})).toHaveText(d.title);
   if(key==='m4-meta-holdout-menu')assert.equal(d.repair.decision.manual_review,true);
   if(key==='m4-meta-dev-tabs')await expect(page.getByText('The original had zero axe violations but failed keyboard tasks.',{exact:true})).toBeVisible();
   await page.getByRole('tab',{name:'Before / After',exact:true}).click();await expect(page.locator('.screens img').first()).toBeVisible();await page.waitForFunction(()=>[...document.querySelectorAll('.screens img')].every(i=>i.complete&&i.naturalWidth));
   await scan(key+'-compare');
   const patch=d.artifacts.find(f=>f.path==='patch.diff');assert.ok(patch);const data=Buffer.from(await (await fetch(base+patch.url)).arrayBuffer());const local=await fs.readFile(path.join('artifacts',d.archive_source.path.replace(/record\.json$/,'patch.diff')));assert.equal(createHash('sha256').update(data).digest('hex'),createHash('sha256').update(local).digest('hex'));
   await page.getByRole('tab',{name:'Evidence & safety',exact:true}).click();await expect(page.getByText(/This is a reviewed public copy/)).toBeVisible();await expect(page.locator('.source-path').filter({hasText:'Original SHA-256'}).locator('code')).toHaveText(d.archive_source.source_sha256);
   await page.getByRole('combobox',{name:'File type',exact:true}).selectOption('traces');await expect(page.getByText('No evidence of the selected type',{exact:true})).toBeVisible();
  });
 }
 await check('refresh-keyboard-and-mobile',async()=>{await page.goto(base+'/#/runs/m4-meta-holdout-switch');await page.reload();await expect(page.getByRole('heading',{level:1})).toContainText('Meta');let reached=false;for(let i=0;i<40;i++){await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.getAttribute('role')==='tab')){reached=true;break;}}assert.ok(reached);await page.keyboard.press('ArrowRight');await expect(page.getByRole('tab',{name:'Before / After',exact:true})).toHaveAttribute('aria-selected','true');await page.setViewportSize({width:320,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await scan('mobile-320-switch');});
 await check('no-inference-or-browser-error',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);});
}finally{await browser.close();const summary={time_utc:new Date().toISOString(),checks:checks.length,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,actual_model_calls:0,mutations,errors,audits,results:checks};await save('summary.json',summary);console.log(JSON.stringify({checks:summary.checks,passed:summary.passed,failed:summary.failed}));if(summary.failed)process.exitCode=1;}
