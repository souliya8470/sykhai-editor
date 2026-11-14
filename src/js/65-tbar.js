// ============================================================
//  v1.57 — floating text toolbar: select a text on the preview and a small bar appears right above it
//  ✎ edit the words · Aa font · ● colour / gradient · ◯ outline · ✦ glow & 3D · A− A+ size · 🎨 change look (pack) · ✨ animation
//  Move / resize / rotate is still done by dragging the text itself on the preview (handles from the overlay).
// ============================================================
const TB = { pop: null, last: '' };
const TB_CH = ['#ffffff', '#000000', '#FFE14D', '#FFB300', '#FF5252', '#E0143C', '#FF4FD8', '#8F6BFF', '#2B6BFF', '#00C8FF', '#37D883', '#0E7A5F'];
const TB_GR = [['#FFF4B8', '#F5C242', '#B87A10'], ['#FFF59D', '#FF9100', '#E53935'], ['#FFE259', '#FF7A59', '#C33764'], ['#00E5FF', '#7C4DFF'], ['#FF9DE6', '#8F6BFF'], ['#F1FFF7', '#37D883'], ['#FFFFFF', '#FF8FE9'], ['#FFFFFF', '#8FDCFF'], ['#FFFDE7', '#FFD600'], ['#FFFFFF', '#9aa0a6']];
const tbItem = () => { const it = SEL ? getItem(SEL) : null; return it && it.type === 'text' ? it : null; };
function tbBuild() {
  const st = $('#stage'); if (!st || $('#tbar')) return;
  const bar = document.createElement('div'); bar.id = 'tbar'; bar.hidden = true;
  bar.innerHTML = `<div class="tbrow">
    <button data-tb="text" title="แก้ข้อความ">✎</button><button data-tb="font" title="เลือกฟอนต์">Aa</button>
    <button data-tb="fill" title="สีตัวอักษร / ไล่สี"><i class="tbsw"></i></button><button data-tb="stroke" title="ขอบตัวอักษร"><i class="tbring"></i></button>
    <button data-tb="glow" title="แสงเรือง / 3D">✦</button><button data-tb="sm" title="ลดขนาด">A−</button><button data-tb="sp" title="เพิ่มขนาด">A+</button>
    <button data-tb="pack" title="เปลี่ยนลุค (แพ็กข้อความ)">🎨</button><button data-tb="anim" title="แอนิเมชันข้อความ">✨</button></div><div id="tbpop" hidden></div>`;
  st.appendChild(bar);
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  bar.addEventListener('click', tbClick);
  bar.addEventListener('input', tbInput);
  bar.addEventListener('change', tbChange);
}
function tbSet(it, k, v) {   // one property of the text, from a chip / colour input
  if (k === 'color') { it.color = v; it.grad = null; }
  else if (k === 'stroke') { if (!v) { it.stroke = ''; it.strokeW = 0; } else { it.stroke = v; if (!it.strokeW) it.strokeW = 8; } }
  else if (k === 'glow') it.glow = v || null;
  else if (k === 'ext') it.ext = v ? { c: v, d: it.ext && it.ext.d != null ? it.ext.d : .06 } : null;
  else if (k === 'grad') it.grad = null;
}
const tbChips = (k, cur, none) => (none ? `<button class="tbc none" data-tbv="${k}:" title="ไม่มี">⌀</button>` : '') + TB_CH.map(c => `<button class="tbc${cur && String(cur).toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-tbv="${k}:${c}" style="background:${c}"></button>`).join('') + `<input type="color" class="tbcol" data-tbi="${k}" value="${toHex(cur || '#ffffff')}" title="สีอื่น">`;
function tbPopHtml(name, it) {
  if (name === 'text') return `<textarea id="tbTxt" rows="3" data-tbtxt>${esc(it.text)}</textarea><div class="tbh">บรรทัดใหม่ = Enter · *คำ* = เน้นสีเหลือง</div>`;
  if (name === 'fill') {
    let h = `<div class="tbl">สีตัวอักษร</div><div class="tbr">${tbChips('color', it.grad ? '' : it.color)}</div>
      <div class="tbl">สีไล่เฉด (ไล่สี)</div><div class="tbr">${TB_GR.map(g => `<button class="tbg" data-tbg="${g.join(',')}" style="background:linear-gradient(90deg,${g.join(',')})"></button>`).join('')}</div>`;
    if (it.grad) h += `<div class="tbr"><span class="tbh">ปรับสี</span>${it.grad.c.map((c, i) => `<input type="color" class="tbcol" data-tbgi="${i}" value="${toHex(c)}">`).join('')}<label class="tbh">มุมไล่สี <input type="range" min="0" max="180" step="1" value="${it.grad.a == null ? 90 : it.grad.a}" data-tbga></label><button class="tbx" data-tbv="grad:">ปิดไล่สี</button></div>`;
    return h;
  }
  if (name === 'stroke') return `<div class="tbl">สีขอบ</div><div class="tbr">${tbChips('stroke', it.stroke, true)}</div><div class="tbr"><label class="tbh">ความหนาขอบ <input type="range" min="0" max="30" step="1" value="${it.strokeW || 0}" data-tbsw></label></div>`;
  if (name === 'glow') return `<div class="tbl">แสงเรือง</div><div class="tbr">${tbChips('glow', it.glow, true)}</div><div class="tbl">3D (ขอบหนาหลังตัวอักษร)</div><div class="tbr">${tbChips('ext', it.ext && it.ext.c, true)}</div><div class="tbr"><label class="tbh">ความลึก <input type="range" min="1" max="15" step="1" value="${Math.round((it.ext && it.ext.d != null ? it.ext.d : .06) * 100)}" data-tbed></label></div>`;
  return '';
}
function tbPop(name) {
  const it = tbItem(), pop = $('#tbpop'); if (!it || !pop) return;
  TB.pop = name; pop.innerHTML = tbPopHtml(name, it); pop.hidden = !name;
  $$('#tbar [data-tb]').forEach(b => b.classList.toggle('on', b.dataset.tb === name));
  if (name === 'text') { const ta = $('#tbTxt'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  TB.last = ''; tbUpdate();
}
function tbOpen(name) {   // also callable from the inspector: bring the playhead onto the clip so the bar can show
  const it = tbItem(); if (!it) return; if (PB.t < it.start - 1e-3 || PB.t >= it.start + it.dur) seek(it.start + .01); pause(); tbPop(name);
}
function tbSwatch() {
  const it = tbItem(), sw = $('#tbar .tbsw'), rg = $('#tbar .tbring'); if (!it) return;
  if (sw) sw.style.background = (it.grad && it.grad.c && it.grad.c.length > 1) ? `linear-gradient(135deg,${it.grad.c.join(',')})` : toHex(it.color || '#ffffff');
  if (rg) rg.style.borderColor = it.stroke ? toHex(it.stroke) : 'transparent';
}
function tbClick(e) {
  const it = tbItem(); if (!it) return;
  const chip = e.target.closest('[data-tbv]');
  if (chip) { const [k, ...r] = chip.dataset.tbv.split(':'); tbSet(it, k, r.join(':')); commit('tb-' + k); renderInspector(); tbPop(TB.pop); return; }
  const g = e.target.closest('[data-tbg]');
  if (g) { it.grad = { c: g.dataset.tbg.split(','), a: it.grad && it.grad.a != null ? it.grad.a : 90 }; commit('tb-grad'); renderInspector(); tbPop('fill'); return; }
  const b = e.target.closest('[data-tb]'); if (!b) return; const k = b.dataset.tb;
  if (k === 'sm' || k === 'sp') { it.size = clamp(Math.round((it.size || 60) * (k === 'sp' ? 1.08 : .92)), 12, 300); commit('tb-size'); renderInspector(); return; }
  if (k === 'font') { lfOpen(it); return; }
  if (k === 'pack') { tpkOpen(it); return; }
  if (k === 'anim') { taOpen(); return; }
  tbPop(TB.pop === k ? null : k);
}
function tbInput(e) {
  const it = tbItem(), el = e.target; if (!it) return;
  if (el.hasAttribute('data-tbtxt')) { it.text = el.value; dirty(); renderTimeline(); return; }
  if (el.dataset.tbi) { tbSet(it, el.dataset.tbi, el.value); dirty(); tbSwatch(); return; }
  if (el.dataset.tbgi != null && it.grad) { it.grad.c[+el.dataset.tbgi] = el.value; dirty(); tbSwatch(); return; }
  if (el.hasAttribute('data-tbga') && it.grad) { it.grad.a = +el.value; dirty(); return; }
  if (el.hasAttribute('data-tbsw')) { it.strokeW = +el.value; if (it.strokeW && !it.stroke) it.stroke = '#000000'; dirty(); tbSwatch(); return; }
  if (el.hasAttribute('data-tbed') && it.ext) { it.ext.d = (+el.value) / 100; dirty(); return; }
  if (el.hasAttribute('data-tbed') && !it.ext) { it.ext = { c: '#000000', d: (+el.value) / 100 }; dirty(); }
}
function tbChange(e) {
  const it = tbItem(); if (!it) return; const el = e.target;
  if (el.hasAttribute('data-tbtxt')) { commit('text'); renderInspector(); return; }
  if (el.matches('[data-tbi],[data-tbgi],[data-tbga],[data-tbsw],[data-tbed]')) { commit('tb'); renderInspector(); tbPop(TB.pop); }
}
// place the bar above the selected text (below it when there is no room); called on every frame, touches the DOM only when something changed
function tbUpdate() {
  const bar = $('#tbar'); if (!bar) return;
  const it = tbItem(), b = it ? BOUNDS[it.id] : null;
  const show = !!(b && !PB.playing && !PB.starting && !PB.exporting && PB.t >= it.start - 1e-3 && PB.t < it.start + it.dur - 1e-3 && !document.querySelector('dialog[open]'));
  if (!show) { if (!bar.hidden) { bar.hidden = true; } return; }
  const st = $('#stage'), sr = st.getBoundingClientRect(), kx = sr.width / PW, ky = sr.height / PH, vw = window.innerWidth, vh = window.innerHeight;   // the bar is position:fixed, so it may be wider than a small phone stage
  const key = [it.id, b.cx | 0, b.cy | 0, b.w | 0, b.h | 0, b.rot | 0, sr.left | 0, sr.top | 0, sr.width | 0, vw, vh, TB.pop, it.grad ? 1 : 0].join('|');
  if (!bar.hidden && key === TB.last) return; TB.last = key; bar.hidden = false;
  const rad = b.rot * Math.PI / 180, ext = Math.abs(b.h / 2 * Math.cos(rad)) + Math.abs(b.w / 2 * Math.sin(rad));
  const bh = bar.querySelector('.tbrow').offsetHeight, ty = sr.top + (b.cy - ext) * ky, by = sr.top + (b.cy + ext) * ky;
  const spaceAbove = ty - 44, spaceBelow = vh - by - 16;
  const up = spaceAbove >= spaceBelow, top = up ? spaceAbove - bh : by + 16;   // the side with more room (stays put while editing); the popover opens away from the text
  bar.classList.toggle('up', up); bar.style.top = clamp(top, 4, Math.max(4, vh - bh - 4)) + 'px';
  const pop = $('#tbpop'); if (pop) pop.style.maxHeight = Math.max(110, (up ? top : vh - top - bh) - 14) + 'px';
  bar.style.left = clamp(sr.left + b.cx * kx - bar.offsetWidth / 2, 4, Math.max(4, vw - bar.offsetWidth - 4)) + 'px';
}
function tbInit() {
  tbBuild();
  on('sel', () => { TB.pop = null; const p = $('#tbpop'); if (p) p.hidden = true; $$('#tbar [data-tb]').forEach(b => b.classList.remove('on')); TB.last = ''; tbSwatch(); });
  on('doc', () => { TB.last = ''; tbSwatch(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && TB.pop) { tbPop(null); } });
}
