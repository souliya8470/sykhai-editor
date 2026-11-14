'use strict';
// ============================================================
//  v1.42 — animated auto-captions (like the AutoCaptions plugin for Premiere):
//  transcript -> pick a caption look -> pick an animation -> words per caption / position / highlight -> text clips with a karaoke highlight
//  Word timing: the transcript gives phrase times (Gemini) so every phrase is split into words (Intl.Segmenter, Lao/Thai safe) and the
//  phrase time is shared between the words by their length. Whisper words are used as they are for the phrase boundaries.
//  v1.55 — caption modes: 2 stacked rows (fast speech), minimum display time (short captions are merged / held), keyword-only mode
//  (Gemini picks the key phrases of the saved transcript), calm default animations, font choice (Lao font library).
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
const CAPS = { look: 'white', anim: 'soft', words: 4, pos: .74, kar: true, mode: 'cur', color: '', rows: 1, minDur: .8, kw: 'all', font: '', raf: 0, t0: 0, last: 0 };
const capLook = id => CAP_LOOKS.find(l => l[0] === id) || CAP_LOOKS[0];
function capItem(text, extra) {   // a caption text item (not yet on the timeline) in the chosen look
  const l = capLook(CAPS.look); const o = Object.assign({ sub: 1, anim: { in: 'none', out: 'none', d: 0 }, reveal: 0, maxW: .9 }, l[3], { ay: CAPS.pos }, extra || {});
  const it = mkText(l[2], text, 0, 3, o); it.color2 = CAPS.color || l[4];
  if (CAPS.font && LF_BY[CAPS.font]) { it.font = lfStack(CAPS.font); if (!LF_W[CAPS.font]) it.weight = 400; }   // v1.55: font from the Lao font library
  if (CAPS.anim && CAPS.anim !== 'none' && TAX_BY[CAPS.anim]) it.tanim = { id: CAPS.anim, d: Math.min(TAX_BY[CAPS.anim].d, .7), mode: TAX_BY[CAPS.anim].mode };
  return it;
}
function capTokens(text) { const segs = segWords(text); let n = 0, ch = 0; return segs.map(s => { const isW = !/^\s+$/.test(s); if (!isW) ch++; return { s, w: isW, ch, wt: isW ? Math.max(.3, [...s.replace(/[\s.,!?…"'“”‘’()\-–—]/g, '')].length) : 0, i: isW ? n++ : -1 }; }); }
// one transcript sentence -> tokens (with char offsets) + spoken words with their share of the sentence time
function capSeg(sg) {
  const text = String(sg.text || '').trim(); let off = 0;
  const toks = capTokens(text).map(k => { k.off = off; off += k.s.length; return k; }).filter(k => !(k.w && isFiller(k.s))); const words = toks.filter(k => k.w); if (!words.length) return null;
  const tot = words.reduce((a, k) => a + k.wt, 0), dur = Math.max(.2, sg.b - sg.a); let acc = 0; words.forEach(k => { k.a = sg.a + dur * acc / tot; acc += k.wt; k.b = sg.a + dur * acc / tot; });
  return { text, toks, words };
}
// v1.55: with 2 rows the block text gets a line break near the middle (preferably where the speaker's own spaces are)
function capText(toks, ws, rows) {
  const i0 = toks.indexOf(ws[0]), i1 = toks.indexOf(ws[ws.length - 1]), cut = (a, b) => toks.slice(a, b).map(k => k.s).join('').trim();
  if (rows !== 2 || ws.length < 2) return cut(i0, i1 + 1);
  let best = 1, bc = 1e9; for (let q = 1; q < ws.length; q++) { const c = Math.abs(q - ws.length / 2) + (ws[q].ch === ws[q - 1].ch ? 2.5 : 0); if (c < bc) { bc = c; best = q; } }
  const im = toks.indexOf(ws[best]); return cut(i0, im) + '\n' + cut(im, i1 + 1);
}
const capBlk = (toks, ws, rows) => { const a = ws[0].a, b = ws[ws.length - 1].b; return { a, b, n: ws.length, text: capText(toks, ws, rows), t: ws.map(k => k.a - a), e: ws.map(k => k.b - a) }; };
// transcript -> caption blocks [{a,b,n,text,t:[...],e:[...]}] in SOURCE seconds (t/e relative to the block start)
// o = { rows:1|2, minDur:seconds, kw:{segIndex:[phrases]} (keyword-only mode) }
function capBlocks(tr, per, o) {
  o = o || {}; const rows = o.rows === 2 ? 2 : 1, cap = per * rows; let out = [];
  tr.segs.forEach((sg, si) => {
    const P = capSeg(sg); if (!P) return; const { text, toks, words } = P;
    if (o.kw) {   // keyword-only: one caption per key phrase that Gemini picked (copied from the sentence), timed by its own words
      const seen = new Set();
      for (const ph of (o.kw[si] || [])) {
        const q = String(ph || '').trim(); if (!q) continue; const at = text.indexOf(q); if (at < 0) continue;
        const ws = words.filter(k => k.off < at + q.length && k.off + k.s.length > at).slice(0, cap); if (!ws.length || seen.has(ws[0].i)) continue; seen.add(ws[0].i);
        out.push(capBlk(toks, ws, rows));
      }
      return;
    }
    for (let i = 0, j; i < words.length; i = j) {
      j = Math.min(words.length, i + cap); while (j < words.length && words[j].ch === words[j - 1].ch) j++;   // never cut inside a space-separated word
      const ws = words.slice(i, j); if (!capText(toks, ws, 1)) continue;
      out.push(capBlk(toks, ws, rows));
    }
  });
  out.sort((x, y) => x.a - y.a);
  if (o.minDur > 0) {   // too-short captions are glued to the next one when it follows right away (the rest is handled by holding them on the timeline)
    const m = []; for (const c of out) {
      const p = m[m.length - 1];
      if (p && p.b - p.a < o.minDur && c.a - p.b < .35 && p.n + c.n <= cap) {
        const sh = c.a - p.a, flat = (p.text + ' ' + c.text).replace(/\n/g, ' '), tk = capTokens(flat);
        p.text = capText(tk, tk.filter(k => k.w), rows); p.t = p.t.concat(c.t.map(x => x + sh)); p.e = p.e.concat(c.e.map(x => x + sh)); p.b = c.b; p.n += c.n;
      } else m.push(c);
    }
    out = m;
  }
  return out;
}
// ---------- keyword-only mode: Gemini reads the saved transcript and returns the key phrases of every sentence ----------
async function capKeywords(tr) {
  if (tr.kw && tr.kw.v === 1 && tr.kw.n === tr.segs.length) return tr.kw.map;   // saved with the transcript: no second Gemini call
  const list = tr.segs.map((sg, i) => ({ i, text: String(sg.text || '').trim() }));
  const prompt = 'You pick the KEY PHRASES for the on-screen captions of a short sales video (speech may be Lao, Thai or English). ' +
    'Input: numbered sentences of the transcript. For every sentence choose 0 to 3 key phrases a viewer must SEE on screen: product names, prices / numbers / discounts, results and benefits, calls to action, strong claims. ' +
    'Each key phrase must be copied EXACTLY, character by character, from its sentence (no translation, no corrections) and be 1 to 4 words. Skip filler and sentences with nothing important. ' +
    'Answer with JSON only: [{"i": <sentence number>, "k": ["phrase", "phrase"]}]\n\nSENTENCES:\n' + JSON.stringify(list);
  const arr = parseJsonLoose(await gemini([{ text: prompt }], { label: 'คำสำคัญ' })); const map = {};
  (Array.isArray(arr) ? arr : []).forEach(r => { const i = +r.i; if (Number.isInteger(i) && i >= 0 && i < tr.segs.length && Array.isArray(r.k)) map[i] = r.k.map(x => String(x)).filter(Boolean).slice(0, 3); });
  tr.kw = { v: 1, n: tr.segs.length, map }; commit('tr'); return map;
}
function capApply(m, tr, kw) {
  const blocks = capBlocks(tr, CAPS.words, { rows: CAPS.rows, minDur: CAPS.minDur, kw }); let n = 0; const L = [];
  D.items = D.items.filter(it => !(it.sub && it.subOf === m.id));
  for (const c of blocks) {
    const pcs = srcPieces(m.id, c.a, c.b); if (!pcs.length) continue; const [s, e] = pcs[0]; if (e - s < .25) continue;
    const dur = Math.max(.4, e - s); L.push({ c, s, dur, k: dur / Math.max(.05, c.b - c.a) });
  }
  L.sort((x, y) => x.s - y.s);
  L.forEach((q, i) => { const nx = L[i + 1], room = nx ? nx.s - q.s - .03 : 1e9; q.hold = Math.max(q.dur, Math.min(CAPS.minDur || 0, room)); });   // a short caption stays up to the minimum time if the next one has not started yet
  for (const q of L) {
    const it = capItem(q.c.text, { subOf: m.id }); it.start = q.s; it.dur = q.hold; it.track = freeTrack('text', q.s, q.hold, 'T2');
    if (CAPS.kar) it.kar = { t: q.c.t.map(x => x * q.k), e: q.c.e.map(x => x * q.k), c: CAPS.color || it.color2, mode: CAPS.mode };
    addItem(it); n++;
  }
  commit('captions'); return n;
}
// ---------- dialog ----------
function capSample() { return CAPS.rows === 2 ? T('วันนี้มีโปรพิเศษมาก ซื้อเลย รับฟรีของแถมทันที ส่งฟรีทั่วเวียงจันทน์') : T('วันนี้มีโปรพิเศษมาก ซื้อเลย'); }
function capDrawPreview(cv, ph, text) {
  const W = 540, H = 960; if (!VP.tpc) { VP.tpc = document.createElement('canvas'); VP.tpc.width = W; VP.tpc.height = H; }
  const c = VP.tpc.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; vpBg(c, W, H);
  const it = capItem(text, { ay: CAPS.pos }); const bl = capBlocks({ segs: [{ a: 0, b: 2.4, text }] }, CAPS.words, { rows: CAPS.rows })[0] || { t: [0], e: [2.4], text }; if (bl.text) it.text = bl.text;
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
  $('#capFont').innerHTML = `<option value="">${T('ตามหน้าตา (ฟอนต์เดิม)')}</option>` + LF_CATS.filter(c => c[0] !== 'all').map(c => `<optgroup label="${esc(T(c[1]))}">` + LAOFONTS.filter(f => f[2] === c[0]).map(f => `<option value="${f[0]}" translate="no">${esc(f[1])}</option>`).join('') + '</optgroup>').join('');
  $('#capFont').value = CAPS.font; $('#capRows').value = String(CAPS.rows); $('#capMin').value = CAPS.minDur; $('#capMinO').textContent = CAPS.minDur.toFixed(1); $('#capKw').value = CAPS.kw;
  $('#capKar').checked = CAPS.kar; $('#capMode').value = CAPS.mode; $('#capColor').value = CAPS.color || capLook(CAPS.look)[4]; $('#capStat').textContent = capStatus(m);
  const sync = () => { $$('#capLooks .caplook').forEach(b => b.classList.toggle('on', b.dataset.id === CAPS.look)); };
  const drawLooks = () => $$('#capLooks .caplook').forEach(b => { const l = capLook(b.dataset.id), save = CAPS.look; CAPS.look = l[0]; const c = VP.tpc || (VP.tpc = Object.assign(document.createElement('canvas'), { width: 540, height: 960 })); const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); vpBg(x, 540, 960); const it = capItem(T('ตัวอย่าง ซับ'), { ay: .5 }); it.kar = { t: [0, .5], e: [.5, 1], c: it.color2, mode: 'cur' }; try { drawText(x, it, .7, 540, 960); } catch (e) { } delete BOUNDS[it.id]; CAPS.look = save; const q = $('canvas', b).getContext('2d'); q.clearRect(0, 0, 150, 52); q.drawImage(c, 20, 435, 500, 90, 0, 0, 150, 52); });
  CAPS.drawLooks = drawLooks; drawLooks(); sync(); dlg.dataset.mid = m.id; dlg.showModal(); CAPS.t0 = performance.now(); CAPS.last = 0;
  const loop = now => { if (!dlg.open) { CAPS.raf = 0; return; } if (now - CAPS.last > 50) { CAPS.last = now; const ph = (((now - CAPS.t0) / 1000) % 4.4) / 4.4; capDrawPreview($('#capPrev'), ph, capSample()); } CAPS.raf = requestAnimationFrame(loop); };
  cancelAnimationFrame(CAPS.raf); CAPS.raf = requestAnimationFrame(loop);
}
function capInit() {
  $('#capLooks').onclick = e => { const b = e.target.closest('.caplook'); if (!b) return; CAPS.look = b.dataset.id; CAPS.color = ''; $('#capColor').value = capLook(CAPS.look)[4]; $$('#capLooks .caplook').forEach(x => x.classList.toggle('on', x === b)); };
  $('#capAnim').onchange = e => { CAPS.anim = e.target.value; };
  $('#capWords').oninput = e => { CAPS.words = +e.target.value; $('#capWordsO').textContent = e.target.value; };
  $('#capPos').onchange = e => { CAPS.pos = +e.target.value; };
  $('#capKar').onchange = e => { CAPS.kar = e.target.checked; };
  $('#capRows').onchange = e => { CAPS.rows = +e.target.value === 2 ? 2 : 1; };
  $('#capMin').oninput = e => { CAPS.minDur = +e.target.value; $('#capMinO').textContent = (+e.target.value).toFixed(1); };
  $('#capKw').onchange = e => { CAPS.kw = e.target.value === 'key' ? 'key' : 'all'; };
  $('#capFont').onchange = async e => { CAPS.font = e.target.value; if (CAPS.font) { await lfEnsure(CAPS.font); } if (CAPS.drawLooks && $('#dlgCap').open) CAPS.drawLooks(); };
  $('#capMode').onchange = e => { CAPS.mode = e.target.value; };
  $('#capColor').oninput = e => { CAPS.color = e.target.value; };
  $('#capClose').onclick = () => $('#dlgCap').close();
  $('#dlgCap').addEventListener('close', () => { cancelAnimationFrame(CAPS.raf); CAPS.raf = 0; });
  $('#capGo').onclick = async () => {
    const dlg = $('#dlgCap'), m = MEDIA.get(dlg.dataset.mid); if (!m || AI.busy) return; dlg.close(); AI.busy = true;
    try {
      ensureOnTimeline(m); let tr = getTr(m.id); if (!tr) { tr = await ensureTranscript(m); }
      let kw = null; if (CAPS.kw === 'key') { aiProg('กำลังให้ AI เลือกคำสำคัญจากข้อความที่ถอดไว้…', null); kw = await capKeywords(tr); }
      if (CAPS.font) await lfEnsure(CAPS.font);
      AI.busy = false; $('#dlgAi').open && $('#dlgAi').close();
      const n = capApply(m, tr, kw); toast(n ? `ใส่คำบรรยาย ${n} ช่วงแล้ว` : (kw ? 'AI ไม่พบคำสำคัญในคลิปนี้' : 'ไม่พบข้อความพูดในคลิปนี้'));
      if (n) { const f = D.items.filter(i => i.sub && i.subOf === m.id).sort((a, b) => a.start - b.start)[0]; if (f) { select(f.id); seek(Math.max(0, f.start - .2)); play(); setTimeout(() => { if (PB.playing) pause(); }, 4000); } }
    } catch (e) { aiErr(e); }
  };
}
