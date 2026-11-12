// ============================================================
//  Export (real-time capture of the compositor via MediaRecorder)
// ============================================================
const EXP = { running: false, cancel: false, last: null };
function pickMime() {
  const c = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}
async function waitReady(t, ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    syncMedia(true);
    const act = D.items.filter(i => i.type === 'video' && t >= i.start - 1e-3 && t < i.start + i.dur);
    if (act.every(i => { const r = POOL.get(i.id); return r && r.el.readyState >= 3 && !r.el.seeking; })) return true; await sleep(60);
  }
  return false;
}
async function runExport(opts) {
  opts = opts || {}; if (EXP.running) return null;
  const bar = $('#expBar'), msg = $('#expMsg');
  if (!D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return null; }
  EXP.running = true; EXP.cancel = false; pause(); ensureAudio(); await AC.resume();
  const W = opts.w || 1080, H = opts.h || 1920, FPS = 30, total = durEnd();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { alpha: false });
  const mime = pickMime(); const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const stream = cv.captureStream(FPS); const at = EXPDEST.stream.getAudioTracks()[0]; if (at) stream.addTrack(at);
  let rec; try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: parseInt(opts.bps || $('#expQ').value) || 8e6, audioBitsPerSecond: 192000 }); }
  catch (e) { EXP.running = false; toast('เบราว์เซอร์นี้อัดวิดีโอไม่ได้: ' + e.message); return null; }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { rec.onstop = res; });
  MONITOR.gain.value = 0; PB.exporting = true; PB.t = 0; PB.duck = 1;
  msg.textContent = 'กำลังเตรียมคลิป…'; await waitReady(0, 8000);
  renderFrame(ctx, W, H, 0);
  rec.start(1000); PB.playing = true; const start = performance.now();
  await new Promise(resolve => {
    const loop = () => {
      if (EXP.cancel) return resolve();
      const t = (performance.now() - start) / 1000; PB.t = Math.min(t, total);
      syncMedia(false); renderFrame(ctx, W, H, PB.t);
      if (bar) bar.style.width = (100 * PB.t / total).toFixed(1) + '%'; if (msg) msg.textContent = `กำลังบันทึก… ${fmt(PB.t)} / ${fmt(total)}`;
      if (t >= total + 0.25) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  PB.playing = false; for (const r of POOL.values()) { try { r.el.pause(); } catch (e) { } } for (const r of APOOL.values()) { try { r.el.pause(); } catch (e) { } }
  try { rec.stop(); } catch (e) { } await done;
  PB.exporting = false; MONITOR.gain.value = 1; EXP.running = false; seek(0);
  if (EXP.cancel) { msg.textContent = 'ยกเลิกแล้ว'; return null; }
  const blob = new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
  EXP.last = { size: blob.size, mime, ext, w: W, h: H, dur: total };
  if (!opts.noDownload) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (D.name || 'video') + '.' + ext; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); }, 2000);
  }
  if (bar) bar.style.width = '100%'; if (msg) msg.textContent = `เสร็จแล้ว ✔ (${(blob.size / 1048576).toFixed(1)} MB, .${ext})` + (ext === 'webm' ? ' — เบราว์เซอร์ไม่รองรับ mp4 จึงได้ .webm' : '');
  EXP.blob = blob; return blob;
}
