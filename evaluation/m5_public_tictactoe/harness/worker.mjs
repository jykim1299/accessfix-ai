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
 await fs.writeFile('/out/dist/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AccessFix M5 public React Tic Tac Toe</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
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

// Independent final tasks are never sent to the model.
async function cells(page){
 const handle=await page.evaluateHandle(()=>{
  const boards=[...document.querySelectorAll('main *')].filter(el=>{
   const children=[...el.children];if(children.length!==9)return false;
   const boxes=children.map(x=>x.getBoundingClientRect());
   if(boxes.some(b=>b.width<20||b.height<20))return false;
   const xs=new Set(boxes.map(b=>Math.round(b.x+b.width/2))),ys=new Set(boxes.map(b=>Math.round(b.y+b.height/2)));
   return xs.size===3&&ys.size===3;
  });
  return boards.length===1?boards[0]:null;
 });
 const board=handle.asElement();if(!board)throw issue('semantic_ambiguity','Exactly one visible 3-by-3 board is required');
 return await board.$$('xpath=./*');
}
async function marks(page){
 const list=await cells(page);const values=[];
 for(const cell of list)values.push(await cell.evaluate(el=>{
  for(const node of [el,...el.querySelectorAll('*')]){
   const text=node.textContent.trim();if(!['X','O'].includes(text))continue;
   let visible=true;for(let a=node;a&&a!==el.parentElement;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)visible=false;}
   if(visible&&node.childElementCount===0)return text;
  }
  return '';
 }));
 return values;
}
async function reachCell(page,index,onKey=async()=>{}){
 const cell=(await cells(page))[index];
 const focused=()=>cell.evaluate(el=>{const active=document.activeElement;const id=active?.getAttribute('aria-activedescendant');const descendant=id?document.getElementById(id):null;return el===active||el.contains(active)||(descendant&&el.contains(descendant)&&active.contains(descendant));});
 for(let i=0;i<24;i++){
  if(await focused())return;
  await page.keyboard.press('Tab');await onKey('Tab');
 }
 // Also support a roving grid that exposes one tab stop and arrow navigation.
 for(const key of ['ArrowRight','ArrowRight','ArrowDown','ArrowLeft','ArrowLeft','ArrowDown','ArrowRight','ArrowRight']){
  if(await focused())return;
  await page.keyboard.press(key);await onKey(key);
 }
 if(await focused())return;
 throw issue('keyboard_unreachable',`Cell at row ${Math.floor(index/3)+1}, column ${index%3+1} could not be reached with keyboard navigation`);
}
async function observe(browser){
 const dir='/out/observation';const session=await createSession(browser,dir);const {page}=session;
 const observations={audits:[],keyboard:[],errors:[],scope:'Operational focus and screen observations only; no final assertions or control patches'};
 try{
  observations.audits.push(await scan(page,dir,'initial'));
  for(let i=0;i<12;i++){
   await page.keyboard.press('Tab');observations.keyboard.push({action:'Tab',focus:await focus(page)});
  }
  for(const key of ['Enter','Space']){
   await page.keyboard.press(key);observations.keyboard.push({action:key,focus:await focus(page),visible_text:(await page.locator('body').innerText()).slice(0,4000),board:await marks(page)});
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
  const play=async index=>{if(spec.modality==='pointer'){await (await cells(page))[index].click();await event('pointer',{row:Math.floor(index/3)+1,column:index%3+1});}else{await reachCell(page,index,async key=>event('key',{key}));await press(spec.scenario==='enter'?'Enter':'Space');}};
  const check=async(id,test,expected)=>{let actual;const until=performance.now()+1500;do{actual=await test();if(isDeepStrictEqual(actual,expected))break;await wait(30);}while(performance.now()<until);const pass=isDeepStrictEqual(actual,expected);result.checks.push({id,status:pass?'pass':'fail',expected,actual});return pass;};
  const ensure=async(id,test,expected)=>{if(!await check(id,test,expected))throw issue('task_failed','User task checkpoint failed: '+id);};
  const audit=async state=>result.audits.push(await scan(page,dir,state));
  const score=()=>page.getByText(/^[0-9]+ (Wins|Draws)$/).allTextContents();
  const status=async()=>{const text=await page.locator('body').innerText();return text.match(/Status:\s*(Playing|Winner [XO])/)[1];};
  await ensure('content-preserved',async()=>{await resolveRole(page,'button','Rematch');return await cells(page).then(x=>x.length);},9);
  await ensure('initial-state',async()=>({board:await marks(page),status:await status(),score:await score()}),{board:Array(9).fill(''),status:'Playing',score:['0 Wins','0 Wins','0 Draws']});await audit('initial');
  const sequence=spec.modality==='pointer'?(spec.scenario==='x-win'?[0,3,1,4,2]:spec.scenario==='draw'?[0,1,2,4,3,5,7,6,8]:[0,3,1,4,8,5]):(spec.scenario==='enter'?[0,3]:[2,5]);
  const expected=Array(9).fill('');
  await play(sequence[0]);expected[sequence[0]]='X';await ensure('first-move',()=>marks(page),[...expected]);
  await play(sequence[0]);await ensure('occupied-cell-protection',()=>marks(page),[...expected]);
  await play(sequence[1]);expected[sequence[1]]='O';await ensure('alternating-turn',()=>marks(page),[...expected]);await audit('playing');
  if(spec.modality==='pointer'){
   for(let i=2;i<sequence.length;i++){await play(sequence[i]);expected[sequence[i]]=i%2===0?'X':'O';}
   const winner=spec.scenario==='x-win'?'X':spec.scenario==='draw'?null:'O';
   await ensure('winner',async()=>({board:await marks(page),status:await status()}),{board:expected,status:winner?'Winner '+winner:'Playing'});
   await ensure('score',score,winner==='X'?['1 Wins','0 Wins','0 Draws']:winner==='O'?['0 Wins','1 Wins','0 Draws']:['0 Wins','0 Wins','1 Draws']);
   const empty=Math.max(0,expected.findIndex(x=>x===''));await play(empty);await ensure('finished-game-protection',()=>marks(page),expected);await audit('won');
  }else await ensure('score',score,['0 Wins','0 Wins','0 Draws']);
  const beforeScore=await score();const rematch=await resolveRole(page,'button','Rematch');
  if(spec.modality==='pointer'){await rematch.click();await event('pointer',{name:'Rematch'});}else{
   for(let i=0;i<24&&!await rematch.evaluate(el=>el===document.activeElement);i++)await press('Tab');
   if(!await rematch.evaluate(el=>el===document.activeElement))throw issue('keyboard_unreachable','Rematch is unreachable');
   await press('Enter');
  }
  await ensure('rematch-clears',()=>marks(page),Array(9).fill(''));
  await ensure('rematch-playing',status,'Playing');
  await ensure('score-preserved',score,beforeScore);await audit('rematched');
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

