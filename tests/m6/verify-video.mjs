// Decode and seek the actual rendered media in Chromium, not just a file header.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../m2/package.json',import.meta.url));
const {chromium}=require('playwright');
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out,{recursive:false});
const size=(await fs.stat(file)).size;
const server=http.createServer((req,res)=>{
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html><head><title>Media review</title></head><body style="margin:0"><video id="v" muted controls style="width:1440px;height:1000px" src="/video"></video></body></html>');return;}
 if(req.url!=='/video'){res.writeHead(404);res.end();return;}
 const m=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);const start=m?Number(m[1]):0,end=m&&m[2]?Math.min(Number(m[2]),size-1):size-1;
 if(start>end||start>=size){res.writeHead(416);res.end();return;}
 res.writeHead(m?206:200,{'Content-Type':'video/webm','Content-Length':end-start+1,'Accept-Ranges':'bytes',...(m?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});createReadStream(file,{start,end}).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});const frames=[];
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
 const duration=await page.locator('video').evaluate(v=>v.duration);assert.ok(duration>150&&duration<=180);
 for(const t of [2,30,66,85,102,122,145,170]){
  await page.locator('video').evaluate((v,t)=>new Promise((resolve,reject)=>{v.addEventListener('seeked',()=>resolve(),{once:true});v.addEventListener('error',()=>reject(Error('Media decode failed')),{once:true});v.currentTime=t;}),t);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  const state=await page.locator('video').evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.message||null,decoded_frames:v.getVideoPlaybackQuality().totalVideoFrames}));assert.equal(state.error,null);assert.equal(state.width,1440);assert.equal(state.height,1000);frames.push(state);await page.screenshot({path:path.join(out,'frame-'+t+'.png')});
 }
 const result={duration_s:duration,within_three_minutes:true,seeked_decoded_states:frames,actual_video_playback:true,model_requests:0};await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({duration_s:duration,decoded_states:frames.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
