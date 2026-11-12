// ============================================================
//  Render engine: media pool, layers, transitions, effects, text, stickers
// ============================================================
let DIRTY = true;
const dirty = () => { DIRTY = true; };

// ---------- video element pool ----------
const POOL = new Map();           // itemId -> {el, last, gain}
const POOL_MAX = 7;
function poolGet(it, create = true) {
  let r = POOL.get(it.id);
  if (r) { r.last = performance.now(); return r.el; }
  if (!create) return null;
  const m = MEDIA.get(it.mediaId); if (!m) return null;
  if (POOL.size >= POOL_MAX) poolEvict();
  const el = document.createElement('video');
  el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.src = m.url;
  el.addEventListener('seeked', dirty); el.addEventListener('loadeddata', dirty); el.addEventListener('canplay', dirty);
  const gain = (typeof connectEl === 'function') ? connectEl(el) : null;
  r = { el, last: performance.now(), gain, itemId: it.id };
  POOL.set(it.id, r);
  return el;
}
function poolEvict() {
  let oldest = null;
  for (const [id, r] of POOL) { if (!oldest || r.last < oldest.last) oldest = r; }
  if (oldest) poolRelease(oldest.itemId);
}
function poolRelease(id) {
  const r = POOL.get(id); if (!r) return;
  try { r.el.pause(); r.el.removeAttribute('src'); r.el.load(); } catch (e) { }
  try { if (r.gain) { r.gain.disconnect(); } if (r.srcNode) r.srcNode.disconnect(); } catch (e) { }
  POOL.delete(id);
}
function poolPrune() { for (const id of [...POOL.keys()]) if (!getItem(id)) poolRelease(id); }

// ---------- scratch buffers ----------
const BUFS = [];
function getBuf(i, W, H) {
  let b = BUFS[i];
  if (!b) { b = BUFS[i] = document.createElement('canvas'); b.ctx = b.getContext('2d'); }
  if (b.width !== W || b.height !== H) { b.width = W; b.height = H; }
  b.ctx.setTransform(1, 0, 0, 1, 0, 0); b.ctx.globalAlpha = 1; b.ctx.globalCompositeOperation = 'source-over'; b.ctx.filter = 'none';
  b.ctx.clearRect(0, 0, W, H);
  return b;
}

// ---------- transitions ----------
const TRANS = {
  none: { label: 'ไม่มี' },
  fade: { label: 'เลือนเข้า' }, dipblack: { label: 'ผ่านดำ' }, dipwhite: { label: 'ผ่านขาว' },
  slideL: { label: 'สไลด์เข้าจากขวา' }, slideR: { label: 'สไลด์เข้าจากซ้าย' }, slideU: { label: 'สไลด์เข้าจากล่าง' }, slideD: { label: 'สไลด์เข้าจากบน' },
  wipeD: { label: 'ปัดลง', buf: 1 }, wipeU: { label: 'ปัดขึ้น', buf: 1 }, wipeL: { label: 'ปัดไปซ้าย', buf: 1 }, wipeR: { label: 'ปัดไปขวา', buf: 1 }, wipeBlur: { label: 'ปัดลง + เบลอ', buf: 1 },
  zoomIn: { label: 'ซูมเข้า' }, zoomOut: { label: 'ซูมออก' }, punch: { label: 'ซูมกระแทก' }, spin: { label: 'หมุนเข้า' },
  card3d: { label: 'การ์ดกรอบขาวหมุน 3D', buf: 1 }, glitch: { label: 'กลิตช์', buf: 1 }, blur: { label: 'เบลอเลือน' },
};
const FX_BUF_TYPES = new Set(['featherTop', 'featherBottom', 'featherAll']);

// ---------- helpers ----------
function mediaSource(it) {
  const m = MEDIA.get(it.mediaId); if (!m) return null;
  if (it.type === 'image') return m.img && m.img.complete ? m.img : null;
  const el = poolGet(it); if (!el) return null;
  return (el.readyState >= 2 && el.videoWidth > 0) ? el : null;
}
function srcSize(src) { return src.videoWidth ? [src.videoWidth, src.videoHeight] : [src.naturalWidth, src.naturalHeight]; }

function filterString(it, extraBlur) {
  const f = it.fx || {}; const parts = [];
  if (f.brightness != null && f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast != null && f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturate != null && f.saturate !== 1) parts.push(`saturate(${f.saturate})`);
  if (f.gray) parts.push(`grayscale(${f.gray})`);
  if (f.sepia) parts.push(`sepia(${f.sepia})`);
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`);
  const bl = (f.blur || 0) + (extraBlur || 0); if (bl > 0.01) parts.push(`blur(${bl.toFixed(1)}px)`);
  if (f.denoise) parts.push('url(#f-denoise)');
  if (f.sharpen) parts.push(f.sharpen >= 2 ? 'url(#f-sharp2)' : 'url(#f-sharp1)');
  return parts.length ? parts.join(' ') : 'none';
}

function rrPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const BOUNDS = {};   // itemId -> {cx,cy,w,h,rot}  (preview hit-testing)

// ---------- core: draw one media item (content only, with xf + mask + filter) ----------
function drawMediaContent(ctx, it, t, W, H, extra) {
  extra = extra || {};
  const src = mediaSource(it); if (!src) return false;
  const [sw0, sh0] = srcSize(src);
  const lt = t - it.start;
  const s = prop(it, 's', t), x = prop(it, 'x', t), y = prop(it, 'y', t), r = prop(it, 'r', t), o = prop(it, 'o', t);
  let fw = W, fh = H, sx = 0, sy = 0, sw = sw0, sh = sh0;
  if (it.fit === 'contain') {
    const k = Math.min(W / sw0, H / sh0); fw = sw0 * k; fh = sh0 * k;
  } else {
    const ka = W / H, sa = sw0 / sh0;
    if (sa > ka) { sw = sh0 * ka; sx = (sw0 - sw) / 2; } else { sh = sw0 / ka; sy = (sh0 - sh) / 2; }
  }
  // Ken Burns (zoom on source crop)
  let z = 1, pan = 0; const pr = clamp(lt / Math.max(0.1, it.dur), 0, 1);
  if (it.kb === 'in') z = 1 + 0.2 * EASE.io(pr); else if (it.kb === 'out') z = 1.2 - 0.2 * EASE.io(pr); else if (it.kb === 'pan') { z = 1.14; pan = lerp(-1, 1, pr); }
  if (z !== 1 || pan) { const nw = sw / z, nh = sh / z; sx += (sw - nw) / 2 + pan * (sw - nw) / 2; sy += (sh - nh) / 2; sw = nw; sh = nh; }
  const w = fw * s, h = fh * s, cx = W / 2 + x * W + (extra.dx || 0), cy = H / 2 + y * H + (extra.dy || 0);
  BOUNDS[it.id] = { cx, cy, w, h, rot: r };
  ctx.save();
  ctx.globalAlpha *= clamp(o, 0, 1) * (extra.alpha ?? 1);
  ctx.translate(cx, cy); ctx.rotate(r * Math.PI / 180);
  const mk = it.mask || { type: 'none' };
  // frame / clip shapes
  if (mk.type === 'circle') {
    const rad = Math.min(w, h) / 2 * (mk.size || 1);
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.save(); ctx.clip();
  } else if (mk.type === 'round') {
    ctx.save(); rrPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * (mk.r ?? 0.06)); ctx.clip();
  } else if (mk.type === 'frame') {
    const b = (mk.ring ?? 0.014) * W * (mk.scale ?? 1);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18 * (W / 1080); ctx.fillStyle = '#fff';
    rrPath(ctx, -w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, 6 * W / 1080); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
  } else { ctx.save(); }
  ctx.filter = filterString(it, extra.blur);
  ctx.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  ctx.filter = 'none';
  ctx.restore();
  if (mk.type === 'circle') {
    const rad = Math.min(w, h) / 2 * (mk.size || 1); const ring = (mk.ring ?? 0.008) * W;
    if (ring > 0) { ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.lineWidth = ring; ctx.strokeStyle = mk.color || '#fff'; ctx.stroke(); }
  }
  ctx.restore();
  return true;
}

function postFx(buf, it, t, W, H) {
  const c = buf.ctx, f = it.fx || {}, mk = it.mask || {};
  if (f.pain) {
    const p = f.pain; const g = c.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, p.r * W);
    g.addColorStop(0, 'rgba(255,40,40,.75)'); g.addColorStop(.6, 'rgba(255,60,60,.35)'); g.addColorStop(1, 'rgba(255,60,60,0)');
    c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }
  if (f.vignette > 0) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .25, W / 2, H / 2, Math.max(W, H) * .72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${clamp(f.vignette, 0, 1)})`);
    c.save(); c.globalCompositeOperation = 'source-atop'; c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }
  if (f.glitch > 0) glitchBuf(buf, W, H, f.glitch, t);
  if (FX_BUF_TYPES.has(mk.type)) {
    c.save(); c.globalCompositeOperation = 'destination-in';
    let g;
    if (mk.type === 'featherTop') { const k = mk.size ?? 0.3; g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.max(0, 1 - k), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else if (mk.type === 'featherBottom') { const k = mk.size ?? 0.3; g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(Math.min(1, k), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
    else { g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * .5); const k = 1 - (mk.size ?? 0.35); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(clamp(k, 0, .95), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }
}
function glitchBuf(buf, W, H, amt, t) {
  const tmp = getBuf(3, W, H); tmp.ctx.drawImage(buf, 0, 0);
  const c = buf.ctx; c.clearRect(0, 0, W, H); c.drawImage(tmp, 0, 0);
  const seed = Math.floor(t * 14); let r = seed * 9301 + 49297; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const n = Math.round(6 + amt * 10);
  for (let i = 0; i < n; i++) {
    const y = rnd() * H, hh = (0.01 + rnd() * 0.05) * H, off = (rnd() - .5) * amt * 0.22 * W;
    c.clearRect(0, y, W, hh); c.drawImage(tmp, 0, y, W, hh, off, y, W, hh);
  }
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.22 * amt;
  c.drawImage(tmp, -amt * 0.012 * W, 0); c.restore();
}

// transition-driven modifiers applied to a canvas context before drawing the layer
function applyTrans(ctx, T, p, W, H, ex) {
  const e = EASE.out(p);
  switch (T) {
    case 'fade': ctx.globalAlpha *= p; break;
    case 'blur': ctx.globalAlpha *= p; ex.blur = (1 - p) * 22 * (W / 1080); break;
    case 'slideL': ctx.translate((1 - e) * W, 0); break;
    case 'slideR': ctx.translate(-(1 - e) * W, 0); break;
    case 'slideU': ctx.translate(0, (1 - e) * H); break;
    case 'slideD': ctx.translate(0, -(1 - e) * H); break;
    case 'zoomIn': case 'zoomOut': case 'punch': case 'spin': {
      let sc = 1, rot = 0, a = p;
      if (T === 'zoomIn') sc = lerp(1.6, 1, e); else if (T === 'zoomOut') sc = lerp(.6, 1, e);
      else if (T === 'punch') { sc = lerp(1.22, 1, EASE.out(clamp(p * 1.4, 0, 1))); a = clamp(p * 3, 0, 1); }
      else { sc = lerp(.55, 1, e); rot = lerp(-28, 0, e) * Math.PI / 180; }
      ctx.translate(W / 2, H / 2); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2); ctx.globalAlpha *= a; break;
    }
  }
}

function drawRotY(ctx, buf, W, H, ang) {
  const N = 48, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N; const x0 = (u0 - .5) * W, x1 = (u1 - .5) * W;
    const persp = (x) => 1 / (1 + (x / W) * sa * 0.9);
    const p0 = persp(x0 * ca), p1 = persp(x1 * ca);
    const dx0 = W / 2 + x0 * ca * p0, dx1 = W / 2 + x1 * ca * p1; const hs = H * (p0 + p1) / 2;
    ctx.drawImage(buf, u0 * W, 0, W / N + 1, H, dx0, (H - hs) / 2, Math.max(1, dx1 - dx0) + 1, hs);
  }
}

function drawMediaItem(ctx, it, t, W, H) {
  const lt = t - it.start; const tr = it.transIn;
  let T = null, p = 1;
  if (tr && tr.type && tr.type !== 'none' && lt < tr.dur) { T = tr.type; p = clamp(lt / tr.dur, 0, 1); }
  const f = it.fx || {}, mk = it.mask || {};
  const needBuf = (T && TRANS[T] && TRANS[T].buf) || f.vignette > 0 || f.glitch > 0 || f.pain || FX_BUF_TYPES.has(mk.type);
  const ex = {};
  if (!needBuf) {
    if (T === 'dipblack' || T === 'dipwhite') {
      if (p >= .5) { ctx.save(); const ok = drawMediaContent(ctx, it, t, W, H, ex); ctx.restore(); }
      ctx.save(); ctx.globalAlpha = p < .5 ? p * 2 : (1 - p) * 2; ctx.fillStyle = T === 'dipwhite' ? '#fff' : '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
      return;
    }
    ctx.save(); if (T) applyTrans(ctx, T, p, W, H, ex); drawMediaContent(ctx, it, t, W, H, ex); ctx.restore();
    return;
  }
  // buffered path
  const buf = getBuf(0, W, H);
  if (!drawMediaContent(buf.ctx, it, t, W, H, T === 'blur' ? { blur: (1 - p) * 22 * W / 1080 } : {})) return;
  postFx(buf, it, t, W, H);
  ctx.save();
  if (T && T.startsWith('wipe')) {
    const c = buf.ctx; c.save(); c.globalCompositeOperation = 'destination-in';
    const fe = T === 'wipeBlur' ? .35 : .14; const e = p * (1 + fe) - fe; let g;
    if (T === 'wipeD' || T === 'wipeBlur') g = c.createLinearGradient(0, 0, 0, H);
    else if (T === 'wipeU') g = c.createLinearGradient(0, H, 0, 0);
    else if (T === 'wipeL') g = c.createLinearGradient(W, 0, 0, 0);
    else g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(clamp(e, 0, 1), 'rgba(0,0,0,1)'); g.addColorStop(clamp(e + fe, 0, 1), 'rgba(0,0,0,0)');
    if (e <= 0) { g = null; }
    if (g) { g.addColorStop(0, 'rgba(0,0,0,1)'); c.fillStyle = g; c.fillRect(0, 0, W, H); } else { c.clearRect(0, 0, W, H); }
    c.restore();
    if (T === 'wipeBlur') { ctx.filter = `blur(${((1 - p) * 8 * W / 1080).toFixed(1)}px)`; }
    ctx.drawImage(buf, 0, 0); ctx.filter = 'none';
  } else if (T === 'card3d') {
    const card = getBuf(1, W, H), cc = card.ctx; const k = .9, b = 14 * W / 1080;
    cc.save(); cc.translate(W / 2, H / 2); cc.shadowColor = 'rgba(0,0,0,.4)'; cc.shadowBlur = 20; cc.fillStyle = '#fff';
    rrPath(cc, -W * k / 2 - b, -H * k / 2 - b, W * k + 2 * b, H * k + 2 * b, 10); cc.fill(); cc.shadowBlur = 0;
    cc.beginPath(); cc.rect(-W * k / 2, -H * k / 2, W * k, H * k); cc.clip(); cc.drawImage(buf, -W * k / 2, -H * k / 2, W * k, H * k); cc.restore();
    ctx.globalAlpha *= clamp(p * 2.5, 0, 1);
    drawRotY(ctx, card, W, H, lerp(-1.25, 0, EASE.out(p)));
  } else if (T === 'glitch') {
    glitchBuf(buf, W, H, (1 - p) * 1.6, t); ctx.globalAlpha *= clamp(p * 3, 0, 1); ctx.drawImage(buf, 0, 0);
  } else {
    if (T) applyTrans(ctx, T, p, W, H, ex);
    ctx.drawImage(buf, 0, 0);
  }
  ctx.restore();
}

// ============================================================
//  Text
// ============================================================
let _seg = {};
function segWords(str) {
  const lang = /[຀-໿]/.test(str) ? 'lo' : 'th';
  try { _seg[lang] = _seg[lang] || new Intl.Segmenter(lang, { granularity: 'word' }); return [..._seg[lang].segment(str)].map(s => s.segment); }
  catch (e) { return str.match(/\S+\s*|\s+/g) || [str]; }
}
function parseRuns(line) {  // *highlight* markers
  const parts = line.split('*'); const runs = [];
  parts.forEach((p, i) => { if (p) runs.push({ s: p, hl: i % 2 === 1 }); });
  return runs.length ? runs : [{ s: '', hl: false }];
}
function layoutText(ctx, it, W) {
  const size = it.size * W / 1080; ctx.font = `${it.weight || 700} ${size}px ${it.font || FONT_STACK}`;
  const maxW = (it.maxW || .88) * W;
  const rows = [];   // each: {li, toks:[{s,hl,w}], w}
  const srcLines = String(it.text || '').split('\n');
  srcLines.forEach((ln, li) => {
    const toks = [];
    parseRuns(ln).forEach(r => segWords(r.s).forEach(wd => toks.push({ s: wd, hl: r.hl })));
    let cur = [], cw = 0;
    const flush = () => { if (cur.length) { while (cur.length > 1 && /^\s+$/.test(cur[cur.length - 1].s)) cur.pop(); rows.push({ li, toks: cur, w: cur.reduce((a, k) => a + k.w, 0) }); } cur = []; cw = 0; };
    toks.forEach(k => {
      k.w = ctx.measureText(k.s).width;
      if (cw + k.w > maxW && cur.length && !/^\s+$/.test(k.s)) flush();
      if (!(cur.length === 0 && /^\s+$/.test(k.s))) { cur.push(k); cw += k.w; }
    });
    flush();
    if (!toks.length) rows.push({ li, toks: [], w: 0 });
  });
  return { rows, size, lineH: size * 1.32 };
}
function textAnimParams(it, lt, W, H) {
  const A = it.anim || {}; const d = Math.max(.05, A.d || .25);
  const pin = clamp(lt / d, 0, 1), pout = clamp((it.dur - lt) / d, 0, 1);
  let a = 1, s = 1, dx = 0, dy = 0, chars = 1;
  switch (A.in) {
    case 'fade': a = pin; break;
    case 'pop': s = lerp(.55, 1, EASE.back(pin)); a = Math.min(1, pin * 2.2); break;
    case 'bounce': s = lerp(.2, 1, EASE.bounce(pin)); a = Math.min(1, pin * 3); break;
    case 'up': dy = (1 - EASE.out(pin)) * .08 * H; a = pin; break;
    case 'left': dx = -(1 - EASE.out(pin)) * .35 * W; a = pin; break;
    case 'drop': dy = -(1 - EASE.bounce(pin)) * .18 * H; a = Math.min(1, pin * 3); break;
    case 'zoom': s = lerp(2, 1, EASE.out(pin)); a = pin; break;
    case 'type': chars = clamp(lt / Math.max(.3, d * 2.4), 0, 1); break;
  }
  if (A.out === 'fade') a *= pout; else if (A.out === 'down') { dy += (1 - EASE.in(pout)) * .06 * H; a *= pout; }
  return { a, s, dx, dy, chars };
}
function drawText(ctx, it, t, W, H) {
  const lt = t - it.start; if (lt < 0) return;
  const ap = textAnimParams(it, lt, W, H);
  if (ap.a <= 0.001) return;
  const L = layoutText(ctx, it, W); const { rows, size, lineH } = L;
  const totalH = rows.length * lineH;
  const xs = prop(it, 's', t), xx = prop(it, 'x', t), yy = prop(it, 'y', t), rr = prop(it, 'r', t), oo = prop(it, 'o', t);
  const cx = W / 2 + xx * W + ap.dx, cy = (it.ay ?? .5) * H + yy * H + ap.dy;
  const blockW = Math.max(0, ...rows.map(r => r.w));
  BOUNDS[it.id] = { cx, cy, w: blockW + 40, h: totalH + 20, rot: rr };
  const echoN = (it.anim && it.anim.echo) ? 3 : 0;
  for (let ei = echoN; ei >= 0; ei--) {
    ctx.save();
    ctx.globalAlpha *= clamp(ap.a * oo, 0, 1) * (ei ? 0.22 : 1);
    ctx.translate(cx, cy); ctx.rotate(rr * Math.PI / 180); const sc = ap.s * xs * (ei ? 1 + ei * 0.05 : 1); ctx.scale(sc, sc);
    ctx.font = `${it.weight || 700} ${size}px ${it.font || FONT_STACK}`; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    // block background
    if (it.box === 'block' && it.bg && ei === 0) {
      const pad = size * .42; ctx.fillStyle = it.bg; rrPath(ctx, -blockW / 2 - pad, -totalH / 2 - pad * .25, blockW + pad * 2, totalH + pad * .5, Math.min(size * .7, (totalH + pad * .5) / 2)); ctx.fill();
    }
    let totalChars = 0; if (ap.chars < 1) rows.forEach(r => r.toks.forEach(k => totalChars += [...k.s].length));
    let shown = 0, limit = ap.chars < 1 ? Math.floor(totalChars * ap.chars) : Infinity;
    rows.forEach((row, ri) => {
      let rowAlpha = 1;
      if (row.li >= 1 && it.reveal > 0) { const q = clamp((lt - it.reveal * row.li) / .25, 0, 1); rowAlpha = q; if (q <= 0) return; }
      const y = (ri - (rows.length - 1) / 2) * lineH;
      const base = row.li === 0 ? it.color : (it.color2 || it.color);
      let x0 = it.align === 'left' ? -blockW / 2 : it.align === 'right' ? blockW / 2 - row.w : -row.w / 2;
      if (it.box === 'line' || it.box === 'line2') {
        const bg = (it.box === 'line2' && row.li > 0) ? (it.bg2 || '#E02B3A') : it.bg; const pad = size * .36;
        if (bg && ei === 0) { ctx.save(); ctx.globalAlpha *= rowAlpha; ctx.fillStyle = bg; rrPath(ctx, x0 - pad, y - lineH / 2 + lineH * .06, row.w + pad * 2, lineH * .88, size * .22); ctx.fill(); ctx.restore(); }
      }
      let x = x0;
      row.toks.forEach(k => {
        let str = k.s;
        if (limit !== Infinity) { const n = [...str].length; if (shown >= limit) { x += k.w; return; } if (shown + n > limit) str = [...str].slice(0, limit - shown).join(''); shown += n; }
        const col = k.hl ? (row.li === 0 ? (it.color2 || '#FFE14D') : it.color) : base;
        ctx.textAlign = 'left';
        ctx.save(); ctx.globalAlpha *= rowAlpha;
        if (it.shadow && ei === 0) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = size * .18; ctx.shadowOffsetY = size * .05; }
        if (it.stroke && it.strokeW) { ctx.lineWidth = it.strokeW * W / 1080; ctx.strokeStyle = it.stroke; ctx.strokeText(str, x, y); ctx.shadowColor = 'transparent'; }
        ctx.fillStyle = col; ctx.fillText(str, x, y); ctx.restore();
        x += k.w;
      });
    });
    ctx.restore();
  }
}

// ============================================================
//  Stickers
// ============================================================
function drawSticker(ctx, it, t, W, H) {
  const lt = t - it.start; if (lt < 0) return;
  const ap = textAnimParams(it, lt, W, H);
  const S = it.size * W / 1080; const xs = prop(it, 's', t), xx = prop(it, 'x', t), yy = prop(it, 'y', t), rr = prop(it, 'r', t), oo = prop(it, 'o', t);
  const cx = W / 2 + xx * W + ap.dx, cy = (it.ay ?? .5) * H + yy * H + ap.dy;
  BOUNDS[it.id] = { cx, cy, w: S, h: S, rot: rr };
  ctx.save(); ctx.globalAlpha *= clamp(ap.a * oo, 0, 1); ctx.translate(cx, cy); ctx.rotate(rr * Math.PI / 180); const sc = ap.s * xs; ctx.scale(sc, sc);
  const col = it.color || '#FFD60A'; const r = S / 2;
  const pulse = 0.5 + 0.5 * Math.sin(lt * 6);
  switch (it.kind) {
    case 'check': ctx.fillStyle = '#12B76A'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = S * .1; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-r * .45, 0); ctx.lineTo(-r * .1, r * .38); ctx.lineTo(r * .5, -r * .35); ctx.stroke(); break;
    case 'warning': ctx.fillStyle = '#E0143C'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * .95, r * .8); ctx.lineTo(-r * .95, r * .8); ctx.closePath(); ctx.lineJoin = 'round'; ctx.lineWidth = S * .06; ctx.strokeStyle = '#E0143C'; ctx.stroke(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-S * .045, -r * .4, S * .09, r * .7); ctx.beginPath(); ctx.arc(0, r * .55, S * .06, 0, 7); ctx.fill(); break;
    case 'cursor': { const k = S / 100; ctx.scale(k, k); ctx.translate(-30, -20);
      ctx.save(); ctx.globalAlpha *= .35 * (1 - pulse); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(30, 20, 14 + pulse * 26, 0, 7); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(30, 80); ctx.lineTo(44, 66); ctx.lineTo(54, 90); ctx.lineTo(64, 85); ctx.lineTo(54, 62); ctx.lineTo(74, 60); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
    case 'brackets': { const g = r * (1 + (1 - EASE.out(clamp(lt / .35, 0, 1))) * .6), l = r * .38; ctx.strokeStyle = it.color || '#fff'; ctx.lineWidth = S * .035; ctx.lineCap = 'round';
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a * g, b * (g - l)); ctx.lineTo(a * g, b * g); ctx.lineTo(a * (g - l), b * g); ctx.stroke(); }); break; }
    case 'arrow': { const bob = Math.sin(lt * 7) * S * .06; ctx.translate(0, bob); ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = S * .05; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-r * .32, -r); ctx.lineTo(r * .32, -r); ctx.lineTo(r * .32, 0); ctx.lineTo(r * .75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * .75, 0); ctx.lineTo(-r * .32, 0); ctx.closePath(); ctx.stroke(); ctx.fill(); break; }
    case 'star': { ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.lineWidth = S * .04; ctx.lineJoin = 'round'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .45 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.stroke(); ctx.fill(); break; }
    case 'underline': { const q = EASE.out(clamp(lt / .4, 0, 1)); ctx.strokeStyle = col; ctx.lineWidth = S * .05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-r * 1.6, 0); ctx.quadraticCurveTo(0, S * .08, -r * 1.6 + r * 3.2 * q, -S * .02); ctx.stroke(); break; }
    case 'circle': { const q = EASE.out(clamp(lt / .5, 0, 1)); ctx.strokeStyle = col; ctx.lineWidth = S * .05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * .75, -.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); ctx.stroke(); break; }
    case 'emoji': ctx.font = `${S}px "Apple Color Emoji","Noto Color Emoji","Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.text || '🔥', 0, 0); break;
  }
  ctx.restore();
}

// ============================================================
//  Frame composition
// ============================================================
const activeAt = (tr, t) => D.items.filter(i => i.track === tr && t >= i.start - 1e-6 && t < i.start + i.dur - 1e-6).sort((a, b) => a.start - b.start);
function renderFrame(ctx, W, H, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (const tr of RENDER_ORDER) {
    for (const it of activeAt(tr, t)) {
      if (it.hidden) continue;
      if (it.type === 'video' || it.type === 'image') drawMediaItem(ctx, it, t, W, H);
      else if (it.type === 'text') drawText(ctx, it, t, W, H);
      else if (it.type === 'sticker') drawSticker(ctx, it, t, W, H);
    }
  }
}
