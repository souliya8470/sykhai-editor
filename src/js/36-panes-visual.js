// ============================================================
//  v1.14 — left panes with real previews (MyCut style): text styles, stickers + emoji, animations
// ============================================================
const EMOJI_CATS = [
  ['หน้ายิ้ม', '😀😁😂🤣😍🥰😎🤩😭😱🤔😴🥳😡🤯😇🙄😏🤭😘😉😊🙃😋🥺😤😬'],
  ['หัวใจ', '❤️🧡💛💚💙💜🖤🤍💖💕💘💝💗💓💔💞'],
  ['มือ', '👍👎👏🙌👋🤝🙏💪👌✌️🤞👉👈👆👇☝️✊🤙🫶'],
  ['สัญลักษณ์', '🔥⭐✨💯✅❌⚠️❗❓💥🎉🎁💰💎🏆📣🔔💡⚡🆕🆓🔝➡️⬅️⬆️⬇️'],
  ['สัตว์', '🐶🐱🐭🐰🦊🐻🐼🐯🦁🐮🐷🐸🐵🐔🐧🦄🐝🦋🐢🐠'],
  ['อาหาร', '🍎🍌🍇🍓🍉🍑🍕🍔🍟🌭🍜🍣🍰🍩☕🍺🥤🍿🥑🌶️']
];
const VP = { emo: 0, animG: 'in', tpc: null };
function vpBg(c, W, H) {   // real footage frame from the project as the preview background (dark card when nothing imported)
  const m = MEDIA.get('__pvA');
  if (PV.key && m && m.img && m.img.naturalWidth) { const iw = m.img.naturalWidth, ih = m.img.naturalHeight, k = Math.max(W / iw, H / ih); c.drawImage(m.img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, 0, W, H); }
  else { c.fillStyle = '#2a2b30'; c.fillRect(0, 0, W, H); }
}
const emojiList = s => (typeof Intl !== 'undefined' && Intl.Segmenter) ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map(x => x.segment) : [...s];

// ---- text style tiles (real rendering with the same drawText used for export) ----
function tpDraw(cv, st) {
  const W = 540, H = 960; if (!VP.tpc) { VP.tpc = document.createElement('canvas'); VP.tpc.width = W; VP.tpc.height = H; }
  const c = VP.tpc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, W, H);
  const sz = st.id === 'footer' ? 90 : 120, k = sz / (st.d.size || 60);
  const it = mkText(st.id, T('ข้อความ'), 0, 3, { ay: .5, anim: {}, size: sz, strokeW: (st.d.strokeW || 0) * k, maxW: .95 });
  try { drawText(c, it, 1, W, H); } catch (e) { console.warn(e); } delete BOUNDS[it.id];
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(VP.tpc, 135, 399, 270, 162, 0, 0, cv.width, cv.height);
}
function buildTextPane() {
  $('#pane-text').innerHTML = `<div class="sec" style="margin-top:0">🎨 ${T('แพ็กข้อความ — ลุคสำเร็จรูป')}</div><div class="hint">กดเพื่อเพิ่มที่หัวอ่าน · หรือลากการ์ดไปวางบนไทม์ไลน์/บนจอ (วางทับข้อความเดิม = เปลี่ยนลุค) · เอาเมาส์ชี้การ์ดเพื่อดูแอนิเมชัน</div><div class="vgrid tpkgrid" id="tpkPane">${tpkTiles()}</div><hr><button id="btnTA" class="wide primary" style="margin-bottom:8px">✨ ${T('ห้องแอนิเมชันข้อความ (22 แบบ)')}</button><div class="hint">กดเพื่อเพิ่มข้อความที่ตำแหน่งหัวอ่าน (เส้นแดง) — ใช้ *คำ* เพื่อทำตัวเหลือง/เน้น</div><div class="vgrid tt-grid">` +
    TEXT_STYLES.map(s => `<button class="vt tstyle" data-style="${s.id}"><canvas width="270" height="162"></canvas><span>${esc(s.label)}</span></button>`).join('') +
    `</div><hr><button id="btnFooter" class="wide">+ ใส่ข้อความท้ายจอตลอดคลิป</button>`;
  tpkWire($('#tpkPane'));
  $('#pane-text').onclick = e => { const k = e.target.closest('.tpk'); if (k) return tpkAdd(TPK_BY[k.dataset.pk]); const b = e.target.closest('.tstyle'); if (b) addText(b.dataset.style); if (e.target.id === 'btnFooter') addFooter(); if (e.target.id === 'btnTA') taOpen(); };
  drawTextTiles();
}
async function drawTextTiles() { await pvSamples(); $$('#pane-text .tstyle').forEach(b => { const st = TEXT_STYLES.find(s => s.id === b.dataset.style); if (st) tpDraw($('canvas', b), st); }); }

// ---- stickers: drawn stickers + emoji by category ----
function buildStickerPane() {
  $('#pane-sticker').innerHTML = `<div class="hint">กดเพื่อเพิ่มที่หัวอ่าน · ลากบนจอเพื่อย้าย</div><div class="vgrid sk-grid">` +
    STICKERS.map(([k, l]) => `<button class="vt stk" data-k="${k}"><canvas width="120" height="120"></canvas><span>${esc(l)}</span></button>`).join('') + `</div>` +
    `<div class="chips emcats">` + EMOJI_CATS.map(([l], i) => `<button data-ec="${i}" class="${i === VP.emo ? 'on' : ''}">${l}</button>`).join('') + `</div><div class="emj-grid" id="emjGrid"></div><hr>
    <div class="row"><input id="emojiIn" value="🔥" maxlength="8" style="width:60px;font-size:22px;text-align:center"><button id="addEmoji">+ อีโมจิ</button></div>`;
  fillEmoji();
  $('#pane-sticker').onclick = e => {
    const b = e.target.closest('.stk'); if (b) return addSticker(b.dataset.k);
    const c = e.target.closest('[data-ec]'); if (c) { VP.emo = +c.dataset.ec; $$('#pane-sticker .emcats button').forEach(x => x.classList.toggle('on', x === c)); return fillEmoji(); }
    const m = e.target.closest('.emj'); if (m) return addSticker('emoji', { text: m.dataset.e });
    if (e.target.id === 'addEmoji') addSticker('emoji', { text: $('#emojiIn').value || '🔥' });
  };
  drawStickerTiles();
}
function fillEmoji() { $('#emjGrid').innerHTML = emojiList(EMOJI_CATS[VP.emo][1]).map(e => `<button class="emj" data-e="${e}">${e}</button>`).join(''); }
async function drawStickerTiles() {
  await pvSamples(); $$('#pane-sticker .stk').forEach(b => {
    const cv = $('canvas', b), c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, 120, 120);
    const it = mkSticker(b.dataset.k, 0, 2, { size: 540, ay: .5, anim: {} });
    try { drawSticker(c, it, 1.3, 120, 120); } catch (e) { console.warn(e); } delete BOUNDS[it.id];
  });
}

// ---- animations tab (in / out / combo) with live hover previews ----
function buildAnimPane() {
  $('#pane-anim').innerHTML = `<div class="hint">เลือกคลิปบนไทม์ไลน์ แล้วกดเพื่อใส่แอนิเมชัน · เอาเมาส์ชี้เพื่อดูตัวอย่าง</div><div class="chips animsub">` +
    [['in', 'เข้า'], ['out', 'ออก'], ['combo', 'ต่อเนื่อง']].map(([k, l]) => `<button data-ag="${k}" class="${k === VP.animG ? 'on' : ''}">${l}</button>`).join('') + `</div><div class="tiles" id="tilesAnim"></div>`;
  $('#pane-anim .animsub').onclick = e => { const b = e.target.closest('[data-ag]'); if (!b) return; VP.animG = b.dataset.ag; $$('#pane-anim .animsub button').forEach(x => x.classList.toggle('on', x === b)); fillAnimTiles(); };
  fillAnimTiles();
}
async function fillAnimTiles() {
  const g = VP.animG, box = $('#tilesAnim'); if (!box) return; box.innerHTML = '';
  const cur = (getItem(SEL) || {}).anim || {};
  ANIM_LIST[g].forEach(([k, l]) => {
    const t = document.createElement('div'); t.className = 'tile' + ((cur[g] || 'none') === k ? ' on' : ''); t.dataset.kind = 'anim'; t.dataset.key = g + ':' + k;
    t.innerHTML = `<canvas width="${PV.W}" height="${PV.H}"></canvas><span>${esc(l)}</span>`; t.style.cursor = 'pointer'; box.appendChild(t);
    t.addEventListener('mouseenter', () => pvStart(t)); t.addEventListener('mouseleave', () => pvStop(t));
    t.addEventListener('click', () => {
      const it = getItem(SEL); if (!it || (it.type !== 'video' && it.type !== 'image')) { toast('เลือกคลิปวิดีโอ/ภาพบนไทม์ไลน์ก่อน'); return; }
      it.anim = Object.assign({ in: 'none', out: 'none', combo: 'none' }, it.anim || {}); it.anim[g] = k; commit('anim'); renderInspector();
      $$('#tilesAnim .tile').forEach(x => x.classList.toggle('on', x === t)); if (k !== 'none') ccPreview(it, g);
    });
  });
  await pvSamples(); pvPosters();
}
function buildVisualPanes() { buildTextPane(); buildStickerPane(); buildAnimPane(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawTextTiles()); }
