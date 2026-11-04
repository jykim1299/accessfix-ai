// Trusted verifier. This file is not supplied to the repair model.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
import {hasSemanticFocus} from './semantics.mjs';
const require=createRequire('/opt/runtime/package.json');
const {chromium}=require('playwright');
const esbuild=require('esbuild');
const axeSource=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const contract=JSON.parse(await fs.readFile('/harness/contract.json','utf8'));
const [caseId,mode]=(process.argv[2]||'').split(':');
const selected=contract.cases[caseId];
if(!selected||!['final','observe'].includes(mode))throw Error('Unknown case or verification mode');
const started=performance.now();
const write=(name,value)=>fs.writeFile(name,JSON.stringify(value,null,2));
const issue=(category,message)=>Object.assign(new Error(message),{category});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const origin='http://127.0.0.1:8042';
const output={schema_version:1,case_id:caseId,mode,build_ok:false,workflows:[],environment:{playwright:require('playwright/package.json').version,axe:require('axe-core/package.json').version,react:require('react/package.json').version,esbuild:esbuild.version,chromium_sandbox:false,source_scripts_executed:false,network:'none'}};

async function build(){
 const buildStarted=performance.now();
 await fs.mkdir('/out/dist',{recursive:true});
 const result=await esbuild.build({entryPoints:['/source/src/main.tsx'],outfile:'/out/dist/app.js',bundle:true,platform:'browser',format:'iife',target:'es2022',jsx:'automatic',nodePaths:['/opt/runtime/node_modules'],tsconfigRaw:{compilerOptions:{jsx:'react-jsx',target:'es2022'}},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',metafile:true,
  plugins:[{name:'source-boundary',setup(build){build.onResolve({filter:/.*/},args=>{
   if(args.kind==='entry-point')return;
   const fromSource=args.resolveDir.startsWith('/source');
   if(fromSource&&path.isAbsolute(args.path))throw Error('Absolute source imports are not allowed');
   if(fromSource&&args.path.startsWith('.')){const resolved=path.resolve(args.resolveDir,args.path);if(!resolved.startsWith('/source/'))throw Error('Source import escapes registered project');}
   if(fromSource&&!args.path.startsWith('.')&&!/^(react|react-dom)(\/|$)/.test(args.path))throw Error('Unregistered dependency import');
  });}}]});
 await fs.writeFile('/out/dist/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AccessFix M4 registered evaluation case</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
 output.build_s=(performance.now()-buildStarted)/1000;
 await write('/out/build.json',{esbuild:esbuild.version,entry:'src/main.tsx',warnings:result.warnings,inputs:Object.keys(result.metafile.inputs),source_scripts_executed:false,elapsed_s:output.build_s});
 output.build_ok=true;
}

async function serve(){
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css'};
 const server=http.createServer(async(req,res)=>{try{
  const requested=decodeURIComponent(new URL(req.url,origin).pathname);
  const filename=requested==='/'?'/out/dist/index.html':path.resolve('/out/dist','.'+requested);
  if(!filename.startsWith('/out/dist/')){res.writeHead(403);res.end();return;}
  const body=await fs.readFile(filename);
  res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'");
  res.end(body);
 }catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(resolve=>server.listen(8042,'127.0.0.1',resolve));return server;
}

async function resolveRole(page,role,name){
 const locator=page.getByRole(role,name===undefined?{}:{name,exact:true});
 const until=performance.now()+1500;
 let count=0;
 do{count=await locator.count();if(count>1)throw issue('selector_ambiguity',`Role ${role} / ${name||''} matched ${count} elements`);if(count===1)return locator;await wait(30);}while(performance.now()<until);
 throw issue('target_missing',`Role ${role} / ${name||''} did not resolve uniquely`);
}
async function focus(page){return page.evaluate(()=>{const a=document.activeElement;return a?{tag:a.tagName,role:a.getAttribute('role'),name:a.getAttribute('aria-label'),text:(a.innerText||'').trim().slice(0,120),inDialog:Boolean(a.closest('[role="dialog"],dialog'))}:null;});}
function axeRules(rules){return rules.map(rule=>({id:rule.id,impact:rule.impact,description:rule.description,help:rule.help,helpUrl:rule.helpUrl,nodes:rule.nodes.map(n=>({target:n.target,html:n.html,impact:n.impact,failureSummary:n.failureSummary,any:n.any,all:n.all,none:n.none}))}));}

async function createSession(browser,dir){
 await fs.mkdir(dir,{recursive:true});
 const context=await browser.newContext({viewport:{width:1280,height:900},locale:'en-US',serviceWorkers:'block'});
 const page=await context.newPage();page.setDefaultTimeout(1800);
 const errors=[];const blocked=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(blocked.push(route.request().url()),route.abort()));
 await context.routeWebSocket('**/*',ws=>{blocked.push(ws.url());ws.close();});
 await context.tracing.start({screenshots:true,snapshots:true,sources:false});
 await page.goto(origin,{waitUntil:'networkidle',timeout:15000});
 return {page,context,errors,blocked};
}
async function scan(page,dir,state){
 const item={state,status:'error'};
 try{
  await page.addScriptTag({content:axeSource});
  const raw=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']},resultTypes:['violations','incomplete']}));
  Object.assign(item,{status:'complete',violations:axeRules(raw.violations),incomplete:axeRules(raw.incomplete),test_engine:raw.testEngine});
  item.screenshot=`${state}.png`;await page.screenshot({path:path.join(dir,item.screenshot),fullPage:true});
 }catch(error){item.status='error';item.error=String(error.message);}
 await write(path.join(dir,`${state}.axe.json`),item);return item;
}

async function runFinal(browser,spec){
 const dir=`/out/evidence/${spec.id}`;
 const result={id:spec.id,modality:spec.modality,status:'error',required_checks:spec.checks,required_states:spec.states,checks:[],actions:[],errors:[],audits:[],page_errors:[]};
 const time=performance.now();let session;
 try{
  session=await createSession(browser,dir);const {page}=session;
  const event=async(kind,detail={})=>result.actions.push({kind,...detail,focus:await focus(page),elapsed_s:(performance.now()-time)/1000});
  const press=async key=>{await page.keyboard.press(key);await event('key',{key});};
  const target=(role,name)=>resolveRole(page,role,name);
  const focused=async(role,name)=>(await target(role,name)).evaluate(hasSemanticFocus);
  const reach=async loc=>{for(let i=0;i<24;i++){if(await loc.evaluate(el=>el===document.activeElement))return;await press('Tab');}throw issue('keyboard_unreachable','Bounded Tab navigation could not reach the semantic target');};
  const activate=async(role,name,key='Enter')=>{const loc=await target(role,name);if(spec.modality==='pointer'){await loc.click();await event('pointer',{role,name});}else{await reach(loc);await press(key);}};
  const text=async(role,name)=>(await (await target(role,name)).innerText()).trim();
  const check=async(id,test,expected=true)=>{let actual;const until=performance.now()+1200;do{actual=await test();if(isDeepStrictEqual(actual,expected))break;await wait(30);}while(performance.now()<until);const pass=isDeepStrictEqual(actual,expected);result.checks.push({id,status:pass?'pass':'fail',expected,actual});return pass;};
  const ensure=async(id,test,expected=true)=>{if(!await check(id,test,expected))throw issue('task_failed',`User task checkpoint failed: ${id}`);};
  const audit=async state=>result.audits.push(await scan(page,dir,state));
  const reload=async()=>{await page.reload({waitUntil:'networkidle'});await event('reload');};
  if(caseId==='dev-tabs'){
   const destination=spec.scenario==='activity'?'Activity':'Billing';
   const panel=destination==='Activity'?'Recent activity':'Billing details';
   await ensure('content-preserved',async()=>{await target('heading','Project overview');await target('tablist','Project views');return await text('status','Note count');},'Notes: 0');
   await audit('overview');
   if(spec.modality==='pointer')await activate('tab',destination);
   else{await reach(await target('tab','Overview'));await press(destination==='Activity'?'ArrowRight':'ArrowLeft');await ensure('focus-target',()=>focused('tab',destination));await press('Enter');}
   await ensure('target-panel',async()=>await page.getByRole('heading',{name:panel,exact:true}).count(),1);
   await check('active-tab',async()=>(await target('tab',destination)).getAttribute('aria-selected'),'true');
   await audit(destination.toLowerCase());
   if(spec.modality==='pointer')await activate('tab','Overview');
   else{await press(destination==='Activity'?'ArrowLeft':'ArrowRight');await ensure('focus-return',()=>focused('tab','Overview'));await press('Enter');}
   await ensure('return-panel',async()=>await page.getByRole('heading',{name:'Project overview',exact:true}).count(),1);
   await audit('returned-overview');
   await activate('button','Add note');await check('note-action',()=>text('status','Note count'),'Notes: 1');
   await reload();await check('persistence',()=>text('status','Note count'),'Notes: 1');await audit('persisted');
  }else if(caseId==='holdout-menu'){
   const archived=spec.scenario==='archive';const command=archived?'Archive draft':'Duplicate draft';
   const current=async()=>({status:await text('status','Draft status'),copies:await text('status','Copy count'),drafts:await text('status','Draft count')});
   const expected={status:archived?'Archived':'Active',copies:archived?'Copies: 0':'Copies: 1',drafts:'Drafts: 1'};
   await ensure('content-preserved',current,{status:'Active',copies:'Copies: 0',drafts:'Drafts: 1'});await audit('closed');
   await activate('button','Workspace actions');await ensure('opened',async()=>await page.getByRole('menu',{name:'Workspace actions',exact:true}).count(),1);await audit('open');
   if(spec.modality==='keyboard'){
    await ensure('focus-entry',()=>focused('menuitem','Duplicate draft'));
    if(archived)await press('ArrowDown');
    await ensure('focus-command',()=>focused('menuitem',command));await press('Enter');
   }else await activate('menuitem',command);
   await ensure('closed',async()=>await page.getByRole('menu').count(),0);await check('selection-result',current,expected);
   if(spec.modality==='keyboard')await check('selection-focus-return',()=>focused('button','Workspace actions'));
   await audit('selected');
   await activate('button','Workspace actions');
   if(spec.modality==='keyboard')await press('Escape');else await activate('button','Workspace actions');
   await ensure('cancel-closed',async()=>await page.getByRole('menu').count(),0);await check('cancel-preserves',current,expected);
   if(spec.modality==='keyboard')await check('cancel-focus-return',()=>focused('button','Workspace actions'));
   await audit('cancelled');
   await activate('button','Create draft');expected.drafts='Drafts: 2';await check('background-action',current,expected);
   await reload();await check('persistence',current,expected);await audit('persisted');
  }else if(caseId==='holdout-switch'){
   const state=async()=>(await target('switch','Weekly summary')).getAttribute('aria-checked');
   const saved=()=>text('status','Saved notification settings');
   await ensure('content-preserved',async()=>({state:await state(),saved:await saved(),test:await text('status','Test notification count')}),{state:'false',saved:'Weekly summary: Off',test:'Test notifications: 0'});await audit('initial');
   await activate('switch','Weekly summary','Space');await ensure('toggle-on',state,'true');await check('draft-not-saved',saved,'Weekly summary: Off');await audit('changed');
   if(spec.scenario==='save'){
    await activate('button','Save settings');await check('saved-summary',saved,'Weekly summary: On');
    await activate('switch','Weekly summary','Space');await ensure('toggle-off',state,'false');await activate('button','Reset changes');await check('reset-preserves',state,'true');
   }else{
    await activate('button','Reset changes');await check('reset-preserves',state,'false');await check('saved-summary',saved,'Weekly summary: Off');
    await activate('switch','Weekly summary','Space');await ensure('toggle-again',state,'true');await activate('button','Save settings');await check('save-after-reset',saved,'Weekly summary: On');
   }
   await audit('saved');await activate('button','Send test notification');await check('background-action',()=>text('status','Test notification count'),'Test notifications: 1');
   await reload();await check('persistence',async()=>({state:await state(),saved:await saved(),test:await text('status','Test notification count')}),{state:'true',saved:'Weekly summary: On',test:'Test notifications: 0'});await audit('persisted');
  }else if(caseId==='holdout-action'){
   const current=async()=>({total:await text('status','Order total'),coupon:await text('status','Coupon status'),items:await text('status','Item count')});
   await ensure('content-preserved',current,{total:'$100.00',coupon:'No coupon',items:'Items: 1'});await audit('initial');
   await activate('button','Apply coupon',spec.scenario==='space'?'Space':'Enter');await ensure('coupon-applied',current,{total:'$90.00',coupon:'Coupon applied',items:'Items: 1'});await audit('discounted');
   if(spec.scenario==='clear-first'){
    await activate('button','Clear coupon');await check('clear-coupon',current,{total:'$100.00',coupon:'No coupon',items:'Items: 1'});await audit('cleared');
    await activate('button','Add item');await check('background-action',current,{total:'$200.00',coupon:'No coupon',items:'Items: 2'});
    await reload();await check('persistence',current,{total:'$200.00',coupon:'No coupon',items:'Items: 2'});await audit('persisted');
   }else{
    await activate('button','Add item');await check('background-action',current,{total:'$180.00',coupon:'Coupon applied',items:'Items: 2'});
    await reload();await check('persistence',current,{total:'$180.00',coupon:'Coupon applied',items:'Items: 2'});await audit('persisted');
    await activate('button','Clear coupon');await check('clear-coupon',current,{total:'$200.00',coupon:'No coupon',items:'Items: 2'});await audit('cleared');
   }
   await reload();await check('clear-persistence',current,{total:'$200.00',coupon:'No coupon',items:'Items: 2'});
  }
 }catch(error){result.errors.push({category:error.category||'measurement_error',message:String(error.message).slice(0,2500)});}
 finally{
  if(session){result.page_errors=session.errors;result.blocked_requests=session.blocked;await session.context.tracing.stop({path:`${dir}/trace.zip`}).catch(error=>result.errors.push({category:'trace_error',message:String(error.message)}));await session.context.close();}
  for(const id of spec.checks)if(!result.checks.some(c=>c.id===id))result.checks.push({id,status:'missing'});
  for(const state of spec.states)if(!result.audits.some(a=>a.state===state))result.audits.push({state,status:'missing'});
  const uncertain=result.errors.some(e=>['selector_ambiguity','target_missing','measurement_error','trace_error'].includes(e.category));
  result.status=uncertain?'error':result.errors.length||result.page_errors.length||result.blocked_requests?.length||result.checks.some(c=>c.status!=='pass')||result.audits.some(a=>a.status!=='complete')?'fail':'pass';
  result.elapsed_s=(performance.now()-time)/1000;await fs.mkdir(dir,{recursive:true});await write(`${dir}/result.json`,result);
 }
 return result;
}

async function observe(browser){
 const dir='/out/observation';const session=await createSession(browser,dir);const {page}=session;
 const observations={audits:[],keyboard:[],errors:[],scope:'Operational keyboard observations only; no final assertions or control patches'};
 const targets={'dev-tabs':['tab','Overview'],'holdout-menu':['button','Workspace actions'],'holdout-switch':['switch','Weekly summary'],'holdout-action':['button','Apply coupon']};
 const keys={'dev-tabs':['ArrowRight','Enter','ArrowLeft','Enter'],'holdout-menu':['Enter','ArrowDown','Escape'],'holdout-switch':['Space'],'holdout-action':['Enter','Space']};
 try{
  observations.audits.push(await scan(page,dir,'initial'));
  const [role,name]=targets[caseId];const loc=await resolveRole(page,role,name);let reached=false;
  for(let i=0;i<24;i++){if(await loc.evaluate(el=>el===document.activeElement)){reached=true;break;}await page.keyboard.press('Tab');}
  observations.keyboard.push({action:'Tab navigation',target:{role,name},reached,focus:await focus(page)});
  if(reached){for(const key of keys[caseId]){await page.keyboard.press(key);observations.keyboard.push({action:key,focus:await focus(page),visible_text:(await page.locator('body').innerText()).slice(0,4000)});}observations.audits.push(await scan(page,dir,'after-keys'));}
 }catch(error){observations.errors.push({category:error.category||'measurement_error',message:String(error.message).slice(0,2000)});}
 finally{observations.page_errors=session.errors;observations.blocked_requests=session.blocked;await session.context.tracing.stop({path:`${dir}/trace.zip`});await session.context.close();}
 output.observations=observations;
}

let browser,server;
try{
 await build();const browserStarted=performance.now();server=await serve();browser=await chromium.launch({headless:true,chromiumSandbox:false});output.environment.chromium=browser.version();
 if(mode==='observe')await observe(browser);else for(const spec of selected.workflows)output.workflows.push(await runFinal(browser,spec));
 output.browser_s=(performance.now()-browserStarted)/1000;
}catch(error){output.error={category:output.build_ok?'measurement_error':'build_failed',message:String(error.stack||error).slice(0,8000)};process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));output.elapsed_s=(performance.now()-started)/1000;await write('/out/result.json',output);}

