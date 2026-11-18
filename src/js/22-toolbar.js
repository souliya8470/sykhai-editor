// ============================================================
//  Timeline toolbar (CapCut-style): trim left/right, markers, magnet, snapping, zoom
// ============================================================
const TLS = { snap: true, magnet: true };
try { Object.assign(TLS, JSON.parse(localStorage.getItem('sk_tls') || '{}')); } catch (e) { }
const snapTol = () => TLS.snap ? 9 : 0;
// magnetic main track (Video 1, like CapCut): clips are always glued end to end — no gaps, no overlaps (a transition keeps its own small overlap).
// skipId = the clip being dragged: it floats under the mouse, the others close up around the slot it would take.
// ord (optional) = the clip ids in the order they had when the drag/trim started: trimming or stretching an edge can then never swap clips
function magnetLayout(skipId, ord) {
  const rk = id => { const k = ord ? ord.indexOf(id) : -1; return k < 0 ? 1e9 : k; };
  const list = D.items.filter(i => i.track === 'V1').sort(ord ? ((a, b) => rk(a.id) - rk(b.id) || a.start - b.start) : ((a, b) => (a.start + a.dur / 2) - (b.start + b.dur / 2))); let t = 0, prev = null;
  for (const it of list) {
    const ov = prev && it.transIn && it.transIn.ext && it.transIn.prevId === prev.id ? Math.min(it.transIn.ext, prev.dur * .9) : 0;
    const st = Math.max(0, t - ov);
    if (it.id !== skipId) it.start = st;
    t = st + it.dur; prev = it;
  }
}
// ---- v1.60 magnet DRAG feel (CapCut style, but stickier): while a V1 clip is dragged the others open a slot for it, the slot glows when the clip is pulled in,
// there is a dead-zone (the clip "sticks" to the slot), then a rubber band, then free flight; the insert point has hysteresis so it never flickers.
let _mgHintT = 0;   // last time we explained that the magnet only works on the main row
const MG = { on: false, k: null, slot: 0, snapped: false };
const MG_SN = 30, MG_RL = 70, MG_H = 16; // px: stick radius, release radius, hysteresis
function mgBuzz(n) { try { if (navigator.vibrate) navigator.vibrate(n); } catch (e) { } }
function magnetDrag(it, raw) {
  const others = D.items.filter(i => i.track === 'V1' && i.id !== it.id).sort((a, b) => a.start - b.start);
  const ps = [], pe = []; let t = 0, prev = null;
  for (const o of others) {
    const ov = prev && o.transIn && o.transIn.ext && o.transIn.prevId === prev.id ? Math.min(o.transIn.ext, prev.dur * .9) : 0;
    const st = Math.max(0, t - ov); ps.push(st); pe.push(st + o.dur); t = st + o.dur; prev = o;
  }
  const n = others.length, c = raw + it.dur / 2, H = MG_H / TL.pps, mid = i => (ps[i] + pe[i]) / 2;
  let k = MG.k;
  if (k == null || k > n) { k = 0; while (k < n && c > mid(k)) k++; }
  else { // swap with a neighbour once the clip has travelled more than half of that neighbour's length past its slot (independent of the dragged clip's own length)
    const sl = j => j === 0 ? 0 : pe[j - 1];
    const MINH = 28 / TL.pps;   // v1.70: even a very short neighbour needs a deliberate drag (>= 28 px) before the clips swap places
    while (k > 0 && sl(k) - raw > Math.max(MINH, (pe[k - 1] - ps[k - 1]) / 2) + H) k--;
    while (k < n && raw - sl(k) > Math.max(MINH, (pe[k] - ps[k]) / 2) + H) k++;
  }
  if (MG.on && k !== MG.k) mgBuzz(10);
  MG.k = k; MG.on = true;
  const slot = k === 0 ? 0 : pe[k - 1]; MG.slot = slot;
  others.forEach((o, i) => { o.start = i < k ? ps[i] : ps[i] + it.dur; });
  const d = (raw - slot) * TL.pps, ad = Math.abs(d); let off = 0;
  if (ad >= MG_SN) off = (ad - MG_SN) * MG_RL / (MG_RL - MG_SN); if (ad >= MG_RL) off = ad;
  const sn = ad < MG_SN; if (sn && !MG.snapped) mgBuzz(8); MG.snapped = sn;
  it.start = Math.max(0, slot + Math.sign(d) * off / TL.pps);
  return others;
}
function mgPaint(it) {
  const row = document.querySelector('.trow[data-track="V1"] .tlane'); if (!row) return false;
  const body = $('#tlbody'); if (body) body.classList.add('mgdrag');
  let ok = true;
  for (const i of D.items) {
    if (i.track !== 'V1') continue;
    const el = row.querySelector('.clip[data-id="' + i.id + '"]'); if (!el) { ok = false; continue; }
    el.style.left = (i.start * TL.pps) + 'px';
    el.classList.toggle('dragging', i.id === it.id); el.classList.toggle('mgsnap', i.id === it.id && MG.snapped);
  }
  let g = row.querySelector('.magslot'); if (!g) { g = document.createElement('div'); g.className = 'magslot'; row.insertBefore(g, row.firstChild); }
  g.style.left = (MG.slot * TL.pps) + 'px'; g.style.width = Math.max(6, it.dur * TL.pps) + 'px'; g.classList.toggle('snap', MG.snapped);
  return ok;
}
function mgReset() {
  MG.on = false; MG.k = null; MG.snapped = false; 
  const body = $('#tlbody'); if (body) body.classList.remove('mgdrag');
  $$('.magslot').forEach(e => e.remove());
}
function magnetFix(label) {
  if (!TLS.magnet || label === 'init' || label === 'open') return;
  magnetLayout(null);
}
function trimTargets() {
  const t = PB.t; const target = SEL ? getItem(SEL) : null;
  const hit = it => it && t > it.start + 0.05 && t < it.start + it.dur - 0.05 && (it.type === 'video' || it.type === 'image' || it.type === 'audio');
  return hit(target) ? [target] : D.items.filter(hit);
}
function cmdTrimLeft() {
  const list = trimTargets(); if (!list.length) { toast('เลื่อนหัวอ่านไปกลางคลิปก่อนตัด'); return; }
  const t = PB.t;
  for (const it of list) {
    const lt = t - it.start, sp = it.speed || 1;
    if (it.in != null) it.in += lt * sp; it.dur -= lt; it.start = t; it.transIn = null;
    if (it.kf) for (const k in it.kf) it.kf[k] = it.kf[k].map(p => ({ t: p.t - lt, v: p.v }));
  }
  commit('trimL'); if (TLS.magnet) seek(Math.min(PB.t, projectEnd()));
}
function cmdTrimRight() {
  const list = trimTargets(); if (!list.length) { toast('เลื่อนหัวอ่านไปกลางคลิปก่อนตัด'); return; }
  for (const it of list) { it.dur = PB.t - it.start; it.transOut = null; }
  commit('trimR');
}
function cmdMarker() {
  D.markers = D.markers || []; const t = Math.round(PB.t * 100) / 100;
  const ex = D.markers.findIndex(m => Math.abs(m.t - t) < 0.05);
  if (ex >= 0) D.markers.splice(ex, 1); else D.markers.push({ id: uid(), t });
  D.markers.sort((a, b) => a.t - b.t); commit('marker');
}
function setTog(id, key) { const b = $(id); b.classList.toggle('on', !!TLS[key]); }
function initToolbar() {
  $('#tbImport').onclick = () => $('#fileIn').click();
  $('#tbUndo').onclick = undo; $('#tbRedo').onclick = redo;
  $('#tbSplit').onclick = cmdSplit; $('#tbTrimL').onclick = cmdTrimLeft; $('#tbTrimR').onclick = cmdTrimRight;
  $('#tbDel').onclick = () => cmdDelete(false); $('#tbRipple').onclick = () => cmdDelete(true); $('#tbMark').onclick = cmdMarker;
  const save = () => { try { localStorage.setItem('sk_tls', JSON.stringify(TLS)); } catch (e) { } };
  $('#tbMagnet').onclick = () => { TLS.magnet = !TLS.magnet; setTog('#tbMagnet', 'magnet'); save(); if (TLS.magnet) { commit('gaps'); toast('เปิดแม่เหล็ก: คลิปในแถวที่มีป้าย 🧲 จะชิดกันอัตโนมัติ'); } else { renderTimeline(); toast('ปิดแม่เหล็ก: วางคลิปได้อิสระ เว้นช่องว่างได้'); } };
  $('#tbCover').onclick = () => { if (typeof coverOpen === 'function') coverOpen(); };
  $('#tbSnap').onclick = () => { TLS.snap = !TLS.snap; setTog('#tbSnap', 'snap'); save(); };
  setTog('#tbMagnet', 'magnet'); setTog('#tbSnap', 'snap');
  $('#tbZoomIn').onclick = () => setZoom(TL.pps * 1.3); $('#tbZoomOut').onclick = () => setZoom(TL.pps / 1.3);
  $('#tbFit').onclick = () => { const w = $('#tlbody').clientWidth - TL.labelW - 30; setZoom(w / Math.max(projectEnd(), 2)); };
  $('#tlbody').addEventListener('dblclick', e => { const mk = e.target.closest('.mk'); if (!mk) return; D.markers = (D.markers || []).filter(m => m.id !== mk.dataset.id); commit('marker'); });
}
