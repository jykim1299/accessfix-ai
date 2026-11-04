// Actual browser recording of preserved Meta evidence. No source/metric changes.
// Captions are video annotations only; they are not product or model responses.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium,expect}=require('playwright/test');
const execute=promisify(execFile);
const base=(process.argv[2]||'http://127.0.0.1:8804').replace(/\/$/,'');
const out=path.resolve(process.argv[3]||'artifacts/m6/video-new');
const duration=174;
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname),'Only the local reviewed product may be recorded');
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});
const save=(name,value)=>fs.writeFile(path.join(out,name),JSON.stringify(value,null,2));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

async function findFFmpeg(){
 if(process.env.FFMPEG_PATH)return process.env.FFMPEG_PATH;
 const roots=[process.env.PLAYWRIGHT_BROWSERS_PATH,
  process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'ms-playwright'),
  path.join(os.homedir(),'.cache/ms-playwright'),path.join(os.homedir(),'Library/Caches/ms-playwright')].filter(Boolean);
 for(const root of roots){for(const name of (await fs.readdir(root).catch(()=>[])).filter(n=>n.startsWith('ffmpeg-')).sort().reverse()){
  for(const binary of ['ffmpeg-win64.exe','ffmpeg-linux','ffmpeg-mac']){const candidate=path.join(root,name,binary);if(await fs.stat(candidate).then(s=>s.isFile()).catch(()=>false))return candidate;}
 }}
 return 'ffmpeg';
}
const ffmpeg=await findFFmpeg();
const records={};
for(const key of ['m4-meta-dev-tabs','m4-meta-holdout-switch','m4-meta-holdout-menu']){
 const response=await fetch(base+'/api/runs/'+key);assert.equal(response.status,200);
 const run=await response.json();assert.equal(run.read_only,true);
 assert.equal(run.repair.model.provider,'meta');assert.equal(run.repair.model.response_model,'muse-spark-1.3-contributor');
 records[key]=run;await save(key+'.recording-source.json',{key,archive_source:run.archive_source,model:run.repair.model,decision:run.repair.decision,status:run.repair.status,selected:run.repair.selected});
}
assert.equal(records['m4-meta-dev-tabs'].repair.decision.accepted,true);
assert.equal(records['m4-meta-holdout-switch'].repair.decision.accepted,false);
assert.equal(records['m4-meta-holdout-menu'].repair.decision.manual_review,true);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',recordVideo:{dir:path.join(out,'capture'),size:{width:1440,height:1000}}});
const posts=[],errors=[],timeline=[];let recordingError=null;
await context.route('**/*',route=>{
 const request=route.request();
 if(request.method()!=='GET'){posts.push({method:request.method(),path:new URL(request.url()).pathname});return route.abort();}
 if(new URL(request.url()).origin!==new URL(base).origin)return route.abort();
 return route.continue();
});
const start=performance.now();const page=await context.newPage();const video=page.video();
page.on('pageerror',error=>errors.push(error.message));
async function ready(key){
 if(!page.url().includes('#/runs/'+key))await page.goto(base+'/#/runs/'+key);
 await expect(page.getByRole('heading',{level:1})).toHaveText(records[key].title);
 await expect(page.getByRole('tab',{name:'Before / After',exact:true})).toBeVisible();
}
async function overlay(text){
 await page.evaluate(text=>{
  let banner=document.querySelector('#recording-disclosure');
  if(!banner){banner=document.createElement('aside');banner.id='recording-disclosure';banner.textContent='RECORDED RESULTS  ·  ACTUAL META API RUNS  ·  NO LIVE INFERENCE';Object.assign(banner.style,{position:'fixed',zIndex:'2147483647',top:'0',left:'0',right:'0',padding:'9px 20px',background:'#102d26',color:'#f5ffe8',font:'600 14px Segoe UI,sans-serif',letterSpacing:'1px',textAlign:'center',borderBottom:'2px solid #c9ed8a',pointerEvents:'none'});document.body.appendChild(banner);}
  let caption=document.querySelector('#recording-caption');
  if(!caption){caption=document.createElement('aside');caption.id='recording-caption';Object.assign(caption.style,{position:'fixed',zIndex:'2147483647',bottom:'18px',left:'255px',right:'22px',padding:'16px 24px',background:'#102d26',color:'#fff',font:'500 23px/1.42 Segoe UI,sans-serif',borderRadius:'9px',boxShadow:'0 2px 16px #0003',textAlign:'center',pointerEvents:'none',whiteSpace:'pre-line'});document.body.appendChild(caption);}
  caption.textContent=text;
 },text);
}
async function scroll(locator){await locator.evaluate(el=>window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-75),behavior:'instant'}));}
async function tab(name){await page.getByRole('tab',{name,exact:true}).click();}
async function segment(name,end,caption,action){
 await action();await overlay(caption);
 const observed=(performance.now()-start)/1000;
 timeline.push({name,start_s:observed,planned_end_s:end,caption,url:page.url()});
 await page.screenshot({path:path.join(out,name+'.png')});
 await save('timeline.json',timeline);
 const remaining=end*1000-(performance.now()-start);if(remaining<=0)throw new Error('Recording action exceeded its scheduled segment');
 // Bounded sleeps keep the recording interruptible and progress visible.
 while(performance.now()-start<end*1000)await wait(Math.min(1000,end*1000-(performance.now()-start)));
 console.log(JSON.stringify({segment:name,elapsed_s:Math.round((performance.now()-start)/1000)}));
}
try{
 await segment('01-tabs-axe-zero',22,'Zero reported axe violations in measured states.\nYet both keyboard tasks failed.',async()=>{await ready('m4-meta-dev-tabs');await page.evaluate(()=>scrollTo(0,0));});
 await segment('02-tabs-before-after',42,'Meta generated a bounded patch.\nKeyboard tasks: 0/2 → 2/2. Pointer tasks: 2/2 preserved.',async()=>{await tab('Before / After');await page.getByRole('combobox',{name:'사용자 작업',exact:true}).selectOption('keyboard-activity');await page.getByRole('combobox',{name:'화면 상태',exact:true}).selectOption('overview');await expect(page.locator('.screens img')).toHaveCount(2);await page.waitForFunction(()=>[...document.querySelectorAll('.screens img')].every(i=>i.complete&&i.naturalWidth));await scroll(page.locator('.screens'));});
 await segment('03-independent-tasks',59,'A separate browser verifier checks the same user tasks.\nThe model does not receive our final assertions.',async()=>{await scroll(page.locator('.table-scroll'));});
 await segment('04-actual-patch',74,'This is the actual stored Meta patch.\nIts explanation cannot override the browser evidence.',async()=>{await tab('코드 Diff');await scroll(page.locator('.diff-panel'));});
 await segment('05-switch-rejected',94,'The switch repair passed keyboard and pointer tasks.\nA new accessibility regression still caused rejection.',async()=>{await ready('m4-meta-holdout-switch');await page.evaluate(()=>scrollTo(0,0));});
 await segment('06-switch-screens',111,'The replacement inherited a low-contrast style: 1.19:1.\nThe original remains selected; the failed patch is preserved.',async()=>{await tab('Before / After');await page.getByRole('combobox',{name:'사용자 작업',exact:true}).selectOption('pointer-save');await page.getByRole('combobox',{name:'화면 상태',exact:true}).selectOption('initial');await expect(page.locator('.screens img')).toHaveCount(2);await page.waitForFunction(()=>[...document.querySelectorAll('.screens img')].every(i=>i.complete&&i.naturalWidth));await scroll(page.locator('.screens'));});
 await segment('07-meta-evidence',134,'Requested and returned model: muse-spark-1.3-contributor.\nActual request counts, tokens, timing, and rejection reasons.',async()=>{await tab('증거 · 안전성');await scroll(page.locator('.evidence-top'));});
 await segment('08-menu-limits',154,'The menu is a partial improvement: existing issues remain.\n3 of 4 synthetic candidates accepted ≠ complete accessibility.',async()=>{await ready('m4-meta-holdout-menu');await page.evaluate(()=>scrollTo(0,0));});
 await segment('09-task-proof',duration,'Don’t just fix accessibility issues.\nProve users can complete their tasks.',async()=>{await ready('m4-meta-dev-tabs');await page.evaluate(()=>scrollTo(0,0));});
 assert.equal(posts.length,0);assert.equal(errors.length,0);
}catch(error){recordingError=String(error.stack||error);}
finally{await context.close();await browser.close();}
const videoPath=await video.path();const outputPath=path.join(out,'accessfix-m6-recorded-demo.webm');await fs.copyFile(videoPath,outputPath);
let mediaText='';try{await execute(ffmpeg,['-hide_banner','-i',outputPath],{maxBuffer:2*1024*1024});}catch(error){mediaText=(error.stderr||'')+(error.stdout||'');}
const match=mediaText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
const measured=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):null;
await fs.writeFile(path.join(out,'video-metadata.txt'),mediaText.replaceAll(out,'<VIDEO_OUTPUT>'));
const stamp=s=>{const ms=Math.round(s*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
const subtitles=timeline.map((row,i)=>`${i+1}\n${stamp(row.start_s)} --> ${stamp(i+1<timeline.length?timeline[i+1].start_s:measured||duration)}\n${row.caption}\n`).join('\n');
await fs.writeFile(path.join(out,'accessfix-m6-recorded-demo.en.srt'),subtitles);
const summary={recorded_utc:new Date().toISOString(),actual_browser_recording:true,stored_evidence_replay:true,live_model_requests:0,mutating_requests:posts,browser_errors:errors,recording_error:recordingError,segments:timeline.length,duration_s:measured,within_three_minutes:measured!==null&&measured<=180,format:'WebM',audio:'none; silent screen capture with burned-in English captions',video_sha256:hash(await fs.readFile(outputPath)),subtitles_sha256:hash(await fs.readFile(path.join(out,'accessfix-m6-recorded-demo.en.srt'))),viewports:{width:1440,height:1000},disclosure:'Recorded results · Actual Meta API runs · No live inference',annotations:'Disclosure and captions are recording overlays; product metrics/evidence are unchanged.',source_records:Object.keys(records)};
await save('summary.json',summary);console.log(JSON.stringify(summary));
if(recordingError||!summary.within_three_minutes)process.exitCode=1;
