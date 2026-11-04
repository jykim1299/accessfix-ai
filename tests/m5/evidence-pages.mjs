// M5 product evidence pagination: compare every displayed URL with the real API.
// Read-only browser review; a request guard blocks all non-GET operations.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const base=process.argv[2],out=process.argv[3];
if(!base||!out)throw Error('Usage: node evidence-pages.mjs URL NEW_OUTPUT');
await fs.mkdir(out,{recursive:false});
const started=new Date(),checks=[],requests=[],errors=[],audits=[],pages=[];
const save=(name,value)=>fs.writeFile(path.join(out,name),JSON.stringify(value,null,2));
const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const bundle=async()=>{const result={};for(const name of ['app.js','app.css']){const r=await fetch(base+'/'+name);assert.equal(r.status,200);result[name]=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');}return result;};
const initialBundle=await bundle();await save('bundle-start.json',initialBundle);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
const page=await context.newPage();page.setDefaultTimeout(12000);
await page.route('**/*',route=>{if(route.request().method()==='GET')return route.continue();requests.push({url:route.request().url(),method:route.request().method()});return route.abort();});
page.on('pageerror',error=>errors.push(error.message));
async function check(id,fn){try{const detail=await fn();checks.push({id,pass:true,detail});console.log(JSON.stringify({id,pass:true}));}catch(e){checks.push({id,pass:false,error:String(e.stack||e)});await page.screenshot({path:path.join(out,id+'-failure.png')}).catch(()=>{});console.log(JSON.stringify({id,pass:false,error:e.message}));}await save('checks.json',checks);}
async function reach(locator){for(let i=0;i<180;i++){if(await locator.evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Keyboard cannot reach target');}
const status=()=>page.locator('.artifact-count');
const next=()=>page.getByRole('button',{name:'Next evidence page',exact:true});
const previous=()=>page.getByRole('button',{name:'Previous evidence page',exact:true});
const links=()=>page.locator('.artifact-list').getByRole('link',{name:/^Download/});
async function hrefs(){return links().evaluateAll(els=>els.map(el=>el.getAttribute('href')));}
async function turn(button){await reach(button);await page.keyboard.press('Enter');await expect(status()).toBeFocused();}
async function scan(name){await page.addScriptTag({content:axe});const result=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));await save(name+'.axe.json',result);audits.push({name,violations:result.violations.map(x=>({id:x.id,nodes:x.nodes.length})),incomplete:result.incomplete.map(x=>({id:x.id,nodes:x.nodes.length}))});assert.equal(result.violations.length,0);}
try{
 for(const key of ['m3-meta','m4-meta-holdout-switch']){
  const response=await page.request.get(base+'/api/runs/'+key);assert.equal(response.status(),200);const run=await response.json();await save(key+'-api-run.json',run);
  const expected=run.artifacts.map(f=>f.url),count=Math.ceil(expected.length/12);
  await page.goto(base+'/#/runs/'+key);await page.getByRole('tab',{name:'Evidence & safety',exact:true}).click();await expect(status()).toContainText(`Page 1/${count}`);
  await check(key+'-every-artifact-once',async()=>{
   const actual=[];await expect(previous()).toBeDisabled();
   for(let p=0;p<count;p++){
    await expect(status()).toContainText(`Page ${p+1}/${count}`);
    const found=await hrefs();assert.deepEqual(found,expected.slice(p*12,(p+1)*12));actual.push(...found);pages.push({key,page:p+1,urls:found});
    if(p<count-1)await turn(next());
   }
   assert.deepEqual(actual,expected);assert.equal(new Set(actual).size,actual.length);
   await expect(next()).toBeDisabled();await expect(status()).toBeFocused();
   await page.screenshot({path:path.join(out,key+'-last-page.png')});
   return {api_artifacts:expected.length,visited_pages:count,unique_urls:actual.length,missing:0,duplicates:0,last_next_disabled:true,last_focus_on_status:true};
  });
  await check(key+'-previous-keyboard',async()=>{
   await turn(previous());await expect(status()).toContainText(`Page ${count-1}/${count}`);assert.deepEqual(await hrefs(),expected.slice((count-2)*12,(count-1)*12));await expect(next()).toBeEnabled();
   return {keyboard_previous:true,focus_on_status:true};
  });
  await check(key+'-filter-resets-page',async()=>{
   const filter=page.getByRole('combobox',{name:'File type',exact:true});
   const screens=run.artifacts.filter(f=>f.path.endsWith('.png')).map(f=>f.url);
   await filter.selectOption('screens');await expect(status()).toContainText(`Page 1/${Math.ceil(screens.length/12)}`);assert.deepEqual(await hrefs(),screens.slice(0,12));
   await turn(next());await expect(status()).toContainText(`Page 2/${Math.ceil(screens.length/12)}`);
   const traces=run.artifacts.filter(f=>f.path.endsWith('.zip')).map(f=>f.url);
   await filter.selectOption('traces');await expect(status()).toContainText(`Page 1/${Math.ceil(traces.length/12)}`);assert.deepEqual(await hrefs(),traces.slice(0,12));
   await filter.selectOption('all');await expect(status()).toContainText(`Page 1/${count}`);assert.deepEqual(await hrefs(),expected.slice(0,12));
   await scan(key+'-desktop');
   return {screens:screens.length,traces:traces.length,filter_reset_to_first_page:true};
  });
  await check(key+'-mobile-reflow-keyboard',async()=>{
   await page.setViewportSize({width:320,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at 320px');
   await turn(next());await expect(status()).toContainText(`Page 2/${count}`);assert.deepEqual(await hrefs(),expected.slice(12,24));
   await turn(previous());await expect(status()).toContainText(`Page 1/${count}`);
   await page.screenshot({path:path.join(out,key+'-mobile320.png'),fullPage:true});await scan(key+'-mobile320');
   await page.setViewportSize({width:1440,height:1000});return {width:320,horizontal_overflow:false,keyboard_pagination:true};
  });
 }
 await check('no-mutations-or-browser-errors',async()=>{assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);return {mutating_requests:0,page_errors:0,model_calls:0};});
 await check('frontend-bundles-unchanged',async()=>{const final=await bundle();await save('bundle-end.json',final);assert.deepEqual(final,initialBundle);return {assets:2};});
}finally{
 await context.tracing.stop({path:path.join(out,'evidence-pages-trace.zip')});await browser.close();
 await save('pages.json',pages);await save('axe-summary.json',audits);await save('blocked-requests.json',requests);await save('browser-errors.json',errors);
 const result={purpose:'Read-only evidence pagination against real immutable API archives; no models',started_utc:started.toISOString(),finished_utc:new Date().toISOString(),checks:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,model_calls:0,playwright:require('playwright/package.json').version,axe:require('axe-core/package.json').version,results:checks};await save('summary.json',result);console.log(JSON.stringify({passed:result.passed,checks:result.checks,failed:result.failed}));if(result.failed)process.exitCode=1;
}
