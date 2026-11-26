// ============================================================
//  v2.03  🥦 INGREDIENT PICTURES
//  Tar 2026-11-26: "AI listens to the video, finds which ingredients are said, makes the real PNG pictures itself and puts them in the project —
//  no emoji (they look different on every device), no downloading / uploading by hand."
//   1) AI (Gemini, or Claude if only that key exists) reads the transcript and lists the ingredients / foods / plants that are said, with the time.
//   2) For each one a realistic packshot is generated with a Gemini image model on a flat magenta background, the background is keyed out
//      in a canvas (soft edge + colour un-mix) and the picture is cropped -> a transparent PNG.
//   3) The PNG is kept as media 'ing|<key>' (library: next video that says "broccoli" re-uses it, no new AI cost).
//   4) The pictures are put on track V2 at the time they are said (pop-in / fade-out), optionally replacing the emoji stickers in that window.
//  The dialog lets you look at every picture, make it again, or give your own PNG before anything is placed.
// ============================================================
const ING = { rows: [], busy: false, dlg: null };
const ING_MODELS = ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image', 'gemini-2.5-flash-image'];   // tried in order; localStorage sk_gimg = a model name to try first
const ING_KEY = { r: 255, g: 0, b: 255 };   // background colour that is keyed out (magenta: none of the ingredients is magenta)
const ingId = k => 'ing|' + k;
const ingSlug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || ('item' + Date.now());

// ---------- 1) what is said, and when (timeline seconds) ----------
function ingTranscriptLines() {
  const out = []; let any = false, missing = [];
  for (const it of D.items.filter(i => i.type === 'video').sort((a, b) => a.start - b.start)) {
    const tr = getTr(it.mediaId); if (!tr || !tr.segs) { missing.push((MEDIA.get(it.mediaId) || {}).name || it.mediaId); continue; }
    any = true; const sp = it.speed || 1;
    for (const sg of tr.segs) {
      const a = +sg.a, b = +sg.b, tx = String(sg.text || '').trim(); if (!tx || !(b > it.in) || !(a < it.in + it.dur * sp)) continue;
      const t0 = it.start + (Math.max(a, it.in) - it.in) / sp, t1 = it.start + (Math.min(b, it.in + it.dur * sp) - it.in) / sp;
      out.push({ t0, t1, text: tx });
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  return { lines: out, any, missing: [...new Set(missing)] };
}
async function ingDetect(lines) {
  const body = lines.slice(0, 220).map(l => `[${l.t0.toFixed(1)}-${l.t1.toFixed(1)}] ${l.text}`).join('\n');
  const sys = `You read the speech transcript of a short sales video (Lao or Thai, for a shop that sells supplements / cosmetics). Find the INGREDIENTS, foods, fruits, vegetables, herbs or plants the speaker names, i.e. things that can be shown as a real photo of that object. Ignore the product itself, brands, vitamins / chemicals that have no look (L-Cysteine, vitamin C ...), body parts, and abstract words.
Return ONLY a JSON array (max 8 items, no repeats; if a thing is said several times keep the first mention): [{"key":"english-lowercase-slug","en":"English name","name":"name exactly as spoken","desc":"short English description of one photographable object, e.g. 'a fresh broccoli floret' / 'two fresh Indian gooseberries (amla) with leaves'","t0":start seconds,"t1":end seconds}]
t0 / t1 are timeline seconds taken from the [t0-t1] stamps in front of the sentence where it is said (t1 = t0 + about 2.5 s is fine). If nothing qualifies return [].`;
  let txt;
  if (loadKeys().gemini) txt = await gemini([{ text: sys + '\n\nTRANSCRIPT:\n' + body }], { json: true, label: 'ingredients' });
  else txt = await claude({ system: sys, content: 'TRANSCRIPT:\n' + body, max_tokens: 1500, estUsd: .02, label: 'ingredients' });
  const arr = parseJsonLoose(txt); if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.map(r => ({ key: ingSlug(r.key || r.en), en: String(r.en || r.key || '').slice(0, 60), name: String(r.name || r.en || '').slice(0, 60), desc: String(r.desc || r.en || r.key || '').slice(0, 160), t0: Math.max(0, +r.t0 || 0), t1: Math.max(0, +r.t1 || 0) }))
    .filter(r => r.key && r.desc && !seen.has(r.key) && seen.add(r.key)).map(r => (r.t1 <= r.t0 + .5 && (r.t1 = r.t0 + 2.5), r));
}

// ---------- 2) make the picture ----------
// flat-colour key -> transparent PNG canvas (soft edge, key colour un-mixed from the edge pixels, cropped to the object, max 1024 px)
function ingKeyCanvas(img, key) {
  key = key || ING_KEY; const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, 1400 / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, cw, ch);
  const id = x.getImageData(0, 0, cw, ch), d = id.data; let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // distance from the key colour in "how magenta is it" terms: min(r,b) - g is large for magenta and small for green / red / yellow / brown food
    const m = Math.min(r, b) - g; let a = 1 - (m - 40) / 90; a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a < 1 && a > 0) {   // edge pixel: remove the key colour that bleeds into it
      d[i] = Math.max(0, Math.min(255, (r - (1 - a) * key.r) / a)); d[i + 1] = Math.max(0, Math.min(255, (g - (1 - a) * key.g) / a)); d[i + 2] = Math.max(0, Math.min(255, (b - (1 - a) * key.b) / a));
    }
    d[i + 3] = Math.round(a * 255);
    if (a > .05) { const px = p % cw, py = (p / cw) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  if (x1 < 0) throw new Error('ลบพื้นหลังแล้วไม่เหลือภาพ (AI อาจไม่ได้ใช้พื้นสีม่วงบานเย็น) — กดสร้างใหม่');
  x.putImageData(id, 0, 0);
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * .04), sx = Math.max(0, x0 - pad), sy = Math.max(0, y0 - pad), sw = Math.min(cw, x1 + pad + 1) - sx, sh = Math.min(ch, y1 + pad + 1) - sy;
  const q = Math.min(1, 1024 / Math.max(sw, sh)), o = document.createElement('canvas'); o.width = Math.max(2, Math.round(sw * q)); o.height = Math.max(2, Math.round(sh * q));
  o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height); return o;
}
async function ingGenerate(desc) {
  const key = loadKeys().gemini; if (!key) throw new Error('ยังไม่ได้ใส่ Gemini API key (กดปุ่ม ⚙ ตั้งค่า)');
  if (!costGuard(0.06)) throw new Error('งบ AI ครบเพดาน');
  const prompt = `Photorealistic studio product photograph (packshot) of ${desc}. The whole object is fully inside the frame, centered, with a clear margin all around. Natural soft lighting, sharp focus, rich true-to-life colours and fine detail, like a premium food / health-supplement advertisement. IMPORTANT: the background is one perfectly flat, solid, pure magenta colour (#FF00FF) everywhere, no gradient, no floor, no cast shadow, no reflection, no text, no border.`;
  const first = (() => { try { return localStorage.getItem('sk_gimg') || ''; } catch (e) { return ''; } })();
  const models = [...new Set([first, ...ING_MODELS].filter(Boolean))]; let last = '';
  for (const m of models) {
    for (let tri = 0; tri < 2; tri++) {
      let r; const ac = new AbortController(), to = setTimeout(() => ac.abort(), 150000);
      try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) }); } catch (e) { last = e.name === 'AbortError' ? 'หมดเวลา' : String(e.message || e); clearTimeout(to); continue; }
      clearTimeout(to); const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const parts = ((j.candidates || [])[0] || {}).content?.parts || []; const p = parts.find(q => (q.inlineData || q.inline_data));
        if (p) { const id = p.inlineData || p.inline_data; costAdd(0.04, 'ingredient image'); return { b64: id.data, mime: id.mimeType || id.mime_type || 'image/png', model: m }; }
        last = m + ': ไม่ได้รูป (' + (parts.map(q => q.text || '').join(' ').slice(0, 120) || 'ว่าง') + ')'; break;
      }
      last = m + ': ' + ((j.error && j.error.message) || r.status);
      if ([429, 500, 502, 503, 504].includes(r.status)) { await new Promise(o => setTimeout(o, 3000)); continue; }   // busy -> once more, then the next model
      break;   // 400 / 403 / 404 (model does not exist or is not allowed for this key) -> next model
    }
  }
  throw new Error('สร้างรูปไม่สำเร็จ — ' + last + ' · ถ้าชื่อโมเดลเปลี่ยน ให้ตั้งชื่อใหม่ใน localStorage sk_gimg');
}
async function ingMakePng(desc) {
  const g = await ingGenerate(desc); const img = new Image(); img.src = `data:${g.mime};base64,${g.b64}`; await img.decode();
  const cv = ingKeyCanvas(img); const blob = await new Promise(res => cv.toBlob(res, 'image/png')); return blob;
}

// ---------- 3) library = media 'ing|key' ----------
async function ingSaveMedia(key, label, blob) {
  const old = MEDIA.get(ingId(key)); if (old && old.url) { try { URL.revokeObjectURL(old.url); } catch (e) { } }
  await importFiles([new File([blob], label + '.png', { type: 'image/png' })], { id: ingId(key), name: label + ' (ส่วนผสม)', quiet: true });
  return MEDIA.get(ingId(key));
}

// ---------- the dialog ----------
function ingDlg() {
  if (ING.dlg) return ING.dlg;
  const d = document.createElement('dialog'); d.id = 'dlgIng'; d.style.cssText = 'width:min(760px,96vw);max-height:92vh;overflow:auto';
  d.innerHTML = `<h3>🥦 ส่วนผสม — รูปจริงจาก AI</h3><div class="hint" id="ingHint"></div><div id="ingList"></div><div id="ingMsg" class="hint"></div>
  <div class="row"><label class="mini" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ingRmEmoji" checked> ลบอีโมจิที่อยู่ในช่วงเวลาเดียวกันออก</label><span class="sp"></span><button id="ingClose">ปิด</button><button id="ingGo" class="primary">✅ วางลงไทม์ไลน์</button></div>`;
  document.body.appendChild(d); ING.dlg = d;
  $('#ingClose').onclick = () => d.close(); $('#ingGo').onclick = ingPlace;
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-ing]'); if (!b) return; const i = +b.dataset.i, r = ING.rows[i]; if (!r) return;
    if (b.dataset.ing === 'redo') ingFill(r, true);
    if (b.dataset.ing === 'own') { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/png,image/webp'; f.onchange = async () => { const file = f.files[0]; if (!file) return; r.state = 'busy'; ingRender(); try { await ingSaveMedia(r.key, r.en || r.key, file); r.state = 'ok'; } catch (e) { r.state = 'err'; r.err = String(e.message || e); } ingRender(); }; f.click(); }
  });
  d.addEventListener('input', e => { const t = e.target; if (!t.dataset || t.dataset.ingf === undefined) return; const r = ING.rows[+t.dataset.i]; if (!r) return; if (t.dataset.ingf === 'use') r.use = t.checked; else r[t.dataset.ingf] = parseFloat(t.value) || 0; });
  return d;
}
function ingRender() {
  const list = $('#ingList'); if (!list) return;
  list.innerHTML = ING.rows.length ? ING.rows.map((r, i) => {
    const m = MEDIA.get(ingId(r.key));
    const pic = m && m.url ? `<img src="${m.url}" style="width:96px;height:96px;object-fit:contain;border-radius:8px;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50%/16px 16px">` : `<div style="width:96px;height:96px;border-radius:8px;background:#222;display:flex;align-items:center;justify-content:center;font-size:12px;color:#aaa;text-align:center">${r.state === 'busy' ? '⏳ กำลังสร้าง…' : r.state === 'err' ? '⚠' : '—'}</div>`;
    return `<div style="display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #2a2a2a">
      <input type="checkbox" data-ingf="use" data-i="${i}" ${r.use ? 'checked' : ''} ${m ? '' : 'disabled'}>${pic}
      <div style="flex:1;min-width:0"><div><b translate="no">${esc(r.en || r.key)}</b> <span class="mini" translate="no">${esc(r.name)}</span></div>
        <div class="mini" translate="no">${esc(r.desc)}</div>
        <div class="mini">แสดงที่วินาที <input type="number" step="0.1" min="0" style="width:68px" data-ingf="t0" data-i="${i}" value="${r.t0.toFixed(1)}"> ถึง <input type="number" step="0.1" min="0" style="width:68px" data-ingf="t1" data-i="${i}" value="${r.t1.toFixed(1)}"></div>
        ${r.err ? `<div class="mini" style="color:#ff8a8a">${esc(r.err)}</div>` : ''}</div>
      <div style="display:flex;flex-direction:column;gap:6px"><button data-ing="redo" data-i="${i}" ${r.state === 'busy' ? 'disabled' : ''}>↻ สร้างใหม่</button><button data-ing="own" data-i="${i}" ${r.state === 'busy' ? 'disabled' : ''}>⬆ ใช้ PNG ของฉัน</button></div></div>`;
  }).join('') : '';
}
async function ingFill(r, force) {
  if (!force && MEDIA.get(ingId(r.key))) { r.state = 'ok'; r.use = true; ingRender(); return; }   // library hit: no AI cost
  r.state = 'busy'; r.err = ''; ingRender();
  try { const blob = await ingMakePng(r.desc); await ingSaveMedia(r.key, r.en || r.key, blob); r.state = 'ok'; r.use = true; }
  catch (e) { r.state = 'err'; r.err = String(e.message || e); }
  ingRender();
}
async function ingOpen() {
  if (!D || !D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return; }
  const dlg = ingDlg(); if (!dlg.open) dlg.showModal();
  const hint = $('#ingHint'), msg = $('#ingMsg'); ING.rows = []; ingRender(); $('#ingGo').disabled = true;
  hint.textContent = 'AI ฟังเสียงในวิดีโอ แล้วหาว่าพูดถึงส่วนผสมอะไรบ้าง…'; msg.textContent = '';
  try {
    const tl = ingTranscriptLines();
    if (!tl.any) { hint.textContent = ''; msg.textContent = '⚠ ยังไม่ได้ถอดเสียงคลิปในไทม์ไลน์ — ถอดเสียงก่อน (แท็บ AI) แล้วกดปุ่มนี้อีกครั้ง' + (tl.missing.length ? ' · ยังไม่มีเสียงถอด: ' + tl.missing.join(', ') : ''); return; }
    const found = await ingDetect(tl.lines);
    if (!found.length) { hint.textContent = ''; msg.textContent = 'AI ไม่พบส่วนผสมที่ถ่ายเป็นรูปได้ในเสียงของวิดีโอนี้'; return; }
    ING.rows = found.map(f => Object.assign(f, { state: MEDIA.get(ingId(f.key)) ? 'ok' : 'busy', use: !!MEDIA.get(ingId(f.key)), err: '' }));
    hint.textContent = `พบ ${found.length} อย่าง — รูปที่เคยทำแล้วดึงจากคลัง (ฟรี) ที่ยังไม่มีกำลังสร้างให้ (~0.04 USD/รูป) ดูรูปแล้วกด ↻ สร้างใหม่ หรือ ⬆ ใช้ PNG ของฉัน ได้`; ingRender();
    const todo = ING.rows.filter(r => r.state === 'busy'); let n = 0;
    await Promise.all([0, 1].map(async () => { while (n < todo.length) { const r = todo[n++]; await ingFill(r, true); } }));   // 2 at a time
    msg.textContent = ING.rows.some(r => r.state === 'err') ? '⚠ บางรูปสร้างไม่สำเร็จ — กด ↻ ลองอีกครั้ง หรือ ⬆ ใช้ PNG ของฉัน' : '';
  } catch (e) { hint.textContent = ''; msg.textContent = '⚠ ' + (e.message || e); }
  finally { $('#ingGo').disabled = false; }
}

// ---------- 4) place on the timeline ----------
function ingPlace() {
  const rows = ING.rows.filter(r => r.use && MEDIA.get(ingId(r.key)) && r.t1 > r.t0); if (!rows.length) { $('#ingMsg').textContent = 'ยังไม่ได้เลือกรูปที่พร้อมใช้'; return; }
  const slots = [-.1, .08, .26, -.28], placed = [];
  let removed = 0;
  for (const r of rows.sort((a, b) => a.t0 - b.t0)) {
    const dur = Math.max(1.2, r.t1 - r.t0);
    if ($('#ingRmEmoji').checked) { const kill = D.items.filter(i => i.type === 'sticker' && i.kind === 'emoji' && i.start < r.t0 + dur && i.start + i.dur > r.t0); kill.forEach(k => removeItem(k.id)); removed += kill.length; }
    const k = placed.filter(p => p.t0 < r.t0 + dur && p.t0 + p.dur > r.t0).length;
    const tr = freeTrack('video', r.t0, dur, 'V2'); const it = mkMedia(tr, ingId(r.key), r.t0, 0, dur);
    it.fit = 'contain'; it.xf.s = .3; it.xf.x = .3; it.xf.y = slots[k % slots.length]; it.anim = { in: 'pop', out: 'fade', dIn: .35, dOut: .25 };
    addItem(it); placed.push({ t0: r.t0, dur });
  }
  commit('ingredients'); try { renderTimeline(); dirty(); } catch (e) { }
  toast(`วางรูปส่วนผสม ${rows.length} อย่างแล้ว` + (removed ? ` · ลบอีโมจิ ${removed} ตัว` : ''), 5000); ING.dlg.close();
}
(function () { const b = $('#btnIng'); if (b) b.onclick = ingOpen; })();
