let recognizer;
self.onmessage=async ({data})=>{
  try {
    if(!recognizer){
      const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
      env.allowLocalModels=false;
      env.backends.onnx.wasm.numThreads=1;
      recognizer=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{quantized:true,progress_callback:p=>self.postMessage({type:'progress',text:'กำลังดาวน์โหลดโมเดล '+(p.file||'')+' '+(p.progress?Math.round(p.progress)+'%':'')})});
    }
    if(data.type==='load'){self.postMessage({type:'ready'});return;}
    const result=await recognizer(data.audio,{language:data.language,task:'transcribe',return_timestamps:true,chunk_length_s:30,stride_length_s:5});
    self.postMessage({type:'result',result});
  }catch {self.postMessage({type:'error',text:'โหลดโมเดลหรือถอดเสียงไม่สำเร็จ ตรวจอินเทอร์เน็ตและหน่วยความจำ แล้วลองใหม่ด้วย Chrome/Edge และไฟล์สั้นลง'});}
};
