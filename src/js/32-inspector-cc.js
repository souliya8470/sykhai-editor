// ============================================================
//  CapCut-style tabbed inspector for video / image clips
//  Tabs: Video | Audio | Speed | Animation | Adjust | AI   (+ number boxes & reset buttons on every slider)
// ============================================================
const INSP = { tab: 'video', sub: { video: 'basic', audio: 'basic', speed: 'std', anim: 'in', adjust: 'basic' }, hslc: 'red', ch: 'l' };
try { const o = JSON.parse(localStorage.getItem('sk_insp') || '{}'); if (o.tab) INSP.tab = o.tab; if (o.sub) Object.assign(INSP.sub, o.sub); } catch (e) { }
const inspSave = () => { try { localStorage.setItem('sk_insp', JSON.stringify({ tab: INSP.tab, sub: INSP.sub })); } catch (e) { } };

// ---------- default values (for the ↺ button) ----------
const DEFS = {
  'xf.x': 0, 'xf.y': 0, 'xf.s': 1, 'xf.r': 0, 'xf.o': 1, speed: 1, vol: 1, sx: 1, sy: 1, fadeIn: 0, fadeOut: 0,
  'fx.brightness': 1, 'fx.contrast': 1, 'fx.saturate': 1, 'fx.hue': 0, 'fx.gray': 0, 'fx.sepia': 0, 'fx.blur': 0, 'fx.vignette': 0, 'fx.soften': 0, 'fx.whiten': 0,
  'anim.dIn': .5, 'anim.dOut': .5, 'enh.v': 75, 'chroma.tol': .3, 'chroma.soft': .15, 'kfdummy': 0,
  'mask.size': 1, 'mask.ring': .008, 'mask.r': .06, 'mask.angle': 0, 'mask.pos': 0, 'mask.feather': .05, duckLevel: .35,
};
const DEF_SNAP = new Map();
function defOf(it, p, min, max) {
  if (p in DEFS) return DEFS[p]; if (/^adj\./.test(p)) return 0;
  const k = ((it && it.id) || '') + '|' + p; if (!DEF_SNAP.has(k)) { const v = it ? curVal(it, p) : null; DEF_SNAP.set(k, v == null ? (min <= 0 && max >= 0 ? 0 : min) : v); }
  return DEF_SNAP.get(k);
}
// range slider + number box + reset button (+ keyframe button)
function RR(label, p, min, max, step, it, o) {
  o = o || {}; const m = o.m || 1; const def = o.def !== undefined ? o.def : defOf(it, p, min, max);
  let v = curVal(it, p); if (v == null || !isFinite(v)) v = def; const dec = o.dec !== undefined ? o.dec : (step * m < .1 ? 2 : step * m < 1 ? 1 : 0);
  const mod = Math.abs(v - def) > step / 2;
  const kfk = o.kf ? p.slice(3) : null;
  return `<div class="fld rr"><label>${label}</label><input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${v}"${o.span ? ` data-span="${o.span}"` : ''}><input type="number" class="nv" data-p="${p}" data-m="${m}" data-dec="${dec}" min="${+(min * m).toFixed(4)}" max="${+(max * m).toFixed(4)}" step="${+(step * m).toFixed(4)}" value="${(v * m).toFixed(dec)}"><button class="rst${mod ? ' mod' : ''}" data-rst="${p}" data-d="${def}" title="รีเซ็ตเป็นค่าเริ่มต้น">↺</button>${kfk ? `<button class="kfb ${KF_ON(it, kfk) ? 'on' : ''}" data-kf="${kfk}" title="คีย์เฟรม">◆</button>` : ''}</div>`;
}
function R(label, p, min, max, step, it, kf) { return RR(label, p, min, max, step, it, { kf: !!kf }); }
function fmtOutEl(el, v) { const m = +(el.dataset.m || 1); const dec = el.dataset.dec != null ? +el.dataset.dec : (parseFloat(el.step) * m < .1 ? 2 : parseFloat(el.step) * m < 1 ? 1 : 0); return (v * m).toFixed(dec); }

// ---------- small builders ----------
const BLENDS = [['source-over', 'ปกติ'], ['multiply', 'คูณ (Multiply)'], ['screen', 'สกรีน (Screen)'], ['overlay', 'โอเวอร์เลย์'], ['soft-light', 'ซอฟต์ไลต์'], ['hard-light', 'ฮาร์ดไลต์'], ['darken', 'มืดกว่า'], ['lighten', 'สว่างกว่า'], ['color-dodge', 'ดอดจ์สี'], ['difference', 'ผลต่าง'], ['luminosity', 'ความสว่าง']];
const MASK_GRID = [['none', 'ไม่มี', '⊘'], ['circle', 'วงกลม', '◯'], ['round', 'มุมมน', '▢'], ['frame', 'การ์ดกรอบขาว', '▣'], ['star', 'ดาว', '★'], ['heart', 'หัวใจ', '♥'], ['linear', 'เส้นตรง', '◧'], ['featherTop', 'ฟุ้งขอบบน', '▀'], ['featherBottom', 'ฟุ้งขอบล่าง', '▄'], ['featherAll', 'ฟุ้งรอบ', '◍']];
const HSL_COLORS = [['red', '#e5333b', 'แดง'], ['orange', '#f08a24', 'ส้ม'], ['yellow', '#f2d230', 'เหลือง'], ['green', '#3cb957', 'เขียว'], ['cyan', '#2cc7c7', 'ฟ้าอมเขียว'], ['blue', '#3b6fe0', 'น้ำเงิน'], ['purple', '#8a4fd6', 'ม่วง'], ['magenta', '#d94fb0', 'ชมพู']];
const dis = label => `<div class="fld chk dis"><label><input type="checkbox" disabled> ${label}</label><span class="soon">ยังไม่พร้อม</span></div>`;
const subs = (g, list) => `<div class="isubs">` + list.map(([k, l]) => `<button data-act="isub" data-g="${g}" data-v="${k}" class="${INSP.sub[g] === k ? 'on' : ''}">${l}</button>`).join('') + `</div>`;
const sec = t => `<div class="sec">${t}</div>`;
const grid = (act, list, cur, extra) => `<div class="agrid">` + list.map(([k, l, ic]) => `<button data-act="${act}" data-v="${k}" ${extra || ''} class="${String(cur) === k ? 'on' : ''}"><i>${ic || '•'}</i><span>${l}</span></button>`).join('') + `</div>`;

function setMaskType(it, val) {
  if (val === 'none') it.mask = { type: 'none' };
  else { const d = { circle: { size: 1, ring: .008, color: '#ffffff' }, round: { r: .06 }, frame: { ring: .014 }, star: { size: 1 }, heart: { size: 1.1 }, linear: { angle: 0, pos: 0, feather: .05, inv: false }, featherTop: { size: .3 }, featherBottom: { size: .3 }, featherAll: { size: .35 } }[val]; it.mask = Object.assign({ type: val }, d); }
}

// ---------- tab contents ----------
function ccVideo(it) {
  const sb = INSP.sub.video; let h = subs('video', [['basic', 'พื้นฐาน'], ['bg', 'ลบพื้นหลัง'], ['mask', 'มาสก์'], ['retouch', 'แต่งหน้า/ผิว']]);
  if (sb === 'basic') {
    h += sec('ตำแหน่งและขนาด') + RR('ขนาด (%)', 'xf.s', .1, 4, .01, it, { kf: 1, m: 100, def: 1 }) + K('ปรับขนาดสัดส่วนเดิม (Uniform)', 'uni', it, true);
    if (it.uni === false) h += RR('ขนาดแนวนอน (%)', 'sx', .1, 4, .01, it, { m: 100, def: 1 }) + RR('ขนาดแนวตั้ง (%)', 'sy', .1, 4, .01, it, { m: 100, def: 1 });
    h += RR('ซ้าย-ขวา', 'xf.x', -1, 1, .005, it, { kf: 1, def: 0 }) + RR('บน-ล่าง', 'xf.y', -1, 1, .005, it, { kf: 1, def: 0 }) + RR('หมุน (°)', 'xf.r', -180, 180, 1, it, { kf: 1, def: 0 });
    h += `<div class="alignrow"><button data-act="align" data-v="l" title="ชิดซ้าย">⇤</button><button data-act="align" data-v="c" title="กึ่งกลางแนวนอน">⇔</button><button data-act="align" data-v="r" title="ชิดขวา">⇥</button><button data-act="align" data-v="t" title="ชิดบน">⤒</button><button data-act="align" data-v="m" title="กึ่งกลางแนวตั้ง">⇕</button><button data-act="align" data-v="b" title="ชิดล่าง">⤓</button></div>`;
    h += S('การแสดงผล', 'fit', [['cover', 'เต็มจอ 9:16 (ครอป)'], ['contain', 'ทั้งภาพ (มีขอบ)']], it);
    h += sec('การผสมภาพ (Blend)') + S('โหมด', 'blend', BLENDS, it) + RR('ความโปร่งใส (%)', 'xf.o', 0, 1, .01, it, { kf: 1, m: 100, def: 1 });
    h += sec('คุณภาพภาพ') + S('เพิ่มความคมชัด', 'fx.sharpen', [[0, 'ปิด'], [1, 'ปานกลาง'], [2, 'มาก']], it) + K('ลดนอยส์ภาพ', 'fx.denoise', it, false) + RR('เบลอ', 'fx.blur', 0, 20, .5, it, { def: 0 });
    h += `<div class="btnrow"><button data-act="enhance">✨ ปรับภาพให้สวย/ชัดอัตโนมัติ</button></div>`;
    h += sec('แคนวาส (พื้นหลังด้านหลังคลิป)') + S('พื้นหลัง', 'bg', [['none', 'ไม่มี'], ['blur', 'เบลอ'], ['color', 'สีพื้น']], it) + (it.bg === 'color' ? C('สีพื้น', 'bgColor', it, '#000000') : '') + `<div class="hint small">เห็นผลเมื่อเลือก “ทั้งภาพ (มีขอบ)” หรือย่อขนาดคลิป</div><div class="btnrow"><button data-act="applyall" data-keys="bg,bgColor,fit">ใช้กับทุกคลิป</button></div>`;
    h += sec('Ken Burns') + S('การเคลื่อนไหวภาพ', 'kb', [['none', 'ไม่มี'], ['in', 'ซูมเข้า'], ['out', 'ซูมออก'], ['pan', 'แพน']], it);
    h += sec('ทรานสิชัน (ตอนเริ่มคลิป)') + S('ชนิด', 'transIn.type', Object.entries(TRANS).map(([k, v]) => [k, v.label]), Object.assign({}, it, { transIn: it.transIn || { type: 'none' } })) + (it.transIn ? R('ความยาว (วิ)', 'transIn.dur', .15, 1.5, .05, it) : '');
    if (it.type === 'video') h += sec('AI') + `<div class="btnrow"><button data-act="silence">✂ ตัดช่วงเงียบ</button><button data-act="aiclip">🎙 วิเคราะห์เสียงคลิปนี้</button></div>`;
    h += `<details class="soonbox"><summary>ฟีเจอร์ AI ขั้นสูงของ CapCut (ยังไม่พร้อม)</summary>` + ['ทำภาพนิ่ง (Stabilize)', 'เฟรมต่อเนื่อง (Optical flow)', 'AI ลบ/ขยาย/รีมิกซ์วัตถุ', 'สบตากล้อง (Eye contact)', 'ซิงก์ปากอัตโนมัติ', 'ปรับแสงใหม่ (Relight)', 'ครอปอัตโนมัติ (Auto reframe)', 'ลบแสงกะพริบ', 'ติดตามกล้อง'].map(dis).join('') + `</details>`;
  } else if (sb === 'bg') {
    const ck = it.chroma || {};
    h += sec('ลบพื้นหลัง') + dis('ลบอัตโนมัติ (AI)') + dis('ลบแบบกำหนดเอง') + `<div class="hint small">ทั้งสองแบบต้องใช้ AI ตัดคน — ยังไม่มีในตัวแก้ไขนี้</div>`;
    h += sec('Chroma key (ฉากเขียว/ฉากสี)') + K('เปิดใช้ Chroma key', 'chroma.on', it, false) + C('สีที่จะลบ', 'chroma.color', it, '#00ff00') + (window.EyeDropper ? `<div class="btnrow"><button data-act="eyedrop">🎯 ดูดสีจากหน้าจอ</button></div>` : '') + RR('ความแรง', 'chroma.tol', 0, 1, .01, it, { def: .3 }) + RR('ความนุ่มของขอบ', 'chroma.soft', 0, 1, .01, it, { def: .15 });
    h += `<div class="hint small">พื้นหลังที่ถูกลบจะโปร่งใส — วางคลิปอื่นไว้แถวล่างเพื่อให้เห็นเป็นพื้นหลัง</div>`;
  } else if (sb === 'mask') {
    const mt = (it.mask && it.mask.type) || 'none';
    h += sec('เพิ่มมาสก์') + grid('mask', MASK_GRID, mt);
    if (mt === 'circle') h += RR('ขนาดวง', 'mask.size', .3, 1.2, .01, it, { def: 1 }) + RR('ขอบ', 'mask.ring', 0, .03, .001, it, { def: .008 }) + C('สีขอบ', 'mask.color', it, '#ffffff');
    if (mt === 'round') h += RR('ความโค้ง', 'mask.r', 0, .5, .01, it, { def: .06 });
    if (mt === 'frame') h += RR('ขอบขาว', 'mask.ring', 0, .05, .001, it, { def: .014 });
    if (mt === 'star' || mt === 'heart') h += RR('ขนาด', 'mask.size', .3, 1.4, .01, it, { def: 1 });
    if (mt === 'linear') h += RR('มุม (°)', 'mask.angle', -180, 180, 1, it, { def: 0 }) + RR('ตำแหน่ง', 'mask.pos', -.6, .6, .01, it, { def: 0 }) + RR('ความนุ่ม', 'mask.feather', .002, .4, .002, it, { def: .05 }) + K('กลับด้าน', 'mask.inv', it, false);
    if (mt.startsWith('feather')) h += RR('ความฟุ้ง', 'mask.size', .05, .8, .01, it, { def: .3 });
  } else {
    h += sec('แต่งผิว (ใช้กับทั้งภาพ)') + RR('ผิวเนียน (%)', 'fx.soften', 0, 1, .01, it, { m: 100, def: 0 }) + RR('ผิวขาวใส (%)', 'fx.whiten', 0, 1, .01, it, { m: 100, def: 0 });
    h += `<div class="hint small">ยังไม่มีระบบจับใบหน้า (AI) จึงปรับทั้งภาพ ไม่ได้เฉพาะใบหน้า</div><details class="soonbox"><summary>แต่งหน้า/รูปร่าง/ผม (ยังไม่พร้อม)</summary>` + ['ปรับรูปหน้า', 'ปรับดวงตา/จมูก/ปาก', 'ปรับรูปร่าง', 'สีผม'].map(dis).join('') + `</details>`;
  }
  return h;
}
function ccAudio(it) {
  const sb = INSP.sub.audio; let h = subs('audio', [['basic', 'พื้นฐาน'], ['voice', 'เปลี่ยนเสียง']]); const m = MEDIA.get(it.mediaId);
  if (m && m.hasAudio === false) return h + `<div class="hint">คลิปนี้ไม่มีเสียง</div>`;
  if (sb === 'basic') {
    h += RR('ระดับเสียง (%)', 'vol', 0, 1.5, .01, it, { m: 100, def: 1 }) + RR('ค่อยๆ ดังขึ้น (วิ)', 'fadeIn', 0, 5, .1, it, { def: 0 }) + RR('ค่อยๆ เบาลง (วิ)', 'fadeOut', 0, 5, .1, it, { def: 0 });
    h += K('ปรับระดับเสียงอัตโนมัติ (Normalize)', 'normalize', it, true) + K('ปิดเสียงคลิปนี้', 'muted', it, false);
    h += K('เพิ่มความชัดของเสียงพูด', 'enh.on', it, false) + (it.enh && it.enh.on ? RR('ความแรง', 'enh.v', 0, 100, 1, it, { def: 75 }) : '') + K('ลดเสียงรบกวน (กรองความถี่)', 'aDn', it, false);
    h += `<div class="fld"><label>เสียงที่ปิดไว้</label><span class="mini">${(it.mutes || []).length} ช่วง</span><button data-act="clearmutes">ล้าง</button></div>`;
    h += `<div class="btnrow"><button data-act="sepaudio">🎵 แยกเสียงออกจากวิดีโอ</button></div>` + dis('แปลเสียงวิดีโอ (Video translator)');
  } else {
    h += `<div class="btnrow"><button data-act="applyall" data-keys="vfx,enh,aDn">ใช้กับทุกคลิป</button></div>` + sec('ฟิลเตอร์เสียง') + grid('voice', VOICES.map(([k, l]) => [k, l, k === 'orig' ? '⊘' : '♪']), it.vfx || 'orig');
    h += `<div class="hint small">เสียงตัวการ์ตูน/แปลงเป็นเพลงต้องเปลี่ยนระดับเสียงแบบ AI — ยังไม่มี</div>`;
  }
  return h;
}
function ccSpeed(it) {
  const sb = INSP.sub.speed; let h = subs('speed', [['std', 'มาตรฐาน'], ['curve', 'เส้นโค้ง'], ['vel', 'เอฟเฟกต์ความเร็ว']]);
  if (sb === 'std') {
    const span = it.dur * (it.speed || 1);
    h += sec('ความเร็ว') + `<div class="chips spd">` + [.25, .5, .75, 1, 1.5, 2, 3, 4].map(x => `<button data-act="spdset" data-v="${x}" class="${(it.speed || 1) === x ? 'on' : ''}">${x}x</button>`).join('') + `</div>`;
    h += RR('ความเร็ว (เท่า)', 'speed', .1, 8, .05, it, { def: 1, dec: 2, span: span.toFixed(4) });
    h += `<div class="fld"><label>ความยาว (วิ)</label><input type="number" class="num" data-p="sdur" data-span="${span.toFixed(4)}" step="0.1" min="0.1" value="${it.dur.toFixed(2)}"></div>`;
    h += K('เปลี่ยนระดับเสียงตามความเร็ว', 'pitchShift', it, false) + `<div class="btnrow"><button data-act="spdreset">รีเซ็ตความเร็ว</button></div>`;
  } else h += dis(sb === 'curve' ? 'เส้นโค้งความเร็ว (Montage, Hero, Bullet…)' : 'เอฟเฟกต์ความเร็ว') + `<div class="hint small">ยังไม่มีในเวอร์ชันนี้ — ใช้แท็บ “มาตรฐาน” ปรับความเร็วคงที่ได้</div>`;
  return h;
}
function ccAnim(it) {
  const g = INSP.sub.anim; const an = it.anim || {}; const cur = an[g] || 'none';
  let h = subs('anim', [['in', 'เข้า'], ['out', 'ออก'], ['combo', 'ต่อเนื่อง']]) + grid('anim', ANIM_LIST[g].map(([k, l, ic]) => [k, l, ic]), cur, `data-g="${g}"`);
  if (g === 'in') h += RR('ความเร็วตอนเข้า (วิ)', 'anim.dIn', .1, 2, .05, it, { def: .5 });
  if (g === 'out') h += RR('ความเร็วตอนออก (วิ)', 'anim.dOut', .1, 2, .05, it, { def: .5 });
  return h;
}
function ccAdjust(it) {
  const sb = INSP.sub.adjust; let h = subs('adjust', [['basic', 'พื้นฐาน'], ['hsl', 'HSL'], ['curves', 'เส้นโค้ง'], ['wheel', 'วงล้อสี']]);
  if (sb === 'basic') {
    h += sec('ฟิลเตอร์สำเร็จรูป') + `<div class="chips">` + FX_PRESETS.map(p => `<button data-act="fxp" data-v="${p.id}">${p.label}</button>`).join('') + `</div>`;
    let sp = []; try { sp = JSON.parse(localStorage.getItem('sk_adjpresets') || '[]'); } catch (e) { }
    if (sp.length) h += `<div class="chips mine">` + sp.map((p, i) => `<button data-act="adjp" data-v="${i}" translate="no">★ ${esc(p.name)}</button>`).join('') + `</div>`;
    h += `<div class="btnrow"><button data-act="enhance">✨ ปรับอัตโนมัติ</button></div>`;
    h += sec('การแก้สี') + RR('อุณหภูมิสี', 'adj.temp', -100, 100, 1, it) + RR('ทินต์ (เขียว–ม่วง)', 'adj.tint', -100, 100, 1, it) + RR('ความสด (%)', 'fx.saturate', 0, 2.5, .01, it, { m: 100, def: 1 }) + RR('เปลี่ยนสี (Hue °)', 'fx.hue', -180, 180, 1, it, { def: 0 });
    h += sec('แสง') + RR('ความสว่าง (%)', 'fx.brightness', .5, 1.6, .01, it, { m: 100, def: 1 }) + RR('คอนทราสต์ (%)', 'fx.contrast', .5, 1.8, .01, it, { m: 100, def: 1 }) + RR('ไฮไลต์', 'adj.high', -100, 100, 1, it) + RR('เงา (Shadow)', 'adj.shadow', -100, 100, 1, it) + RR('ขาว (Whites)', 'adj.white', -100, 100, 1, it) + RR('ดำ (Blacks)', 'adj.black', -100, 100, 1, it) + RR('ความสดใส (Brilliance)', 'adj.bril', -100, 100, 1, it);
    h += sec('เอฟเฟกต์') + RR('ความคมลึก (Clarity)', 'adj.clarity', -100, 100, 1, it) + RR('เกรนฟิล์ม (Particles)', 'adj.grain', 0, 100, 1, it) + RR('ซีดจาง (Fade)', 'adj.fade', 0, 100, 1, it) + RR('มุมมืด (Vignette %)', 'fx.vignette', 0, 1, .01, it, { m: 100, def: 0 }) + RR('ขาวดำ (%)', 'fx.gray', 0, 1, .01, it, { m: 100, def: 0 }) + RR('โทนอุ่นซีเปีย (%)', 'fx.sepia', 0, 1, .01, it, { m: 100, def: 0 });
    if (it.fx && it.fx.pain) h += R('แสงแดง: X', 'fx.pain.x', 0, 1, .01, it) + R('แสงแดง: Y', 'fx.pain.y', 0, 1, .01, it) + R('แสงแดง: ขนาด', 'fx.pain.r', .05, .8, .01, it);
    h += dis('แปลงเป็น HDR') + `<div class="btnrow"><button data-act="applyall" data-keys="adj,fx">ใช้กับทุกคลิป</button><button data-act="adjsave">★ บันทึกเป็นพรีเซ็ต</button><button data-act="adjreset">รีเซ็ตทั้งหมด</button></div>`;
  } else if (sb === 'hsl') {
    h += `<div class="hslrow">` + HSL_COLORS.map(([k, c, l]) => `<button data-act="hslc" data-v="${k}" title="${l}" class="${INSP.hslc === k ? 'on' : ''}" style="background:${c}"></button>`).join('') + `</div>`;
    const k = INSP.hslc; const cn = HSL_COLORS.find(x => x[0] === k)[2];
    h += `<div class="hint">สี: <b>${cn}</b></div>` + RR('เฉดสี (Hue)', `adj.hsl.${k}.h`, -100, 100, 1, it) + RR('ความสด (Saturation)', `adj.hsl.${k}.s`, -100, 100, 1, it) + RR('ความสว่าง (Lightness)', `adj.hsl.${k}.l`, -100, 100, 1, it);
    h += `<div class="btnrow"><button data-act="hslreset">รีเซ็ต HSL</button></div><div class="hint small">การปรับ HSL ใช้พลังเครื่องมาก อาจกระตุกตอนเล่น/ส่งออก</div>`;
  } else if (sb === 'curves') {
    h += `<div class="chips ch">` + [['l', 'ความสว่าง'], ['r', 'แดง'], ['g', 'เขียว'], ['b', 'น้ำเงิน']].map(([k, l]) => `<button data-act="cch" data-v="${k}" class="${INSP.ch === k ? 'on' : ''}">${l}</button>`).join('') + `</div>`;
    h += `<canvas id="curveCv" width="260" height="260"></canvas><div class="hint small">คลิกเพื่อเพิ่มจุด · ลากจุดเพื่อโค้ง · ดับเบิลคลิกจุดเพื่อลบ</div><div class="btnrow"><button data-act="curvereset">รีเซ็ตเส้นโค้ง</button></div>`;
  } else {
    h += `<div class="wheels">` + [['s', 'เงา'], ['m', 'โทนกลาง'], ['h', 'ไฮไลต์']].map(([k, l]) => `<div class="wh"><b>${l}</b><canvas class="wheel" data-k="${k}" width="120" height="120"></canvas>${RR('สว่าง', `adj.wheel.${k}.l`, -1, 1, .01, it, { m: 100, def: 0 })}${RR('สี', `adj.wheel.${k}.s`, 0, 1, .01, it, { m: 100, def: 0 })}<button data-act="wreset" data-v="${k}">รีเซ็ต</button></div>`).join('') + `</div>`;
  }
  return h;
}
function ccAI() { return `<div class="hint">สไตล์ AI (แปลงภาพเป็นการ์ตูน/สีน้ำ ฯลฯ) ใน CapCut ต้องใช้เซิร์ฟเวอร์ AI — ยังไม่มีในตัวแก้ไขนี้</div>` + ['การ์ตูน', 'สีน้ำมัน', 'ภาพวาดดินสอ', 'อนิเมะ'].map(dis).join(''); }

function renderVideoInspector(it) {
  const tabs = it.type === 'video' ? [['video', 'วิดีโอ'], ['audio', 'เสียง'], ['speed', 'ความเร็ว'], ['anim', 'แอนิเมชัน'], ['adjust', 'ปรับแต่ง'], ['ai', 'AI']] : [['video', 'ภาพ'], ['anim', 'แอนิเมชัน'], ['adjust', 'ปรับแต่ง']];
  if (!tabs.some(t => t[0] === INSP.tab)) INSP.tab = 'video';
  let h = `<div class="ihead"><b>${it.type === 'video' ? 'คลิปวิดีโอ' : 'รูปภาพ'}</b><span class="sp"></span><button data-act="dup">ทำซ้ำ</button><button data-act="del" class="danger">ลบ</button></div>`;
  h += `<div class="fld"><label>เริ่ม</label><input type="number" step="0.1" data-p="start" value="${it.start.toFixed(2)}" class="num"><label class="r">ยาว</label><input type="number" step="0.1" min="0.1" data-p="dur" value="${it.dur.toFixed(2)}" class="num"></div>`;
  h += `<div class="itabs">` + tabs.map(([k, l]) => `<button data-act="itab" data-v="${k}" class="${INSP.tab === k ? 'on' : ''}">${l}</button>`).join('') + `</div>`;
  h += `<div class="ibody">` + cardify(({ video: ccVideo, audio: ccAudio, speed: ccSpeed, anim: ccAnim, adjust: ccAdjust, ai: ccAI }[INSP.tab])(it)) + `</div>`;
  return h;
}

// ---------- cards (MyCut-style): every section becomes a rounded card with its own reset button ----------
function cardify(html) {
  const parts = html.split('<div class="sec">'); if (parts.length < 2) return html; let out = parts[0];
  for (let i = 1; i < parts.length; i++) { const j = parts[i].indexOf('</div>'); const title = parts[i].slice(0, j), rest = parts[i].slice(j + 6); out += `<div class="icard"><div class="ctitle"><b>${title}</b><button class="crst" data-act="cardrst" title="รีเซ็ตเป็นค่าเริ่มต้น">↺</button></div>${rest}</div>`; }
  return out;
}
// ---------- actions ----------
function ccApplyAll(it, keys) {
  let n = 0; for (const o of D.items) { if (o.id === it.id || (o.type !== 'video' && o.type !== 'image')) continue; for (const k of keys) { const v = getPath(it, k); if (v === undefined) { delete o[k]; continue; } setPath(o, k, JSON.parse(JSON.stringify(v))); } n++; }
  commit('applyall'); toast(n ? 'ใช้กับทุกคลิปแล้ว' : 'ไม่มีคลิปอื่นให้ใช้');
}
function ccPreview(it, g) {
  const an = it.anim || {}; let t0 = Math.max(0, it.start - .3); if (g === 'out') t0 = Math.max(it.start, it.start + it.dur - (an.dOut || .5) - .5); else if (g === 'combo') t0 = it.start;
  pause(); seek(t0); play(); const stop = g === 'combo' ? 2200 : 1500; setTimeout(() => { if ((PB.playing || PB.starting) && !PB.exporting) pause(); }, stop);
}
function ccAction(act, a, it) {
  if (act === 'cardrst') { const card = a.closest('.icard'); if (card) $$('.rst.mod', card).forEach(b => b.click()); return true; }
  if (!it) return false; const v = a.dataset.v;
  switch (act) {
    case 'itab': INSP.tab = v; inspSave(); renderInspector(); return true;
    case 'isub': INSP.sub[a.dataset.g] = v; inspSave(); renderInspector(); return true;
    case 'align': {
      const B = BOUNDS[it.id]; const s = prop(it, 's', PB.t); const bw = B ? B.w : PW * s, bh = B ? B.h : PH * s;
      const set = (k, val) => setXf(it, k, +val.toFixed(4));
      if (v === 'l') set('x', (bw - PW) / 2 / PW); if (v === 'r') set('x', (PW - bw) / 2 / PW); if (v === 'c') set('x', 0);
      if (v === 't') set('y', (bh - PH) / 2 / PH); if (v === 'b') set('y', (PH - bh) / 2 / PH); if (v === 'm') set('y', 0);
      commit('align'); renderInspector(); return true;
    }
    case 'mask': setMaskType(it, v); commit('mask'); renderInspector(); return true;
    case 'voice': it.vfx = v; commit('voice'); renderInspector(); return true;
    case 'anim': { it.anim = Object.assign({ in: 'none', out: 'none', combo: 'none' }, it.anim || {}); it.anim[a.dataset.g] = v; commit('anim'); renderInspector(); if (v !== 'none') ccPreview(it, a.dataset.g); return true; }
    case 'fxp': applyFxPreset(it, v); return true;
    case 'adjp': { let sp = []; try { sp = JSON.parse(localStorage.getItem('sk_adjpresets') || '[]'); } catch (e) { } const p = sp[+v]; if (p) { it.adj = JSON.parse(JSON.stringify(p.adj || {})); it.fx = JSON.parse(JSON.stringify(p.fx || {})); commit('preset'); renderInspector(); } return true; }
    case 'adjsave': { const nm = prompt(T('ชื่อพรีเซ็ต'), T('พรีเซ็ตของฉัน')); if (!nm) return true; let sp = []; try { sp = JSON.parse(localStorage.getItem('sk_adjpresets') || '[]'); } catch (e) { } sp.push({ name: nm, adj: it.adj || {}, fx: it.fx || {} }); try { localStorage.setItem('sk_adjpresets', JSON.stringify(sp.slice(-24))); } catch (e) { } toast('บันทึกพรีเซ็ตแล้ว'); renderInspector(); return true; }
    case 'adjreset': it.adj = {}; it.fx = {}; commit('adjreset'); renderInspector(); return true;
    case 'applyall': ccApplyAll(it, (a.dataset.keys || '').split(',')); return true;
    case 'hslc': INSP.hslc = v; renderInspector(); return true;
    case 'hslreset': if (it.adj && it.adj.hsl) delete it.adj.hsl[INSP.hslc]; commit('hsl'); renderInspector(); return true;
    case 'cch': INSP.ch = v; renderInspector(); return true;
    case 'curvereset': if (it.adj && it.adj.curve) delete it.adj.curve[INSP.ch]; commit('curve'); renderInspector(); return true;
    case 'wreset': if (it.adj && it.adj.wheel) delete it.adj.wheel[v]; commit('wheel'); renderInspector(); return true;
    case 'spdset': { const span = it.dur * (it.speed || 1); it.speed = +v; it.dur = Math.max(.1, span / it.speed); commit('speed'); renderInspector(); return true; }
    case 'spdreset': { const span = it.dur * (it.speed || 1); it.speed = 1; it.dur = span; commit('speed'); renderInspector(); return true; }
    case 'eyedrop': new EyeDropper().open().then(r => { setPath(it, 'chroma.color', r.sRGBHex); setPath(it, 'chroma.on', true); commit('chroma'); renderInspector(); }).catch(() => { }); return true;
    case 'sepaudio': {
      const m = MEDIA.get(it.mediaId); if (!m || m.hasAudio === false) { toast('คลิปนี้ไม่มีเสียง'); return true; }
      if ((it.speed || 1) !== 1) { toast('แยกเสียงได้เฉพาะคลิปที่ความเร็ว 1 เท่า'); return true; }
      const au = mkAudio('A2', it.mediaId, it.start, it.dur); au.in = it.in || 0; au.vol = it.vol ?? 1; au.fadeIn = it.fadeIn || 0; au.fadeOut = it.fadeOut || 0; au.duck = false; au.loop = false;
      au.track = freeTrack('audio', it.start, it.dur, 'A2'); if (au.track === 'A1') au.track = 'A2'; addItem(au); it.muted = true; commit('sepaudio'); toast('แยกเสียงไปไว้แถวเสียงแล้ว'); renderInspector(); return true;
    }
  }
  return false;
}

// ---------- canvas widgets (curves, colour wheels) ----------
let _wheelImg = null;
function wheelImage(S) {
  if (_wheelImg && _wheelImg.width === S) return _wheelImg; const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const im = x.createImageData(S, S); const R0 = S / 2 - 2;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const dx = i - S / 2, dy = j - S / 2, r = Math.hypot(dx, dy); if (r > R0) continue; const h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; const [rr, gg, bb] = hue2rgb01(h); const s = r / R0; const k = (j * S + i) * 4; im.data[k] = (rr * s + .5 * (1 - s)) * 255; im.data[k + 1] = (gg * s + .5 * (1 - s)) * 255; im.data[k + 2] = (bb * s + .5 * (1 - s)) * 255; im.data[k + 3] = 255; }
  x.putImageData(im, 0, 0); return (_wheelImg = c);
}
function ccPost(it) {
  if (!it || (it.type !== 'video' && it.type !== 'image')) return;
  if (INSP.tab === 'adjust' && INSP.sub.adjust === 'curves') ccCurveInit(it);
  if (INSP.tab === 'adjust' && INSP.sub.adjust === 'wheel') ccWheelInit(it);
}
function ccCurveInit(it) {
  const cv = $('#curveCv'); if (!cv) return; const S = cv.width, ch = INSP.ch; const col = { l: '#e8e8e8', r: '#ff5a5a', g: '#4ee06a', b: '#5a8aff' }[ch];
  const pts = () => ((it.adj = it.adj || {}).curve = it.adj.curve || {})[ch] || (it.adj.curve[ch] = [[0, 0], [1, 1]]);
  const X = v => 8 + v * (S - 16), Y = v => S - 8 - v * (S - 16), inv = (px, py) => [clamp((px - 8) / (S - 16), 0, 1), clamp((S - 8 - py) / (S - 16), 0, 1)];
  const draw = () => {
    const c = cv.getContext('2d'); c.clearRect(0, 0, S, S); c.fillStyle = '#15181c'; c.fillRect(0, 0, S, S); c.strokeStyle = '#2b3036'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(X(i / 4), Y(0)); c.lineTo(X(i / 4), Y(1)); c.moveTo(X(0), Y(i / 4)); c.lineTo(X(1), Y(i / 4)); c.stroke(); }
    c.strokeStyle = '#444b53'; c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(1), Y(1)); c.stroke();
    const P = pts(), lut = curveLut(P); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 256; i++) { const x = X(i / 255), y = Y(clamp(lut[i], 0, 1)); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    c.fillStyle = '#fff'; for (const p of P) { c.beginPath(); c.arc(X(p[0]), Y(p[1]), 5, 0, 7); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }
  };
  draw(); let drag = -1, moved = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S / r.width, (e.clientY - r.top) * S / r.height]; };
  cv.onpointerdown = e => {
    e.preventDefault(); cv.setPointerCapture(e.pointerId); const [px, py] = pos(e); const P = pts(); drag = P.findIndex(p => Math.hypot(X(p[0]) - px, Y(p[1]) - py) < 10); moved = false;
    if (drag < 0) { const [x, y] = inv(px, py); P.push([x, y]); P.sort((a, b) => a[0] - b[0]); drag = P.findIndex(p => p[0] === x && p[1] === y); moved = true; }
    draw();
  };
  cv.onpointermove = e => { if (drag < 0) return; const P = pts(); const [x, y] = inv(...pos(e)); const q = P[drag]; const first = drag === 0, last = drag === P.length - 1; q[1] = y; if (!first && !last) q[0] = clamp(x, P[drag - 1][0] + .01, P[drag + 1][0] - .01); else q[0] = first ? clamp(x, 0, P[1][0] - .01) : clamp(x, P[drag - 1][0] + .01, 1); moved = true; draw(); dirty(); };
  cv.onpointerup = () => { if (drag >= 0 && moved) commit('curve'); drag = -1; };
  cv.ondblclick = e => { const [px, py] = pos(e); const P = pts(); const i = P.findIndex(p => Math.hypot(X(p[0]) - px, Y(p[1]) - py) < 10); if (i > 0 && i < P.length - 1) { P.splice(i, 1); commit('curve'); draw(); } };
}
function ccWheelInit(it) {
  $$('#inspector canvas.wheel').forEach(cv => {
    const k = cv.dataset.k, S = cv.width; const get = () => (((it.adj = it.adj || {}).wheel = it.adj.wheel || {})[k] = it.adj.wheel[k] || { h: 0, s: 0, l: 0 });
    const draw = () => { const c = cv.getContext('2d'); c.clearRect(0, 0, S, S); c.drawImage(wheelImage(S), 0, 0); const w = get(); const R0 = S / 2 - 2, a = (w.h || 0) * Math.PI / 180, r = (w.s || 0) * R0; c.beginPath(); c.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 6, 0, 7); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.stroke(); };
    draw(); let on = false;
    const set = e => { const r = cv.getBoundingClientRect(); const dx = (e.clientX - r.left) * S / r.width - S / 2, dy = (e.clientY - r.top) * S / r.height - S / 2; const w = get(); w.h = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360); w.s = +clamp(Math.hypot(dx, dy) / (S / 2 - 2), 0, 1).toFixed(2); draw(); dirty(); const rg = $(`#inspector input[type=range][data-p="adj.wheel.${k}.s"]`), nv = $(`#inspector input.nv[data-p="adj.wheel.${k}.s"]`); if (rg) rg.value = w.s; if (nv) nv.value = Math.round(w.s * 100); };
    cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); on = true; set(e); };
    cv.onpointermove = e => { if (on) set(e); }; cv.onpointerup = () => { if (on) { on = false; commit('wheel'); } };
  });
}
