const {chromium}=require('C:/Users/USER-01/AppData/Local/OpenAI/Codex/runtimes/cua_node/23b8c1efed953688/bin/node_modules/playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const live=process.argv.includes('--live');
const server=http.createServer((req,res)=>{let pathname=new URL(req.url,'http://localhost').pathname;if(pathname.startsWith('/.netlify/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({user:null,missing:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','SITE_URL','SESSION_SECRET']}));return;}let file=path.join(__dirname,'dist',pathname==='/'?'index.html':pathname);try{res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(live&&m.type()==='error')console.log(m.text());});
    if(!live)await page.route('**/transcribe-worker.js',r=>r.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>{if(data.type==='load')postMessage({type:'ready'});else postMessage({type:'result',result:{text:'Hello world',chunks:[{timestamp:[0,1],text:'Hello world'}]}});}` }));
    await page.goto(base);await page.waitForTimeout(300);
    await page.locator('header .login').click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/GOOGLE_CLIENT_ID/);await page.keyboard.press('Escape');
    await page.evaluate(()=>openFile({name:'large.mp4',size:400000001}));assert.match(await page.getByRole('alert').innerText(),/400/);await page.keyboard.press('Escape');
    await page.locator('#file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});assert.match(await page.getByRole('alert').innerText(),/MP4/);await page.keyboard.press('Escape');
    let buffer;
    if(live)buffer=fs.readFileSync(path.join(__dirname,'test-speech.wav'));
    else {const n=32000;buffer=Buffer.alloc(44+n*2);buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)buffer.writeInt16LE(Math.sin(i/16000*440*Math.PI*2)*10000,44+i*2);}
    await page.locator('#file').setInputFiles({name:'speech.wav',mimeType:'audio/wav',buffer});await page.locator('#speech-language').selectOption('english');await page.locator('#transcribe').click();
    await page.waitForFunction(()=>{const s=document.querySelector('#work-status')?.textContent;return s?.includes('สำเร็จ')||s?.includes('ไม่พบเสียงพูด')||s?.includes('เกินไป');},{},{timeout:live?600000:20000});
    const status=await page.locator('#work-status').innerText();console.log('Transcription status:',status);assert.match(status,/ถอดเสียงสำเร็จ/);
    const first=page.locator('#cues textarea').first();console.log('Transcript:',await first.inputValue());await first.fill('Edited subtitle');
    const downloadPromise=page.waitForEvent('download');await page.locator('#save-srt').click();const download=await downloadPromise;assert.match(fs.readFileSync(await download.path(),'utf8'),/Edited subtitle/);
    const vttPromise=page.waitForEvent('download');await page.locator('#save-vtt').click();assert.match(fs.readFileSync(await (await vttPromise).path(),'utf8'),/^WEBVTT/);
    await page.locator('#transcribe').click();await page.locator('#cancel-transcribe').click();assert.match(await page.locator('#work-status').innerText(),/ยกเลิก/);
    if(!live){
      await page.keyboard.press('Escape');
      await page.evaluate(async()=>{
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;canvas.getContext('2d').fillRect(0,0,160,90);
        const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();await ctx.resume();
        const stream=canvas.captureStream(5);stream.addTrack(dest.stream.getAudioTracks()[0]);
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];
        const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});recorder.start();await new Promise(r=>setTimeout(r,2200));recorder.stop();await done;osc.stop();stream.getTracks().forEach(t=>t.stop());await ctx.close();
        openFile(new File(chunks,'video.webm',{type:'video/webm'}));
      });
      await page.locator('#transcribe').click();await page.waitForFunction(()=>document.querySelector('#work-status')?.textContent.includes('ถอดเสียงสำเร็จ'),{},{timeout:20000});
      await page.keyboard.press('Escape');
      await page.route('**/transcribe-worker.js',r=>r.fulfill({contentType:'text/javascript',body:`self.onmessage=()=>postMessage({type:'error',text:'โหลดโมเดลไม่สำเร็จ กรุณาลองใหม่'});`}));
      await page.locator('#file').setInputFiles({name:'failure.wav',mimeType:'audio/wav',buffer});await page.locator('#transcribe').click();await page.waitForFunction(()=>document.querySelector('#work-status')?.textContent.includes('โหลดโมเดลไม่สำเร็จ'));assert.equal(await page.locator('#transcribe').isEnabled(),true);
      console.log('PASS real WebM decoding with mock model, VTT, model failure and retry availability');
    }
    assert.deepEqual(errors,[]);console.log('PASS file validation, status, '+(live?'real':'mock')+' transcription, edit, SRT export, cancel/retry, missing OAuth UI');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
