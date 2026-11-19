// ============================================================
//  v1.81  FAST OFFLINE EXPORT  (WebCodecs + mp4-muxer)
//  The old export plays the timeline in real time and films it, so it needs the tab in front (Chrome stops drawing in hidden tabs).
//  This one does not "play" anything: for every output frame it seeks the clips to the exact time, draws the frame, and hands it to the
//  hardware H.264 encoder; the sound is mixed separately with an OfflineAudioContext (same volumes, fades, ducking, voice effects)
//  and encoded as AAC. No timers / animation frames in the loop → works in the background and runs faster than real time.
//  runExportFast returns undefined when it cannot be used (old browser, speed-changed audio …) → the caller then uses the real-time path.
// ============================================================
const FXP = { rate: 48000, step: 0.005, cover: 4 };
const fxYield = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const fxEven = n => Math.max(2, Math.round(n / 2) * 2);

async function fxSupport(W, H, bps) {
  if (!window.VideoEncoder || !window.AudioEncoder || !window.VideoFrame || !window.AudioData || !window.OfflineAudioContext || typeof Mp4Muxer === 'undefined') return null;
  let vc = null;
  for (const c of ['avc1.640032', 'avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
    try { const r = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: bps, framerate: 30 }); if (r && r.supported) { vc = c; break; } } catch (e) { }
  }
  if (!vc) return null;
  const aacOk = async () => { try { const r = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: FXP.rate, numberOfChannels: 2, bitrate: 192000 }); return !!(r && r.supported); } catch (e) { return false; } };
  if (await aacOk()) return { vc, ac: 'mp4a.40.2', am: 'aac' };
  if (window.__fxOpus) return { vc, ac: 'opus', am: 'opus' };   // test hook only (a build of Chrome without AAC)
  return null;
}

// things the offline mixer cannot copy exactly → use the real-time path instead
function fxNeedsRealtime() {
  for (const it of D.items) {
    if (it.type !== 'video' || it.hidden || it.muted) continue;
    const m = MEDIA.get(it.mediaId); if (!m || m.hasAudio === false) continue;
    const sp = it.speed || 1;
    if (sp !== 1 && sp >= 0.25 && sp <= 4 && !it.pitchShift && videoGain(it, it.start + it.dur / 2) > 0.001) return 'speed';   // pitch-preserving time stretch
  }
  return null;
}

async function fxBuffer(m, cache) {
  if (cache.has(m.id)) return cache.get(m.id);
  let buf = null;
  try {
    if (m.file && m.file.size > 1.2e9) throw new Error('too big');
    const ab = m.file ? await m.file.arrayBuffer() : await (await fetch(m.purl || m.url)).arrayBuffer();
    buf = await new OfflineAudioContext(2, 1, FXP.rate).decodeAudioData(ab);
  } catch (e) { console.warn('fx audio decode', m.name, e); }
  cache.set(m.id, buf); return buf;
}

// mix the whole project's sound into one stereo AudioBuffer (starts `off` seconds late, because the cover frames come first)
async function fxMixAudio(total, off) {
  const rate = FXP.rate, STEP = FXP.step, len = Math.ceil((total + off) * rate);
  const bufs = new Map(), list = [];
  for (const it of D.items) {
    if (it.type !== 'video' && it.type !== 'audio') continue;
    if (it.type === 'video' && (it.hidden || it.muted)) continue;
    const m = MEDIA.get(it.mediaId); if (!m || m.hasAudio === false) continue;
    const sp = it.type === 'video' ? (it.speed || 1) : 1; if (sp < 0.25 || sp > 4) continue;   // media elements are silent outside this speed range
    const b = await fxBuffer(m, bufs); if (b) list.push({ it, m, b, sp });
    if (EXP.cancel) return null;
  }
  // ducking curve (music goes down while somebody speaks) — same smoothing as syncMedia
  const n = Math.ceil(total / STEP) + 2, duck = new Float32Array(n); let d = 1;
  const vids = D.items.filter(i => i.type === 'video');
  for (let k = 0; k < n; k++) {
    const t = k * STEP; let voice = false;
    for (const it of vids) { if (t >= it.start - 1e-6 && t < it.start + it.dur - 1e-6 && isVoice(it, t)) { voice = true; break; } }
    const tgt = voice ? D.duckLevel : 1, tau = tgt < d ? .08 : .45; d += (tgt - d) * (1 - Math.exp(-STEP / tau)); duck[k] = d;
  }
  const oc = new OfflineAudioContext(2, Math.max(1, len), rate);
  const prevAC = AC; AC = oc;                       // the voice-effect builders (vchainApply) create their nodes on the global AC
  try {
    const master = oc.createGain(), comp = oc.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(oc.destination);
    for (const { it, m, b, sp } of list) {
      const np = Math.max(2, Math.ceil(it.dur / STEP) + 1), curve = new Float32Array(np); let mx = 0;
      for (let k = 0; k < np; k++) {
        const lt = Math.min(it.dur, k * STEP), t = it.start + lt; let g;
        if (it.type === 'video') g = videoGain(it, t);
        else { const muteSeg = (it.mutes || []).some(q => lt >= q.a && lt < q.b); g = (muteSeg || trSt(it.track).mute) ? 0 : (it.vol ?? .5) * clamp(fadeEnv(it, lt), 0, 1) * (it.duck ? duck[Math.min(n - 1, Math.round(t / STEP))] : 1); }
        curve[k] = g; if (g > mx) mx = g;
      }
      if (mx < 1e-4) continue;
      const when = off + it.start, md = b.duration, inn = it.in || 0;
      const s = oc.createBufferSource(); s.buffer = b; s.playbackRate.value = sp;
      const g = oc.createGain(); g.gain.value = 0; s.connect(g); g.connect(master); g._src = s;
      if (it.type === 'audio' && it.loop && md < it.dur + inn) { s.loop = true; s.loopStart = 0; s.loopEnd = md; s.start(when, inn % md); s.stop(when + it.dur); }
      else { if (inn >= md) continue; s.start(when, inn, it.dur * sp); }
      try { g.gain.setValueCurveAtTime(curve, when, Math.max(0.01, it.dur)); } catch (e) { g.gain.value = Math.min(1, mx); }
      try { vchainApply({ gain: g }, it); } catch (e) { console.warn('fx vchain', e); }
    }
  } finally { AC = prevAC; }
  return await oc.startRendering();
}

async function fxEncodeAudio(abuf, enc) {
  const rate = abuf.sampleRate, L = abuf.getChannelData(0), R = abuf.numberOfChannels > 1 ? abuf.getChannelData(1) : abuf.getChannelData(0), N = abuf.length, CH = 4800;   // 0.1 s pieces
  for (let i = 0; i < N; i += CH) {
    const nn = Math.min(CH, N - i), data = new Float32Array(nn * 2); data.set(L.subarray(i, i + nn), 0); data.set(R.subarray(i, i + nn), nn);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: nn, numberOfChannels: 2, timestamp: Math.round(i * 1e6 / rate), data });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 40) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
    if ((i / CH) % 50 === 0) await fxYield();
  }
  await enc.flush();
}

async function fxSeeked(el, tt) {
  for (let k = 0; k < 4; k++) {
    if (!el.seeking && el.readyState >= 2) return true;
    await new Promise(res => {
      let done = false; const ev = ['seeked', 'loadeddata', 'canplay'];
      const f = () => { if (done) return; done = true; clearTimeout(tm); ev.forEach(e => el.removeEventListener(e, f)); res(); };
      const tm = setTimeout(f, 4000); ev.forEach(e => el.addEventListener(e, f));
    });
    if (!el.seeking && el.readyState < 2) { try { el.currentTime = tt; } catch (e) { } }
  }
  return false;
}
async function fxSeekAll(t) {
  const jobs = [];
  for (const it of D.items) {
    if (it.type !== 'video' || it.hidden || !(t >= it.start - 1e-6 && t < it.start + it.dur - 1e-6)) continue;
    const r = POOL.get(it.id); if (!r) continue; const el = r.el, m = MEDIA.get(it.mediaId);
    const tt = Math.min(timelineToSrc(it, t), (m && m.duration) ? Math.max(0, m.duration - 0.04) : 1e9);
    if (Math.abs(el.currentTime - tt) > 0.0015) { try { el.currentTime = tt; } catch (e) { } }
    jobs.push(fxSeeked(el, tt));
  }
  const res = await Promise.all(jobs); return res.filter(x => !x).length;   // how many clips did not deliver their frame in time
}

async function runExportFast(opts) {
  try { if (localStorage.getItem('sk_fastexp') === '0') return undefined; } catch (e) { }
  const W = fxEven(opts.w || D.w || 1080), H = fxEven(opts.h || D.h || 1920), FPS = 30, bps = parseInt(opts.bps || ($('#expQ') || {}).value) || 8e6;
  const sup = await fxSupport(W, H, bps); if (!sup) return undefined;
  if (fxNeedsRealtime()) return undefined;
  if (EXP.running) return null;
  const bar = $('#expBar'), msg = $('#expMsg'); const say = s => { if (msg) msg.textContent = s; };
  EXP.running = true; EXP.cancel = false; pause(); ensureAudio();
  let undoOrig = () => { }, venc = null, aenc = null, failed = null, blob = null, abuf = null;
  const total = durEnd();
  try {
    say('กำลังเตรียมคลิป…'); try { await lfPreloadDoc(); } catch (e) { }
    try { undoOrig = await exportUseOriginals(msg); } catch (e) { console.warn(e); }
    PB.exporting = true; PB.playing = false; PB.t = 0; MONITOR.gain.value = 0; PB.duck = 1;
    say('กำลังเตรียมคลิป…'); await waitReady(0, 8000);
    // cover as the very first frames (~0.13 s) so Facebook / TikTok / players take it as the thumbnail
    let coverImg = null;
    if (D.cover && (opts.coverFirst != null ? opts.coverFirst : (($('#expCover') || {}).checked !== false)) && typeof coverStill === 'function') {
      try { say('กำลังทำหน้าปก…'); coverImg = await coverStill(D.cover.t, W, H); } catch (e) { console.warn(e); }
    }
    const nCov = coverImg ? FXP.cover : 0, off = nCov / FPS, nFr = Math.max(1, Math.ceil(total * FPS));
    say('กำลังมิกซ์เสียง…'); if (bar) bar.style.width = '2%'; await fxYield();
    abuf = await fxMixAudio(total, off); if (EXP.cancel || !abuf) throw new Error('cancel');
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: { codec: sup.am, numberOfChannels: 2, sampleRate: FXP.rate }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
    let encErr = null;
    venc = new VideoEncoder({ output: (c, meta) => muxer.addVideoChunk(c, meta), error: e => { encErr = e; } });
    venc.configure({ codec: sup.vc, width: W, height: H, bitrate: bps, framerate: FPS, bitrateMode: 'variable', latencyMode: 'quality' });
    aenc = new AudioEncoder({ output: (c, meta) => muxer.addAudioChunk(c, meta), error: e => { encErr = e; } });
    aenc.configure({ codec: sup.ac, sampleRate: FXP.rate, numberOfChannels: 2, bitrate: 192000 });
    say('กำลังเข้ารหัสเสียง…'); await fxEncodeAudio(abuf, aenc); abuf = null; if (encErr) throw encErr;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { alpha: false });
    const dur = Math.round(1e6 / FPS); let fi = 0, stale = 0;
    const push = async (keyFrame) => {
      const vf = new VideoFrame(cv, { timestamp: Math.round(fi * 1e6 / FPS), duration: dur }); venc.encode(vf, { keyFrame }); vf.close(); fi++;
      if (venc.encodeQueueSize > 6) await new Promise(r => venc.addEventListener('dequeue', r, { once: true }));
      if (encErr) throw encErr;
    };
    for (let k = 0; k < nCov; k++) { ctx.drawImage(coverImg, 0, 0, W, H); await push(k === 0); }
    const t0 = performance.now();
    for (let i = 0; i < nFr; i++) {
      if (EXP.cancel) throw new Error('cancel');
      const t = i / FPS; PB.t = t; syncMedia(false); stale += await fxSeekAll(t);
      renderFrame(ctx, W, H, t); await push(i === 0 || i % 60 === 0);
      if (i % 6 === 0) {
        const el = (performance.now() - t0) / 1000, sp = el > 0.5 ? (i / FPS) / el : 0;
        if (bar) bar.style.width = (5 + 93 * i / nFr).toFixed(1) + '%'; say(`กำลังส่งออก… ${fmt(t)} / ${fmt(total)}` + (sp ? ` (เร็ว ${sp.toFixed(1)}×)` : ''));
        await fxYield();
      }
    }
    if (stale > nFr * 0.03) toast('⚠ บางช่วงของวิดีโออาจภาพค้าง (' + stale + ' เฟรม) — ถ้าเป็น ให้ส่งออกใหม่โดยเปิดแท็บ Editor ไว้ข้างหน้า', 9000);
    say('กำลังปิดไฟล์…'); await venc.flush(); if (encErr) throw encErr; muxer.finalize();
    blob = new Blob([target.buffer], { type: 'video/mp4' });
  } catch (e) { failed = e; }
  try { venc && venc.state !== 'closed' && venc.close(); aenc && aenc.state !== 'closed' && aenc.close(); } catch (e) { }
  PB.exporting = false; MONITOR.gain.value = 1; EXP.running = false; try { undoOrig(); } catch (e) { } seek(0);
  if (EXP.cancel || (failed && failed.message === 'cancel')) { say('ยกเลิกแล้ว'); return null; }
  if (failed) {
    console.warn('fast export failed → real-time', failed); toast('ส่งออกแบบเร็วไม่สำเร็จ (' + (failed.message || failed) + ') — ใช้แบบเรียลไทม์แทน', 5000);
    return undefined;
  }
  return exportDeliver(blob, { ext: 'mp4', mime: 'video/mp4', W, H, total, opts, msg, bar });
}
