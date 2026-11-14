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
  el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.src = m.purl || m.url;
  el.addEventListener('seeked', dirty); el.addEventListener('loadeddata', dirty); el.addEventListener('canplay', dirty);
  // scrubbing: a new seek while one is still running cancels it, so a fast drag over a 4K clip never showed a frame. Keep ONE seek in flight, remember the latest wish, and jump there when the frame lands (live preview like CapCut)
  el.addEventListener('seeked', () => { const rr = POOL.get(it.id); if (rr && rr.want != null && !PB.playing) { const w = rr.want; rr.want = null; if (Math.abs(el.currentTime - w) > 0.02) { try { el.currentTime = w; } catch (e) { } } } });
  const gain = (typeof connectEl === 'function') ? connectEl(el) : null;
  r = { el, last: performance.now(), gain, itemId: it.id };
  POOL.set(it.id, r);
  return el;
}
function poolResetAll() { for (const id of [...POOL.keys()]) poolRelease(id); if (typeof APOOL !== 'undefined') for (const id of [...APOOL.keys()]) apoolRelease(id); dirty(); }
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
  if (!b) { b = BUFS[i] = document.createElement('canvas'); b.ctx = b.getContext('2d', { willReadFrequently: true }); }
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
const FX_BUF_TYPES = new Set(['featherTop', 'featherBottom', 'featherAll', 'linear']);

// ---------- helpers ----------
function mediaSource(it) {
  const m = MEDIA.get(it.mediaId); if (!m) return null;
  if (it.type === 'image') return m.img && m.img.complete ? m.img : null;
  const el = poolGet(it); if (!el) return null;
  const ok = el.readyState >= 2 && el.videoWidth > 0;
  // v1.39: while scrubbing / waiting for a seek, show the nearest low-res cached frame instead of black or a stale frame (CapCut-like). Only the live preview turns SCR.on.
  if (SCR.on && !PB.exporting) {
    let tg = timelineToSrc(it, PB.t); if (m.duration) tg = Math.min(tg, Math.max(0, m.duration - .04));
    if (!ok || (!PB.playing && (el.seeking || Math.abs(el.currentTime - tg) > .06))) { const f = scrFrame(it.mediaId, tg); if (f) return f; }
  }
  return ok ? el : null;
}
function srcSize(src) { return src.videoWidth ? [src.videoWidth, src.videoHeight] : [src.naturalWidth || src.width, src.naturalHeight || src.height]; }

function filterString(it, extraBlur) {
  const f = it.fx || {}; const parts = [];
  const br = (f.brightness != null ? f.brightness : 1) * (1 + .14 * (f.whiten || 0)); if (br !== 1) parts.push(`brightness(${br.toFixed(3)})`);
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

let BS = 1;   // bounds scale (preview may be rendered at reduced resolution)
const bsc = b => { if (BS !== 1) { b.cx *= BS; b.cy *= BS; b.w *= BS; b.h *= BS; } return b; };
const BOUNDS = {};   // itemId -> {cx,cy,w,h,rot}  (preview hit-testing)

// ---------- core: draw one media item (content only, with xf + mask + filter) ----------
function drawMediaContent(ctx, it, t, W, H, extra) {
  extra = extra || {};
  const src = mediaSource(it); if (!src) return false;
  const [sw0, sh0] = srcSize(src);
  const lt = t - it.start;
  const s = prop(it, 's', t), x = prop(it, 'x', t), y = prop(it, 'y', t); let r = prop(it, 'r', t); const o = prop(it, 'o', t);
  const A = mediaAnim(it, lt); if (A) { r += A.r; extra = Object.assign({}, extra, { alpha: (extra.alpha ?? 1) * A.a, blur: (extra.blur || 0) + A.blur * Math.min(W, H) / 1080, dx: (extra.dx || 0) + A.dx * W, dy: (extra.dy || 0) + A.dy * H }); }
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
  const nu = it.uni === false; const am = A ? A.s : 1;
  const w = fw * s * (nu ? (it.sx ?? 1) : 1) * am, h = fh * s * (nu ? (it.sy ?? 1) : 1) * am, cx = W / 2 + x * W + (extra.dx || 0), cy = H / 2 + y * H + (extra.dy || 0);
  BOUNDS[it.id] = bsc({ cx, cy, w, h, rot: r });
  ctx.save();
  ctx.globalAlpha *= clamp(o, 0, 1) * (extra.alpha ?? 1);
  if (it.bg && it.bg !== 'none' && (it.fit === 'contain' || w < W - 1 || h < H - 1)) {   // canvas background (CapCut: Canvas)
    ctx.save();
    if (it.bg === 'color') { ctx.fillStyle = it.bgColor || '#000000'; ctx.fillRect(0, 0, W, H); }
    else {
      const ka = W / H, sa = sw0 / sh0; let bx = 0, by = 0, bw = sw0, bh = sh0; if (sa > ka) { bw = sh0 * ka; bx = (sw0 - bw) / 2; } else { bh = sw0 / ka; by = (sh0 - bh) / 2; }
      ctx.filter = `blur(${(22 * Math.min(W, H) / 1080).toFixed(1)}px) brightness(.72)`; ctx.drawImage(src, bx, by, bw, bh, -W * .06, -H * .06, W * 1.12, H * 1.12); ctx.filter = 'none';
    }
    ctx.restore();
  }
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
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18 * (Math.min(W, H) / 1080); ctx.fillStyle = '#fff';
    rrPath(ctx, -w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, 6 * Math.min(W, H) / 1080); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
  } else if (mk.type === 'star' || mk.type === 'heart') {
    ctx.save(); ctx.beginPath(); const R0 = Math.min(w, h) / 2 * (mk.size || 1);
    if (mk.type === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R0 * .42 : R0; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else { const k = R0 / 16; ctx.moveTo(0, 14 * k); ctx.bezierCurveTo(-24 * k, -2 * k, -16 * k, -20 * k, 0, -8 * k); ctx.bezierCurveTo(16 * k, -20 * k, 24 * k, -2 * k, 0, 14 * k); ctx.closePath(); }
    ctx.clip();
  } else { ctx.save(); }
  ctx.filter = filterString(it, extra.blur);
  ctx.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  if ((it.fx || {}).soften > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(it.fx.soften, 0, 1) * .75; ctx.filter = `blur(${(5 * Math.min(W, H) / 540).toFixed(1)}px) brightness(1.04)`; ctx.drawImage(src, sx, sy, sw, sh, -w / 2, -h / 2, w, h); ctx.globalAlpha = ga; }
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
  if ((it.chroma && it.chroma.on) || adjActive(it)) pixelPass(buf, it, W, H, t);
  if (FX_BUF_TYPES.has(mk.type)) {
    c.save(); c.globalCompositeOperation = 'destination-in';
    let g;
    if (mk.type === 'featherTop') { const k = mk.size ?? 0.3; g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.max(0, 1 - k), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else if (mk.type === 'featherBottom') { const k = mk.size ?? 0.3; g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(Math.min(1, k), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
    else if (mk.type === 'linear') {
      const ang = (mk.angle || 0) * Math.PI / 180, cx = W / 2 + (mk.pos || 0) * W * Math.cos(ang), cy = H / 2 + (mk.pos || 0) * W * Math.sin(ang); const L = Math.hypot(W, H) / 2, fe = Math.max(.001, (mk.feather ?? .05)) * W;
      const dx = Math.cos(ang), dy = Math.sin(ang), sgn = mk.inv ? -1 : 1;
      g = c.createLinearGradient(cx - dx * fe * sgn, cy - dy * fe * sgn, cx + dx * fe * sgn, cy + dy * fe * sgn); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    else { g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * .5); const k = 1 - (mk.size ?? 0.35); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(clamp(k, 0, .95), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }
}

// ---------- clip animations (In / Out / Combo) ----------
const ANIM_LIST = {
  in: [['none', 'ไม่มี', '⊘'], ['fade', 'เลือนเข้า', '◐'], ['zoomin', 'ซูมเข้าหา', '⊕'], ['zoomout', 'ซูมถอยเข้า', '⊖'], ['slideL', 'สไลด์จากขวา', '⇠'], ['slideR', 'สไลด์จากซ้าย', '⇢'], ['slideU', 'สไลด์จากล่าง', '⇡'], ['slideD', 'สไลด์จากบน', '⇣'], ['spin', 'หมุนเข้า', '⟳'], ['pop', 'เด้งป๊อป', '✺'], ['rise', 'ลอยขึ้น', '△'], ['shake', 'สั่นเข้า', '≋'], ['blur', 'เบลอแล้วชัด', '◌']],
  out: [['none', 'ไม่มี', '⊘'], ['fade', 'เลือนหาย', '◐'], ['zoomin', 'ซูมเข้าหาย', '⊕'], ['zoomout', 'ซูมออกหาย', '⊖'], ['slideL', 'สไลด์ไปซ้าย', '⇠'], ['slideR', 'สไลด์ไปขวา', '⇢'], ['slideU', 'สไลด์ขึ้น', '⇡'], ['slideD', 'สไลด์ลง', '⇣'], ['spin', 'หมุนหาย', '⟳'], ['fall', 'ตกลง', '▽'], ['shake', 'สั่นแล้วหาย', '≋'], ['blur', 'เบลอหาย', '◌']],
  combo: [['none', 'ไม่มี', '⊘'], ['pulse', 'ซูมเต้น', '◉'], ['swing', 'แกว่ง', '⇋'], ['shake', 'สั่น', '≋'], ['float', 'ลอยขึ้นลง', '≈'], ['heart', 'หัวใจเต้น', '♥'], ['breathe', 'หายใจ', '○']],
};
function mediaAnim(it, lt) {
  const an = it.anim; if (!an || !(an.in || an.out || an.combo)) return null; if (an.in === 'none' && an.out === 'none' && (!an.combo || an.combo === 'none')) return null;
  const A = { a: 1, s: 1, dx: 0, dy: 0, r: 0, blur: 0 }; const lerpv = (a, b, p) => a + (b - a) * p;
  if (an.in && an.in !== 'none') {
    const d = Math.min(an.dIn || .5, it.dur / 2);
    if (lt < d) {
      const p = EASE.out(clamp(lt / d, 0, 1)), pr = clamp(lt / d, 0, 1);
      switch (an.in) {
        case 'fade': A.a = p; break; case 'zoomin': A.s = lerpv(.5, 1, p); A.a = p; break; case 'zoomout': A.s = lerpv(1.5, 1, p); A.a = p; break;
        case 'slideL': A.dx = lerpv(-1, 0, p); break; case 'slideR': A.dx = lerpv(1, 0, p); break; case 'slideU': A.dy = lerpv(1, 0, p); break; case 'slideD': A.dy = lerpv(-1, 0, p); break;
        case 'spin': A.r = lerpv(-120, 0, p); A.s = lerpv(.3, 1, p); A.a = p; break;
        case 'pop': A.s = pr < .7 ? lerpv(.2, 1.12, pr / .7) : lerpv(1.12, 1, (pr - .7) / .3); A.a = Math.min(1, pr * 3); break;
        case 'rise': A.dy = lerpv(.12, 0, p); A.a = p; break; case 'shake': A.dx = Math.sin(pr * 24) * .04 * (1 - pr); A.a = Math.min(1, pr * 4); break;
        case 'blur': A.blur = (1 - p) * 24; A.a = Math.min(1, pr * 3); break;
      }
    }
  }
  if (an.out && an.out !== 'none') {
    const d = Math.min(an.dOut || .5, it.dur / 2);
    if (lt > it.dur - d) {
      const q = clamp((lt - (it.dur - d)) / d, 0, 1), e = EASE.in ? EASE.in(q) : q * q;
      switch (an.out) {
        case 'fade': A.a *= 1 - q; break; case 'zoomin': A.s *= 1 + .5 * e; A.a *= 1 - q; break; case 'zoomout': A.s *= 1 - .5 * e; A.a *= 1 - q; break;
        case 'slideL': A.dx += -e; break; case 'slideR': A.dx += e; break; case 'slideU': A.dy += -e; break; case 'slideD': A.dy += e; break;
        case 'spin': A.r += 120 * e; A.s *= 1 - .7 * e; A.a *= 1 - q; break; case 'fall': A.dy += .25 * e; A.a *= 1 - q; break;
        case 'shake': A.dx += Math.sin(q * 24) * .04 * q; A.a *= 1 - q * .6; break; case 'blur': A.blur += e * 24; A.a *= 1 - q * .6; break;
      }
    }
  }
  if (an.combo && an.combo !== 'none') {
    const w = lt * Math.PI * 2;
    switch (an.combo) {
      case 'pulse': A.s *= 1 + .06 * Math.sin(w * 1.2); break; case 'swing': A.r += 4 * Math.sin(w * .8); break;
      case 'shake': A.dx += Math.sin(w * 9) * .006; A.dy += Math.cos(w * 11) * .006; break; case 'float': A.dy += .015 * Math.sin(w * .6); break;
      case 'heart': { const k = (lt * 1.4) % 1; A.s *= 1 + .07 * (Math.exp(-Math.pow((k - .12) * 14, 2)) + .6 * Math.exp(-Math.pow((k - .3) * 14, 2))); break; }
      case 'breathe': A.s *= 1.03 + .03 * Math.sin(w * .35); break;
    }
  }
  return A;
}

// ---------- pixel pass: tone / curves / colour wheel / HSL / chroma key ----------
const ADJ0 = () => ({ temp: 0, tint: 0, shadow: 0, high: 0, white: 0, black: 0, bril: 0, clarity: 0, fade: 0, grain: 0 });
function adjActive(it) {
  const a = it.adj; if (!a) return false;
  for (const k of ['temp', 'tint', 'shadow', 'high', 'white', 'black', 'bril', 'clarity', 'fade', 'grain']) if (a[k]) return true;
  if (a.curve) for (const k in a.curve) { const c = a.curve[k]; if (c && c.length && !(c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1)) return true; }
  if (a.wheel) for (const k in a.wheel) { const w = a.wheel[k]; if (w && (w.s || w.l)) return true; }
  if (a.hsl) for (const k in a.hsl) { const h = a.hsl[k]; if (h && (h.h || h.s || h.l)) return true; }
  return false;
}
function curveLut(pts) {   // monotone cubic through points (x 0..1) -> Float32Array(256)
  const P = pts.slice().sort((p, q) => p[0] - q[0]); const n = P.length; const out = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i / 255; return out; }
  const dx = [], m = [], d = []; for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, P[i + 1][0] - P[i][0]); d[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; } else { const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b); if (h > 3) { m[i] = 3 * a / h * d[i]; m[i + 1] = 3 * b / h * d[i]; } } }
  for (let i = 0; i < 256; i++) {
    const x = i / 255; let k = 0; while (k < n - 2 && x > P[k + 1][0]) k++;
    if (x <= P[0][0]) { out[i] = P[0][1]; continue; } if (x >= P[n - 1][0]) { out[i] = P[n - 1][1]; continue; }
    const h = dx[k], tt = (x - P[k][0]) / h, t2 = tt * tt, t3 = t2 * tt;
    out[i] = (2 * t3 - 3 * t2 + 1) * P[k][1] + (t3 - 2 * t2 + tt) * h * m[k] + (-2 * t3 + 3 * t2) * P[k + 1][1] + (t3 - t2) * h * m[k + 1];
  }
  return out;
}
function hue2rgb01(h) { h = ((h % 360) + 360) % 360 / 60; const c = 1 - Math.abs(h % 2 - 1); const [r, g, b] = h < 1 ? [1, c, 0] : h < 2 ? [c, 1, 0] : h < 3 ? [0, 1, c] : h < 4 ? [0, c, 1] : h < 5 ? [c, 0, 1] : [1, 0, c]; return [r, g, b]; }
const HSL_BANDS = [0, 30, 60, 120, 180, 240, 280, 320];
const _ADJC = {};
function adjBuild(it) {
  const a = it.adj || {}; const key = JSON.stringify(a); let c = _ADJC[it.id]; if (c && c.key === key) return c;
  const L = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)];
  const cl = a.curve || {}; const cM = cl.l && cl.l.length ? curveLut(cl.l) : null; const cC = [cl.r, cl.g, cl.b].map(p => p && p.length ? curveLut(p) : null);
  const W = a.wheel || {}; const tint = k => { const w = W[k]; if (!w || !w.s) return [0, 0, 0]; const [r, g, b] = hue2rgb01(w.h || 0); return [(r - .5) * 2 * w.s, (g - .5) * 2 * w.s, (b - .5) * 2 * w.s]; };
  const tS = tint('s'), tM = tint('m'), tH = tint('h'); const lS = (W.s && W.s.l) || 0, lM = (W.m && W.m.l) || 0, lH = (W.h && W.h.l) || 0;
  const g = z => Math.exp(-z * z);
  for (let i = 0; i < 256; i++) {
    const x0 = i / 255; let x = x0;
    x += .25 * ((a.shadow || 0) / 100 * g((x0 - .2) / .2) + (a.high || 0) / 100 * g((x0 - .8) / .2) + (a.black || 0) / 100 * g(x0 / .15) + (a.white || 0) / 100 * g((x0 - 1) / .15));
    x += .18 * (a.bril || 0) / 100 * (g((x0 - .2) / .25) - .6 * g((x0 - .8) / .25));
    x += .35 * (a.clarity || 0) / 100 * (x0 - .5) * (1 - Math.abs(2 * x0 - 1));
    if (a.fade) x = x * (1 - .2 * a.fade / 100) + .2 * a.fade / 100 * .9;
    const wS = (1 - x0) * (1 - x0), wM = 4 * x0 * (1 - x0), wH = x0 * x0;
    for (let ch = 0; ch < 3; ch++) {
      let v = x + wS * (tS[ch] * .3 + lS * .2) + wM * (tM[ch] * .3 + lM * .2) + wH * (tH[ch] * .3 + lH * .2);
      if (ch === 0) v += (a.temp || 0) / 100 * .09 + (a.tint || 0) / 100 * .03; if (ch === 2) v -= (a.temp || 0) / 100 * .09 - (a.tint || 0) / 100 * .03; if (ch === 1) v -= (a.tint || 0) / 100 * .06;
      v = clamp(v, 0, 1); if (cM) v = cM[Math.round(v * 255)]; if (cC[ch]) v = cC[ch][Math.round(clamp(v, 0, 1) * 255)];
      L[ch][i] = Math.round(clamp(v, 0, 1) * 255);
    }
  }
  const hsl = a.hsl || {}; let hslOn = false; const dh = new Float32Array(360), ds = new Float32Array(360), dl = new Float32Array(360);
  const names = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
  for (let hh = 0; hh < 360; hh++) for (let b = 0; b < 8; b++) {
    const v = hsl[names[b]]; if (!v || !(v.h || v.s || v.l)) continue; hslOn = true;
    let dd = Math.abs(hh - HSL_BANDS[b]); if (dd > 180) dd = 360 - dd; const w = Math.max(0, 1 - dd / 45); if (!w) continue;
    dh[hh] += (v.h || 0) / 100 * 35 * w; ds[hh] += (v.s || 0) / 100 * w; dl[hh] += (v.l || 0) / 100 * w;
  }
  c = _ADJC[it.id] = { key, L, hslOn, dh, ds, dl, grain: (a.grain || 0) / 100, identity: false }; return c;
}
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hsl2rgb(h, s, l) { h = ((h % 360) + 360) % 360 / 360; if (!s) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
function pixelPass(buf, it, W, H, t) {
  const c = buf.ctx; const im = c.getImageData(0, 0, W, H); const d = im.data, n = d.length;
  const ck = it.chroma && it.chroma.on ? it.chroma : null;
  if (ck) {
    const [kr, kg, kb] = (() => { const h = (ck.color || '#00ff00').replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; })();
    const kcb = -.1687 * kr - .3313 * kg + .5 * kb, kcr = .5 * kr - .4187 * kg - .0813 * kb; const tol = (ck.tol ?? .3) * 110, soft = Math.max(1, (ck.soft ?? .15) * 110);
    for (let i = 0; i < n; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]; const cb = -.1687 * r - .3313 * g + .5 * b, cr = .5 * r - .4187 * g - .0813 * b; const dist = Math.hypot(cb - kcb, cr - kcr);
      if (dist < tol + soft) { const a = dist <= tol ? 0 : (dist - tol) / soft; d[i + 3] *= a; if (a > 0 && a < 1) { const gm = (r + b) / 2; if (g > gm) d[i + 1] = gm + (g - gm) * a; } }
    }
  }
  if (adjActive(it)) {
    const A = adjBuild(it); const [Lr, Lg, Lb] = A.L; const gr = A.grain;
    for (let i = 0; i < n; i += 4) {
      if (!d[i + 3]) continue; let r = d[i], g = d[i + 1], b = d[i + 2];
      if (A.hslOn) { const [h, s, l] = rgb2hsl(r, g, b); const hi = Math.floor(h) % 360; const ns = clamp(s * (1 + A.ds[hi]), 0, 1), nl = clamp(l + A.dl[hi] * .3 * (1 - Math.abs(2 * l - 1)), 0, 1); [r, g, b] = hsl2rgb(h + A.dh[hi], ns, nl); }
      r = Lr[r | 0]; g = Lg[g | 0]; b = Lb[b | 0];
      if (gr) { const nz = (Math.random() - .5) * 90 * gr; r += nz; g += nz; b += nz; }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  c.putImageData(im, 0, 0);
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
    case 'blur': ctx.globalAlpha *= p; ex.blur = (1 - p) * 22 * (Math.min(W, H) / 1080); break;
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
  if (it.blend && it.blend !== 'source-over') { ctx.save(); ctx.globalCompositeOperation = it.blend; try { drawMediaItem0(ctx, it, t, W, H); } finally { ctx.restore(); } }
  else drawMediaItem0(ctx, it, t, W, H);
}
function drawMediaItem0(ctx, it, t, W, H) {
  const lt = t - it.start; const tr = it.transIn;
  let T = null, p = 1;
  if (tr && tr.type && tr.type !== 'none' && lt < tr.dur) { T = tr.type; p = clamp(lt / tr.dur, 0, 1); }
  const f = it.fx || {}, mk = it.mask || {};
  const needBuf = (T && TRANS[T] && TRANS[T].buf) || f.vignette > 0 || f.glitch > 0 || f.pain || FX_BUF_TYPES.has(mk.type) || adjActive(it) || (it.chroma && it.chroma.on);
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
  if (!drawMediaContent(buf.ctx, it, t, W, H, T === 'blur' ? { blur: (1 - p) * 22 * Math.min(W, H) / 1080 } : {})) return;
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
    if (T === 'wipeBlur') { ctx.filter = `blur(${((1 - p) * 8 * Math.min(W, H) / 1080).toFixed(1)}px)`; }
    ctx.drawImage(buf, 0, 0); ctx.filter = 'none';
  } else if (T === 'card3d') {
    const card = getBuf(1, W, H), cc = card.ctx; const k = .9, b = 14 * Math.min(W, H) / 1080;
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
function layoutText(ctx, it, W, H) {
  const size = it.size * Math.min(W, H) / 1080; ctx.font = `${it.weight || 700} ${size}px ${it.font || FONT_STACK}`;
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
  if (it.font && it.font.indexOf('"LF-') >= 0) lfNeed(it.font);
  const ap = textAnimParams(it, lt, W, H);
  if (ap.a <= 0.001) return;
  const L = layoutText(ctx, it, W, H); const { rows, size, lineH } = L;
  const totalH = rows.length * lineH;
  const xs = prop(it, 's', t), xx = prop(it, 'x', t), yy = prop(it, 'y', t), rr = prop(it, 'r', t), oo = prop(it, 'o', t);
  const cx = W / 2 + xx * W + ap.dx, cy = (it.ay ?? .5) * H + yy * H + ap.dy;
  const blockW = Math.max(0, ...rows.map(r => r.w));
  BOUNDS[it.id] = bsc({ cx, cy, w: blockW + 40, h: totalH + 20, rot: rr });
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
    const TAm = taOn(it) ? taMode(it) : null, TAn = TAm ? taCount(it, rows) : 0; let TAi = 0;
    let KWi = 0;   // v1.41+: karaoke highlight — it.kar = { t:[start..], e:[end..], c:colour, mode:'cur'|'acc' } (times relative to the clip start, one per spoken word / token)   // v1.41 text animation pack (see 14-textfx.js)
    rows.forEach((row, ri) => {
      let rowAlpha = 1;
      if (row.li >= 1 && it.reveal > 0) { const q = clamp((lt - it.reveal * row.li) / .25, 0, 1); rowAlpha = q; if (q <= 0) return; }
      const y = (ri - (rows.length - 1) / 2) * lineH;
      const base = (row.li === 0 || it.sub) ? it.color : (it.color2 || it.color);   // v1.55: the 2nd row of a caption keeps the normal colour (colour2 is the karaoke highlight there)
      let x0 = it.align === 'left' ? -blockW / 2 : it.align === 'right' ? blockW / 2 - row.w : -row.w / 2;
      if (it.box === 'line' || it.box === 'line2') {
        const bg = (it.box === 'line2' && row.li > 0) ? (it.bg2 || '#E02B3A') : it.bg; const pad = size * .36;
        if (bg && ei === 0) { ctx.save(); ctx.globalAlpha *= rowAlpha; ctx.fillStyle = bg; rrPath(ctx, x0 - pad, y - lineH / 2 + lineH * .06, row.w + pad * 2, lineH * .88, size * .22); ctx.fill(); ctx.restore(); }
      }
      let x = x0;
      // paint one string at px; P = optional per-unit animation params, gb = [left, width] of the animated group (for wipes)
      const paint = (s2, px, col, P, gb) => {
        ctx.textAlign = 'left'; ctx.save(); ctx.globalAlpha *= rowAlpha * (P ? clamp(P.a, 0, 1) : 1);
        if (P && P.blur > .3) ctx.filter = `blur(${P.blur.toFixed(1)}px)`;
        if (P && P.clip != null && gb) { ctx.beginPath(); ctx.rect(gb[0] - size * .3, y - lineH / 2, (gb[1] + size * .6) * P.clip, lineH); ctx.clip(); }
        if (it.shadow && ei === 0) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = size * .18; ctx.shadowOffsetY = size * .05; }
        const gc = (P && P.glow) ? (it.glow || it.color2 || '#ffffff') : it.glow, gm = (P && P.glow) ? P.glow.m : 1;
        if (gc && ei === 0) { ctx.save(); ctx.shadowColor = gc; ctx.shadowBlur = size * .5 * gm; ctx.fillStyle = gc; ctx.fillText(s2, px, y); ctx.shadowBlur = size * .22 * gm; ctx.fillText(s2, px, y); ctx.restore(); }
        if (P && P.ghost) P.ghost.forEach(g => { ctx.save(); ctx.globalAlpha *= g.a; ctx.fillStyle = g.col; ctx.fillText(s2, px + g.dx, y + g.dy); ctx.restore(); });
        if (it.stroke && it.strokeW) { ctx.lineWidth = it.strokeW * Math.min(W, H) / 1080; ctx.strokeStyle = it.stroke; ctx.strokeText(s2, px, y); ctx.shadowColor = 'transparent'; }
        let fill = col;
        if (P && P.hue != null) fill = `hsl(${P.hue.toFixed(0)},95%,62%)`;
        else if (P && P.shine != null) { const g = ctx.createLinearGradient(-blockW / 2, 0, blockW / 2, 0), q = P.shine, lo = clamp(q - .1, 0, 1), mid = clamp(q, 0, 1), hi = clamp(q + .1, 0, 1); g.addColorStop(0, col); g.addColorStop(lo, col); g.addColorStop(mid, '#ffffff'); g.addColorStop(hi, col); g.addColorStop(1, col); fill = g; }
        ctx.fillStyle = fill; ctx.fillText(s2, px, y); ctx.restore();
      };
      // run paint inside the unit's own transform (about its centre)
      const unit = (s2, px, uw, col, idx, gb) => {
        const P = taParams(it, lt, idx, TAn, size); const ucx = px + uw / 2;
        ctx.save(); ctx.translate(ucx + P.dx, y + P.dy); if (P.r) ctx.rotate(P.r * Math.PI / 180); ctx.scale(P.s * P.sx, P.s * P.sy); ctx.translate(-ucx, -y);
        paint(s2, px, col, P, gb || [px, uw]); ctx.restore();
      };
      row.toks.forEach(k => {
        let str = k.s;
        if (limit !== Infinity) { const n = [...str].length; if (shown >= limit) { x += k.w; return; } if (shown + n > limit) str = [...str].slice(0, limit - shown).join(''); shown += n; }
        let col = k.hl ? (row.li === 0 ? (it.color2 || '#FFE14D') : it.color) : base;
        if (it.kar && !/^\s+$/.test(k.s)) { const wi = KWi++, ka = it.kar; const on = ka.mode === 'acc' ? lt >= ka.t[wi] : (lt >= ka.t[wi] && lt < (ka.e[wi] ?? 1e9)); if (on) col = ka.c || it.color2 || '#FFE14D'; }
        if (TAm && !/^\s+$/.test(str)) {
          if (TAm === 'char') { const gs = taGraphemes(str); gs.forEach((g, gi) => { const gx = x + ctx.measureText(str.slice(0, g.off)).width, gw = ctx.measureText(g.s).width; unit(g.s, gx, gw, col, TAi++); }); }
          else if (TAm === 'line') unit(str, x, k.w, col, ri, [x0, row.w]);
          else unit(str, x, k.w, col, TAi++);
        } else paint(str, x, col, null);
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
  const S = it.size * Math.min(W, H) / 1080; const xs = prop(it, 's', t), xx = prop(it, 'x', t), yy = prop(it, 'y', t), rr = prop(it, 'r', t), oo = prop(it, 'o', t);
  const cx = W / 2 + xx * W + ap.dx, cy = (it.ay ?? .5) * H + yy * H + ap.dy;
  BOUNDS[it.id] = bsc({ cx, cy, w: S, h: S, rot: rr });
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
    case 'burst': { const n = 14; ctx.rotate(lt * .5); ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n, rad = i % 2 ? r * .52 : r; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); break; }
    case 'rays': { ctx.fillStyle = col; for (let i = 0; i < 9; i++) { ctx.save(); ctx.rotate(-Math.PI / 2 + (i - 4) * .3); ctx.beginPath(); ctx.moveTo(r * .2, -S * .035); ctx.lineTo(r, 0); ctx.lineTo(r * .2, S * .035); ctx.closePath(); ctx.fill(); ctx.restore(); } break; }
    case 'grid': { ctx.rotate(.12); ctx.fillStyle = col; ctx.fillRect(-r * .8, -r * .8, r * 1.6, r * 1.6); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = S * .012; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(-r * .8, i * r * .23); ctx.lineTo(r * .8, i * r * .23); ctx.moveTo(i * r * .23, -r * .8); ctx.lineTo(i * r * .23, r * .8); ctx.stroke(); } break; }
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
  twRebuild();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (const tr of layerOrder()) {
    if (trSt(tr).hide) continue;
    for (const it of activeAt(tr, t)) {
      if (it.hidden) continue;
      if (it.type === 'video' || it.type === 'image') drawMediaItem(ctx, it, t, W, H);
      else if (it.type === 'text') drawText(ctx, it, t, W, H);
      else if (it.type === 'sticker') drawSticker(ctx, it, t, W, H);
    }
  }
}
