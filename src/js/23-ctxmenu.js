// ============================================================
//  v1.62 — right-click menu on a timeline clip (CapCut style, only the commands that matter) + copy / cut / paste of clips.
//  Mirror / rotate live here now (not in the crowded inspector on the right).
// ============================================================
const CB = { it: null };   // internal clip clipboard
const MODK = /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl+';
function cbCopy(id, quiet) { const it = getItem(id); if (!it) return; CB.it = JSON.parse(JSON.stringify(it)); if (!quiet) toast('คัดลอกคลิปแล้ว'); }
function cbCut(id) { const it = getItem(id); if (!it) return; cbCopy(id, true); select(id); cmdDelete(false); toast('ตัดคลิปแล้ว — กดวางได้ที่หัวอ่าน'); }
function cbPaste() {
  if (!CB.it) return toast('ยังไม่ได้คัดลอกคลิป');
  const b = JSON.parse(JSON.stringify(CB.it)); b.id = uid(); b.start = Math.max(0, PB.t); b.transIn = null; b.transOut = null; b.tween = null;
  try { const kind = (TRACKS.find(t => t.id === b.track) || {}).kind; if (kind) { const tr = freeTrack(kind, b.start, b.dur, b.track); if (tr) b.track = tr; } } catch (e) { }
  addItem(b); commit('paste'); select(b.id);
}
function ctxFlip(it, axis) { if (axis === 'x') it.flipX = !it.flipX; else it.flipY = !it.flipY; commit('flip'); renderInspector(); }
function ctxRotate(it) { let n = Math.round(prop(it, 'r', PB.t) || 0) + 90; if (n > 180) n -= 360; setXf(it, 'r', n); commit('rotate'); renderInspector(); }
function ctxItems(it) {
  const t = PB.t, inside = t > it.start + .05 && t < it.start + it.dur - .05, vis = it.type === 'video' || it.type === 'image', vid = it.type === 'video';
  const L = [
    ['คัดลอกคลิป', MODK + 'C', () => cbCopy(it.id)],
    ['ตัดคลิป (Cut)', MODK + 'X', () => cbCut(it.id)],
    ['วางคลิปที่หัวอ่าน', MODK + 'V', () => cbPaste(), !CB.it],
    ['ทำซ้ำคลิป', MODK + 'D', () => { const b = duplicateItem(it.id); commit('dup'); if (b) select(b.id); }],
    ['ลบคลิป', '⌫', () => { select(it.id); cmdDelete(false); }],
    ['ลบคลิปและปิดช่องว่าง', '⇧⌫', () => { select(it.id); cmdDelete(true); }],
    '-',
    ['แยกคลิปที่หัวอ่าน', 'S', () => { select(it.id); cmdSplit(); }, !inside],
    ['ตัดซ้ายถึงหัวอ่าน', 'Q', () => { select(it.id); cmdTrimLeft(); }, !inside],
    ['ตัดขวาจากหัวอ่าน', 'W', () => { select(it.id); cmdTrimRight(); }, !inside],
  ];
  if (vis) L.push('-', ['กลับด้านซ้าย-ขวา (Mirror)', it.flipX ? '✓' : '', () => ctxFlip(it, 'x')], ['กลับด้านบน-ล่าง', it.flipY ? '✓' : '', () => ctxFlip(it, 'y')], ['หมุน 90°', '', () => ctxRotate(it)]);
  if (vid) L.push('-', ['แยกเสียงออกจากวิดีโอ', '', () => sepAudio(it)], ['Auto Cut คลิปนี้', '', () => { select(it.id); acUI(); }], ['แก้ไขตามข้อความ', '', () => { select(it.id); teUI(); }]);
  L.push('-', [it.hidden ? 'แสดงคลิป' : 'ซ่อนคลิป', '', () => { it.hidden = !it.hidden; commit('hide'); }]);
  return L;
}
function ctxHide() {
  const m = $('#ctxm'); if (m) m.remove();
  window.removeEventListener('pointerdown', ctxAway, true); window.removeEventListener('keydown', ctxKey, true); window.removeEventListener('blur', ctxHide); window.removeEventListener('wheel', ctxHide);
}
function ctxAway(e) { if (!e.target.closest || !e.target.closest('#ctxm')) ctxHide(); }
function ctxKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ctxHide(); } }
function ctxShow(x, y, items) {
  ctxHide(); const m = document.createElement('div'); m.id = 'ctxm';
  m.innerHTML = items.map((r, i) => r === '-' ? '<hr>' : `<button data-i="${i}" ${r[3] ? 'disabled' : ''}><span translate="no">${esc(T(r[0]))}</span><kbd>${esc(r[1] || '')}</kbd></button>`).join('');
  document.body.appendChild(m);
  const w = m.offsetWidth, h = m.offsetHeight; m.style.left = Math.max(4, Math.min(x, innerWidth - w - 6)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - h - 6)) + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; const r = items[+b.dataset.i]; ctxHide(); r[2](); };
  m.oncontextmenu = e => e.preventDefault();
  setTimeout(() => { window.addEventListener('pointerdown', ctxAway, true); window.addEventListener('keydown', ctxKey, true); window.addEventListener('blur', ctxHide); window.addEventListener('wheel', ctxHide, { passive: true }); }, 0);
}
document.addEventListener('contextmenu', e => {
  const c = e.target.closest && e.target.closest('#tlbody .clip'); if (!c || HOME.open) return;
  const it = getItem(c.dataset.id); if (!it) return;
  e.preventDefault(); select(it.id); ctxShow(e.clientX, e.clientY, ctxItems(it));
});
