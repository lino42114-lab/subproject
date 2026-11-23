// Export uses a fresh dedicated worker per job so cancellation frees the encoder heap.
const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/';
async function bytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('ดาวน์โหลดตัวช่วยหรือฟอนต์ไม่สำเร็จ');
  return new Uint8Array(await response.arrayBuffer());
}

self.onmessage = async ({data}) => {
  try {
    self.postMessage({status: 'กำลังโหลดตัวเข้ารหัสวิดีโอ…'});
    importScripts(coreBase + 'ffmpeg-core.js');
    const core = await createFFmpegCore({
      wasmBinary: await bytes(coreBase + 'ffmpeg-core.wasm')
    });
    core.setProgress(({progress}) => {
      if (Number.isFinite(progress)) self.postMessage({progress});
    });
    core.FS.mkdir('/fonts');
    for (const name of [data.fontFile, 'NotoSans-Bold.ttf']) {
      core.FS.writeFile('/fonts/' + name, await bytes('/assets/caption-fonts/' + name));
    }
    core.FS.writeFile('source', new Uint8Array(await data.file.arrayBuffer()));
    core.FS.writeFile('titles.ass', new TextEncoder().encode(data.ass));
    self.postMessage({status: 'กำลังฝังซับและบันทึกเสียงลง MP4…'});
    core.exec('-hide_banner', '-i', 'source', '-map', '0:V:0', '-map', '0:a:0?',
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2,ass=titles.ass:fontsdir=/fonts',
      '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'result.mp4');
    if (core.ret !== 0) throw Error('แปลงวิดีโอไม่สำเร็จ ลองคลิปสั้นลงหรือ MP4 แบบ H.264');
    const video = core.FS.readFile('result.mp4');
    self.postMessage({video}, [video.buffer]);
  } catch (error) {
    self.postMessage({error: 'ส่งออกไม่สำเร็จ ตรวจอินเทอร์เน็ตหรือใช้คลิปขนาดเล็กลง (' + error.message + ')'});
  }
};
