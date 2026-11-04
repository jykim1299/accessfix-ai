// Local verifier-unit probe, not a keyboard task score or inference result.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {hasSemanticFocus} from '../../evaluation/m4/harness/semantics.mjs';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium}=require('playwright');
const out=process.argv[2];await fs.mkdir(out,{recursive:false});
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const results=[];
for(const [name,html,focus,target,expected] of [
 ['direct','<button id="b">Action</button>','#b','#b',true],
 ['active-descendant','<div id="m" role="menu" tabindex="0" aria-activedescendant="i"><button role="menuitem" id="i">Action</button></div>','#m','#i',true],
 ['wrong-descendant','<div id="m" role="menu" tabindex="0" aria-activedescendant="j"><button id="i">A</button><button id="j">B</button></div>','#m','#i',false],
 ['unsupported-owner','<button id="m" aria-activedescendant="i">Trigger</button><button id="i">A</button>','#m','#i',false],
 ['unowned-descendant','<div id="m" role="menu" tabindex="0" aria-activedescendant="i"></div><button id="i">A</button>','#m','#i',false],
]){
 await page.setContent(html);await page.locator(focus).focus();
 const actual=await page.locator(target).evaluate(hasSemanticFocus);results.push({name,actual,expected,pass:actual===expected});
}
await fs.writeFile(out+'/result.json',JSON.stringify({scope:'Verifier semantics unit controls; no product model calls',results},null,2));
await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length}));
if(results.some(r=>!r.pass))process.exitCode=1;
