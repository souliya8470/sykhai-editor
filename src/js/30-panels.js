// ============================================================
//  Left panels (library) + right inspector
// ============================================================
const FX_PRESETS = [
  { id: 'none', label: 'ต้นฉบับ', fx: {} },
  { id: 'vivid', label: 'สดใส', fx: { saturate: 1.25, contrast: 1.08, brightness: 1.03 } },
  { id: 'warm', label: 'อบอุ่น', fx: { sepia: .18, saturate: 1.2, hue: -8, brightness: 1.04 } },
  { id: 'cool', label: 'เย็นสดชื่น', fx: { saturate: 1.05, hue: 10, brightness: 1.03, contrast: 1.05 } },
  { id: 'bright', label: 'ผิวขาวใส', fx: { brightness: 1.12, contrast: .96, saturate: 1.05 } },
  { id: 'cine', label: 'ซีนีมา + มุมมืด', fx: { contrast: 1.15, saturate: .9, vignette: .55 } },
  { id: 'bw', label: 'ขาวดำ', fx: { gray: 1, contrast: 1.12 } },
  { id: 'bwred', label: 'ขาวดำ + แดงเรืองแสง', fx: { gray: 1, contrast: 1.15, pain: { x: .5, y: .5, r: .22 } } },
  { id: 'glitch', label: 'กลิตช์', fx: { glitch: 1 } },
  { id: 'blur', label: 'เบลอ', fx: { blur: 6 } },
  { id: 'sharp', label: 'คมชัด', fx: { sharpen: 1 } },
  { id: 'sharp2', label: 'คมชัดมาก + ลดนอยส์', fx: { sharpen: 2, denoise: 1 } },
];
const STICKERS = [['check', 'ถูกต้อง ✔'], ['warning', 'เตือน ⚠'], ['cursor', 'มือชี้'], ['brackets', 'กรอบโฟกัส'], ['arrow', 'ลูกศร'], ['star', 'ดาว'], ['underline', 'ขีดเส้นใต้'], ['circle', 'วงรีวง']];
const MASK_OPTS = [['none', 'ไม่มี'], ['circle', 'วงกลม'], ['round', 'มุมมน'], ['frame', 'การ์ดกรอบขาว'], ['featherTop', 'ฟุ้งขอบบน'], ['featherBottom', 'ฟุ้งขอบล่าง'], ['featherAll', 'ฟุ้งรอบด้าน']];

// ---------- tabs ----------
const TABS = [['media', 'สื่อ'], ['text', 'ข้อความ'], ['sticker', 'สติกเกอร์'], ['trans', 'ทรานสิชัน'], ['fx', 'เอฟเฟกต์'], ['audio', 'เสียง'], ['ai', 'AI ✨']];
function buildLeft() {
  $('#leftTabs').innerHTML = TABS.map(([id, l], i) => `<button data-tab="${id}" class="${i ? '' : 'on'}">${l}</button>`).join('');
  $('#leftTabs').onclick = e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); };
  // text pane
  $('#pane-text').innerHTML = `<div class="hint">กดเพื่อเพิ่มข้อความที่ตำแหน่งหัวอ่าน (เส้นแดง) — ใช้ *คำ* เพื่อทำตัวเหลือง/เน้น</div>` +
    TEXT_STYLES.map(s => `<button class="tstyle" data-style="${s.id}">${esc(s.label)}</button>`).join('') +
    `<hr><button id="btnFooter" class="wide">+ ใส่ข้อความท้ายจอตลอดคลิป</button>`;
  $('#pane-text').onclick = e => {
    const b = e.target.closest('.tstyle'); if (b) addText(b.dataset.style);
    if (e.target.id === 'btnFooter') addFooter();
  };
  // sticker pane
  $('#pane-sticker').innerHTML = `<div class="grid2">` + STICKERS.map(([k, l]) => `<button class="stk" data-k="${k}">${l}</button>`).join('') + `</div><hr>
    <div class="row"><input id="emojiIn" value="🔥" maxlength="4" style="width:60px;font-size:22px;text-align:center"><button id="addEmoji">+ อีโมจิ</button></div>`;
  $('#pane-sticker').onclick = e => {
    const b = e.target.closest('.stk'); if (b) addSticker(b.dataset.k);
    if (e.target.id === 'addEmoji') addSticker('emoji', { text: $('#emojiIn').value || '🔥' });
  };
  // transitions + effects: animated tiles (hover = preview, drag = drop onto timeline)
  $('#pane-trans').innerHTML = `<div class="hint">เอาเมาส์ชี้เพื่อดูตัวอย่าง · ลากไปวาง “ตรงรอยต่อระหว่างคลิป” บนไทม์ไลน์ หรือเลือกคลิปแล้วกด</div><div class="tiles" id="tilesTrans"></div>`;
  $('#pane-fx').innerHTML = `<div class="hint">เอาเมาส์ชี้เพื่อดูตัวอย่าง · ลากไปวางบนคลิป หรือเลือกคลิปแล้วกด (ปรับละเอียดได้ที่แผงขวา)</div><div class="tiles" id="tilesFx"></div><div class="hint" style="margin-top:12px">รูปทรง / กรอบ / ซูม</div><div class="tiles" id="tilesMk"></div>`;
  buildTiles();
  // audio
  $('#pane-audio').innerHTML = `<div class="hint">นำเข้าไฟล์เพลง/เสียงจากปุ่ม “สื่อ” (mp3, wav, m4a) แล้วกดใส่เป็นเพลง/เอฟเฟกต์ได้ที่นี่</div><div id="audioList"></div><hr><div class="hint">เสียงเอฟเฟกต์ในตัว (กดเพื่อใส่ที่หัวอ่าน)</div><div class="grid2">` +
    [['whoosh', 'วูช (ผ่าน)'], ['swipe', 'สวิป'], ['pop', 'ป๊อป'], ['ding', 'ติ๊ง'], ['click', 'คลิก'], ['boom', 'ตูม']].map(([k, l]) => `<button class="sfx" data-k="${k}">${l}</button>`).join('') + `</div>`;
  $('#pane-audio').onclick = e => {
    const s = e.target.closest('.sfx'); if (s) addBuiltinSfx(s.dataset.k);
    const a = e.target.closest('[data-aadd]'); if (a) addMediaToTimeline(a.dataset.id, a.dataset.aadd, PB.t);
  };
  $('#btnImport').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => { importFiles(e.target.files); e.target.value = ''; };
}
function showTab(id) {
  $$('#leftTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  $$('.lpane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + id));
  if (id === 'audio') renderAudioList(); if (id === 'ai' && window.renderAiPane) renderAiPane();
}
function renderAudioList() {
  const box = $('#audioList'); if (!box) return; const arr = [...MEDIA.values()].filter(m => m.type === 'audio');
  box.innerHTML = arr.length ? arr.map(m => `<div class="arow"><span title="${esc(m.name)}">♪ ${esc(m.name)}</span><button data-aadd="A1" data-id="${m.id}">เพลง</button><button data-aadd="A2" data-id="${m.id}">เอฟเฟกต์</button></div>`).join('') : '<div class="empty">ยังไม่มีไฟล์เสียง</div>';
}
on('media', renderAudioList); on('media-added', renderAudioList);

// ---------- add commands ----------
function addText(styleId, text, start, dur, extra) {
  start = start ?? PB.t; dur = dur ?? 3;
  const it = mkText(styleId, text, start, dur, extra); it.track = (extra && extra.track) || freeTrack('text', start, dur, 'T1');
  addItem(it); commit('text'); select(it.id); return it;
}
function addFooter() { const it = mkText('footer', null, 0, durEnd(), { track: 'T3', anim: { in: 'fade', out: 'none', d: .4 } }); addItem(it); commit('footer'); select(it.id); }
function addSticker(kind, extra) {
  const dur = 2; const it = mkSticker(kind, PB.t, dur, extra); it.track = freeTrack('text', PB.t, dur, 'T3');
  if (kind === 'cursor') { it.size = 150; it.ay = .6; it.anim = { in: 'pop', out: 'fade', d: .2 }; } if (kind === 'brackets') it.size = 300; if (kind === 'underline') it.size = 260;
  addItem(it); commit('sticker'); select(it.id);
}
function applyTransition(it, type, dur) {
  if (!it || (it.type !== 'video' && it.type !== 'image')) { toast('เลือกคลิปวิดีโอ/ภาพบนไทม์ไลน์ก่อน'); return; }
  const prevExt = it.transIn && it.transIn.ext || 0; const prev = it.transIn && it.transIn.prevId ? getItem(it.transIn.prevId) : null;
  if (prev && prevExt) prev.dur = Math.max(0.1, prev.dur - prevExt);
  if (type === 'none') { it.transIn = null; commit('trans'); return; }
  dur = dur || (it.transIn && it.transIn.dur) || 0.5; dur = Math.min(dur, it.dur * 0.9);
  const p2 = D.items.find(o => o.track === it.track && o.id !== it.id && Math.abs(o.start + o.dur - it.start) < 0.06);
  it.transIn = { type, dur };
  if (p2) { p2.dur += dur; it.transIn.ext = dur; it.transIn.prevId = p2.id; }
  commit('trans'); seek(Math.max(0, it.start - 0.4)); play();
  setTimeout(() => { if (PB.t > it.start + dur + 0.4) pause(); }, 1500);
}
function applyFxPreset(it, k) {
  if (!it || (it.type !== 'video' && it.type !== 'image')) { toast('เลือกคลิปวิดีโอ/ภาพก่อน'); return; }
  const p = FX_PRESETS.find(x => x.id === k); it.fx = JSON.parse(JSON.stringify(p.fx)); commit('fx'); renderInspector();
}
function applyMaskTo(it, k) {
  switch (k) {
    case 'pip': it.mask = { type: 'circle', ring: .01, size: 1, color: '#ffffff' }; it.xf.s = .36; it.xf.x = .26; it.xf.y = .3; it.fit = 'cover'; break;
    case 'card': it.mask = { type: 'frame', ring: .014, scale: 1 }; it.xf.s = .82; it.xf.x = 0; it.xf.y = 0; it.xf.r = -3; break;
    case 'round': it.mask = { type: 'round', r: .06 }; break;
    case 'fTop': it.mask = { type: 'featherTop', size: .3 }; break;
    case 'fBot': it.mask = { type: 'featherBottom', size: .3 }; break;
    case 'fAll': it.mask = { type: 'featherAll', size: .35 }; break;
    case 'kbIn': it.kb = 'in'; break; case 'kbOut': it.kb = 'out'; break; case 'kbPan': it.kb = 'pan'; break;
  }
}
function applyMaskPreset(it, k) {
  if (!it || (it.type !== 'video' && it.type !== 'image')) { toast('เลือกคลิปวิดีโอ/ภาพก่อน'); return; }
  applyMaskTo(it, k); commit('mask'); renderInspector();
}

// ---------- built-in SFX ----------
function encodeWav(f32, sr) {
  const n = f32.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, clamp(f32[i], -1, 1) * 32767, true); return new Blob([b], { type: 'audio/wav' });
}
function genSfx(kind) {
  const sr = 44100; let n, f; let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  if (kind === 'whoosh' || kind === 'swipe') {
    const d = kind === 'whoosh' ? .7 : .35; n = Math.floor(sr * d); f = new Float32Array(n); let lp = 0;
    for (let i = 0; i < n; i++) { const p = i / n; const env = Math.sin(Math.PI * p) ** 1.5; const a = kind === 'whoosh' ? .02 + .35 * Math.sin(Math.PI * p) : .04 + .5 * p; lp += a * (rnd() - lp); f[i] = lp * env * 1.6; }
  } else if (kind === 'pop') { n = Math.floor(sr * .18); f = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; f[i] = Math.sin(2 * Math.PI * (180 + 520 * Math.exp(-t * 40)) * t) * Math.exp(-t * 28) * .9; } }
  else if (kind === 'ding') { n = Math.floor(sr * 1.1); f = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; f[i] = (Math.sin(2 * Math.PI * 1318 * t) + .4 * Math.sin(2 * Math.PI * 1975 * t) + .2 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-t * 4.5) * .45; } }
  else if (kind === 'click') { n = Math.floor(sr * .06); f = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; f[i] = rnd() * Math.exp(-t * 90) * .7; } }
  else { n = Math.floor(sr * 1.0); f = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; f[i] = (Math.sin(2 * Math.PI * (70 - 30 * t) * t) * Math.exp(-t * 5) + rnd() * .25 * Math.exp(-t * 12)) * .9; } }
  return encodeWav(f, sr);
}
const SFX_CACHE = {};
async function addBuiltinSfx(kind) {
  let id = SFX_CACHE[kind];
  if (!id || !MEDIA.has(id)) {
    const blob = genSfx(kind); const url = URL.createObjectURL(blob); const f = new File([blob], 'sfx-' + kind + '.wav', { type: 'audio/wav' });
    const m = { id: uid(), name: 'เอฟเฟกต์ ' + kind, type: 'audio', file: f, url, duration: 0, builtin: true };
    const a = new Audio(); a.src = url; await new Promise(r => { a.onloadedmetadata = r; setTimeout(r, 2000); }); m.duration = a.duration || 1; m.hasAudio = true; m.norm = 1;
    MEDIA.set(m.id, m); id = SFX_CACHE[kind] = m.id; renderMediaBin(); renderAudioList();
  }
  const it = mkAudio('A2', id, PB.t, MEDIA.get(id).duration); it.track = freeTrack('audio', PB.t, it.dur, 'A2'); if (it.track === 'A1') it.track = 'A2'; it.vol = .9; it.fadeIn = 0; it.fadeOut = 0.05; it.duck = false; it.loop = false;
  addItem(it); commit('sfx'); select(it.id);
}

// ============================================================
//  Inspector
// ============================================================
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }
function curVal(it, p) { if (p.startsWith('xf.')) return prop(it, p.slice(3), PB.t); return getPath(it, p); }
function setXf(it, k, v) {
  const kf = it.kf && it.kf[k];
  if (kf && kf.length) { const lt = clamp(PB.t - it.start, 0, it.dur); const e = kf.find(p => Math.abs(p.t - lt) < 0.04); if (e) e.v = v; else { kf.push({ t: lt, v }); kf.sort((a, b) => a.t - b.t); } }
  else it.xf[k] = v;
}
function kfToggle(it, k) {
  it.kf = it.kf || {}; const lt = clamp(PB.t - it.start, 0, it.dur); const arr = it.kf[k] || (it.kf[k] = []); const i = arr.findIndex(p => Math.abs(p.t - lt) < 0.04);
  if (i >= 0) { arr.splice(i, 1); if (!arr.length) { delete it.kf[k]; } }
  else { const v = prop(it, k, PB.t); if (!arr.length) { arr.push({ t: 0, v }); if (lt > 0.04) arr.push({ t: lt, v }); } else { arr.push({ t: lt, v }); arr.sort((a, b) => a.t - b.t); } }
  commit('kf');
}
const KF_ON = (it, k) => { const lt = PB.t - it.start; return it.kf && it.kf[k] && it.kf[k].some(p => Math.abs(p.t - lt) < 0.04); };

function R(label, p, min, max, step, it, kf, fmtv) {
  const v = curVal(it, p); const val = v == null ? (min <= 0 && max >= 0 ? 0 : min) : v;
  const k = kf ? p.slice(3) : null;
  return `<div class="fld"><label>${label}</label><input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${(+val).toFixed(step < .1 ? 2 : step < 1 ? 1 : 0)}</output>${kf ? `<button class="kfb ${KF_ON(it, k) ? 'on' : ''}" data-kf="${k}" title="คีย์เฟรม">◆</button>` : ''}</div>`;
}
function S(label, p, opts, it) { const v = getPath(it, p) ?? opts[0][0]; return `<div class="fld"><label>${label}</label><select data-p="${p}">${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`; }
function C(label, p, it, def) { const v = getPath(it, p); return `<div class="fld"><label>${label}</label><input type="color" data-p="${p}" value="${toHex(v || def || '#ffffff')}"></div>`; }
function K(label, p, it, def) { const v = getPath(it, p); return `<div class="fld chk"><label><input type="checkbox" data-p="${p}" ${(v ?? def) ? 'checked' : ''}> ${label}</label></div>`; }
function toHex(c) { if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7); if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map(x => x + x).join(''); return '#ffffff'; }

const ANIM_IN = [['none', 'ไม่มี'], ['fade', 'เลือน'], ['pop', 'ป๊อป'], ['bounce', 'เด้ง'], ['up', 'ลอยขึ้น'], ['left', 'สไลด์จากซ้าย'], ['drop', 'ตกลงมา'], ['zoom', 'ซูมเข้า'], ['type', 'พิมพ์ทีละตัว']];

function renderInspector() {
  const box = $('#inspector'); if (!box) return; const it = SEL ? getItem(SEL) : null;
  if (!it) { box.innerHTML = projectInspector(); bindInspector(null); return; }
  let h = `<div class="ihead"><b>${{ video: 'คลิปวิดีโอ', image: 'รูปภาพ', text: 'ข้อความ', sticker: 'สติกเกอร์', audio: 'เสียง' }[it.type]}</b><span class="sp"></span><button data-act="dup">ทำซ้ำ</button><button data-act="del" class="danger">ลบ</button></div>`;
  h += `<div class="fld"><label>เริ่ม</label><input type="number" step="0.1" data-p="start" value="${it.start.toFixed(2)}" class="num"><label class="r">ยาว</label><input type="number" step="0.1" min="0.1" data-p="dur" value="${it.dur.toFixed(2)}" class="num"></div>`;
  if (it.type === 'video' || it.type === 'image') {
    h += `<div class="sec">ตำแหน่ง / ขนาด</div>` + R('ซ้าย-ขวา', 'xf.x', -1, 1, .005, it, 1) + R('บน-ล่าง', 'xf.y', -1, 1, .005, it, 1) + R('ขนาด', 'xf.s', .1, 4, .01, it, 1) + R('หมุน', 'xf.r', -180, 180, 1, it, 1) + R('ความโปร่งใส', 'xf.o', 0, 1, .01, it, 1);
    h += S('การแสดงผล', 'fit', [['cover', 'เต็มจอ 9:16 (ครอป)'], ['contain', 'ทั้งภาพ (มีขอบ)']], it);
    if (it.type === 'video') h += `<div class="sec">ความเร็ว / เสียง</div>` + R('ความเร็ว', 'speed', .25, 4, .05, it) + R('ระดับเสียง', 'vol', 0, 2, .01, it) + K('ปรับระดับเสียงอัตโนมัติ', 'normalize', it, true) + K('ปิดเสียงคลิปนี้', 'muted', it, false) + `<div class="fld"><label>เสียงที่ปิดไว้</label><span class="mini">${(it.mutes || []).length} ช่วง</span><button data-act="clearmutes">ล้าง</button></div>`;
    h += `<div class="sec">สี / เอฟเฟกต์</div>` + R('สว่าง', 'fx.brightness', .5, 1.6, .01, it) + R('คอนทราสต์', 'fx.contrast', .5, 1.8, .01, it) + R('ความสด', 'fx.saturate', 0, 2.5, .01, it) + R('ขาวดำ', 'fx.gray', 0, 1, .01, it) + R('โทนอุ่น (ซีเปีย)', 'fx.sepia', 0, 1, .01, it) + R('เปลี่ยนสี', 'fx.hue', -180, 180, 1, it) + R('เบลอ', 'fx.blur', 0, 30, .5, it) + R('มุมมืด', 'fx.vignette', 0, 1, .01, it) + R('กลิตช์', 'fx.glitch', 0, 2, .05, it) + S('ความคมชัด', 'fx.sharpen', [[0, 'ปิด'], [1, 'คม'], [2, 'คมมาก']], it) + K('ลดนอยส์', 'fx.denoise', it, false);
    if (it.fx && it.fx.pain) h += R('แสงแดง: X', 'fx.pain.x', 0, 1, .01, it) + R('แสงแดง: Y', 'fx.pain.y', 0, 1, .01, it) + R('แสงแดง: ขนาด', 'fx.pain.r', .05, .8, .01, it);
    h += `<div class="sec">กรอบ / มาสก์</div>` + S('รูปทรง', 'mask.type', MASK_OPTS, it);
    const mt = it.mask && it.mask.type; if (mt === 'circle') h += R('ขนาดวง', 'mask.size', .3, 1.2, .01, it) + R('ขอบ', 'mask.ring', 0, .03, .001, it) + C('สีขอบ', 'mask.color', it, '#ffffff'); if (mt === 'round') h += R('ความโค้ง', 'mask.r', 0, .5, .01, it); if (mt === 'frame') h += R('ขอบขาว', 'mask.ring', 0, .05, .001, it); if (mt && mt.startsWith('feather')) h += R('ความฟุ้ง', 'mask.size', .05, .8, .01, it);
    h += S('Ken Burns', 'kb', [['none', 'ไม่มี'], ['in', 'ซูมเข้า'], ['out', 'ซูมออก'], ['pan', 'แพน']], it);
    h += `<div class="sec">ทรานสิชัน (ตอนเริ่มคลิป)</div>` + S('ชนิด', 'transIn.type', Object.entries(TRANS).map(([k, v]) => [k, v.label]), Object.assign({}, it, { transIn: it.transIn || { type: 'none' } })) + (it.transIn ? R('ความยาว (วิ)', 'transIn.dur', .15, 1.5, .05, it) : '');
    h += `<div class="sec">AI</div><div class="btnrow"><button data-act="enhance">✨ ปรับภาพให้สวย/ชัดอัตโนมัติ</button>` + (it.type === 'video' ? `<button data-act="silence">✂ ตัดช่วงเงียบ</button><button data-act="aiclip">🎙 วิเคราะห์เสียงคลิปนี้</button>` : '') + `</div>`;
  } else if (it.type === 'text') {
    h += `<div class="fld col"><label>ข้อความ (บรรทัดใหม่ = Enter, *คำ* = เน้นเหลือง)</label><textarea data-p="text" rows="3">${esc(it.text)}</textarea></div>`;
    h += `<div class="btnrow"><button data-act="translate">🌐 แปลไทย→ลาว</button></div>`;
    h += S('สไตล์สำเร็จรูป', 'style', TEXT_STYLES.map(s => [s.id, s.label]), it);
    h += `<div class="sec">ตำแหน่ง</div>` + R('แนวตั้ง (0=บน, 1=ล่าง)', 'ay', 0, 1, .005, it) + R('ซ้าย-ขวา', 'xf.x', -1, 1, .005, it, 1) + R('ขยับขึ้น-ลง', 'xf.y', -.5, .5, .005, it, 1) + R('ขนาดซูม', 'xf.s', .3, 3, .01, it, 1) + R('หมุน', 'xf.r', -45, 45, .5, it, 1) + R('ความกว้างสูงสุด', 'maxW', .3, 1, .01, it);
    h += `<div class="sec">รูปแบบตัวอักษร</div>` + R('ขนาด', 'size', 16, 200, 1, it) + R('น้ำหนัก', 'weight', 400, 900, 100, it) + C('สีบรรทัด 1', 'color', it) + C('สีบรรทัด 2 / เน้น', 'color2', it) + C('สีขอบตัวอักษร', 'stroke', it, '#000000') + R('ความหนาขอบ', 'strokeW', 0, 24, 1, it) + K('เงา', 'shadow', it, false);
    h += S('กรอบพื้นหลัง', 'box', [['none', 'ไม่มี'], ['line', 'แถบต่อบรรทัด'], ['line2', 'แถบ: บรรทัดล่างสีต่าง'], ['block', 'ป้ายก้อนเดียว']], it);
    if (it.box && it.box !== 'none') h += C('สีพื้น', 'bg', it, '#000000') + (it.box === 'line2' ? C('สีแถบบรรทัด 2', 'bg2', it, '#E02B3A') : '');
    h += `<div class="sec">แอนิเมชัน</div>` + S('เข้า', 'anim.in', ANIM_IN, it) + S('ออก', 'anim.out', [['none', 'ไม่มี'], ['fade', 'เลือนหาย'], ['down', 'ตกลง']], it) + R('ความเร็ว (วิ)', 'anim.d', .1, 1, .05, it) + R('บรรทัด 2 ตามมาหลัง (วิ)', 'reveal', 0, 2, .05, it) + K('เอฟเฟกต์เงาตามหลัง', 'anim.echo', it, false);
  } else if (it.type === 'sticker') {
    h += `<div class="sec">ตำแหน่ง</div>` + R('แนวตั้ง', 'ay', 0, 1, .005, it) + R('ซ้าย-ขวา', 'xf.x', -1, 1, .005, it, 1) + R('ขยับขึ้น-ลง', 'xf.y', -.5, .5, .005, it, 1) + R('ขนาด', 'size', 40, 700, 1, it) + R('ซูม', 'xf.s', .3, 3, .01, it, 1) + R('หมุน', 'xf.r', -180, 180, 1, it, 1) + C('สี', 'color', it, '#FFD60A');
    if (it.kind === 'emoji') h += `<div class="fld"><label>อีโมจิ</label><input data-p="text" value="${esc(it.text)}" maxlength="4"></div>`;
    h += S('เข้า', 'anim.in', ANIM_IN.slice(0, 8), it) + S('ออก', 'anim.out', [['none', 'ไม่มี'], ['fade', 'เลือนหาย']], it);
  } else if (it.type === 'audio') {
    const m = MEDIA.get(it.mediaId); h += `<div class="hint">${esc(m ? m.name : '')}</div>` + R('ระดับเสียง', 'vol', 0, 1.5, .01, it) + R('ค่อยๆ ดังขึ้น (วิ)', 'fadeIn', 0, 5, .1, it) + R('ค่อยๆ เบาลง (วิ)', 'fadeOut', 0, 5, .1, it) + K('ลดเสียงอัตโนมัติเมื่อมีคนพูด (ducking)', 'duck', it, false) + K('วนซ้ำจนจบช่วง', 'loop', it, false) + `<div class="fld"><label>เริ่มจากวินาทีที่</label><input type="number" step="0.1" min="0" data-p="in" value="${(it.in || 0).toFixed(1)}" class="num"></div>`;
  }
  box.innerHTML = h; bindInspector(it);
}
function projectInspector() {
  return `<div class="ihead"><b>โปรเจกต์</b></div><div class="hint">ขนาดวิดีโอ 1080×1920 (9:16) · ความยาวรวม ${fmt(projectEnd())}</div>
  ${R('ระดับเสียงเพลงตอนมีคนพูด', 'duckLevel', .05, 1, .01, D)}
  <div class="sec">ทางลัด</div><div class="btnrow"><button data-act="gaps">ชิดคลิปวิดีโอ 1 (ลบช่องว่าง)</button></div>
  <div class="hint small">ปุ่มลัด: Space เล่น/หยุด · S ตัด · Delete ลบ · Shift+Delete ลบแล้วดึงคลิปตามมา · ⌘Z ย้อนกลับ · ⌘⇧Z ทำซ้ำ · ←/→ ขยับ 1 เฟรม · ⌘+ลูกกลิ้ง ซูมไทม์ไลน์</div>`;
}
function bindInspector(it) {
  const box = $('#inspector');
  box.oninput = e => {
    const el = e.target; const p = el.dataset.p; if (!p) return; const tgt = it || D;
    let v = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number') ? parseFloat(el.value) : el.value;
    if (el.tagName === 'SELECT' && /^(fx\.sharpen|transIn\.dur)$/.test(p)) v = parseFloat(v);
    if (p === 'transIn.type') return;
    if (p.startsWith('xf.') && it) setXf(it, p.slice(3), v); else setPath(tgt, p, v);
    if (el.type === 'range') { const o = el.nextElementSibling; if (o && o.tagName === 'OUTPUT') o.textContent = (+v).toFixed(parseFloat(el.step) < .1 ? 2 : parseFloat(el.step) < 1 ? 1 : 0); }
    if (p === 'style' && it) { const st = TEXT_STYLES.find(s => s.id === v); if (st) { const keep = it.text; Object.assign(it, JSON.parse(JSON.stringify(st.d)), { text: keep, style: v }); commit('style'); renderInspector(); return; } }
    dirty(); if (el.type === 'text' || el.tagName === 'TEXTAREA') { renderTimeline(); }
  };
  box.onchange = e => {
    const el = e.target; const p = el.dataset.p; if (!p) return;
    if (p === 'transIn.type') { applyTransition(it, el.value); renderInspector(); return; }
    if (p === 'transIn.dur') { applyTransition(it, it.transIn.type, parseFloat(el.value)); return; }
    if (p === 'mask.type' && it) { if (el.value === 'none') it.mask = { type: 'none' }; else { const d = { circle: { size: 1, ring: .008, color: '#ffffff' }, round: { r: .06 }, frame: { ring: .014 }, featherTop: { size: .3 }, featherBottom: { size: .3 }, featherAll: { size: .35 } }[el.value]; it.mask = Object.assign({ type: el.value }, d); } }
    if (p === 'fx.sharpen' && it) it.fx.sharpen = parseFloat(el.value) || 0;
    if (p === 'dur' && it) { /* keep */ } if (p === 'start' && it) it.start = Math.max(0, it.start);
    commit('inspect'); if (el.tagName === 'SELECT' || el.type === 'checkbox') renderInspector(); else renderTimeline();
  };
  box.onclick = e => {
    const kb = e.target.closest('.kfb'); if (kb && it) { kfToggle(it, kb.dataset.kf); renderInspector(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
    if (act === 'del') cmdDelete(false); else if (act === 'dup') { const b = duplicateItem(it.id); commit('dup'); select(b.id); }
    else if (act === 'clearmutes') { it.mutes = []; commit('mutes'); renderInspector(); }
    else if (act === 'gaps') cmdCloseGaps('V1');
    else if (window.AI && AI.inspectorAction) AI.inspectorAction(act, it);
  };
}
function refreshInspectorValues() {
  const it = SEL ? getItem(SEL) : null; if (!it) return;
  $$('#inspector input[type=range][data-p^="xf."]').forEach(el => { if (document.activeElement === el) return; const v = prop(it, el.dataset.p.slice(3), PB.t); el.value = v; const o = el.nextElementSibling; if (o) o.textContent = (+v).toFixed(parseFloat(el.step) < .1 ? 2 : 1); });
  $$('#inspector .kfb').forEach(b => b.classList.toggle('on', !!KF_ON(it, b.dataset.kf)));
}
on('sel', () => { renderInspector(); renderTimeline(); });
