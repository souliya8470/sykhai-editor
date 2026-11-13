'use strict';
// ============================================================
//  v1.42 — animated auto-captions (like the AutoCaptions plugin for Premiere):
//  transcript -> pick a caption look -> pick an animation -> words per caption / position / highlight -> text clips with a karaoke highlight
//  Word timing: the transcript gives phrase times (Gemini) so every phrase is split into words (Intl.Segmenter, Lao/Thai safe) and the
//  phrase time is shared between the words by their length. Whisper words are used as they are for the phrase boundaries.
// ============================================================
const CAP_LOOKS = [   // [id, label, text style id, overrides, highlight colour]
  ['white', 'ขาว ขอบดำ + เน้นเหลือง', 'sub', { size: 58 }, '#FFE14D'],
  ['box', 'กล่องดำ + เน้นเหลือง', 'subbox', { size: 48 }, '#FFE14D'],
  ['yellow', 'หัวข้อใหญ่ เหลือง', 'big', { size: 84, ay: .72 }, '#ffffff'],
  ['neon', 'แสงเรือง นีออน', 'subGlow', { size: 70 }, '#ffd24d'],
  ['red', 'ป้ายแดง', 'promo', { size: 50, ay: .72 }, '#FFE14D'],
  ['green', 'ป้ายเขียว', 'pill', { size: 48, ay: .72 }, '#FFE14D'],
  ['blue', 'น้ำเงิน ขอบขาว', 'blue', { size: 56, ay: .72 }, '#E02B3A'],
  ['bold', 'ขาวหนา เน้นแดง', 'clean', { size: 66, weight: 900 }, '#ff3b57'],
];
const CAPS = { look: 'white', anim: 'pop', words: 4, pos: .74, kar: true, mode: 'cur', color: '', raf: 0, t0: 0, last: 0 };
const capLook = id => CAP_LOOKS.find(l => l[0] === id) || CAP_LOOKS[0];
function capItem(text, extra) {   // a caption text item (not yet on the timeline) in the chosen look
  const l = capLook(CAPS.look); const o = Object.assign({ sub: 1, anim: { in: 'none', out: 'none', d: 0 }, reveal: 0, maxW: .9 }, l[3], { ay: CAPS.pos }, extra || {});
  const it = mkText(l[2], text, 0, 3, o); it.color2 = CAPS.color || l[4];
  if (CAPS.anim && CAPS.anim !== 'none' && TAX_BY[CAPS.anim]) it.tanim = { id: CAPS.anim, d: Math.min(TAX_BY[CAPS.anim].d, .7), mode: TAX_BY[CAPS.anim].mode };
  return it;
}
function capTokens(text) { const segs = segWords(text); let n = 0, ch = 0; return segs.map(s => { const isW = !/^\s+$/.test(s); if (!isW) ch++; return { s, w: isW, ch, wt: isW ? Math.max(.3, [...s.replace(/[\s.,!?…"'“”‘’()\-–—]/g, '')].length) : 0, i: isW ? n++ : -1 }; }); }
// transcript -> caption blocks [{a,b,text,t:[...],e:[...]}] in SOURCE seconds (t/e relative to the block start)
function capBlocks(tr, per) {
  const out = [];
  for (const sg of tr.segs) {
    const toks = capTokens(String(sg.text || '').trim()).filter((k, i, arr) => !(k.w && isFiller(k.s))); const words = toks.filter(k => k.w); if (!words.length) continue;
    const tot = words.reduce((a, k) => a + k.wt, 0), dur = Math.max(.2, sg.b - sg.a); let acc = 0; words.forEach(k => { k.a = sg.a + dur * acc / tot; acc += k.wt; k.b = sg.a + dur * acc / tot; });
    for (let i = 0, j; i < words.length; i = j) {
      j = Math.min(words.length, i + per); while (j < words.length && words[j].ch === words[j - 1].ch) j++;   // never cut inside a space-separated word
      const ws = words.slice(i, j), i0 = toks.indexOf(ws[0]), i1 = toks.indexOf(ws[ws.length - 1]);
      const text = toks.slice(i0, i1 + 1).map(k => k.s).join('').trim(); if (!text) continue;
      const a = ws[0].a, b = ws[ws.length - 1].b;
      out.push({ a, b, text, t: ws.map(k => k.a - a), e: ws.map(k => k.b - a) });
    }
  }
  return out;
}
function capApply(m, tr) {
  const blocks = capBlocks(tr, CAPS.words); let n = 0;
  D.items = D.items.filter(it => !(it.sub && it.subOf === m.id));
  for (const c of blocks) {
    const pcs = srcPieces(m.id, c.a, c.b); if (!pcs.length) continue; const [s, e] = pcs[0]; if (e - s < .25) continue;
    const dur = Math.max(.4, e - s), k = dur / Math.max(.05, c.b - c.a);
    const it = capItem(c.text, { subOf: m.id }); it.start = s; it.dur = dur; it.track = freeTrack('text', s, dur, 'T2');
    if (CAPS.kar) it.kar = { t: c.t.map(x => x * k), e: c.e.map(x => x * k), c: CAPS.color || it.color2, mode: CAPS.mode };
    addItem(it); n++;
  }
  commit('captions'); return n;
}
// ---------- dialog ----------
function capSample() { return T('วันนี้มีโปรพิเศษมาก ซื้อเลย'); }
function capDrawPreview(cv, ph, text) {
  const W = 540, H = 960; if (!VP.tpc) { VP.tpc = document.createElement('canvas'); VP.tpc.width = W; VP.tpc.height = H; }
  const c = VP.tpc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, W, H);
  const it = capItem(text, { ay: CAPS.pos }); const bl = capBlocks({ segs: [{ a: 0, b: 2.4, text }] }, CAPS.words)[0] || { t: [0], e: [2.4] };
  if (CAPS.kar) it.kar = { t: bl.t, e: bl.e, c: CAPS.color || it.color2, mode: CAPS.mode };
  const t = ph * 3.4; it.dur = 4;
  try { drawText(c, it, t, W, H); } catch (e) { console.warn(e); } delete BOUNDS[it.id];
  const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(VP.tpc, 0, 0, W, H, 0, 0, cv.width, cv.height);
}
function capStatus(m) { const tr = m && getTr(m.id); return tr ? T('ถอดเสียงแล้ว') + ` · ${tr.segs.length} ` + T('ประโยค') : T('ยังไม่ได้ถอดเสียง — กดสร้างแล้วระบบจะถอดเสียงให้ก่อน'); }
async function capOpen() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (!m.pcm16) return toast('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ');
  await pvSamples(); const dlg = $('#dlgCap');
  $('#capLooks').innerHTML = CAP_LOOKS.map(l => `<button class="caplook" data-id="${l[0]}"><canvas width="150" height="52"></canvas><span>${esc(T(l[1]))}</span></button>`).join('');
  $('#capAnim').innerHTML = `<option value="none">${T('ไม่มีแอนิเมชัน')}</option>` + TAX.map(f => `<option value="${f.id}">${esc(T(f.label))}</option>`).join('');
  $('#capAnim').value = CAPS.anim; $('#capWords').value = CAPS.words; $('#capWordsO').textContent = CAPS.words; $('#capPos').value = String(CAPS.pos);
  $('#capKar').checked = CAPS.kar; $('#capMode').value = CAPS.mode; $('#capColor').value = CAPS.color || capLook(CAPS.look)[4]; $('#capStat').textContent = capStatus(m);
  const sync = () => { $$('#capLooks .caplook').forEach(b => b.classList.toggle('on', b.dataset.id === CAPS.look)); };
  const drawLooks = () => $$('#capLooks .caplook').forEach(b => { const l = capLook(b.dataset.id), save = CAPS.look; CAPS.look = l[0]; const c = VP.tpc || (VP.tpc = Object.assign(document.createElement('canvas'), { width: 540, height: 960 })); const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); vpBg(x, 540, 960); const it = capItem(T('ตัวอย่าง ซับ'), { ay: .5 }); it.kar = { t: [0, .5], e: [.5, 1], c: it.color2, mode: 'cur' }; try { drawText(x, it, .7, 540, 960); } catch (e) { } delete BOUNDS[it.id]; CAPS.look = save; const q = $('canvas', b).getContext('2d'); q.clearRect(0, 0, 150, 52); q.drawImage(c, 20, 435, 500, 90, 0, 0, 150, 52); });
  drawLooks(); sync(); dlg.dataset.mid = m.id; dlg.showModal(); CAPS.t0 = performance.now(); CAPS.last = 0;
  const loop = now => { if (!dlg.open) { CAPS.raf = 0; return; } if (now - CAPS.last > 50) { CAPS.last = now; const ph = (((now - CAPS.t0) / 1000) % 4.4) / 4.4; capDrawPreview($('#capPrev'), ph, capSample()); } CAPS.raf = requestAnimationFrame(loop); };
  cancelAnimationFrame(CAPS.raf); CAPS.raf = requestAnimationFrame(loop);
}
function capInit() {
  $('#capLooks').onclick = e => { const b = e.target.closest('.caplook'); if (!b) return; CAPS.look = b.dataset.id; CAPS.color = ''; $('#capColor').value = capLook(CAPS.look)[4]; $$('#capLooks .caplook').forEach(x => x.classList.toggle('on', x === b)); };
  $('#capAnim').onchange = e => { CAPS.anim = e.target.value; };
  $('#capWords').oninput = e => { CAPS.words = +e.target.value; $('#capWordsO').textContent = e.target.value; };
  $('#capPos').onchange = e => { CAPS.pos = +e.target.value; };
  $('#capKar').onchange = e => { CAPS.kar = e.target.checked; };
  $('#capMode').onchange = e => { CAPS.mode = e.target.value; };
  $('#capColor').oninput = e => { CAPS.color = e.target.value; };
  $('#capClose').onclick = () => $('#dlgCap').close();
  $('#dlgCap').addEventListener('close', () => { cancelAnimationFrame(CAPS.raf); CAPS.raf = 0; });
  $('#capGo').onclick = async () => {
    const dlg = $('#dlgCap'), m = MEDIA.get(dlg.dataset.mid); if (!m || AI.busy) return; dlg.close(); AI.busy = true;
    try {
      ensureOnTimeline(m); let tr = getTr(m.id); if (!tr) { tr = await ensureTranscript(m); }
      AI.busy = false; $('#dlgAi').open && $('#dlgAi').close();
      const n = capApply(m, tr); toast(n ? `ใส่คำบรรยาย ${n} ช่วงแล้ว` : 'ไม่พบข้อความพูดในคลิปนี้');
      if (n) { const f = D.items.filter(i => i.sub && i.subOf === m.id).sort((a, b) => a.start - b.start)[0]; if (f) { select(f.id); seek(Math.max(0, f.start - .2)); play(); setTimeout(() => { if (PB.playing) pause(); }, 4000); } }
    } catch (e) { aiErr(e); }
  };
}
