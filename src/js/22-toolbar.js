// ============================================================
//  Timeline toolbar (CapCut-style): trim left/right, markers, magnet, snapping, zoom
// ============================================================
const TLS = { snap: true, magnet: false };
try { Object.assign(TLS, JSON.parse(localStorage.getItem('sk_tls') || '{}')); } catch (e) { }
const snapTol = () => TLS.snap ? 9 : 0;
// magnetic main track: close gaps on Video 1 whenever the document changes
function magnetFix(label) {
  if (!TLS.magnet || label === 'init' || label === 'open') return;
  const list = D.items.filter(i => i.track === 'V1').sort((a, b) => a.start - b.start); let t = 0;
  for (const it of list) { if (it.start > t + 1e-3) it.start = t; t = Math.max(t, it.start + it.dur); }
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
  $('#tbMagnet').onclick = () => { TLS.magnet = !TLS.magnet; setTog('#tbMagnet', 'magnet'); save(); if (TLS.magnet) { commit('gaps'); toast('เปิดแม่เหล็ก: คลิปบนวิดีโอ 1 จะชิดกันอัตโนมัติ'); } };
  $('#tbSnap').onclick = () => { TLS.snap = !TLS.snap; setTog('#tbSnap', 'snap'); save(); };
  setTog('#tbMagnet', 'magnet'); setTog('#tbSnap', 'snap');
  $('#tbZoomIn').onclick = () => setZoom(TL.pps * 1.3); $('#tbZoomOut').onclick = () => setZoom(TL.pps / 1.3);
  $('#tbFit').onclick = () => { const w = $('#tlbody').clientWidth - TL.labelW - 30; setZoom(w / Math.max(projectEnd(), 2)); };
  $('#tlbody').addEventListener('dblclick', e => { const mk = e.target.closest('.mk'); if (!mk) return; D.markers = (D.markers || []).filter(m => m.id !== mk.dataset.id); commit('marker'); });
}
