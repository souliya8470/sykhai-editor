// ============================================================
//  Audio graph + transport (play / seek / sync of media elements)
// ============================================================
let AC = null, MASTER = null, MONITOR = null, EXPDEST = null, ANALYSER = null, _vuBuf = null, _vuLvl = 0;
function ensureAudio() {
  if (AC) return AC;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  MASTER = AC.createGain();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  MONITOR = AC.createGain();
  MASTER.connect(comp); comp.connect(MONITOR); MONITOR.connect(AC.destination);
  EXPDEST = AC.createMediaStreamDestination(); comp.connect(EXPDEST);
  ANALYSER = AC.createAnalyser(); ANALYSER.fftSize = 512; comp.connect(ANALYSER); _vuBuf = new Uint8Array(ANALYSER.fftSize);
  return AC;
}
function connectEl(el) {
  ensureAudio();
  try { const src = AC.createMediaElementSource(el); const g = AC.createGain(); src.connect(g); g.connect(MASTER); g._src = src; return g; }
  catch (e) { console.warn('connectEl', e); return null; }
}

// audio-item element pool
const APOOL = new Map();
function apoolGet(it) {
  let r = APOOL.get(it.id); if (r) { r.last = performance.now(); return r; }
  const m = MEDIA.get(it.mediaId); if (!m) return null;
  const el = document.createElement('audio'); el.preload = 'auto'; el.src = m.url; el.crossOrigin = 'anonymous';
  const gain = connectEl(el);
  r = { el, gain, last: performance.now(), itemId: it.id }; APOOL.set(it.id, r); return r;
}
function apoolRelease(id) { const r = APOOL.get(id); if (!r) return; try { r.el.pause(); r.el.removeAttribute('src'); r.el.load(); r.gain && r.gain.disconnect(); } catch (e) { } APOOL.delete(id); }

// ---------- transport state ----------
const PB = { playing: false, t: 0, t0: 0, wall0: 0, exporting: false, duck: 1, lastTick: 0 };
const PW = 540, PH = 960;
let PCANVAS = null, PCTX = null;
const durEnd = () => Math.max(0.1, projectEnd());

function play() {
  if (PB.playing) return; ensureAudio(); if (AC.state !== 'running') AC.resume();
  if (PB.t >= durEnd() - 0.05) PB.t = 0;
  PB.playing = true; PB.t0 = PB.t; PB.wall0 = performance.now(); emit('transport');
}
function pause() {
  if (!PB.playing) return; PB.playing = false;
  for (const r of POOL.values()) { try { r.el.pause(); } catch (e) { } }
  for (const r of APOOL.values()) { try { r.el.pause(); } catch (e) { } }
  emit('transport');
}
function vuUpdate() {
  const bar = $('#vu i'); if (!bar) return; const active = (PB.playing || (SRC.el && SRC.el.paused === false)) && ANALYSER;
  let lvl = 0;
  if (active) { ANALYSER.getByteTimeDomainData(_vuBuf); let pk = 0; for (let i = 0; i < _vuBuf.length; i++) { const v = Math.abs(_vuBuf[i] - 128) / 128; if (v > pk) pk = v; } lvl = Math.min(1, Math.pow(pk, .6)); }
  _vuLvl = lvl > _vuLvl ? lvl : _vuLvl * .86; bar.style.width = (_vuLvl * 100).toFixed(0) + '%';
}
function togglePlay() { if (SRC.m) return srcToggle(); PB.playing ? pause() : play(); }

// ---------- source preview (click a file in the media bin -> watch it in real time, like CapCut) ----------
const SRC = { m: null, el: null };
function srcExit() {
  if (!SRC.m) return;
  const el = SRC.el; SRC.m = null; SRC.el = null;
  if (el && el.pause) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) { } }
  const b = $('#srcBadge'); if (b) b.hidden = true; const sk = $('#srcSeek'); if (sk) sk.hidden = true;
  $$('#mediaList .mi.sel').forEach(x => x.classList.remove('sel'));
  $('#tpPlay').textContent = PB.playing ? '⏸' : '▶'; dirty(); if (window.onFrame) window.onFrame();
}
function srcOpen(id) {
  const m = MEDIA.get(id); if (!m) return;
  if (SRC.m && SRC.m.id === id) return;
  if (PB.playing) pause(); srcExit();
  SRC.m = m;
  if (m.type === 'image') { const im = new Image(); im.src = m.url; SRC.el = im; }
  else {
    const el = document.createElement(m.type === 'audio' ? 'audio' : 'video'); el.playsInline = true; el.preload = 'auto'; el.src = m.url;
    el.addEventListener('ended', () => { $('#tpPlay').textContent = '▶'; });
    SRC.el = el; el.crossOrigin = 'anonymous'; ensureAudio(); if (AC.state !== 'running') AC.resume(); el.src = m.url; connectEl(el); el.play().catch(() => { });
  }
  $$('#mediaList .mi').forEach(x => x.classList.toggle('sel', x.dataset.id === id));
  $('#srcName').textContent = m.name; $('#srcBadge').hidden = false;
  const sk = $('#srcSeek'); sk.hidden = m.type === 'image'; sk.value = 0;
}
function srcToggle() { const el = SRC.el; if (!el || !el.play) return; if (el.paused) { if (el.ended) el.currentTime = 0; el.play().catch(() => { }); } else el.pause(); }
function srcSeekBy(dt) { const el = SRC.el; if (el && el.pause) { el.pause(); el.currentTime = clamp(el.currentTime + dt, 0, el.duration || 1e9); } }
function srcFrame() {
  const el = SRC.el, m = SRC.m; const c = PCTX; c.fillStyle = '#000'; c.fillRect(0, 0, PW, PH);
  const ov = $('#ov'); if (ov) ov.getContext('2d').clearRect(0, 0, ov.width, ov.height);
  let w = el.videoWidth || el.naturalWidth || 0, h = el.videoHeight || el.naturalHeight || 0;
  if (m.type === 'audio') { c.fillStyle = '#2EE6C5'; c.font = '700 160px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♪', PW / 2, PH / 2); }
  else if (w && h) { const k = Math.min(PW / w, PH / h); const dw = w * k, dh = h * k; try { c.drawImage(el, (PW - dw) / 2, (PH - dh) / 2, dw, dh); } catch (e) { } }
  const dur = m.type === 'image' ? 0 : (el.duration && isFinite(el.duration) ? el.duration : m.duration || 0), cur = el.currentTime || 0;
  $('#tpTime').textContent = fmt(cur) + ' / ' + fmt(dur);
  $('#tpPlay').textContent = (el.paused === false) ? '⏸' : '▶';
  const sk = $('#srcSeek'); if (sk && !sk._drag && dur) sk.value = (cur / dur * 1000) | 0;
}
function seek(t) {
  PB.t = clamp(t, 0, durEnd()); if (PB.playing) { PB.t0 = PB.t; PB.wall0 = performance.now(); }
  syncMedia(true); dirty(); if (window.onFrame) window.onFrame();
}

// effective envelope helpers
function nextOverlap(it) {   // later clip on same track that overlaps our tail via a transition
  let best = null;
  for (const o of D.items) { if (o.track === it.track && o.id !== it.id && o.transIn && o.start > it.start && o.start < it.start + it.dur - 1e-3) { if (!best || o.start < best.start) best = o; } }
  return best;
}
function inMute(it, srcT) { return (it.mutes || []).some(m => srcT >= m.a && srcT < m.b); }
function videoGain(it, t) {
  if (it.hidden || it.muted) return 0;
  const m = MEDIA.get(it.mediaId); if (!m || m.hasAudio === false) return 0;
  const lt = t - it.start; let env = 1;
  if (it.transIn && lt < it.transIn.dur) env = Math.min(env, lt / Math.max(.05, it.transIn.dur));
  const nx = nextOverlap(it); if (nx) { const d = it.start + it.dur - nx.start; env = Math.min(env, (it.start + it.dur - t) / Math.max(.05, d)); }
  if (it.fadeIn) env = Math.min(env, lt / it.fadeIn); if (it.fadeOut) env = Math.min(env, (it.dur - lt) / it.fadeOut);
  const src = timelineToSrc(it, t); if (inMute(it, src)) return 0;
  return (it.vol ?? 1) * clamp(env, 0, 1) * (it.normalize !== false && m.norm ? m.norm : 1);
}
function isVoice(it, t) {
  if (it.type !== 'video' || it.hidden || it.muted) return false;
  const m = MEDIA.get(it.mediaId); if (!m || m.hasAudio === false) return false;
  const src = timelineToSrc(it, t); if (inMute(it, src)) return false;
  if (it.voice && it.voice.length) return it.voice.some(v => src >= v.a - 0.1 && src <= v.b + 0.2);
  return (it.vol ?? 1) > 0.05;
}

function setGain(g, v) { if (!g || !AC) return; try { g.gain.setTargetAtTime(v, AC.currentTime, 0.02); } catch (e) { g.gain.value = v; } }

function syncMedia(force) {
  const t = PB.t;
  const now = performance.now(); const dt = Math.min(.1, (now - (PB.lastTick || now)) / 1000); PB.lastTick = now;
  // --- video ---
  const activeIds = new Set(); let voice = false;
  for (const it of D.items) {
    if (it.type !== 'video') continue;
    const active = t >= it.start - 1e-6 && t < it.start + it.dur - 1e-6;
    const soon = !active && it.start > t && it.start - t < 1.2 && !PB.exporting ? true : (!active && PB.exporting && it.start > t && it.start - t < 2);
    if (!active && !soon) {
      const r = POOL.get(it.id); if (r && !r.el.paused) r.el.pause(); if (r) setGain(r.gain, 0); continue;
    }
    const el = poolGet(it); if (!el) continue; const r = POOL.get(it.id);
    activeIds.add(it.id);
    const sp = clamp(it.speed || 1, 0.0625, 16);
    if (el.playbackRate !== sp) el.playbackRate = sp;
    if (soon) {
      if (!r.pre) { r.pre = true; try { el.currentTime = it.in || 0; } catch (e) { } }
      if (!el.paused) el.pause(); setGain(r.gain, 0); continue;
    }
    r.pre = false;
    const target = timelineToSrc(it, t);
    const m = MEDIA.get(it.mediaId); const maxT = (m && m.duration) ? Math.max(0, m.duration - 0.04) : target;
    const tt = Math.min(target, maxT);
    if (PB.playing) {
      if (el.paused && target <= maxT) el.play().catch(() => { });
      if (Math.abs(el.currentTime - tt) > 0.3) { try { el.currentTime = tt; } catch (e) { } }
    } else {
      if (!el.paused) el.pause();
      if (force || Math.abs(el.currentTime - tt) > 0.03) { try { el.currentTime = tt; } catch (e) { } }
    }
    setGain(r.gain, PB.playing ? videoGain(it, t) : 0);
    if (PB.playing && isVoice(it, t)) voice = true;
  }
  // release far-away elements that are not needed
  for (const [id, r] of POOL) { if (!activeIds.has(id)) { const it = getItem(id); if (!it) poolRelease(id); else if (performance.now() - r.last > 8000 && POOL.size > 4) poolRelease(id); } }
  // --- ducking ---
  const tgt = voice ? D.duckLevel : 1; const tau = tgt < PB.duck ? .08 : .45;
  PB.duck += (tgt - PB.duck) * (1 - Math.exp(-dt / tau));
  // --- audio items ---
  for (const it of D.items) {
    if (it.type !== 'audio') continue;
    const active = t >= it.start - 1e-6 && t < it.start + it.dur - 1e-6;
    const r0 = APOOL.get(it.id);
    if (!active || !PB.playing) { if (r0 && !r0.el.paused) r0.el.pause(); if (r0) setGain(r0.gain, 0); if (!active) continue; if (!PB.playing) continue; }
    const r = apoolGet(it); if (!r) continue;
    const m = MEDIA.get(it.mediaId); const md = m.duration || 1; const lt = t - it.start;
    let target = (it.in || 0) + lt; const loop = it.loop && md < it.dur + (it.in || 0);
    if (loop) target = target % md;
    r.el.loop = !!loop;
    if (r.el.paused) { if (target < md) r.el.play().catch(() => { }); }
    const diff = Math.abs(r.el.currentTime - target);
    if (diff > 0.3 && (!loop || diff < md - 0.3)) { try { r.el.currentTime = Math.min(target, md - 0.05); } catch (e) { } }
    let env = 1; if (it.fadeIn) env = Math.min(env, lt / it.fadeIn); if (it.fadeOut) env = Math.min(env, (it.dur - lt) / it.fadeOut);
    const muteSeg = (it.mutes || []).some(q => lt >= q.a && lt < q.b);
    const g = muteSeg ? 0 : (it.vol ?? .5) * clamp(env, 0, 1) * (it.duck ? PB.duck : 1);
    setGain(r.gain, g);
  }
  for (const [id] of APOOL) if (!getItem(id)) apoolRelease(id);
}

// ---------- main loop ----------
function tick() {
  vuUpdate();
  if (PB.playing && !PB.exporting) {
    PB.t = PB.t0 + (performance.now() - PB.wall0) / 1000;
    if (PB.t >= durEnd()) { PB.t = durEnd(); pause(); emit('ended'); }
  }
  if (SRC.m && PB.exporting) srcExit();
  if (SRC.m) { srcFrame(); }
  else if (!PB.exporting) {
    syncMedia(false);
    if (DIRTY || PB.playing) { renderFrame(PCTX, PW, PH, PB.t); DIRTY = false; if (window.onFrame) window.onFrame(); }
  }
  requestAnimationFrame(tick);
}

// ---------- audio analysis (peaks / 16 kHz mono PCM / loudness) ----------
async function analyzeAudio(m) {
  try {
    ensureAudio();
    if (m.file.size > 1.6e9) throw new Error('too big');
    const buf = await m.file.arrayBuffer();
    const ab = await AC.decodeAudioData(buf);
    m.hasAudio = true; if (!m.duration || !isFinite(m.duration)) m.duration = ab.duration;
    const ch = ab.getChannelData(0), N = 1200, step = Math.max(1, Math.floor(ch.length / N)), peaks = new Float32Array(N);
    for (let i = 0; i < N; i++) { let mx = 0; const a = i * step, b = Math.min(ch.length, a + step); for (let j = a; j < b; j += 4) { const v = Math.abs(ch[j]); if (v > mx) mx = v; } peaks[i] = mx; }
    m.peaks = peaks;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(ab.duration * 16000)), 16000);
    const s = off.createBufferSource(); s.buffer = ab; s.connect(off.destination); s.start(); const rr = await off.startRendering();
    m.pcm16 = rr.getChannelData(0);
    // loudness over non-silent windows
    const w = 1600; let acc = 0, cnt = 0;
    for (let i = 0; i + w < m.pcm16.length; i += w) { let e = 0; for (let j = i; j < i + w; j++) e += m.pcm16[j] * m.pcm16[j]; e = Math.sqrt(e / w); if (e > 0.01) { acc += e * e; cnt++; } }
    const rms = cnt ? Math.sqrt(acc / cnt) : 0.1; m.rms = rms; m.norm = clamp(0.12 / Math.max(rms, 0.005), 0.5, 3.5);
  } catch (e) { console.warn('audio analysis failed', m.name, e); if (m.hasAudio == null) m.hasAudio = m.type === 'audio' ? true : false; }
  emit('media');
}
