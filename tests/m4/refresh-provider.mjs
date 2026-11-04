// Targeted follow-up to M2 regression check 15: await the independently loaded provider catalog.
// No mutations or model requests. Earlier failed timing assertion remains preserved.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const base=process.argv[2],run=process.argv[3],out=process.argv[4];await fs.mkdir(out,{recursive:false});
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const posts=[],results=[];
await page.route('**/*',route=>route.request().method()==='GET'?route.continue():(posts.push(route.request().url()),route.abort()));
try{
 for(let i=0;i<5;i++){
  const providerResponse=page.waitForResponse(r=>r.url()===base+'/api/providers'&&r.status()===200);
  if(i===0)await page.goto(base+'/#/runs/'+run);else await page.reload();
  const providers=await (await providerResponse).json();assert.ok(providers.some(p=>p.available));
  await expect(page.getByRole('combobox',{name:'Model provider',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Model provider',exact:true}).locator('option')).toHaveCount(providers.length);
  await expect(page.getByRole('button',{name:'Repair · Generate patch',exact:true})).toBeEnabled();
  const detail=await (await page.request.get(base+'/api/runs/'+run)).json();
  assert.equal(detail.analysis.status,'completed');assert.equal(detail.repair,null);
  results.push({reload:i,pass:true,analysis_id:detail.analysis.id,provider_count:providers.length});
 }
 await page.screenshot({path:out+'/refresh-provider.png',fullPage:false});assert.equal(posts.length,0);
}finally{
 await fs.writeFile(out+'/summary.json',JSON.stringify({results,passed:results.length,total:5,mutating_requests:posts,actual_model_requests:0},null,2));
 await browser.close();console.log(JSON.stringify({passed:results.length,total:5,actual_model_requests:0}));
}
