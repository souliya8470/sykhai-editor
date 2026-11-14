// ============================================================
//  v1.57 — text look pack ("แพ็กข้อความ"): ready-made looks = Lao font + gradient fill + outline / 3D / glow + text animation.
//  · click a tile  → a new text at the playhead      · drag a tile onto the timeline or onto the preview (onto an existing text = change its look)
//  · tpkOpen(it)   → the same pack as a dialog that CHANGES the look of the selected text (text, time and position stay)
//  Every look is just plain text-item properties (it.grad / it.ext / it.glow / it.stroke / it.font / it.tanim …), so everything stays editable.
// ============================================================
const TPG = (c, a) => ({ c, a });
const TPACK = [
  { id: 'gold', label: 'ทองหรู', f: 'Banteay', ta: 'shine', d: { size: 120, grad: TPG(['#FFF4B8', '#F5C242', '#B87A10'], 90), color: '#F5C242', stroke: '#4a2a00', strokeW: 5, ext: { c: '#5b3300', d: .05 }, shadow: true } },
  { id: 'goldscript', label: 'ทองตัวเขียน', f: 'Krathong', ta: 'rise', d: { size: 112, grad: TPG(['#FFF6C9', '#F0B93A', '#C98512'], 90), color: '#F0B93A', glow: '#ff9f1a' } },
  { id: 'champagne', label: 'แชมเปญ เรียบหรู', f: 'Apsara', ta: 'cine', d: { size: 120, grad: TPG(['#FFFFFF', '#F2D9A0'], 90), color: '#F7EACB', shadow: true } },
  { id: 'emerald', label: 'ทองเรืองแสงเขียว', f: 'Banteay', ta: 'cine', d: { size: 118, grad: TPG(['#FFF3B0', '#D4A72C'], 90), color: '#E6C35C', glow: '#1bb36b' } },
  { id: 'sale', label: 'ลดแรง แดงไฟ', f: 'PreahNeak', ta: 'impact', text: 'ลดราคา', d: { size: 124, grad: TPG(['#FFF59D', '#FF5252'], 90), color: '#FF9E80', stroke: '#6b0000', strokeW: 9, ext: { c: '#a30000', d: .07 } } },
  { id: 'fire', label: 'ไฟลุก', f: 'TimberBrush', ta: 'pulse', d: { size: 126, grad: TPG(['#FFF59D', '#FF9100', '#E53935'], 90), color: '#FF9100', glow: '#ff6d00' } },
  { id: 'price', label: 'ราคาเด้ง เหลือง', f: 'Banteay', ta: 'drop', text: 'ราคาพิเศษ', d: { size: 116, grad: TPG(['#FFFDE7', '#FFD600'], 90), color: '#FFE74C', stroke: '#000000', strokeW: 11, ext: { c: '#000000', d: .05 } } },
  { id: 'tagred', label: 'ป้ายแดง ตัวขาว', f: 'WatPhou', ta: 'elastic', d: { size: 80, color: '#ffffff', box: 'block', bg: '#E0143C', ay: .25, shadow: true } },
  { id: 'neonpink', label: 'นีออนชมพู', f: 'NamOu', ta: 'neon', d: { size: 112, grad: TPG(['#FFFFFF', '#FF8FE9'], 90), color: '#ffc4f3', glow: '#ff2bd6' } },
  { id: 'neonblue', label: 'นีออนฟ้า', f: 'Suksa', ta: 'glow', d: { size: 112, grad: TPG(['#FFFFFF', '#8FDCFF'], 90), color: '#bfeaff', glow: '#00b7ff' } },
  { id: 'neongreen', label: 'เขียวเรืองแสง', f: 'WoodlandHook', ta: 'glow', d: { size: 116, grad: TPG(['#F2FFF8', '#5CFFA8'], 90), color: '#a6ffd2', glow: '#18ff8a' } },
  { id: 'sunset', label: 'พระอาทิตย์ตก', f: 'PreahNeak', ta: 'rise', d: { size: 120, grad: TPG(['#FFE259', '#FF7A59', '#C33764'], 90), color: '#FF7A59', shadow: true } },
  { id: 'ocean', label: 'ฟ้า-ม่วง ไล่สี', f: 'Hankha', ta: 'blur', d: { size: 120, grad: TPG(['#00E5FF', '#7C4DFF'], 0), color: '#5aa0ff', glow: '#7c4dff' } },
  { id: 'candy', label: 'ลูกกวาดชมพู', f: 'TadFane', ta: 'pop', d: { size: 118, grad: TPG(['#FF9DE6', '#8F6BFF'], 90), color: '#c58bff', stroke: '#ffffff', strokeW: 9, shadow: true } },
  { id: 'mint', label: 'เขียวมิ้นต์ สุขภาพ', f: 'WatPhou', ta: 'softw', d: { size: 116, grad: TPG(['#F1FFF7', '#37D883'], 90), color: '#9af0c4', stroke: '#05482a', strokeW: 7, shadow: true } },
  { id: 'impactw', label: 'ขาวหนา ขอบดำ', f: 'TadFane', ta: 'impact', d: { size: 124, color: '#ffffff', stroke: '#000000', strokeW: 14, shadow: true } },
  { id: 'impacty', label: 'เหลืองหนา ขอบดำ', f: 'PreahNeak', ta: 'zoom', d: { size: 124, grad: TPG(['#FFFBB0', '#FFD400'], 90), color: '#FFE74C', stroke: '#000000', strokeW: 14 } },
  { id: 'comic', label: 'การ์ตูนป๊อป', f: 'BanGuesthouse', ta: 'elastic', d: { size: 112, color: '#ffffff', stroke: '#2b2be0', strokeW: 11, ext: { c: '#2b2be0', d: .06 } } },
  { id: 'retro', label: 'ย้อนยุค ส้ม-ครีม', f: 'Krathong', ta: 'drop', d: { size: 112, grad: TPG(['#FFF1CC', '#FF9A3C'], 90), color: '#FFC27A', stroke: '#5a1f00', strokeW: 8, ext: { c: '#5a1f00', d: .08 } } },
  { id: 'outline', label: 'ตัวเส้นขอบ', f: 'PreahNeak', ta: 'write', d: { size: 120, color: 'rgba(255,255,255,0)', stroke: '#ffffff', strokeW: 5 } },
  { id: 'soft', label: 'ขาวนุ่ม เบลอเข้า', f: 'NotoSansLao', w: 700, ta: 'blur', d: { size: 100, color: '#ffffff', shadow: true } },
  { id: 'cinema', label: 'ชื่อเรื่องหนัง', f: 'Sila', ta: 'cine', d: { size: 112, color: '#ffffff', glow: '#ffd9a0' } },
  { id: 'cyber', label: 'ไซเบอร์ กลิตช์', f: 'Kamphaeng', ta: 'glitch', d: { size: 112, color: '#ffffff', glow: '#00e5ff' } },
  { id: 'rainbow', label: 'รุ้งเปลี่ยนสี', f: 'Hankha', ta: 'rainbow', d: { size: 120, color: '#ffffff', stroke: '#000000', strokeW: 8, shadow: true } },
  { id: 'taggreen', label: 'ป้ายเขียว ตัวขาว', f: 'Suksa', ta: 'lineup', d: { size: 76, color: '#ffffff', box: 'block', bg: '#0E7A5F', ay: .25 } },
  { id: 'lower', label: 'แถบชื่อ ล่างจอ', f: 'WatPhou', ta: 'write', d: { size: 64, color: '#ffffff', box: 'line', bg: '#000000d9', ay: .82 } },
];
const TPK_BY = {}; TPACK.forEach(p => TPK_BY[p.id] = p);
const tpkText = pk => T(pk.text || 'ข้อความ');

// text-item properties of a look (everything a look may set is reset first, so a look never inherits the old one)
function tpkProps(pk) {
  const d = JSON.parse(JSON.stringify(pk.d));
  const o = Object.assign({ stroke: '', strokeW: 0, box: 'none', bg: '', shadow: false, glow: null, grad: null, ext: null, ay: .42, weight: pk.w || 400 }, d);
  o.color2 = o.color; o.font = pk.f ? lfStack(pk.f) : FONT_STACK; o.pack = pk.id;
  return o;
}
function tpkSetAnim(it, pk) {
  if (pk.ta && TAX_BY[pk.ta]) { const fx = TAX_BY[pk.ta]; it.tanim = { id: fx.id, d: fx.d, mode: fx.mode }; it.anim = { in: 'none', out: 'fade', d: .25 }; }
  else { delete it.tanim; it.anim = { in: 'pop', out: 'fade', d: .25 }; }
}
function tpkMake(pk, text, start, dur) {
  const it = mkText('clean', text == null ? tpkText(pk) : text, start, dur, tpkProps(pk)); tpkSetAnim(it, pk); return it;
}
function tpkAdd(pk, o) {
  o = o || {}; const start = o.start == null ? PB.t : o.start, dur = o.dur || 3;
  if (pk.f) lfEnsure(pk.f);
  const it = tpkMake(pk, null, start, dur);
  const free = tr => !D.items.some(i => i.track === tr && i.start < start + dur - 1e-3 && i.start + i.dur > start + 1e-3);
  it.track = (o.track && TRACK_KIND[o.track] === 'text' && free(o.track)) ? o.track : freeTrack('text', start, dur, 'T1');
  if (o.ay != null) it.ay = o.ay; if (o.x) setXf(it, 'x', o.x);
  addItem(it); commit('text'); select(it.id);
  seek(it.start); if (it.tanim) { play(); setTimeout(() => { if (PB.playing && PB.t > it.start + (it.tanim ? it.tanim.d : 1) + 1.2) pause(); }, 3500); }
  return it;
}
// change the look of an existing text: text, time, track, position and size multiplier stay
function tpkApply(it, pk) {
  if (!it || it.type !== 'text') return false;
  if (pk.f) lfEnsure(pk.f);
  const p = tpkProps(pk); delete p.ay; if (!pk.d.box && it.box && it.box !== 'none') p.box = 'none';
  Object.assign(it, p); tpkSetAnim(it, pk);
  commit('pack'); renderInspector();
  if (it.tanim) { seek(it.start); play(); setTimeout(() => { if (PB.playing && PB.t > it.start + (it.tanim ? it.tanim.d : 1) + 1.2) pause(); }, 3500); }
  return true;
}

// ---------- tiles ----------
const tpkRest = pk => (pk.ta && TAX_BY[pk.ta]) ? TAX_BY[pk.ta].d + .35 : 1;
function tpkDrawTile(cv, pk, t) {
  const W = 540, H = 960; if (!VP.tpc) { VP.tpc = document.createElement('canvas'); VP.tpc.width = W; VP.tpc.height = H; }
  const c = VP.tpc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, W, H);
  const it = tpkMake(pk, tpkText(pk), 0, 6); it.ay = .5; it.maxW = .98; it.anim = { in: 'none', out: 'none' };
  const k = Math.min(1, 96 / it.size); it.size = Math.round(it.size * k); if (it.strokeW) it.strokeW *= k;
  try { drawText(c, it, t, W, H); } catch (e) { console.warn(e); } delete BOUNDS[it.id];
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(VP.tpc, 120, 399, 300, 162, 0, 0, cv.width, cv.height);
}
const tpkTiles = () => TPACK.map(p => `<button class="vt tpk" data-pk="${p.id}" draggable="true"><canvas width="300" height="162"></canvas><span>${esc(T(p.label))}</span></button>`).join('');
// draw tiles lazily (fonts are fetched only when a tile scrolls into view), animate the tile under the pointer
async function tpkWire(root) {
  await pvSamples();
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target); const b = e.target, pk = TPK_BY[b.dataset.pk], cv = b.querySelector('canvas');
    (pk.f ? lfEnsure(pk.f) : Promise.resolve(true)).then(() => { if (b.isConnected) tpkDrawTile(cv, pk, tpkRest(pk)); });
  })) : null;
  root.querySelectorAll('.tpk').forEach(b => {
    const pk = TPK_BY[b.dataset.pk], cv = b.querySelector('canvas'); let raf = 0, t0 = 0;
    if (io) io.observe(b); else (pk.f ? lfEnsure(pk.f) : Promise.resolve()).then(() => tpkDrawTile(cv, pk, tpkRest(pk)));
    const loop = now => { if (!b.isConnected) { raf = 0; return; } tpkDrawTile(cv, pk, ((now - t0) / 1000) % (tpkRest(pk) + .9)); raf = requestAnimationFrame(loop); };
    b.addEventListener('pointerenter', () => { if (raf || !LF_OK.has(pk.f) && pk.f) return; t0 = performance.now(); raf = requestAnimationFrame(loop); });
    b.addEventListener('pointerleave', () => { if (!raf) return; cancelAnimationFrame(raf); raf = 0; tpkDrawTile(cv, pk, tpkRest(pk)); });
  });
}
function tpkOpen(it) {
  if (!it || it.type !== 'text') return;
  aiDlg('เปลี่ยนลุคข้อความ (แพ็ก)', `<div class="hint">กดเพื่อใช้ลุคนี้กับข้อความที่เลือก — ข้อความ เวลา และตำแหน่งเดิมจะไม่เปลี่ยน · เอาเมาส์ชี้การ์ดเพื่อดูแอนิเมชัน</div><div class="vgrid tpkgrid" id="tpkDlg">${tpkTiles()}</div>`, root => {
    tpkWire(root);
    root.onclick = e => { const b = e.target.closest('.tpk'); if (!b) return; $('#dlgAi').close(); tpkApply(it, TPK_BY[b.dataset.pk]); };
  });
}

// ---------- drop onto the timeline / the preview ----------
function tpkDropStart(e) { return Math.max(0, snapVal(dropTimeFromEvent(e), snapPoints(null), 12 / TL.pps)); }
function tpkDropOnTimeline(e, key) {
  const pk = TPK_BY[key]; if (!pk) return; const row = e.target.closest ? e.target.closest('.trow') : null;
  tpkAdd(pk, { start: tpkDropStart(e), track: row ? row.dataset.track : null });
}
function tpkHitText(p) {   // p in preview pixels → an active text clip under the point, or null
  for (const o of D.items) {
    if (o.type !== 'text' || o.hidden || PB.t < o.start || PB.t >= o.start + o.dur) continue; const b = BOUNDS[o.id]; if (!b) continue;
    const a = -b.rot * Math.PI / 180, dx = p.x - b.cx, dy = p.y - b.cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return o;
  }
  return null;
}
function tpkInit() {
  const pane = $('#pane-text'); if (!pane) return;
  pane.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('.tpk'); if (!b) return; DRAG = { kind: 'tpk', key: b.dataset.pk }; e.dataTransfer.setData('text/tpk', b.dataset.pk); e.dataTransfer.effectAllowed = 'copy'; });
  pane.addEventListener('dragend', () => { DRAG = null; });
  const st = $('#stage'), ov = $('#ov');
  st.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/tpk')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  st.addEventListener('drop', e => {
    if (!e.dataTransfer.types.includes('text/tpk')) return; e.preventDefault(); e.stopPropagation(); DRAG = null;
    const pk = TPK_BY[e.dataTransfer.getData('text/tpk')]; if (!pk) return; const r = ov.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height, hit = tpkHitText({ x: fx * PW, y: fy * PH });
    if (hit) { select(hit.id); tpkApply(hit, pk); } else tpkAdd(pk, { ay: clamp(fy, .06, .94), x: clamp(fx - .5, -.45, .45) });
  });
}
