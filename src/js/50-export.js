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
// v1.80: Chrome stops animation frames (and slows timers to 1/s) in a tab that is hidden, covered by another window or minimised — a real-time capture then records one frozen picture
// (a Mac export had 48 of 58 seconds frozen, and the 0.13 s cover lasted 4 s). So the capture now PAUSES while the tab is not visible and carries on when you come back.
const visWait = async () => { while (document.hidden) await new Promise(r => { const f = () => { document.removeEventListener('visibilitychange', f); r(); }; document.addEventListener('visibilitychange', f); }); };
async function runExport(opts) {
  opts = opts || {}; if (EXP.running) return null;
  const bar = $('#expBar'), msg = $('#expMsg');
  if (!D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return null; }
  if (!opts.realtime && typeof runExportFast === 'function') { const fr = await runExportFast(opts); if (fr !== undefined) return fr; }   // v1.81: fast offline export; undefined = not possible here → real-time capture below
  EXP.running = true; EXP.cancel = false; pause(); ensureAudio(); await AC.resume();
  if (document.hidden) { const m0 = $('#expMsg'); if (m0) m0.textContent = '⏸ กลับมาที่แท็บนี้เพื่อเริ่มส่งออก…'; await visWait(); } try { await lfPreloadDoc(); } catch (e) { }
  const W = opts.w || D.w || 1080, H = opts.h || D.h || 1920, FPS = 30, total = durEnd();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { alpha: false });
  const mime = pickMime(); const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const stream = cv.captureStream(FPS); const at = EXPDEST.stream.getAudioTracks()[0]; if (at) stream.addTrack(at);
  let rec; try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: parseInt(opts.bps || $('#expQ').value) || 8e6, audioBitsPerSecond: 192000 }); }
  catch (e) { EXP.running = false; toast('เบราว์เซอร์นี้อัดวิดีโอไม่ได้: ' + e.message); return null; }
  const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { rec.onstop = res; });
  MONITOR.gain.value = 0; PB.exporting = true; PB.t = 0; PB.duck = 1;
  msg.textContent = 'กำลังเตรียมคลิป…'; let undoOrig = () => { }; try { undoOrig = await exportUseOriginals(msg); } catch (e) { console.warn(e); } msg.textContent = 'กำลังเตรียมคลิป…'; await waitReady(0, 8000);
  // cover as the very first frames (~0.13 s): Facebook / TikTok / players take the first frame as the thumbnail, so the chosen cover shows up by itself
  let coverImg = null;
  if (D.cover && (opts.coverFirst != null ? opts.coverFirst : (($('#expCover') || {}).checked !== false)) && typeof coverStill === 'function') {
    try { msg.textContent = 'กำลังทำหน้าปก…'; coverImg = await coverStill(D.cover.t, W, H); } catch (e) { console.warn(e); }
    PB.t = 0; syncMedia(true); await waitReady(0, 8000);
  }
  renderFrame(ctx, W, H, 0);
  await visWait(); rec.start(1000);
  if (coverImg) { for (let k = 0; k < 5; k++) { await visWait(); ctx.drawImage(coverImg, 0, 0, W, H); await sleep(27); } renderFrame(ctx, W, H, 0); }
  PB.playing = true; const start = performance.now(); let pausedMs = 0, pausedAt = 0; const title0 = document.title;
  const onVis = () => {
    if (document.hidden) {     // stop the recorder and the sound; remember when
      if (pausedAt) return; pausedAt = performance.now(); try { rec.pause(); } catch (e) { } PB.playing = false;
      for (const r of POOL.values()) { try { r.el.pause(); } catch (e) { } } for (const r of APOOL.values()) { try { r.el.pause(); } catch (e) { } }
    } else if (pausedAt) {     // back: skip the paused time, seek everything to where we stopped and go on
      pausedMs += performance.now() - pausedAt; pausedAt = 0; document.title = title0; PB.playing = true; syncMedia(true); try { rec.resume(); } catch (e) { }
    }
  };
  document.addEventListener('visibilitychange', onVis);
  await new Promise(resolve => {
    const loop = () => {
      if (EXP.cancel) return resolve();
      if (pausedAt) { if (msg) msg.textContent = '⏸ หยุดอัดชั่วคราว — กลับมาที่แท็บนี้เพื่อทำต่อ (' + fmt(PB.t) + ' / ' + fmt(total) + ')'; document.title = '⏸ ส่งออกหยุดชั่วคราว'; requestAnimationFrame(loop); return; }
      const t = (performance.now() - start - pausedMs) / 1000; PB.t = Math.min(t, total);
      syncMedia(false); renderFrame(ctx, W, H, PB.t);
      if (bar) bar.style.width = (100 * PB.t / total).toFixed(1) + '%'; if (msg) msg.textContent = `กำลังบันทึก… ${fmt(PB.t)} / ${fmt(total)}`;
      if (t >= total + 0.25) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  document.removeEventListener('visibilitychange', onVis); document.title = title0; if (pausedAt) { try { rec.resume(); } catch (e) { } }
  PB.playing = false; for (const r of POOL.values()) { try { r.el.pause(); } catch (e) { } } for (const r of APOOL.values()) { try { r.el.pause(); } catch (e) { } }
  try { rec.stop(); } catch (e) { } await done;
  PB.exporting = false; MONITOR.gain.value = 1; EXP.running = false; try { undoOrig(); } catch (e) { } seek(0);
  if (EXP.cancel) { msg.textContent = 'ยกเลิกแล้ว'; return null; }
  return exportDeliver(new Blob(chunks, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' }), { ext, mime, W, H, total, opts, msg, bar });
}
// shared tail of both export paths: name the file, download it, cover picture, copy to the shop server
async function exportDeliver(blob, o) {
  const { ext, mime, W, H, total, opts, msg, bar } = o;
  EXP.last = { size: blob.size, mime, ext, w: W, h: H, dur: total };
  // v1.61: VELARIS jobs are exported as vl-<jobId>_v001, v002 ... (one number per export, never overwrites an older round); other projects keep their own name
  let outBase = (D.name || 'video'); if (!opts.noDownload && D.vl) { D.vlRound = (D.vlRound || 0) + 1; outBase = 'vl-' + D.vl + '_v' + String(D.vlRound).padStart(3, '0'); emit('doc', 'vlround'); }
  if (!opts.noDownload) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = outBase + '.' + ext; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); }, 2000);
  }
  if (bar) bar.style.width = '100%'; if (msg) msg.textContent = `เสร็จแล้ว ✔ (${(blob.size / 1048576).toFixed(1)} MB, .${ext})` + (ext === 'webm' ? ' — เบราว์เซอร์ไม่รองรับ mp4 จึงได้ .webm' : '');
  if (!opts.noDownload && D.cover && typeof coverDownload === 'function') setTimeout(() => { coverDownload(true).catch(() => { }); }, 1800);
  EXP.blob = blob; if (!opts.noDownload && typeof srvPushOut === 'function') srvPushOut(blob, outBase.replace(/[\\/:*?"<>|]/g, '_') + '.' + ext);
  return blob;
}
