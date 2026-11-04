// Narrow read-only regression check for the final diff-region semantic change.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const base=process.argv[2]||'http://127.0.0.1:8801';
const out=path.resolve(process.argv[3]||'../../artifacts/m2-ui/final-diff-v1');
await fs.mkdir(out,{recursive:false});
const save=(name,data)=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2));
async function bundle(){const result={};for(const p of ['/app.js','/app.css']){const r=await fetch(base+p);assert.equal(r.status,200);result[p]=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');}return result;}
const initial=await bundle();await save('bundle-start.json',initial);
const b=await chromium.launch({headless:true});
const c=await b.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await c.tracing.start({screenshots:true,snapshots:true,sources:false});
const p=await c.newPage();const posts=[],errors=[];p.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(base+'/#/runs/m1-ai');await p.getByRole('tab',{name:'Code diff',exact:true}).click();
 const region=p.getByRole('region',{name:'Patch diff scroll region',exact:true});await region.waitFor();
 let presses=0;for(;presses<80;presses++){if(await region.evaluate(el=>el===document.activeElement))break;await p.keyboard.press('Tab');}
 assert.ok(presses<80,'Diff region not reachable via Tab');
 const before=await region.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop,width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));
 await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowDown');await p.waitForTimeout(400);
 const after=await region.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop,focused:el===document.activeElement}));
 assert.ok(after.focused,'Diff region lost keyboard focus');assert.ok(after.left>before.left||after.top>before.top,'Arrow keys did not scroll diff');
 const axe=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');await p.addScriptTag({content:axe});
 const audit=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
 await save('diff.axe.json',audit);
 await save('observed.json',{time:new Date().toISOString(),keyboard:{tab_presses:presses,before,after},violation_rules:audit.violations.length,incomplete:audit.incomplete.map(r=>({id:r.id,nodes:r.nodes.map(n=>n.target)})),semantic_aria_incomplete:audit.incomplete.some(r=>r.id==='aria-prohibited-attr'),manual_review_required:audit.incomplete.length>0,post_requests:posts,page_errors:errors});
 await p.screenshot({path:path.join(out,'diff-keyboard-observed.png'),fullPage:true});
 assert.equal(audit.violations.length,0);assert.equal(audit.incomplete.length,0,'Final diff should have no unresolved axe records');
 await p.screenshot({path:path.join(out,'diff-keyboard.png'),fullPage:true});
 const final=await bundle();await save('bundle-end.json',final);assert.deepEqual(final,initial);assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);
 const summary={purpose:'Read-only final Diff semantics and keyboard regression; no model calls',time:new Date().toISOString(),passed:true,keyboard:{tab_presses:presses,before,after},axe:{violation_rules:0,incomplete_rules:0},bundle_unchanged:true,post_requests:posts,page_errors:errors};await save('summary.json',summary);console.log(JSON.stringify(summary));
}catch(e){await save('failure.json',{error:String(e.stack||e)});throw e;}finally{await c.tracing.stop({path:path.join(out,'trace.zip')});await b.close();}
