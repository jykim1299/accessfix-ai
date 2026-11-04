// Trusted verifier. This file is not supplied to the repair model.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
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
 await fs.writeFile('/out/dist/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AccessFix M5 public React accordion</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
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

// Independently authored user-task verification; not sent to the repair provider.
const questions = [
 'Do I have to allow the use of cookies?',
 'How do I change my My Page password?',
 'What is BankID?',
 'Whose birth number can I use?',
 'When do I recieve a password ordered by letter?',
];
const answers = [
 'Unicorn vinyl poutine brooklyn, next level direct trade iceland.',
 'Coloring book forage photo booth gentrify lumbersexual.',
 'Enamel pin fam sustainable woke whatever venmo.',
 'Edison bulb direct trade gentrify beard lo-fi seitan sustainable roof party franzen occupy squid.',
 'Locavore franzen fashion axe live-edge neutra irony synth af tilde shabby chic man braid chillwave waistcoat copper mug messenger bag.',
];
const multipleName='Is multiple open accordion allowed?';

// Select the control by its visible question context, not a fixed tag, CSS class,
// parent depth, generated identifier, or expected answer-patch implementation.
async function questionControl(page,index){
 const title=questions[index];
 const named=page.getByRole('button',{name:title,exact:true});
 if(await named.count()===1)return await named.elementHandle();
 const heading=await resolveRole(page,'heading',title);
 const handle=await heading.evaluateHandle(el=>{
  const candidates=node=>[...node.querySelectorAll('button,[role="button"],summary')].filter(x=>x.getBoundingClientRect().width>0);
  for(let node=el;node&&node.tagName!=='BODY';node=node.parentElement){
   const buttons=candidates(node);
   if(buttons.length===1)return buttons[0];
   if(buttons.length>1)return null;
  }
  return null;
 });
 const element=handle.asElement();
 if(!element)throw issue('semantic_ambiguity','Question did not have exactly one contextual disclosure control: '+title);
 return element;
}
async function reach(page,element,onKey=async()=>{}){
 for(let i=0;i<24;i++){
  if(await element.evaluate(el=>el===document.activeElement))return;
  await page.keyboard.press('Tab');await onKey('Tab');
 }
 throw issue('keyboard_unreachable','Tab navigation could not reach the question control');
}
async function observe(browser){
 const dir='/out/observation';const session=await createSession(browser,dir);const {page}=session;
 const observations={audits:[],keyboard:[],errors:[],scope:'Operational rendered-page observations, no final assertions or reference patches'};
 try{
  observations.audits.push(await scan(page,dir,'initial'));
  const target=await questionControl(page,0);
  await reach(page,target,async key=>observations.keyboard.push({action:key,focus:await focus(page)}));
  for(const key of ['Enter','Space']){
   await page.keyboard.press(key);
   observations.keyboard.push({action:key,focus:await focus(page),visible_text:(await page.locator('body').innerText()).slice(0,4000)});
  }
  observations.audits.push(await scan(page,dir,'after-keys'));
 }catch(error){observations.errors.push({category:error.category||'measurement_error',message:String(error.message)});}
 finally{observations.page_errors=session.errors;observations.blocked_requests=session.blocked;await session.context.tracing.stop({path:`${dir}/trace.zip`});await session.context.close();}
 output.observations=observations;
}
async function runFinal(browser,spec){
 const dir=`/out/evidence/${spec.id}`;
 const result={id:spec.id,modality:spec.modality,status:'error',required_checks:spec.checks,required_states:spec.states,checks:[],actions:[],errors:[],audits:[],page_errors:[]};
 const time=performance.now();let session;
 try{
  session=await createSession(browser,dir);const {page}=session;
  const event=async(kind,detail={})=>result.actions.push({kind,...detail,focus:await focus(page),elapsed_s:(performance.now()-time)/1000});
  const press=async key=>{await page.keyboard.press(key);await event('key',{key});};
  const activate=async(element,key='Enter')=>{if(spec.modality==='pointer'){await element.click();await event('pointer');}else{await reach(page,element,async key=>event('key',{key}));await press(key);}};
  const question=async index=>activate(await questionControl(page,index),spec.scenario==='multi'?'Enter':'Space');
  const toggle=async()=>activate(await (await resolveRole(page,'checkbox',multipleName)).elementHandle(),'Space');
  const visible=async()=>{const values=[];for(const answer of answers)values.push(await page.getByText(answer,{exact:false}).isVisible());return values;};
  const check=async(id,test,expected)=>{let actual;const until=performance.now()+1500;do{actual=await test();if(isDeepStrictEqual(actual,expected))break;await wait(30);}while(performance.now()<until);const pass=isDeepStrictEqual(actual,expected);result.checks.push({id,status:pass?'pass':'fail',expected,actual});return pass;};
  const ensure=async(id,test,expected)=>{if(!await check(id,test,expected))throw issue('task_failed','User task checkpoint failed: '+id);};
  const audit=async state=>result.audits.push(await scan(page,dir,state));
  await ensure('content-preserved',async()=>{for(const q of questions)await resolveRole(page,'heading',q);return await (await resolveRole(page,'checkbox',multipleName)).isChecked();},true);
  await ensure('initial-collapsed',visible,[false,false,false,false,false]);await audit('initial');
  if(spec.scenario==='multi'){
   await question(0);await ensure('first-answer',visible,[true,false,false,false,false]);await audit('first-open');
   await question(1);await ensure('multiple-answers',visible,[true,true,false,false,false]);await audit('multiple-open');
   await question(0);await ensure('independent-close',visible,[false,true,false,false,false]);
   await toggle();await ensure('mode-clears',visible,[false,false,false,false,false]);
   await ensure('single-mode',async()=>await (await resolveRole(page,'checkbox',multipleName)).isChecked(),false);await audit('mode-changed');
   await question(2);await ensure('third-answer',visible,[false,false,true,false,false]);
   await question(3);await ensure('exclusive-open',visible,[false,false,false,true,false]);await audit('exclusive-open');
   await question(3);await ensure('collapse-current',visible,[false,false,false,false,false]);await audit('final');
  }else{
   await toggle();await ensure('single-mode',async()=>await (await resolveRole(page,'checkbox',multipleName)).isChecked(),false);await audit('mode-changed');
   await question(4);await ensure('fifth-answer',visible,[false,false,false,false,true]);await audit('first-open');
   await question(0);await ensure('exclusive-open',visible,[true,false,false,false,false]);await audit('exclusive-open');
   await toggle();await ensure('multiple-mode',async()=>await (await resolveRole(page,'checkbox',multipleName)).isChecked(),true);
   await ensure('mode-preserves',visible,[true,false,false,false,false]);
   await question(1);await ensure('multiple-answers',visible,[true,true,false,false,false]);await audit('multiple-open');
   await question(1);await ensure('independent-close',visible,[true,false,false,false,false]);
   await question(0);await ensure('collapse-current',visible,[false,false,false,false,false]);await audit('final');
  }
 }catch(error){result.errors.push({category:error.category||'measurement_error',message:String(error.message).slice(0,2500)});}
 finally{
  if(session){result.page_errors=session.errors;result.blocked_requests=session.blocked;await session.context.tracing.stop({path:`${dir}/trace.zip`}).catch(error=>result.errors.push({category:'trace_error',message:String(error.message)}));await session.context.close();}
  for(const id of spec.checks)if(!result.checks.some(c=>c.id===id))result.checks.push({id,status:'missing'});
  for(const state of spec.states)if(!result.audits.some(a=>a.state===state))result.audits.push({state,status:'missing'});
  const uncertain=result.errors.some(e=>['selector_ambiguity','semantic_ambiguity','target_missing','measurement_error','trace_error'].includes(e.category));
  result.status=uncertain?'error':result.errors.length||result.page_errors.length||result.blocked_requests?.length||result.checks.some(c=>c.status!=='pass')||result.audits.some(a=>a.status!=='complete')?'fail':'pass';
  result.elapsed_s=(performance.now()-time)/1000;await fs.mkdir(dir,{recursive:true});await write(`${dir}/result.json`,result);
 }
 return result;
}

let browser,server;
try{
 await build();const browserStarted=performance.now();server=await serve();browser=await chromium.launch({headless:true,chromiumSandbox:false});output.environment.chromium=browser.version();
 if(mode==='observe')await observe(browser);else for(const spec of selected.workflows)output.workflows.push(await runFinal(browser,spec));
 output.browser_s=(performance.now()-browserStarted)/1000;
}catch(error){output.error={category:output.build_ok?'measurement_error':'build_failed',message:String(error.stack||error).slice(0,8000)};process.exitCode=1;}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));output.elapsed_s=(performance.now()-started)/1000;await write('/out/result.json',output);}

