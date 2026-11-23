// File bytes stay on this device. Only model downloads and OAuth use the network.
const LIMIT=400000000;
let disposeFile=()=>{};
const originalModal=modal;
modal=(...args)=>{disposeFile();disposeFile=()=>{};originalModal(...args);};
const escapeText=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let authState={user:null,missing:[]};
async function session(){
  try {const r=await fetch('/.netlify/functions/auth/session',{cache:'no-store'});if(!r.ok)throw Error();authState=await r.json();}
  catch{authState={user:null,missing:['ยังติดต่อ Netlify Functions ไม่ได้ กรุณาเผยแพร่พร้อม netlify.toml']};}
  document.querySelectorAll('.login').forEach(b=>{if(authState.user)b.textContent='บัญชี: '+authState.user.name;else if(b.textContent.startsWith('บัญชี:'))b.textContent='เข้าสู่ระบบ';b.onclick=login;});
  if(document.querySelector('.membership h1'))document.querySelector('.membership h1').textContent=authState.user?.name||'ยังไม่ได้เข้าสู่ระบบ';
}
const originalMemberContent=memberContent;
memberContent=(tab=0)=>{originalMemberContent(tab);session();document.querySelectorAll('.affiliate').forEach(b=>{b.textContent=b.matches('.pay')?'PromptPay · ยังไม่เปิดบริการ':'สมัคร Affiliate · ยังไม่เปิด';b.onclick=()=>modal('บริการนี้ปิดอยู่','<p>Affiliate ยังไม่เปิดใช้งาน ไม่มีการรับชำระเงิน</p>');});};
login=async()=>{
  modal('บัญชี Google','<p role="status">กำลังตรวจสอบสถานะ…</p>');await session();
  if(authState.user){modal('บัญชีของคุณ',`<p>${escapeText(authState.user.email)}</p><button class="primary" id="logout">ออกจากระบบ</button><p role="status" id="auth-status"></p>`);document.querySelector('#logout').onclick=async()=>{try{const r=await fetch('/.netlify/functions/auth/logout',{method:'POST'});if(!r.ok)throw Error();await session();modal('ออกจากระบบแล้ว','<p>ออกจากบัญชีบนเว็บไซต์นี้แล้ว</p>');}catch{document.querySelector('#auth-status').textContent='ออกจากระบบไม่สำเร็จ กรุณาลองใหม่';}};return;}
  modal('เข้าสู่ระบบด้วย Google',`<p>ใช้บัญชี Google ของคุณ — ถอดเสียงฟรีได้โดยไม่ต้องเข้าสู่ระบบ</p>${authState.missing.length?'<p role="alert">ยังตั้งค่าไม่ครบ: '+authState.missing.map(escapeText).join(', ')+'</p><p>ตั้งค่าใน Netlify → Project configuration → Environment variables แล้ว deploy ใหม่ ดู <a href="/SETUP.md">คู่มือตั้งค่า</a></p>':'<button class="primary" id="google">เข้าสู่ระบบด้วย Google</button>'}`);
  document.querySelector('#google')?.addEventListener('click',()=>{location.href='/.netlify/functions/auth/start';});
};
function timestamp(seconds,vtt=false){const ms=Math.max(0,Math.round(seconds*1000));return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${vtt?'.':','}${String(ms%1000).padStart(3,'0')}`;}
openFile=function(file){
  if(!file)return;
  if(file.size>LIMIT){modal('ไฟล์เกิน 400 MB','<p role="alert">ขนาดสูงสุด 400,000,000 ไบต์ ไม่เริ่มอ่านหรือส่งไฟล์นี้</p>');return;}
  if(!file.size||! /\.(mp4|mov|webm|mp3|wav|m4a|ogg)$/i.test(file.name)){modal('ไฟล์ไม่รองรับ','<p role="alert">เลือก MP4, MOV, WebM, MP3, WAV, M4A หรือ OGG ที่มีเสียง</p>');return;}
  modal('ถอดเสียงและสร้างคำบรรยาย',`<p>${escapeText(file.name)} · ${(file.size/1000000).toFixed(1)} MB</p><video id="source-media" class="local-preview" controls playsinline></video><p>ประมวลผลในเครื่อง ไม่อัปโหลดไฟล์ ใช้เวลาอย่างน้อยเท่าความยาวคลิปและเวลาดึงโมเดลครั้งแรก กรุณาเปิดหน้านี้ไว้</p><label>ภาษาพูด <select id="speech-language"><option value="thai">ไทย</option><option value="english">English</option></select></label><button class="primary" id="transcribe">เริ่มถอดเสียงฟรี</button><button id="cancel-transcribe" hidden>ยกเลิก</button><p role="status" aria-live="polite" id="work-status">พร้อมอ่านไฟล์ในเครื่อง · ขึ้นกับ codec และกำลังเครื่อง ยังไม่ยืนยันการทดสอบไฟล์จริงขนาด 400 MB</p><progress id="work-progress" max="100" value="0"></progress><div id="cues"></div><button id="save-srt" disabled>ดาวน์โหลด SRT</button> <button id="save-vtt" disabled>ดาวน์โหลด VTT</button><p>แก้ข้อความแต่ละช่วงก่อนดาวน์โหลดได้ ยังไม่รองรับฝังซับลงวิดีโอหรือแปลภาษาอัตโนมัติ</p>`);
  const root=document.querySelector('.overlay'),status=root.querySelector('#work-status'),start=root.querySelector('#transcribe'),cancel=root.querySelector('#cancel-transcribe');
  let media=root.querySelector('video');
  const url=URL.createObjectURL(file);media.src=url;
  let worker,context,node,source,closed=false,cues=[],pending=null;
  const stop=()=>{media.pause();worker?.terminate();worker=null;node?.disconnect();source?.disconnect();if(context&&context.state!=='closed')context.close();context=null;pending?.reject(Error('ยกเลิกแล้ว'));pending=null;start.disabled=false;cancel.hidden=true;media.controls=true;};
  disposeFile=()=>{closed=true;stop();URL.revokeObjectURL(url);observer.disconnect();};
  const observer=new MutationObserver(()=>{if(!root.isConnected)disposeFile();});observer.observe(document.body,{childList:true});
  media.onerror=()=>{stop();status.textContent='อ่านไฟล์ไม่ได้: codec ไม่รองรับหรือไฟล์เสีย ลอง MP4 (H.264/AAC) หรือ WAV/MP3';};
  cancel.onclick=()=>{stop();status.textContent='ยกเลิกแล้ว ผลที่ถอดเสร็จยังดาวน์โหลดได้';};
  function render(){const list=root.querySelector('#cues');list.replaceChildren();cues.forEach((cue,i)=>{const label=document.createElement('label');label.textContent=timestamp(cue.start)+' → '+timestamp(cue.end);const input=document.createElement('textarea');input.value=cue.text;input.setAttribute('aria-label','คำบรรยาย '+(i+1));input.oninput=()=>cue.text=input.value;label.append(input);list.append(label);});root.querySelectorAll('#save-srt,#save-vtt').forEach(b=>b.disabled=!cues.length);}
  for(const format of ['srt','vtt'])root.querySelector('#save-'+format).onclick=()=>{const vtt=format==='vtt';const text=(vtt?'WEBVTT\n\n':'')+cues.filter(c=>c.text.trim()).map((c,i)=>`${vtt?'':i+1+'\n'}${timestamp(c.start,vtt)} --> ${timestamp(c.end,vtt)}\n${c.text.replace(/\r?\n/g,' ')}\n`).join('\n');const link=document.createElement('a'),blob=URL.createObjectURL(new Blob([text],{type:vtt?'text/vtt':'application/x-subrip'}));link.href=blob;link.download=file.name.replace(/\.[^.]+$/,'')+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);};
  start.onclick=async()=>{
    start.disabled=true;cancel.hidden=false;media.controls=false;cues=[];render();
    try {
      // A MediaElementAudioSourceNode cannot be attached twice, even after context.close().
      const fresh=media.cloneNode();fresh.onerror=media.onerror;media.replaceWith(fresh);media=fresh;media.src=url;media.load();
      context=new AudioContext({sampleRate:16000});await context.resume();
      if(context.sampleRate!==16000)throw Error('เบราว์เซอร์ไม่รองรับเสียง 16 kHz กรุณาลอง Chrome หรือ Edge');
      worker=new Worker('/transcribe-worker.js',{type:'module'});
      const request=data=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('ระบบใช้เวลานานเกินไป กรุณาลองใหม่หรือลดความยาวไฟล์')),600000);pending={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};worker.postMessage(data,data.audio?[data.audio.buffer]:[]);});
      worker.onmessage=({data})=>{if(data.type==='progress'){status.textContent=data.text;return;}const p=pending;pending=null;if(data.type==='error')p?.reject(Error(data.text));else p?.resolve(data);};
      worker.onerror=()=>{pending?.reject(Error('โหลดระบบถอดเสียงไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'));pending=null;};
      status.textContent='กำลังโหลดโมเดลฟรี (ครั้งแรกอาจใช้เวลาหลายนาที)…';await request({type:'load'});
      if(closed)return;
      if(!Number.isFinite(media.duration)||media.duration<=0)throw Error('อ่านความยาวไฟล์ไม่ได้ กรุณาเลือกไฟล์ใหม่');
      media.currentTime=0;
      source=context.createMediaElementSource(media);node=context.createScriptProcessor(4096,1,1);source.connect(node);node.connect(context.destination);
      let samples=[],count=0,offset=0,busy=false,ended=false;
      async function flush(){
        if(busy||!count)return;busy=true;media.pause();
        const audio=new Float32Array(count);let n=0;for(const s of samples){audio.set(s,n);n+=s.length;}samples=[];count=0;
        const duration=audio.length/context.sampleRate;
        status.textContent='กำลังถอดเสียงช่วง '+timestamp(offset)+'…';
        let energy=0;for(const value of audio)energy+=value*value;
        try {const {result}=energy/audio.length<0.0000001?{result:{text:'',chunks:[]}}:await request({type:'audio',audio,language:root.querySelector('#speech-language').value});
          const chunks=result.chunks?.length?result.chunks:[{timestamp:[0,duration],text:result.text}];
          for(const c of chunks){const a=offset+Math.max(0,c.timestamp?.[0]||0),b=Math.min(media.duration,offset+(c.timestamp?.[1]??duration));if(c.text?.trim()&&b>a)cues.push({start:a,end:b,text:c.text.trim()});}
          offset+=duration;render();root.querySelector('progress').value=Math.min(100,offset/media.duration*100);busy=false;
          if(ended){stop();root.querySelector('progress').value=100;status.textContent=cues.length?'ถอดเสียงสำเร็จ ตรวจและแก้คำก่อนดาวน์โหลดคำบรรยาย':'ไม่พบเสียงพูด ลองไฟล์ที่มีเสียงชัดเจน';}
          else{status.textContent='กำลังอ่านเสียงในเครื่อง…';await media.play();}
        }catch(e){stop();if(!closed)status.textContent=e.message;}
      }
      node.onaudioprocess=e=>{if(busy||media.paused||closed)return;const pcm=e.inputBuffer.getChannelData(0).slice();samples.push(pcm);count+=pcm.length;root.querySelector('progress').value=Math.min(99,media.currentTime/media.duration*100);if(count>=context.sampleRate*25)flush();};
      media.onended=()=>{ended=true;if(count)flush();else if(!busy){stop();status.textContent=cues.length?'ถอดเสียงสำเร็จ':'ไม่พบเสียงพูด';}};
      status.textContent='กำลังอ่านเสียงในเครื่อง…';await media.play();
    }catch(e){stop();if(!closed)status.textContent=e.message||'ประมวลผลไม่สำเร็จ กรุณาลองไฟล์ขนาดเล็กลง';}
  };
};
async function activateFeatures(){
  if(['/upgrade','/member','/privacy','/terms'].includes(location.pathname)){
    const note=document.createElement('details');note.className='service-notice';const summary=document.createElement('summary');summary.textContent='สถานะบริการ: แพ็กเกจและ Affiliate ยังไม่เปิดใช้';note.append(summary);const detail=document.createElement('p');detail.textContent='เวอร์ชันนี้ถอดเสียงในเครื่องและดาวน์โหลด SRT/VTT ฟรี ไม่มีการชำระเงิน แพ็กเกจ, Affiliate, คลังออนไลน์ และบริการเชิงพาณิชย์ในข้อมูลเดิมยังไม่เปิดใช้';note.append(detail);document.querySelector('main')?.append(note);
  }
  await session();
  document.querySelectorAll('.pay,.affiliate').forEach(b=>{b.textContent=b.matches('.pay')?'PromptPay · ยังไม่เปิดบริการ':'สมัคร Affiliate · ยังไม่เปิด';b.onclick=()=>modal('บริการนี้ปิดอยู่','<p>ไม่มีการรับชำระเงินหรือคิดค่าบริการ ถอดเสียงและดาวน์โหลด SRT/VTT ฟรีที่หน้าแรก</p>');});
  const q=new URLSearchParams(location.search);
  if(q.has('auth_error')){const reasons={denied:'คุณยกเลิกหรือไม่อนุญาตให้เข้าสู่ระบบ',state:'คำขอหมดอายุหรือไม่ตรงกัน กรุณาเริ่มเข้าสู่ระบบใหม่',provider:'Google ยืนยันบัญชีไม่ได้ ตรวจ Client ID, Client Secret และ redirect URI',code:'Google ไม่ได้ส่งรหัสยืนยันกลับมา'};modal('เข้าสู่ระบบไม่สำเร็จ','<p role="alert">'+(reasons[q.get('auth_error')]||'กรุณาลองใหม่')+'</p>');history.replaceState(null,'',location.pathname);}
  if(q.has('signed_in'))history.replaceState(null,'',location.pathname);
}
setTimeout(activateFeatures,0);
