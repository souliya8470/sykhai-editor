'use strict';
// ---------- v1.39: scrub frame cache ----------
// Seeking a 4K iPhone clip takes 0.3–2 s, so dragging the playhead / a clip showed black or a stale frame. Like CapCut, we keep a small
// low-res picture every ~0.2 s of every clip used on the timeline (extracted quietly in the background at 4x speed while idle) and draw the
// nearest one instantly; the exact frame replaces it as soon as the real seek lands.
const SCR = { on: false, cache: new Map(), fail: new Set(), job: null, bytes: 0, MAX: 200e6, MAXSIDE: 320, MAXF: 240 };
function scrFrame(mid, t) {
  const c = SCR.cache.get(mid); if (!c) return null; c.used = performance.now();
  const i = Math.round(t / c.step);
  for (let d = 0; d <= 4; d++) { const a = c.f[i - d] || c.f[i + d]; if (a) return a; }
  return null;
}
function scrDrop(mid) { const c = SCR.cache.get(mid); if (!c) return; SCR.bytes -= c.bytes; SCR.cache.delete(mid); }
function scrEvict(keep) {
  while (SCR.bytes > SCR.MAX) {
    let old = null; for (const [id, c] of SCR.cache) { if (id === keep) continue; if (!old || c.used < old.c.used) old = { id, c }; }
    if (!old) break; scrDrop(old.id); SCR.fail.delete(old.id);
  }
}
const scrIdle = () => !PB.playing && !PB.exporting && !SRC.m && document.visibilityState !== 'hidden';
async function scrBuild(m) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = m.purl || m.url;
  const job = SCR.job = { id: m.id, v, paused: false, done: false };
  await new Promise(res => { v.onloadeddata = res; v.onerror = res; setTimeout(res, 12000); });
  const dur = v.duration || m.duration, vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !dur || !isFinite(dur) || !v.requestVideoFrameCallback) { SCR.fail.add(m.id); SCR.job = null; try { v.removeAttribute('src'); v.load(); } catch (e) { } return; }
  const k = SCR.MAXSIDE / Math.max(vw, vh), W = Math.max(2, Math.round(vw * k)), H = Math.max(2, Math.round(vh * k));
  const step = Math.max(.2, dur / SCR.MAXF), c = { step, f: [], bytes: 0, used: performance.now(), W, H };
  let next = 0, lastTick = performance.now();
  const finish = () => { if (job.done) return; job.done = true; clearInterval(job.wd); try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { } if (SCR.job === job) SCR.job = null; if (c.bytes) { SCR.cache.set(m.id, c); SCR.bytes += c.bytes; scrEvict(m.id); dirty(); } else SCR.fail.add(m.id); };
  const cb = (now, meta) => {
    if (job.done) return; lastTick = performance.now(); const t = meta.mediaTime;
    if (!scrIdle()) { try { v.pause(); } catch (e) { } job.paused = true; return; }       // user plays / exports: stop quietly, resume when idle
    if (t >= next * step - .02) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(v, 0, 0, W, H); c.f[next] = cv; c.bytes += W * H * 4; next = Math.floor(t / step) + 1; }
    if (v.ended || t >= dur - .05) return finish();
    v.requestVideoFrameCallback(cb);
  };
  job.resume = () => { job.paused = false; lastTick = performance.now(); v.requestVideoFrameCallback(cb); v.play().catch(() => finish()); };
  job.wd = setInterval(() => { if (!job.paused && performance.now() - lastTick > 8000) finish(); }, 1000);
  v.onended = finish; v.playbackRate = 4; job.resume();
}
function scrKick() {
  if (!scrIdle()) return;
  const j = SCR.job; if (j) { if (j.paused) j.resume(); return; }
  const want = []; for (const it of D.items) if (it.type === 'video' && !want.includes(it.mediaId)) want.push(it.mediaId);
  for (const id of want) {
    if (SCR.cache.has(id) || SCR.fail.has(id)) continue;
    const m = MEDIA.get(id); if (!m || m.type !== 'video' || !(m.url || m.purl) || !(m.duration > .5)) continue;
    scrBuild(m).catch(() => { SCR.fail.add(id); SCR.job = null; }); return;
  }
}
function scrInit() { setInterval(scrKick, 1200); }
