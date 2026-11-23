// ASS coordinates follow the source aspect ratio. The renderer resolves these
// against the actual frame size, including portrait clips.
function makeCaptionScript(cues, video, style) {
  const height = 720;
  const width = Math.max(2, Math.round(height * video.videoWidth / video.videoHeight));
  const margin = Math.max(8, Math.round(width * 0.05));
  const size = Math.round(Math.min(width, height) * style.scale);
  const color = style.color.slice(1).match(/../g).reverse().join('');
  const canvas = document.createElement('canvas').getContext('2d');
  canvas.font = 'bold ' + size + 'px sans-serif';
  const segmenter = new Intl.Segmenter('th', {granularity: 'word'});
  const stamp = seconds => {
    const ticks = Math.round(seconds * 100);
    return Math.floor(ticks / 360000) + ':' +
      String(Math.floor(ticks / 6000) % 60).padStart(2, '0') + ':' +
      String(Math.floor(ticks / 100) % 60).padStart(2, '0') + '.' +
      String(ticks % 100).padStart(2, '0');
  };
  function wrap(paragraph) {
    const lines = [];
    let line = '';
    for (const {segment} of segmenter.segment(paragraph)) {
      if (line && canvas.measureText(line + segment).width > width - 2 * margin) {
        lines.push(line.trim());
        line = '';
      }
      line += segment;
    }
    lines.push(line.trim());
    return lines;
  }
  const events = cues.filter(cue => cue.text.trim() && cue.end > cue.start).map(cue => {
    const safe = cue.text.trim().replace(/[{}\\]/g, char => ({'{':'｛','}':'｝','\\':'＼'}[char]));
    const text = safe.split(/\r?\n/).flatMap(wrap).join('\\N');
    return 'Dialogue: 0,' + stamp(cue.start) + ',' + stamp(cue.end) + ',Default,,0,0,0,,' + text;
  });
  return [
    '[Script Info]', 'ScriptType: v4.00+', 'PlayResX: ' + width, 'PlayResY: ' + height,
    'ScaledBorderAndShadow: yes', '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,' + style.font + ',' + size + ',&H00' + color + ',&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,' + style.align + ',' + margin + ',' + margin + ',36,1',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events, ''
  ].join('\n');
}

function attachCaptionExport(root, file, getCues) {
  const panel = root.querySelector('#mp4-panel');
  const button = panel.querySelector('#burn-video');
  const cancel = panel.querySelector('#burn-cancel');
  const status = panel.querySelector('[role=status]');
  const download = panel.querySelector('a');
  const start = root.querySelector('#transcribe');
  let worker = null;
  let downloadURL = '';
  function clearDownload() {
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = '';
    download.removeAttribute('href');
    download.hidden = true;
  }
  function refresh() {
    const video = root.querySelector('video');
    panel.hidden = !video.videoWidth || !getCues().length;
    button.disabled = !!worker || start.disabled || !getCues().some(cue => cue.text.trim());
  }
  function finish(message) {
    root.querySelectorAll("#cues textarea").forEach(input => input.readOnly = false);
    worker?.terminate();
    worker = null;
    cancel.hidden = true;
    start.disabled = false;
    panel.querySelector('fieldset').disabled = false;
    status.textContent = message;
    refresh();
  }
  function invalidate() {
    clearDownload();
    if (!worker) status.textContent = '';
    refresh();
  }
  start.addEventListener('click', invalidate);
  root.addEventListener('loadedmetadata', refresh, true);
  root.addEventListener('input', invalidate);
  cancel.onclick = () => finish('ยกเลิกการส่งออกแล้ว');
  button.onclick = () => {
    clearDownload();
    try {
      const select = panel.querySelector('[name=font]');
      const style = {
        font: select.selectedOptions[0].value,
        fontFile: select.selectedOptions[0].dataset.file,
        color: panel.querySelector('[name=color]').value,
        scale: Number(panel.querySelector('[name=size]').value),
        align: panel.querySelector('[name=position]').value
      };
      const ass = makeCaptionScript(getCues(), root.querySelector('video'), style);
      worker = new Worker('/assets/caption-worker.js');
      button.disabled = start.disabled = panel.querySelector('fieldset').disabled = true;
      root.querySelectorAll('#cues textarea').forEach(input => input.readOnly = true);
      cancel.hidden = false;
      status.textContent = 'กำลังเตรียมวิดีโอ…';
      worker.onmessage = ({data}) => {
        if (data.error) return finish(data.error);
        if (data.video) {
          downloadURL = URL.createObjectURL(new Blob([data.video], {type:'video/mp4'}));
          download.href = downloadURL;
          download.download = file.name.replace(/\.[^.]+$/, '') + '-ซับ.mp4';
          download.hidden = false;
          return finish('วิดีโอพร้อมแล้ว กดดาวน์โหลด MP4');
        }
        if (data.status) status.textContent = data.status;
        if (Number.isFinite(data.progress)) status.textContent =
          'กำลังฝังซับ ' + Math.max(0, Math.min(99, Math.floor(data.progress * 100))) + '%';
      };
      worker.onerror = () => finish('ตัวเข้ารหัสหยุดทำงาน ลองคลิปสั้นลงแล้วส่งออกอีกครั้ง');
      worker.postMessage({file, ass, fontFile: style.fontFile});
    } catch (error) {
      finish('เริ่มส่งออกไม่สำเร็จ ' + error.message);
    }
  };
  return {refresh, dispose() {worker?.terminate(); clearDownload();}};
}
