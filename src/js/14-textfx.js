'use strict';
// ============================================================
//  v1.41 — text animation pack (CapCut / Premiere-style one-click text animations)
//  A text clip can carry it.tanim = { id, d, mode }.  The text is split into units (word / character / line); every unit gets its own
//  progress p (0..1, staggered over d seconds) and the effect turns p into alpha / offset / scale / rotation / blur / glow / colour.
//  Lao & Thai have no spaces, so we split with Intl.Segmenter and keep vowel marks together with their consonant.
// ============================================================
const _P0 = () => ({ a: 1, dx: 0, dy: 0, s: 1, sx: 1, sy: 1, r: 0, blur: 0 });
const TAX = [
  { id: 'fade', label: 'เลือนเข้าทีละคำ', mode: 'word', d: 1.0, fn: p => ({ a: p }) },
  { id: 'rise', label: 'ลอยขึ้นทีละคำ', mode: 'word', d: 1.0, fn: (p, c) => ({ a: p, dy: (1 - EASE.out(p)) * .7 * c.size }) },
  { id: 'pop', label: 'ป๊อปทีละคำ', mode: 'word', d: .9, fn: p => ({ s: lerp(.3, 1, EASE.back(p)), a: Math.min(1, p * 3) }) },
  { id: 'drop', label: 'ตกลงมาเด้ง', mode: 'word', d: 1.1, fn: (p, c) => ({ dy: -(1 - EASE.bounce(p)) * 1.4 * c.size, a: Math.min(1, p * 4) }) },
  { id: 'blur', label: 'มัวแล้วชัด', mode: 'word', d: 1.0, fn: (p, c) => ({ blur: (1 - p) * c.size * .35, a: p }) },
  { id: 'slide', label: 'สไลด์เข้าทีละคำ', mode: 'word', d: 1.0, fn: (p, c) => ({ dx: -(1 - EASE.out(p)) * 1.6 * c.size, a: p }) },
  { id: 'zoom', label: 'ซูมเข้าทีละคำ', mode: 'word', d: .9, fn: p => ({ s: lerp(2.4, 1, EASE.out(p)), a: p }) },
  { id: 'spin', label: 'หมุนเข้าทีละคำ', mode: 'word', d: 1.0, fn: p => ({ r: (1 - EASE.out(p)) * -90, s: lerp(.3, 1, EASE.out(p)), a: p }) },
  { id: 'type', label: 'พิมพ์ดีด', mode: 'char', d: 1.6, ud: .02, fn: p => ({ a: p >= 1 ? 1 : 0 }) },
  { id: 'wave', label: 'คลื่นลอยตลอด', mode: 'word', d: .8, fn: (p, c) => ({ a: p, dy: Math.sin(c.lt * 5 + c.i * .8) * .13 * c.size * p }) },
  { id: 'shine', label: 'แสงพาดผ่าน', mode: 'word', d: .6, fn: (p, c) => ({ a: Math.min(1, p * 3), shine: ((c.lt * .8) % 1.9) - .35 }) },
  { id: 'glow', label: 'เรืองแสงกะพริบ', mode: 'word', d: .8, fn: (p, c) => ({ a: p, glow: { m: .55 + .45 * Math.sin(c.lt * 5 + c.i * .5) } }) },
  { id: 'neon', label: 'นีออนติดๆ ดับๆ', mode: 'word', d: 1.2, fn: (p, c) => ({ a: p <= 0 ? 0 : (p >= 1 ? 1 : (Math.sin(c.lt * 47 + c.i * 9) > .15 ? 1 : .12)), glow: { m: p >= 1 ? 1 : .6 } }) },
  { id: 'rainbow', label: 'ไล่สีรุ้ง', mode: 'word', d: .8, fn: (p, c) => ({ a: p, hue: (c.lt * 140 + c.i * 38) % 360 }) },
  { id: 'impact', label: 'กระแทกเข้า', mode: 'word', d: .8, fn: (p, c) => ({ s: lerp(3, 1, EASE.out(p)), a: Math.min(1, p * 4), dx: p < 1 ? Math.sin(c.lt * 70) * .06 * c.size * (1 - p) : 0 }) },
  { id: 'glitch', label: 'กลิตช์', mode: 'word', d: .9, fn: (p, c) => { const g = (1 - p) + (Math.sin(c.lt * 31 + c.i) > .93 ? .6 : 0); return { a: p > 0 ? 1 : 0, dx: g > .1 ? Math.sin(c.lt * 90 + c.i) * .05 * c.size * g : 0, ghost: g > .1 ? [{ dx: -g * .1 * c.size, dy: 0, col: '#ff2a55', a: .8 }, { dx: g * .1 * c.size, dy: 0, col: '#18e6ff', a: .8 }] : null }; } },
  { id: 'cine', label: 'ชื่อเรื่องหรู (ขยายออก)', mode: 'word', d: 2.0, ud: 1.6, fn: (p, c) => ({ a: EASE.out(p), dx: -(c.i - (c.n - 1) / 2) * .5 * c.size * (1 - EASE.out(p)) }) },
  { id: 'elastic', label: 'ยืดเด้งสปริง', mode: 'word', d: 1.1, fn: p => ({ sy: lerp(.1, 1, EASE.elastic(p)), sx: 1 + (1 - EASE.elastic(p)) * .35, a: Math.min(1, p * 5) }) },
  { id: 'write', label: 'ปาดเขียนซ้ายไปขวา', mode: 'line', d: 1.2, fn: p => ({ clip: EASE.io(p), a: p > 0 ? 1 : 0 }) },
  { id: 'flip', label: 'พลิกการ์ด', mode: 'word', d: 1.0, fn: p => ({ sy: Math.sin(p * Math.PI / 2), a: p > 0 ? 1 : 0 }) },
  { id: 'lineup', label: 'เลื่อนขึ้นทั้งแถว', mode: 'line', d: .8, fn: (p, c) => ({ dy: (1 - EASE.out(p)) * 1.0 * c.size, a: p }) },
  { id: 'pulse', label: 'เต้นตามจังหวะ', mode: 'word', d: .8, fn: (p, c) => ({ s: lerp(.4, 1, EASE.back(p)) * (1 + Math.max(0, Math.sin(c.lt * 6 + c.i * .5)) * .08), a: Math.min(1, p * 3) }) },
];
const TAX_BY = {}; TAX.forEach(f => TAX_BY[f.id] = f);
const TA_MODES = [['word', 'ทีละคำ'], ['char', 'ทีละตัวอักษร'], ['line', 'ทั้งแถว']];
let _gseg = null;
const _isLoTh = s => /[฀-໿]/.test(s);
const _PREFIX_V = /^[เ-ไເ-ໄ]$/;   // Thai เแโใไ / Lao ເແໂໃໄ are written before their consonant
function taGraphemes(str) {   // [{s, off}] — Lao/Thai prefix vowels stay glued to the next cluster
  let gs; try { _gseg = _gseg || new Intl.Segmenter(undefined, { granularity: 'grapheme' }); gs = [..._gseg.segment(str)].map(x => ({ s: x.segment, off: x.index })); } catch (e) { let o = 0; gs = [...str].map(ch => { const g = { s: ch, off: o }; o += ch.length; return g; }); }
  const out = []; for (let i = 0; i < gs.length; i++) { let g = gs[i]; while (_PREFIX_V.test(g.s) && i + 1 < gs.length) { const nx = gs[++i]; g = { s: g.s + nx.s, off: g.off }; } out.push(g); }
  return out;
}
const taOn = it => !!(it && it.tanim && TAX_BY[it.tanim.id]);
function taMode(it) { return (it.tanim && it.tanim.mode) || TAX_BY[it.tanim.id].mode; }
// number of units in the whole text (needed for the stagger)
function taCount(it, rows) {
  const mode = taMode(it); let n = 0;
  if (mode === 'line') return rows.length;
  rows.forEach(r => r.toks.forEach(k => { if (/^\s+$/.test(k.s)) return; n += mode === 'char' ? taGraphemes(k.s).length : 1; }));
  return n;
}
function taParams(it, lt, unitIdx, n, size) {
  const fx = TAX_BY[it.tanim.id]; const d = Math.max(.15, it.tanim.d || fx.d); const ud = fx.ud ? Math.min(fx.ud, d) : Math.max(.25, d * .5);
  const stag = n > 1 ? Math.max(0, (d - ud) / (n - 1)) : 0; const p = clamp((lt - unitIdx * stag) / ud, 0, 1);
  return Object.assign(_P0(), fx.fn(p, { lt, i: unitIdx, n, size, d }));
}
function taSet(it, id) {
  if (!it || it.type !== 'text') return false;
  if (!id || id === 'none') delete it.tanim; else { const fx = TAX_BY[id]; if (!fx) return false; it.tanim = { id, d: fx.d, mode: fx.mode }; it.anim = Object.assign({}, it.anim || {}, { in: 'none' }); }
  commit('tanim'); renderInspector();
  if (it.tanim) { seek(it.start); play(); setTimeout(() => { if (PB.playing && PB.t < it.start + it.dur) { } }, 0); setTimeout(() => { if (PB.t > it.start + (it.tanim ? it.tanim.d : 1) + 1.2) pause(); }, 3500); }
  return true;
}

// ---------- gallery dialog ----------
const TAG = { raf: 0, t0: 0, sel: null, last: 0 };
function taSample() {
  const it = SEL ? getItem(SEL) : null; if (it && it.type === 'text' && String(it.text || '').trim()) return String(it.text).split('\n')[0].replace(/\*/g, '').slice(0, 14);
  return T('ข้อความตัวอย่าง');
}
function taPreviewItem(fx, text) {
  const base = SEL && getItem(SEL) && getItem(SEL).type === 'text' ? getItem(SEL) : null;
  const it = mkText('clean', text, 0, 6, { ay: .5, anim: { in: 'none' }, size: 96, strokeW: 12, maxW: .98, weight: 800 });
  if (base) { ['color', 'color2', 'stroke', 'glow', 'font', 'weight', 'shadow'].forEach(k => { if (base[k] != null) it[k] = base[k]; }); if (base.strokeW) it.strokeW = base.strokeW * 96 / (base.size || 60); }
  it.tanim = { id: fx.id, d: fx.d, mode: fx.mode }; return it;
}
function taDrawTile(cv, fx, ph, text) {
  const W = 540, H = 960; if (!VP.tpc) { VP.tpc = document.createElement('canvas'); VP.tpc.width = W; VP.tpc.height = H; }
  const c = VP.tpc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, W, H);
  const it = taPreviewItem(fx, text); const hold = 1.4, loop = (it.tanim.d + hold); const t = ph * loop;
  try { drawText(c, it, t, W, H); } catch (e) { console.warn(e); } delete BOUNDS[it.id];
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(VP.tpc, 20, 399, 500, 162, 0, 0, cv.width, cv.height);
}
async function taOpen() {
  await pvSamples();
  const dlg = $('#dlgTA'); const grid = $('#taGrid'); const text = taSample(); TAG.text = text;
  grid.innerHTML = TAX.map(f => `<button class="tatile" data-id="${f.id}"><canvas width="250" height="81"></canvas><span>${esc(T(f.label))}</span></button>`).join('');
  const cur = SEL && getItem(SEL) && getItem(SEL).tanim ? getItem(SEL).tanim.id : '';
  $$('#taGrid .tatile').forEach(b => b.classList.toggle('on', b.dataset.id === cur));
  dlg.showModal(); TAG.t0 = performance.now(); TAG.last = 0;
  const loop = now => {
    if (!dlg.open) { TAG.raf = 0; return; }
    if (now - TAG.last > 55) { TAG.last = now; $$('#taGrid .tatile').forEach((b, i) => { const fx = TAX[i]; const loopT = fx.d + 1.4; const ph = (((now - TAG.t0) / 1000 + i * .13) % loopT) / loopT; taDrawTile($('canvas', b), fx, ph, TAG.text); }); }
    TAG.raf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(TAG.raf); TAG.raf = requestAnimationFrame(loop);
}
function taPick(id) {
  let it = SEL ? getItem(SEL) : null;
  if (!it || it.type !== 'text') it = addText('clean', T('ข้อความตัวอย่าง'), PB.t, 3);
  $('#dlgTA').close(); taSet(it, id);
}
function taInit() {
  $('#taGrid').onclick = e => { const b = e.target.closest('.tatile'); if (b) taPick(b.dataset.id); };
  $('#taClose').onclick = () => $('#dlgTA').close();
  $('#taNone').onclick = () => { const it = SEL ? getItem(SEL) : null; $('#dlgTA').close(); if (it && it.type === 'text') taSet(it, 'none'); };
  $('#dlgTA').addEventListener('close', () => { cancelAnimationFrame(TAG.raf); TAG.raf = 0; });
}
