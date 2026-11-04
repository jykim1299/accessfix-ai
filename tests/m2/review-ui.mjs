// Read-only visual/accessibility review after the small final semantic/icon fix.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const base=process.argv[2]||'http://127.0.0.1:8801';
const out=path.resolve(process.argv[3]||'../../artifacts/m2-ui/final-static-review');
await fs.mkdir(out,{recursive:false});
const save=(name,data)=>fs.writeFile(path.join(out,name),JSON.stringify(data,null,2));
const hash=data=>createHash('sha256').update(data).digest('hex');
async function bundles(){return Object.fromEntries(await Promise.all(['/app.js','/app.css'].map(async p=>{const r=await fetch(base+p);assert.equal(r.status,200);return[p,hash(Buffer.from(await r.arrayBuffer()))];})));}
const initial=await bundles();await save('bundle-start.json',initial);
const script=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
const page=await context.newPage();const errors=[],posts=[],results=[],reviews=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
const scenarios=[
 {name:'dashboard',route:'#/'},
 {name:'ai-overview',route:'#/runs/m1-ai'},
 {name:'before-after',route:'#/runs/m1-ai',tab:'Before / After'},
 {name:'code-diff',route:'#/runs/m1-ai',tab:'Code diff'},
 {name:'evidence',route:'#/runs/m1-ai',tab:'Evidence & safety'},
 {name:'manual-rejected',route:'#/runs/m1-control',tab:'Evidence & safety'},
 {name:'mobile-dashboard',route:'#/',width:390},
 {name:'mobile-before-after',route:'#/runs/m1-ai',tab:'Before / After',width:390},
 {name:'mobile-320-before-after',route:'#/runs/m1-ai',tab:'Before / After',width:320},
];
function luminance(rgb){return rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function rgb(text){return (text.match(/[\d.]+/g)||[]).map(Number);}
function ratio(a,b){const x=luminance(rgb(a)),y=luminance(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
try{
 for(const s of scenarios){
  try{
   await page.setViewportSize({width:s.width||1440,height:s.width?844:1000});await page.goto(base+'/'+s.route);
   await page.getByRole('heading',{level:1}).waitFor();await page.waitForFunction(()=>!document.body.innerText.includes('Loading the recorded run and verification evidence'));
   if(s.tab)await page.getByRole('tab',{name:s.tab,exact:true}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(i=>i.complete&&i.naturalWidth>0));
   const overflow=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
   assert.ok(overflow.document<=overflow.viewport+1,'Horizontal page overflow');
   await page.screenshot({path:path.join(out,s.name+'.png'),fullPage:true});
   await page.addScriptTag({content:script});const audit=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
   await save(s.name+'.axe.json',audit);
   const incomplete=audit.incomplete.map(r=>({id:r.id,nodes:r.nodes.map(n=>n.target)}));
   results.push({name:s.name,status:audit.violations.length?'fail':'pass',viewport:overflow,violation_rules:audit.violations.length,incomplete});
   // Review representative computed foreground/background pairs without clearing
   // or reclassifying any axe incomplete item in the original audit.
   const colorNodes=audit.incomplete.filter(r=>r.id==='color-contrast').flatMap(r=>r.nodes).filter(n=>n.target.length===1&&typeof n.target[0]==='string');
   const seen=new Set();
   for(const node of colorNodes){
    const loc=page.locator(node.target[0]);
    if(await loc.count()!==1)continue;
    const style=await loc.evaluate(el=>{const c=getComputedStyle(el);let ancestor=el,bg='rgba(0, 0, 0, 0)',image='none',opacity=1;while(ancestor){const a=getComputedStyle(ancestor);opacity*=Number(a.opacity);if(a.backgroundImage!=='none'){image=a.backgroundImage;break;}if(!['rgba(0, 0, 0, 0)','transparent'].includes(a.backgroundColor)){bg=a.backgroundColor;break;}ancestor=ancestor.parentElement;}const box=el.getBoundingClientRect();return{foreground:c.color,background:bg,background_image:image,font_size:c.fontSize,font_weight:c.fontWeight,opacity,text:(el.textContent||'').trim().slice(0,100),before_bounds:{x:box.x,y:box.y,width:box.width,height:box.height}};});
    const key=JSON.stringify([style.foreground,style.background,style.background_image,style.font_size,style.font_weight]);
    if(seen.has(key))continue;seen.add(key);
    await loc.scrollIntoViewIfNeeded();
    const visible=await loc.evaluate(el=>{const b=el.getBoundingClientRect();return b.width>0&&b.height>0&&b.right>0&&b.bottom>0&&b.left<innerWidth&&b.top<innerHeight;});
    const bg=rgb(style.background),fg=rgb(style.foreground);
    const canMeasure=style.background_image==='none'&&style.opacity===1&&bg.length>=3&&fg.length>=3&&(bg.length===3||bg[3]===1)&&(fg.length===3||fg[3]===1);
    const measured=canMeasure?ratio(style.foreground,style.background):null;
    reviews.push({page:s.name,target:node.target[0],...style,scrolled_into_view:visible,computed_solid_color_ratio:measured,criterion:'4.5:1 conservative normal-text ratio; ignores no gradients or opacity',review_status:measured===null?'manual_review_required':measured>=4.5?'computed_pair_meets_4.5':'computed_pair_below_4.5',note:'This supplemental style review does not convert axe incomplete to a pass.'});
   }
   console.log(JSON.stringify({page:s.name,violations:audit.violations.length,incomplete:incomplete.map(x=>({id:x.id,nodes:x.nodes.length}))}));
  }catch(e){results.push({name:s.name,status:'fail',error:String(e.stack||e)});}
 }
 const final=await bundles();await save('bundle-end.json',final);results.push({name:'bundle-stability',status:JSON.stringify(initial)===JSON.stringify(final)?'pass':'fail'});
 results.push({name:'no-mutating-requests',status:posts.length?'fail':'pass',requests:posts});results.push({name:'no-page-errors',status:errors.length?'fail':'pass',errors});
 await save('incomplete-review.json',reviews);
 const summary={purpose:'Read-only final static UI/accessibility review; no analyses, repairs, restores or model calls',time:new Date().toISOString(),checks:results.length,passed:results.filter(r=>r.status==='pass').length,failed:results.filter(r=>r.status==='fail').length,external_model_requests:0,results};
 await save('summary.json',summary);console.log(JSON.stringify({checks:summary.checks,passed:summary.passed,failed:summary.failed}));if(summary.failed)process.exitCode=1;
}finally{await context.tracing.stop({path:path.join(out,'review-trace.zip')});await browser.close();}
