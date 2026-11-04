// Trusted verifier. This file is not supplied to the repair model.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {isDeepStrictEqual} from 'node:util';
import {createRequire} from 'node:module';
const require=createRequire('/opt/runtime/package.json');
const {chromium}=require('playwright');
const esbuild=require('esbuild');
const axeSource=await fs.readFile(require.resolve('axe-core/axe.min.js'),'utf8');
const contract=JSON.parse(await fs.readFile('/harness/contract.json','utf8'));
const mode=process.argv[2]||'final';
const started=performance.now();
const write=(name,value)=>fs.writeFile(name,JSON.stringify(value,null,2));
const issue=(category,message)=>Object.assign(new Error(message),{category});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const origin='http://127.0.0.1:8042';
const defaultSettings={displayName:'Morgan',emailUpdates:true};
const output={schema_version:1,mode,build_ok:false,workflows:[],environment:{playwright:require('playwright/package.json').version,axe:require('axe-core/package.json').version,react:require('react/package.json').version,esbuild:esbuild.version,chromium_sandbox:false,source_scripts_executed:false,network:'none'}};

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
 await fs.writeFile('/out/dist/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AccessFix delivery preferences example</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
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
async function storage(page){return page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('accessfix.delivery'));}catch{return null;}});}
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
 let session;
 const time=performance.now();
 try{
  session=await createSession(browser,dir);const {page}=session;
  const event=async(kind,detail={})=>result.actions.push({kind,...detail,focus:await focus(page),elapsed_s:(performance.now()-time)/1000});
  const press=async key=>{await page.keyboard.press(key);await event('key',{key});};
  const reach=async loc=>{
   for(let i=0;i<32;i++){if(await loc.evaluate(el=>el===document.activeElement))return;await press('Tab');}
   throw issue('keyboard_unreachable','Tab navigation could not reach the requested control');
  };
  const activate=async(role,name,key='Enter')=>{
   const loc=await resolveRole(page,role,name);
   if(spec.modality==='pointer'){await loc.click();await event('pointer',{role,name});}
   else{await reach(loc);await press(key);}
  };
  const check=async(id,test,expected=true)=>{
   let actual;const until=performance.now()+1400;
   do{actual=await test();if(isDeepStrictEqual(actual,expected))break;await wait(30);}while(performance.now()<until);
   result.checks.push({id,status:isDeepStrictEqual(actual,expected)?'pass':'fail',expected,actual});
  };
  const dialog=()=>resolveRole(page,'dialog');
  const inside=async()=>{const d=await dialog();return d.evaluate(el=>el.contains(document.activeElement));};
  const setDraft=async(value,email)=>{
   const input=await resolveRole(page,'textbox','Display name');
   if(spec.modality==='pointer'){await input.fill(value);await event('pointer-input',{name:'Display name',length:value.length});}
   else{await reach(input);await press('ControlOrMeta+A');await page.keyboard.type(value);await event('keyboard-input',{name:'Display name',length:value.length});}
   const box=await resolveRole(page,'checkbox','Email updates');
   if(await box.isChecked()!==email)await activate('checkbox','Email updates','Space');
  };
  const expectedName=spec.scenario==='save'?'Aster Studio':'Uncommitted name';
  const expectedSettings=spec.scenario==='save'?{displayName:expectedName,emailUpdates:false}:defaultSettings;
  const summaryExpected=`${expectedSettings.displayName} · Email updates: ${expectedSettings.emailUpdates?'On':'Off'}`;
  await check('content-preserved',async()=>{
   await resolveRole(page,'heading','Delivery workspace');await resolveRole(page,'button','Create draft');
   const summary=await resolveRole(page,'status','Saved preferences');const drafts=await resolveRole(page,'status','Draft count');
   return (await summary.innerText()).trim()==='Morgan · Email updates: On'&&(await drafts.innerText()).trim()==='0 drafts';
  });
  result.audits.push(await scan(page,dir,'closed'));
  await activate('button','Edit delivery preferences',spec.id==='keyboard-cancel'?'Space':'Enter');
  await check('opened',async()=>{await dialog();return await page.getByRole('heading',{name:'Delivery preferences',exact:true}).count()===1;});
  result.audits.push(await scan(page,dir,'open'));
  if(spec.modality==='keyboard'){
   await check('focus-entry',inside);
   for(const [id,key] of [['focus-forward','Tab'],['focus-reverse','Shift+Tab']]){
    const d=await dialog();const count=await d.locator('button,input,select,textarea,a[href],[tabindex]').filter({visible:true}).count();
    let stayed=true;const observed=[];
    for(let i=0;i<Math.min(30,Math.max(8,count*2+2));i++){await press(key);const ok=await inside();observed.push(await focus(page));if(!ok)stayed=false;}
    result.checks.push({id,status:stayed?'pass':'fail',expected:'all key steps keep focus in dialog',actual:observed});
   }
  }
  await setDraft(expectedName,false);
  if(spec.scenario==='save')await activate('button','Save preferences');
  else if(spec.scenario==='cancel')await activate('button','Cancel');
  else await press('Escape');
  await check('closed',async()=>await page.getByRole('dialog').count()===0);
  if(spec.modality==='keyboard')await check('focus-return',async()=>{
   const opener=await resolveRole(page,'button','Edit delivery preferences');return opener.evaluate(el=>el===document.activeElement);
  });
  const state=spec.scenario==='save'?'saved':'cancelled';
  if(await page.getByRole('dialog').count()===0)result.audits.push(await scan(page,dir,state));
  await check(`${state}-summary`,async()=>{const summary=await resolveRole(page,'status','Saved preferences');return (await summary.innerText()).trim();},summaryExpected);
  await check(`${state}-storage`,()=>storage(page),expectedSettings);
  await activate('button','Edit delivery preferences');
  await check('reopened',async()=>{
   await dialog();const input=await resolveRole(page,'textbox','Display name');const box=await resolveRole(page,'checkbox','Email updates');
   return await input.inputValue()===expectedSettings.displayName&&await box.isChecked()===expectedSettings.emailUpdates;
  });
  await activate('button','Cancel');
  await activate('button','Create draft');
  await check('background-action',async()=>{const count=await resolveRole(page,'status','Draft count');return (await count.innerText()).trim();},'1 drafts');
 }catch(error){result.errors.push({category:error.category||'measurement_error',message:String(error.message).slice(0,2500)});}
 finally{
  if(session){
   result.page_errors=session.errors;result.blocked_requests=session.blocked;
   await session.context.tracing.stop({path:`${dir}/trace.zip`}).catch(error=>result.errors.push({category:'trace_error',message:String(error.message)}));
   await session.context.close();
  }
  for(const id of spec.checks)if(!result.checks.some(c=>c.id===id))result.checks.push({id,status:'missing'});
  for(const state of spec.states)if(!result.audits.some(a=>a.state===state))result.audits.push({state,status:'missing'});
  const uncertain=result.errors.some(e=>['selector_ambiguity','target_missing','measurement_error','trace_error'].includes(e.category));
  result.status=uncertain?'error':result.errors.length||result.page_errors.length||result.checks.some(c=>c.status!=='pass')||result.audits.some(a=>a.status!=='complete')?'fail':'pass';
  result.elapsed_s=(performance.now()-time)/1000;
  await fs.mkdir(dir,{recursive:true});await write(`${dir}/result.json`,result);
 }
 return result;
}

async function observe(browser){
 const dir='/out/observation';const session=await createSession(browser,dir);const {page}=session;
 const observations={audits:[],keyboard:[],errors:[]};
 try{
  observations.audits.push(await scan(page,dir,'closed'));
  const opener=await resolveRole(page,'button','Edit delivery preferences');
  let reached=false;
  for(let i=0;i<24;i++){if(await opener.evaluate(el=>el===document.activeElement)){reached=true;break;}await page.keyboard.press('Tab');}
  observations.keyboard.push({action:'Tab navigation to open preferences',reached,focus:await focus(page)});
  if(reached){await page.keyboard.press('Enter');const d=await resolveRole(page,'dialog');
   observations.keyboard.push({action:'Enter opens preferences',open:true,focus:await focus(page),focus_inside_dialog:await d.evaluate(el=>el.contains(document.activeElement))});
   observations.audits.push(await scan(page,dir,'open'));
   for(let i=0;i<8;i++){await page.keyboard.press('Tab');observations.keyboard.push({action:'Tab',focus:await focus(page)});}
   await page.keyboard.press('Escape');observations.keyboard.push({action:'Escape',dialog_remaining:await page.getByRole('dialog').count(),focus:await focus(page)});
  }
 }catch(error){observations.errors.push({category:error.category||'measurement_error',message:String(error.message).slice(0,2000)});}
 finally{observations.page_errors=session.errors;await session.context.tracing.stop({path:`${dir}/trace.zip`});await session.context.close();}
 output.observations=observations;
}

async function probe(){
 const checks=[];const add=(id,pass,actual)=>checks.push({id,pass,actual});
 add('non-root',process.getuid()!==0,process.getuid());
 for(const [id,p] of [['readonly-root','/probe-denied'],['readonly-source','/source/probe-denied'],['readonly-harness','/harness/probe-denied']]){
  try{await fs.writeFile(p,'test');add(id,false,'write succeeded');}catch(e){add(id,e.code==='EROFS',e.code);}
 }
 for(const p of ['/var/run/docker.sock','/host','/root/.codex']){try{await fs.access(p);add(`not-mounted:${p}`,false,'exists');}catch{add(`not-mounted:${p}`,true,'absent');}}
 const proc=await fs.readFile('/proc/self/status','utf8');
 add('caps-dropped',/CapEff:\s+0+\n/.test(proc),proc.match(/CapEff:\s+(\w+)/)?.[1]);
 add('no-new-privileges',/NoNewPrivs:\s+1/.test(proc),proc.match(/NoNewPrivs:\s+(\d+)/)?.[1]);
 for(const [id,file,expected] of [['memory-limit','memory.max','2147483648'],['cpu-limit','cpu.max','200000 100000'],['process-limit','pids.max','256']]){
  try{const actual=(await fs.readFile(`/sys/fs/cgroup/${file}`,'utf8')).trim();add(id,actual===expected,actual);}
  catch(error){add(id,false,error.code);}
 }
 const network=await new Promise(resolve=>{const socket=net.connect({host:'1.1.1.1',port:443});socket.setTimeout(1500);socket.on('connect',()=>{socket.destroy();resolve('connected');});socket.on('error',e=>resolve(e.code));socket.on('timeout',()=>{socket.destroy();resolve('timeout');});});
 add('external-network-blocked',network!=='connected',network);
 const credentialNames=['OPENAI_API_KEY','MODEL_API_KEY','LLM_API_KEY'];add('no-model-credentials',credentialNames.every(key=>!process.env[key]),credentialNames.filter(key=>Boolean(process.env[key])));
 output.isolation={checks,passed:checks.filter(c=>c.pass).length,total:checks.length};
}

let browser,server;
try{
 if(mode==='isolation'){await probe();}
 else{
  await build();const browserStarted=performance.now();server=await serve();browser=await chromium.launch({headless:true,chromiumSandbox:false});output.environment.chromium=browser.version();
  if(mode==='observe')await observe(browser);
  else if(mode==='final'){for(const spec of contract.workflows)output.workflows.push(await runFinal(browser,spec));}
  else throw Error('Unknown verification mode');
  output.browser_s=(performance.now()-browserStarted)/1000;
 }
}catch(error){output.error={category:output.build_ok?'measurement_error':'build_failed',message:String(error.stack||error).slice(0,8000)};process.exitCode=1;}
finally{
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
 output.elapsed_s=(performance.now()-started)/1000;await write('/out/result.json',output);
}
