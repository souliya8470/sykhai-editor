// ============================================================
//  Style presets (trend looks): pick one -> see it on YOUR footage -> apply to the timeline in one click
//  A preset = colour grade + cut transition + punch-in zoom + text/subtitle style + sticker bursts
// ============================================================
if (document.fonts) ['800 80px Anton', '400 80px Yellowtail'].forEach(f => { try { document.fonts.load(f); } catch (e) { } });

const PRESETS = [
  { id: 'cafe', ico: '☕', name: 'คาเฟ่ อุ่นนุ่ม', desc: 'โทนอุ่นนุ่มน่านั่ง สว่างขึ้นนิด ๆ ผ่านฉากแบบมิกซ์สั้นมาก ซูมเข้าช้า ๆ ให้ภาพมีชีวิต ตัวหนังสือเรียบ เหมาะร้านกาแฟ/ขนม/บรรยากาศร้าน', tags: 'อาหาร · มิกซ์สั้น · ซูมช้า',
    fx: { sepia: .16, saturate: 1.12, contrast: 1.07, brightness: 1.05, hue: -5, vignette: .22 }, trans: ['fade', .12], zoom: ['push', 1.08], text: 'plain', sub: 'subbox' },
  { id: 'food', ico: '🍜', name: 'อาหารสีสด น่ากิน', desc: 'สีสดคมชัด คอนทราสต์พอดี ให้ข้าว/เนื้อ/ผักดูฉ่ำน่ากิน ตัดเร็วด้วยซูมเข้าเบา ๆ ตัวหนังสือขาวขอบดำอ่านง่าย เหมาะร้านอาหาร/เมนูใหม่', tags: 'อาหาร · สีสดคม · ซูมเข้า',
    fx: { saturate: 1.38, contrast: 1.12, brightness: 1.04, sharpen: 1, hue: -3 }, trans: ['zoomIn', .16], zoom: ['push', 1.1], text: 'clean', sub: 'sub' },
  { id: 'street', ico: '🥢', name: 'สตรีทฟู้ด ไว แรง', desc: 'สีจัดจ้าน มุมมืดบาง ตัดไวซูมกระแทกสลับ ตัวหนังสือเหลืองใหญ่ + ดาวระเบิด เหมาะร้านริมทาง/โปรลดราคา/คลิปเร้าใจ', tags: 'อาหาร · ซูมกระแทก · ตัวเหลือง',
    fx: { saturate: 1.4, contrast: 1.22, brightness: 1.02, vignette: .3, sharpen: 1 }, trans: ['punch', .15], zoom: ['alt', 1.12], text: 'big', sub: 'hl', bursts: ['#ffe14d', '#e0143c'] },
  { id: 'neon', ico: '🔥', name: 'นีออนตัวใหญ่ (ฮิตตอนนี้)', desc: 'ตัวหนังสือแคบใหญ่เรืองแสงเต็มจอ + คำเน้นตัวเขียนนีออน โทนส้มแดงอุ่นมืดขอบ ตัดไวแฟลชขาว ดาวระเบิดเด้งตามข้อความ', tags: 'แฟลชขาว · ซูมสลับ · ดาวระเบิด',
    fx: { contrast: 1.3, saturate: 1.25, sepia: .38, hue: -12, brightness: .92, vignette: .62 }, trans: ['dipwhite', .16], zoom: ['alt', 1.13], text: 'condGlow', sub: 'subGlow', bursts: ['#ff6f91', '#ffe14d', '#ff5a00'] },
  { id: 'hype', ico: '⚡', name: 'ขายด่วน ไว แรง', desc: 'สีสด คอนทราสต์แรง ตัดไว ซูมกระแทกทุกช็อต ตัวหนังสือเหลืองใหญ่ขอบดำ เหมาะโปรโมชัน/ลดราคา', tags: 'ซูมกระแทก · ตัวเหลืองใหญ่ · ดาว',
    fx: { saturate: 1.45, contrast: 1.15, brightness: 1.03 }, trans: ['punch', .2], zoom: ['push', 1.1], text: 'big', sub: 'hl', bursts: ['#ffe14d', '#e0143c'] },
  { id: 'review', ico: '🎤', name: 'รีวิวคนพูด (จั๊มพ์คัต)', desc: 'ภาพสว่างคมชัด ตัดต่อเนื่องแบบจั๊มพ์คัต ซูมเข้า-ออกสลับทุกช็อตให้ดูไม่น่าเบื่อ ซับตัวใหญ่ขาวขอบดำ', tags: 'จั๊มพ์คัต · ซับขาวขอบดำ',
    fx: { brightness: 1.06, contrast: 1.08, saturate: 1.1, sharpen: 1 }, trans: ['none', 0], zoom: ['alt', 1.15], text: 'clean', sub: 'sub' },
  { id: 'soft', ico: '🌸', name: 'อ่อนละมุน สะอาดตา', desc: 'โทนสว่างนุ่ม ผิวใส เลือนเข้าช้า ๆ ซูมเบา ๆ ข้อความเรียบ เหมาะครีม/สกินแคร์/ความสวยงาม', tags: 'เลือนนุ่ม · ผิวใส',
    fx: { brightness: 1.1, contrast: .94, saturate: 1.05, sepia: .08 }, trans: ['fade', .4], zoom: ['push', 1.05], text: 'plain', sub: 'plain' },
  { id: 'cine', ico: '🎬', name: 'ซีนีมาพรีเมียม', desc: 'โทนฟิล์มเข้ม มุมมืด ภาพนิ่งหรู ซูมช้า เปลี่ยนฉากแบบเลือน เหมาะสินค้าราคาสูง', tags: 'ฟิล์ม · มุมมืด · ซูมช้า',
    fx: { contrast: 1.18, saturate: .88, hue: 6, vignette: .5, brightness: .97 }, trans: ['fade', .6], zoom: ['push', 1.07], text: 'plain', sub: 'subbox', textOver: { color: '#f3e3c3' } },
  { id: 'vlog', ico: '🎞', name: 'วินเทจ / วล็อก', desc: 'สีวินเทจอุ่น ๆ มุมมืดบาง ผ่านดำนุ่ม ๆ ภาพขยับช้า เหมาะวล็อก/บรรยากาศร้าน', tags: 'วินเทจ · ผ่านดำ',
    fx: { sepia: .4, contrast: .94, saturate: .88, brightness: 1.02, vignette: .35 }, trans: ['dipblack', .35], zoom: ['push', 1.06], text: 'plain', sub: 'subbox' },
  { id: 'ba', ico: '↔', name: 'ก่อน – หลัง', desc: 'ครึ่งแรกเป็นโทนซีดเย็นพร้อมป้าย “ก่อน” ครึ่งหลังสดใสพร้อมป้าย “หลัง” ปัดฉากกลาง เหมาะโชว์ผลลัพธ์สินค้า', tags: 'ป้ายก่อน/หลัง · ปัดฉาก',
    fx: { saturate: 1.2, contrast: 1.08, brightness: 1.05 }, fxBefore: { saturate: .55, contrast: .95, brightness: .96, hue: 10 }, ba: true, trans: ['wipeR', .35], zoom: ['push', 1.05], text: 'pill', sub: 'sub' },
  { id: 'y2k', ico: '👾', name: 'กลิตช์ / Y2K ป๊อป', desc: 'สีป๊อปจัด เปลี่ยนฉากแบบกลิตช์ ซูมสลับ ตัวหนังสือขาวขอบน้ำเงิน เหมาะแฟชั่น/วัยรุ่น', tags: 'กลิตช์ · สีป๊อป',
    fx: { saturate: 1.6, contrast: 1.15, brightness: 1.02 }, trans: ['glitch', .25], zoom: ['alt', 1.1], text: 'blue', sub: 'hl', bursts: ['#7a5cff', '#ff3d9a'] },
  { id: 'lux', ico: '🖤', name: 'ดาร์กลักชัวรี', desc: 'โทนดำเข้ม ตัวหนังสือสีทอง เลือนช้า ซูมเบา ให้ความรู้สึกแบรนด์พรีเมียม', tags: 'ดำ-ทอง · เลือนช้า',
    fx: { contrast: 1.3, saturate: .8, brightness: .94, vignette: .5 }, trans: ['fade', .5], zoom: ['push', 1.04], text: 'plain', sub: 'subbox', textOver: { color: '#e8c26a', color2: '#e8c26a' } },
];

const cloneJ = o => JSON.parse(JSON.stringify(o));
function presetTitleItems() { return D.items.filter(i => i.type === 'text' && !i.sub && !i.presetAdd && i.style !== 'footer'); }
function setTransIn(it, type, dur) {   // same rules as applyTransition(), but without seeking/playing
  if (!type || type === 'none') { it.transIn = null; return; }
  dur = Math.min(dur || .4, it.dur * .9);
  const p2 = D.items.find(o => o.track === it.track && o.id !== it.id && Math.abs(o.start + o.dur - it.start) < .06);
  it.transIn = { type, dur };
  if (p2) {   // the previous clip is stretched under the incoming one — only as far as its source still has footage
    const pm = p2.type === 'video' ? MEDIA.get(p2.mediaId) : null, sp = p2.speed || 1;
    const room = pm && pm.duration ? ((pm.duration - .04) - (p2.in || 0)) / sp - p2.dur : dur;
    const ext = Math.min(dur, room);
    if (ext > .04) { p2.dur += ext; it.transIn.ext = ext; it.transIn.prevId = p2.id; }
  }
}
function restyleText(it, styleId, over) {
  const st = TEXT_STYLES.find(s => s.id === styleId); if (!st) return; const d = cloneJ(st.d); delete d.text; delete d.ay;
  ['glow', 'stroke', 'strokeW', 'bg', 'bg2', 'shadow'].forEach(k => { delete it[k]; });
  Object.assign(it, d, over || {}); it.style = st.id; if (!d.font) it.font = FONT_STACK;
}
// o: which parts to apply {grade, trans, zoom, text, subs, stick}
function applyPresetTo(p, o) {
  o = Object.assign({ grade: 1, trans: 1, zoom: 1, text: 1, subs: 1, stick: 1 }, o || {});
  D.items = D.items.filter(i => !i.presetAdd);
  const vids = D.items.filter(i => i.track === 'V1' && (i.type === 'video' || i.type === 'image')).sort((a, b) => a.start - b.start);
  if (o.trans) vids.forEach(it => { const prev = it.transIn && it.transIn.prevId ? D.items.find(x => x.id === it.transIn.prevId) : null; if (prev && it.transIn.ext) prev.dur = Math.max(.1, prev.dur - it.transIn.ext); it.transIn = null; });
  const half = p.ba ? Math.ceil(vids.length / 2) : 0;
  vids.forEach((it, i) => {
    if (o.grade) it.fx = cloneJ(p.ba && p.fxBefore && i < half && vids.length > 1 ? p.fxBefore : p.fx);
    if (o.zoom && p.zoom && it.mask.type === 'none') {
      const [mode, amt] = p.zoom; it.kf = it.kf || {}; delete it.kf.s; it.xf.s = 1;
      if (mode === 'alt') it.xf.s = i % 2 ? amt : 1; else if (mode === 'push') it.kf.s = [{ t: 0, v: 1 }, { t: it.dur, v: amt }];
      if (it.type === 'image') it.kb = 'none';
    }
  });
  if (o.trans && p.trans) vids.forEach((it, i) => { if (i) setTransIn(it, p.trans[0], p.trans[1]); });
  const titles = presetTitleItems();
  if (o.text) titles.forEach(it => restyleText(it, p.text, p.textOver));
  if (o.subs) D.items.filter(i => i.type === 'text' && i.sub).forEach(it => restyleText(it, p.sub, p.textOver));
  if (o.stick && p.bursts) titles.forEach((it, i) => {
    const dur = Math.min(1.1, it.dur), kinds = ['burst', 'rays', 'grid'], x = i % 2 ? .27 : -.27;
    const s = mkSticker(kinds[i % 3], it.start, dur, { size: 300, color: p.bursts[i % p.bursts.length], ay: i % 2 ? .24 : .62, presetAdd: 1, xf: Object.assign(XF0(), { x, r: i % 2 ? 12 : -10 }) });
    s.track = freeTrack('text', s.start, s.dur, 'T3'); D.items.push(s);
  });
  if (p.ba && o.text && vids.length > 1) {
    const mk = (txt, style, v, dur) => { const t = mkText(style, txt, v.start + .1, Math.min(dur, v.dur - .1), { presetAdd: 1, ay: .12, anim: { in: 'pop', out: 'fade', d: .2 } }); t.track = freeTrack('text', t.start, t.dur, 'T3'); D.items.push(t); };
    mk(T('ก่อน'), 'promo', vids[0], 2.5); mk(T('หลัง'), 'pill', vids[half], 2.5);
  }
}
function applyPreset(id, o) {
  const p = PRESETS.find(x => x.id === id); if (!p) return;
  if (!D.items.some(i => i.track === 'V1' && (i.type === 'video' || i.type === 'image'))) return toast('เอาคลิปลงไทม์ไลน์ก่อน');
  applyPresetTo(p, o); D.preset = id; D.presetSub = p.sub; commit('preset'); renderInspector();
  toast('ใช้พรีเซ็ตแล้ว — กด ↶ ย้อนกลับได้', 4500);
}

// ---------- preview on the user's own footage (thumbnails) ----------
const PRC = {};
function presetPreviewDoc(id) {
  if (PRC.key !== PV.key) { for (const k of Object.keys(PRC)) delete PRC[k]; PRC.key = PV.key; }
  if (PRC[id]) return PRC[id];
  const p = PRESETS.find(x => x.id === id), prev = D;
  const items = [pvItem('__a', '__pvA', 0, 1.15), pvItem('__b', '__pvB', 1.15, 1.15), pvItem('__c', '__pvA', 2.3, 1.15)];
  items.push(mkText('clean', T('ຄຣີມກັນແດດ\nບໍ່ເຫນຽວ'), .15, 1.5, { track: 'T1' }), mkText('sub', T('ຊຶມໄວ ບໍ່ເຫນຽວ'), 1.5, 1.8, { track: 'T2', sub: 1, ay: .8 }));
  const d = { items, duckLevel: .22, len: 3.4 };
  D = d; try { applyPresetTo(p, {}); } catch (e) { console.warn(e); } finally { D = prev; }
  return (PRC[id] = d);
}

// ---------- pane + dialog ----------
async function presetShow() {
  const box = $('#pane-preset'); if (!box) return;
  if (!box.dataset.built) {
    box.dataset.built = 1;
    box.innerHTML = `<div class="aicard"><h4>🍜 โยนฟุตอาหาร → ปุ่มเดียว</h4><div class="mini">เลือกช่วงที่สวยที่สุดของแต่ละคลิป ตัดสั้น เรียงลำดับ ใส่สี/ทรานสิชัน/ซูม ตัดตามจังหวะเพลง</div><button class="wide primary" id="fdP">เริ่ม</button></div><div class="aicard"><h4>🎵 ตัดตามบีตเพลง</h4><div class="mini">จัดจุดตัดคลิปที่มีอยู่ในไทม์ไลน์ให้ตรงจังหวะเพลงที่ใส่ไว้</div><button class="wide" id="bsP">จัดจังหวะ</button></div><div class="hint">เลือกพรีเซ็ต แล้วดูตัวอย่างบนภาพจากคลิปของคุณเอง · เอาเมาส์ชี้เพื่อดูแบบเคลื่อนไหว · กดเพื่อดูใหญ่และใช้</div><div class="tiles" id="tilesPreset"></div>`;
    $('#fdP', box).onclick = foodUI; $('#bsP', box).onclick = beatSnapTimeline;
    const tl = $('#tilesPreset');
    PRESETS.forEach(p => {
      const t = document.createElement('div'); t.className = 'tile'; t.dataset.key = p.id; t.dataset.kind = 'preset';
      t.innerHTML = `<canvas width="${PV.W}" height="${PV.H}"></canvas><span>${p.ico} ${esc(p.name)}</span>`; tl.appendChild(t);
      t.addEventListener('mouseenter', () => pvStart(t)); t.addEventListener('mouseleave', () => pvStop(t)); t.addEventListener('click', () => { pvStop(); presetDialog(p.id); });
    });
  }
  await pvSamples(); pvPosters();
}
function presetDialog(id) {
  const p = PRESETS.find(x => x.id === id);
  const chk = (k, l, on = 1) => `<label class="fld chk"><input type="checkbox" data-o="${k}" ${on ? 'checked' : ''}> ${l}</label>`;
  aiDlg(p.ico + ' ' + p.name, `<div style="display:flex;gap:14px;flex-wrap:wrap"><canvas id="pdCv" width="216" height="384" style="border-radius:10px;background:#000;flex:none"></canvas>
    <div style="flex:1;min-width:200px"><div class="hint">${esc(p.desc)}</div><div class="mini">${esc(p.tags)}</div>
    <div style="margin-top:8px">${chk('grade', 'สี / ฟิลเตอร์')}${p.trans && p.trans[0] !== 'none' ? chk('trans', 'ทรานสิชันตรงรอยต่อ') : ''}${chk('zoom', 'ซูม / ขยับภาพ')}${chk('text', 'สไตล์ข้อความบนจอ')}${chk('subs', 'สไตล์ซับ (ถ้ามี)')}${p.bursts ? chk('stick', 'สติกเกอร์ดาวระเบิด') : ''}</div>
    <div class="mini" style="margin-top:6px">ตัวอย่างนี้ใช้ภาพจากคลิปของคุณ · ใช้แล้วกด ↶ ย้อนกลับได้ · ซับสร้างได้ที่แท็บ AI (💬) แล้วมากดพรีเซ็ตอีกครั้ง</div></div></div>
    <div class="row"><span class="sp"></span><button class="primary" id="pdGo">ใช้พรีเซ็ตนี้</button></div>`, root => {
    const cv = $('#pdCv', root), t0 = performance.now(); const dlg = $('#dlgAi');
    const loop = now => { if (!cv.isConnected || !dlg.open) return; pvDraw(cv, 'preset', id, ((now - t0) % 3600) / 3600); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    $('#pdGo', root).onclick = () => { const o = {}; root.querySelectorAll('[data-o]').forEach(x => { o[x.dataset.o] = x.checked ? 1 : 0; }); dlg.close(); applyPreset(id, o); };
  });
}
