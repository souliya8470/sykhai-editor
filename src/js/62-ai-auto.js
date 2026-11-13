// ============================================================
//  AI auto-edit (Kitti-style), built on the AI module (60-ai.js)
//   A) one-click cleanup: silence + filler words (เอ่อ/อืม) + retakes
//   B) auto subtitles from the transcript
//   C) "cut it all for me": many clips -> story concepts -> storyboard -> approve scene by scene -> timeline
// ============================================================

// ---------- shared helpers ----------
const FILLER_RE = /^(?:เอ่อ|เออ|เอ้อ|เอิ่ม|เอิม|เอ๊อ|เอ่อะ|เออะ|อ่า|อ้า|อืม|อึม|อื้ม|หืม|ເອີ|ເອີ່|ເອີ້|ເອິ|ເອີ່ມ|ອືມ|ອື|ອໍ|ອ່າ|ອ້າ|ຮືມ|ອຶມ)+$/;
const stripP = s => String(s || '').replace(/[\s.,!?…"'“”‘’()\-–—ๆ、。]+/g, '');
const isFiller = s => { s = stripP(s); return !!s && FILLER_RE.test(s); };
function mergeRanges(rs, gap = .03) {
  rs = rs.filter(r => r[1] > r[0]).sort((x, y) => x[0] - y[0]); const out = [];
  for (const r of rs) { const l = out[out.length - 1]; if (l && r[0] <= l[1] + gap) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); }
  return out;
}
function srcPieces(mediaId, a, b) {   // source range -> timeline pieces [start,end] (handles cuts and speed)
  const out = [];
  for (const it of D.items) {
    if (it.type !== 'video' || it.mediaId !== mediaId) continue;
    const s0 = it.in || 0, s1 = s0 + it.dur * (it.speed || 1), lo = Math.max(a, s0), hi = Math.min(b, s1);
    if (hi - lo > .05) out.push([srcToTimeline(it, lo), srcToTimeline(it, hi)]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}
function ensureOnTimeline(m) { if (!D.items.some(it => it.type === 'video' && it.mediaId === m.id)) addMediaToTimeline(m.id); }
async function ensureTranscript(m) { const t = getTr(m.id); if (t) return t; const lang = $('#aiLang').value, eng = $('#aiEng').value; return transcribe(m, lang, lang === 'lo' ? 'gemini' : eng); }
function withDoc(doc, fn) { const prev = D; D = doc; try { return fn(); } finally { D = prev; } }

// ============================================================
//  A) cleanup
// ============================================================
function findFillers(tr) {
  const out = [];
  if (tr.words && tr.words.length) { tr.words.forEach(w => { if (isFiller(w.text)) out.push({ a: w.a, b: w.b, text: w.text.trim(), approx: false }); }); return out; }
  for (const s of tr.segs) {
    const toks = s.text.split(/[\s,，、]+/).filter(Boolean); if (!toks.length) continue;
    if (toks.every(isFiller)) { out.push({ a: s.a, b: s.b, text: s.text, approx: false }); continue; }
    const L = s.text.length || 1; let pos = 0;
    for (const tk of toks) { const i = s.text.indexOf(tk, pos); if (i < 0) continue; pos = i + tk.length; if (isFiller(tk)) out.push({ a: s.a + (s.b - s.a) * i / L, b: s.a + (s.b - s.a) * (i + tk.length) / L, text: tk, approx: true }); }
  }
  return out;
}
async function findRetakes(m, tr) {
  const txt = await claude({ system: 'You review raw takes of a spoken product video and find false starts, stumbles and repeated takes of the same sentence. Reply with JSON only.', label: 'หาเทคซ้ำ', max_tokens: 1500, estUsd: .03, content: `Phrases ("index: text", ${tr.lang === 'lo' ? 'Lao' : 'Thai'}), in recording order:\n${trText(tr)}\n\nFind phrases that should be DROPPED: incomplete/false starts, stumbles, and earlier attempts when the same sentence is repeated later (keep the best, most complete/fluent take — usually the last). Never drop the only occurrence of an idea. Return {"drop":[{"seg":2,"why":"short reason in Thai"}]}` });
  const j = parseJsonLoose(txt);
  return (j.drop || []).filter(d => tr.segs[d.seg | 0]).map(d => { const s = tr.segs[d.seg | 0]; return { a: snapValley(m, s.a - .03, .15), b: snapValley(m, s.b + .05, .15), text: s.text, why: d.why || '' }; });
}
function aiCleanUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (!m.pcm16) return toast('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ');
  const hasC = !!loadKeys().claude;
  aiDlg('ตัดอัตโนมัติ', `<div class="hint">เลือกสิ่งที่จะหา แล้วดูรายการก่อนตัดจริง (ตัดแล้วกด ↶ ย้อนกลับได้)</div>
    <div class="fld chk"><label><input type="checkbox" id="cSil" checked> ช่วงเงียบ</label></div>
    <div class="fld"><label>เงียบนานกว่า (วิ)</label><input id="cMin" type="range" min=".25" max="1.5" step=".05" value=".5"><output>0.5</output></div>
    <div class="fld chk"><label><input type="checkbox" id="cFil" checked> คำอ้ำอึ้ง (เอ่อ อืม…) — ต้องถอดเสียง</label></div>
    <div class="fld chk"><label><input type="checkbox" id="cRet" ${hasC ? 'checked' : 'disabled'}> พูดผิด / พูดซ้ำ (AI) — ต้องใช้ Claude API key</label></div>
    <div class="row"><span class="sp"></span><button class="primary" id="cGo">หาช่วงที่จะตัด</button></div>`, root => {
    $('#cMin', root).oninput = e => { e.target.nextElementSibling.textContent = e.target.value; };
    $('#cGo', root).onclick = () => cleanFind(m, { sil: $('#cSil', root).checked, min: +$('#cMin', root).value, fil: $('#cFil', root).checked, ret: $('#cRet', root).checked });
  });
}
async function cleanFind(m, o) {
  if (AI.busy) return; if (!o.sil && !o.fil && !o.ret) return toast('เลือกอย่างน้อย 1 อย่าง'); AI.busy = true;
  try {
    ensureOnTimeline(m); const rows = [];
    if (o.sil) D.items.filter(it => it.type === 'video' && it.mediaId === m.id).forEach(it => findSilences(m, it.in, it.in + it.dur * (it.speed || 1), o.min, .12).forEach(r => rows.push({ k: 'sil', a: r[0], b: r[1], text: '', on: true })));
    let tr = null; if (o.fil || o.ret) tr = getTr(m.id) || await ensureTranscript(m);
    if (o.fil) findFillers(tr).forEach(f => rows.push({ k: 'fil', a: snapValley(m, f.a - .02, .1), b: snapValley(m, f.b + .03, .1), text: f.text, approx: f.approx, on: !f.approx }));
    if (o.ret) { aiProg('AI กำลังหาเทคที่พูดซ้ำ/พูดผิด…', 60); (await findRetakes(m, tr)).forEach(r => rows.push(Object.assign({ k: 'ret', on: true }, r))); }
    AI.busy = false; cleanShow(m, rows);
  } catch (e) { aiErr(e); }
}
const CLEAN_KIND = { sil: 'เงียบ', fil: 'คำอ้ำอึ้ง', ret: 'พูดซ้ำ' };
function cleanShow(m, rows) {
  rows.sort((x, y) => x.a - y.a); if (!rows.length) return aiDlg('ตัดอัตโนมัติ', '<div class="hint">ไม่พบช่วงที่ควรตัด</div>');
  const body = rows.map((r, i) => `<tr><td><input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''}></td><td>${CLEAN_KIND[r.k]}${r.approx ? '<br><span class="mini">ตำแหน่งโดยประมาณ</span>' : ''}</td><td style="white-space:nowrap">${fmt(r.a)}–${fmt(r.b)}</td><td>${escN(r.text || '')}${r.why ? `<div class="mini">${escN(r.why)}</div>` : ''}</td></tr>`).join('');
  aiDlg('พบช่วงที่ควรตัด', `<table class="aitbl">${body}</table><div id="cSum" class="hint" style="margin-top:6px"></div><div class="row"><span class="sp"></span><button class="primary" id="cApply">ตัดที่เลือก</button></div>`, root => {
    const picked = () => mergeRanges(rows.filter((r, i) => $(`[data-i="${i}"]`, root).checked).map(r => [r.a, r.b]));
    const sum = () => { const rs = picked(); $('#cSum', root).textContent = `ตัดออก ${rs.length} จุด ลดได้ ${rs.reduce((a, r) => a + r[1] - r[0], 0).toFixed(1)} วินาที`; };
    root.onchange = sum; sum();
    $('#cApply', root).onclick = () => { const n = cutSourceRanges(m.id, picked()); commit('clean'); $('#dlgAi').close(); toast(`ตัดแล้ว ${n} จุด`); };
  });
}

// ============================================================
//  B) subtitles
// ============================================================
function wordPieces(text, lang) {
  try { const sg = new Intl.Segmenter(lang === 'lo' ? 'lo' : 'th', { granularity: 'word' }); const a = [...sg.segment(text)].map(x => x.segment); if (a.length) return a; } catch (e) { }
  const a = text.split(/(\s+)/).filter(Boolean); return a.length ? a : [text];
}
function splitSubText(text, maxC, lang) {
  text = String(text || '').replace(/\s+/g, ' ').trim(); if (text.length <= maxC) return text ? [text] : [];
  const lines = []; let cur = '';
  for (const tk of wordPieces(text, lang)) { if (cur && (cur + tk).trim().length > maxC) { lines.push(cur.trim()); cur = ''; } cur += tk; }
  if (cur.trim()) lines.push(cur.trim());
  if (lines.length > 1 && lines[lines.length - 1].length < maxC * .25 && (lines[lines.length - 2] + lines[lines.length - 1]).length <= maxC * 1.3) lines.splice(-2, 2, (lines[lines.length - 2] + ' ' + lines[lines.length - 1]).trim());
  return lines;
}
function subChunks(tr, maxC) {   // -> [{a,b,text}] in source seconds
  const out = [];
  if (tr.words && tr.words.length) {
    let cur = null; const flush = () => { if (cur && cur.text.trim()) out.push({ a: cur.a, b: cur.b, text: cur.text.trim() }); cur = null; };
    for (const w of tr.words) {
      if (isFiller(w.text)) continue;
      if (cur && (w.a - cur.b > .45 || (cur.text + w.text).trim().length > maxC)) flush();
      if (!cur) cur = { a: w.a, b: w.b, text: '' }; cur.text += w.text; cur.b = w.b;
    }
    flush(); return out;
  }
  for (const s of tr.segs) {
    const clean = s.text.split(/(\s+)/).filter(t => !(t.trim() && isFiller(t))).join('');
    const parts = splitSubText(clean, maxC, tr.lang); if (!parts.length) continue; const tot = parts.reduce((a, p) => a + p.length, 0) || 1; let c = 0;
    parts.forEach(p => { const a = s.a + (s.b - s.a) * c / tot; c += p.length; out.push({ a, b: s.a + (s.b - s.a) * c / tot, text: p }); });
  }
  return out;
}
async function translateLines(lines, to) {
  const out = [];
  for (let i = 0; i < lines.length; i += 80) {
    const part = lines.slice(i, i + 80);
    const txt = await claude({ system: `You translate video subtitle lines into natural spoken ${to}. Keep each line short and in the same order. Reply with JSON only.`, label: 'แปลซับ', max_tokens: 4000, estUsd: .04, content: `Translate these ${part.length} subtitle lines to ${to} (${to === 'Lao' ? 'Lao script' : 'Thai script'}). Return {"t":["..."]} with exactly ${part.length} strings in the same order.\n${part.map((s, k) => `${k}|${s}`).join('\n')}` });
    const j = parseJsonLoose(txt), arr = j.t || j; part.forEach((s, k) => out.push(String((arr && arr[k]) || s)));
  }
  return out;
}
function makeSubItems(mediaId, chunks, styleId) {   // adds text items to the CURRENT doc
  let n = 0;
  for (const c of chunks) {
    const txt = String(c.text || '').trim(); if (!txt) continue;
    for (const [s, e] of srcPieces(mediaId, c.a, c.b)) {
      if (e - s < .3) continue; const dur = Math.max(.4, e - s); const it = mkText(styleId, txt, s, dur, { sub: 1, subOf: mediaId, anim: { in: 'none', out: 'none', d: 0 }, reveal: 0 });
      it.track = freeTrack('text', it.start, it.dur, 'T2'); addItem(it); n++;
    }
  }
  return n;
}
async function aiSubsUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (AI.busy) return; AI.busy = true;
  try { ensureOnTimeline(m); const tr = getTr(m.id) || await ensureTranscript(m); AI.busy = false; subsDialog(m, tr); } catch (e) { aiErr(e); }
}
function subsDialog(m, tr) {
  const hasC = !!loadKeys().claude;
  aiDlg('ซับอัตโนมัติ', `<div class="hint">สร้างซับจากเสียงที่ถอดไว้ แล้วดู/แก้ข้อความก่อนใส่เข้าไทม์ไลน์</div>
    <div class="fld"><label>ภาษาซับ</label><select id="sbLang"><option value="orig">ตามที่พูด</option><option value="Lao" ${hasC ? '' : 'disabled'}>แปลเป็นลาว (Claude)</option><option value="Thai" ${hasC ? '' : 'disabled'}>แปลเป็นไทย (Claude)</option></select></div>
    <div class="fld"><label>สไตล์</label><select id="sbStyle">${['sub', 'subbox', 'subGlow', 'clean', 'plain', 'hl'].map(id => `<option value="${id}" ${id === (D.presetSub || 'sub') ? 'selected' : ''}>${esc(TEXT_STYLES.find(s => s.id === id).label)}</option>`).join('')}</select></div>
    <div class="fld"><label>ตัวอักษรต่อซับ</label><input id="sbMax" type="range" min="12" max="40" step="1" value="24"><output>24</output></div>
    <div class="fld chk"><label><input type="checkbox" id="sbRep" checked> แทนที่ซับเดิมของคลิปนี้</label></div>
    <div class="row"><span class="sp"></span><button class="primary" id="sbGo">สร้างซับ</button></div>`, root => {
    $('#sbMax', root).oninput = e => { e.target.nextElementSibling.textContent = e.target.value; };
    $('#sbGo', root).onclick = async () => {
      if (AI.busy) return; AI.busy = true;
      try {
        const lang = $('#sbLang', root).value, style = $('#sbStyle', root).value, rep = $('#sbRep', root).checked; let chunks = subChunks(tr, +$('#sbMax', root).value);
        if (!chunks.length) { AI.busy = false; return aiDlg('ซับอัตโนมัติ', '<div class="hint">ไม่พบข้อความพูดในคลิปนี้</div>'); }
        if (lang !== 'orig') { aiProg('AI กำลังแปลซับ…', 50); const tl = await translateLines(chunks.map(c => c.text), lang); chunks = chunks.map((c, i) => Object.assign({}, c, { text: tl[i] })); }
        AI.busy = false; subsPreview(m, chunks, style, rep);
      } catch (e) { aiErr(e); }
    };
  });
}
function subsPreview(m, chunks, style, rep) {
  const rows = chunks.map((c, i) => `<tr><td style="width:64px;white-space:nowrap">${fmt(c.a)}</td><td><input data-t="${i}" value="${esc(c.text)}" style="width:100%;box-sizing:border-box"></td></tr>`).join('');
  aiDlg('ตรวจซับก่อนใส่', `<div class="hint">${chunks.length} ซับ · แก้ข้อความได้ (ลบข้อความ = ไม่ใส่ซับนั้น)</div><table class="aitbl" translate="no">${rows}</table><div class="row"><span class="sp"></span><button class="primary" id="sbApply">ใส่เข้าไทม์ไลน์</button></div>`, root => {
    $('#sbApply', root).onclick = () => {
      const fin = chunks.map((c, i) => Object.assign({}, c, { text: $(`[data-t="${i}"]`, root).value }));
      if (rep) D.items = D.items.filter(it => !(it.sub && it.subOf === m.id));
      const n = makeSubItems(m.id, fin, style); commit('subs'); $('#dlgAi').close(); toast(n ? `ใส่ซับ ${n} จุดแล้ว` : 'ไม่ได้ใส่ซับ');
    };
  });
}

// ============================================================
//  C) "cut it all for me" — concepts -> storyboard -> approve -> timeline
// ============================================================
const KIT = { clips: [], concepts: [], boards: [], brief: '', target: 30, subs: true, footer: true, music: true };
function kitClipBlocks() {
  const out = [];
  for (const c of KIT.clips) {
    out.push({ type: 'text', text: `--- CLIP ${c.id} "${c.m.name}" duration ${c.m.duration.toFixed(1)}s, sharpness ${c.sharp}, brightness ${c.bright}. ${c.tr ? 'Transcript phrases (start-end seconds | text):\n' + c.tr.segs.map(s => `${s.a.toFixed(1)}-${s.b.toFixed(1)} | ${s.text}`).join('\n') : 'No transcript (no speech).'}\nSample frames at 15%, 50%, 85%:` });
    c.frames.forEach(f => out.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.b64 } }));
  }
  return out;
}
function kitClipText() { return KIT.clips.map(c => `${c.id} | ${c.m.name} | ${c.m.duration.toFixed(1)}s | ${c.tr ? c.tr.segs.map(s => `${s.a.toFixed(1)}-${s.b.toFixed(1)} ${s.text}`).join(' / ') : 'no speech'}`).join('\n'); }
const KIT_RULES = 'Rules: use only clip ids above; segment start/end are SOURCE seconds and must align with phrase boundaries (never cut a sentence in half); prefer the best complete take, skip stumbles/repeats/dead air; avoid blurry or dark footage unless it is the only take; keep the speaker\'s voice continuous. Overlay text: "line1" short Lao-script text (2-5 words, wrap the key word in *asterisks*), "line2" optional short Lao detail (translate to Lao if the speech is Thai); leave both empty when the scene needs no text.';

function aiKittiUI() {
  const vids = [...MEDIA.values()].filter(m => m.type === 'video'); if (!vids.length) return toast('นำเข้าคลิปวิดีโอก่อน');
  if (!loadKeys().claude) return toast('ต้องใส่ Claude API key ก่อน (⚙ ตั้งค่า)');
  const hasMus = [...MEDIA.values()].some(m => m.type === 'audio' && !m.builtin);
  aiDlg('ให้ AI ตัดให้ทั้งคลิป', `<div class="hint">① เลือกคลิป → ② AI ดูคลิปแล้วเสนอแนวเรื่อง → ③ ตรวจ storyboard ทีละฉาก → ④ ได้คลิปแนวตั้ง 9:16 ลงไทม์ไลน์ (แก้ต่อได้)</div>
    <div class="kclips">${vids.map(m => `<label class="kcl"><input type="checkbox" data-m="${m.id}" checked> <span translate="no">${esc(m.name)}</span> <span class="mini">${fmt(m.duration)}</span></label>`).join('')}</div>
    <div class="fld col"><label>โจทย์ / สิ่งที่อยากได้ (ไม่ใส่ก็ได้)</label><textarea id="kBrief" rows="2" placeholder="เช่น ขายครีมกันแดด เน้นไม่เหนียว"></textarea></div>
    <div class="fld"><label>ความยาวที่ต้องการ</label><select id="kLen"><option value="15">ประมาณ 15 วินาที</option><option value="30" selected>ประมาณ 30 วินาที</option><option value="45">ประมาณ 45 วินาที</option><option value="60">ประมาณ 60 วินาที</option></select></div>
    <div class="fld chk"><label><input type="checkbox" id="kSubs" checked> ใส่ซับจากเสียงพูด</label></div>
    <div class="fld chk"><label><input type="checkbox" id="kFoot" checked> ใส่ข้อความท้ายจอ</label></div>
    ${hasMus ? '<div class="fld chk"><label><input type="checkbox" id="kMus" checked> ใส่เพลงพื้นหลังที่นำเข้าไว้</label></div>' : ''}
    <div class="row"><span class="sp"></span><button class="primary" id="kGo">ให้ AI ดูคลิป</button></div>`, root => {
    $('#kGo', root).onclick = () => {
      const ids = [...root.querySelectorAll('[data-m]')].filter(x => x.checked).map(x => x.dataset.m); if (!ids.length) return toast('เลือกคลิปก่อน');
      Object.assign(KIT, { brief: $('#kBrief', root).value.trim(), target: +$('#kLen', root).value, subs: $('#kSubs', root).checked, footer: $('#kFoot', root).checked, music: !!($('#kMus', root) && $('#kMus', root).checked) });
      kitAnalyze(ids.slice(0, 24));
    };
  });
}
async function kitAnalyze(ids) {
  if (AI.busy) return; AI.busy = true;
  try {
    const lang = $('#aiLang').value, eng = $('#aiEng').value; KIT.clips = []; KIT.concepts = []; KIT.boards = [];
    for (let i = 0; i < ids.length; i++) {
      const m = MEDIA.get(ids[i]); if (!m) continue; let tr = getTr(m.id);
      if (!tr && m.pcm16) { try { aiProg(`ถอดเสียงคลิป ${i + 1}/${ids.length}: ${m.name}`, 5 + 35 * i / ids.length); tr = await transcribe(m, lang, lang === 'lo' ? 'gemini' : eng); } catch (e) { if (/งบ|API key/.test(e.message)) throw e; console.warn(e); } }
      aiProg(`กำลังดูภาพคลิป ${i + 1}/${ids.length}`, 40 + 25 * i / ids.length); const frames = [];
      for (const q of [.15, .5, .85]) { const c = await grabFrame(m, m.duration * q, 288); const a = analyzePixels(c); frames.push({ b64: c.toDataURL('image/jpeg', .6).split(',')[1], a }); }
      KIT.clips.push({ id: 'c' + (KIT.clips.length + 1), m, tr, frames, sharp: Math.round(frames.reduce((s, f) => s + f.a.sharp, 0) / 3), bright: +(frames.reduce((s, f) => s + f.a.mean, 0) / 3).toFixed(2) });
    }
    aiProg('AI กำลังคิดแนวเรื่อง…', 75);
    const content = [{ type: 'text', text: `You plan short vertical (9:16) videos for a Lao online shop (cosmetics/supplements) from the raw clips below. ${KIT.brief ? 'Owner brief: ' + KIT.brief + '\n' : ''}Target length about ${KIT.target} seconds each.` }, ...kitClipBlocks(),
      { type: 'text', text: 'Task: propose EXACTLY 3 clearly different story angles (concepts) that are realistic with THIS footage (e.g. hook-first, problem->solution, proof/result, offer-focused). For each: "name" short Thai name, "pitch" 1-2 Thai sentences describing what the viewer sees and hears, "hook" the opening hook in Thai. Return ONLY JSON: {"concepts":[{"name":"","pitch":"","hook":""}]}' }];
    const txt = await claude({ system: 'You are an expert short-form video editor and storyteller. Reply with JSON only.', content, max_tokens: 2500, useStyle: true, label: 'แนวเรื่อง', estUsd: .1 });
    KIT.concepts = (parseJsonLoose(txt).concepts || []).slice(0, 4).map(c => ({ name: String(c.name || ''), pitch: String(c.pitch || ''), hook: String(c.hook || '') })).filter(c => c.name || c.pitch);
    AI.busy = false; kitShowConcepts();
  } catch (e) { aiErr(e); }
}
function kitShowConcepts() {
  if (!KIT.concepts.length) return aiDlg('แนวเรื่อง', '<div class="hint">AI ไม่ได้ส่งแนวเรื่องที่ใช้ได้กลับมา ลองใหม่อีกครั้ง</div>');
  const sheet = KIT.clips.map(c => `<div class="kc"><img src="data:image/jpeg;base64,${c.frames[1].b64}"><div class="kn" translate="no">${esc(c.m.name)}</div><div>${fmt(c.m.duration)}${c.tr ? ' · 🎤' : ''}</div></div>`).join('');
  const cards = KIT.concepts.map((c, i) => `<label class="vcard"><input type="checkbox" data-c="${i}" ${i === 0 ? 'checked' : ''}><div class="vt"><b translate="no">${i + 1}. ${esc(c.name)}</b><div class="hint" translate="no">${esc(c.pitch)}</div>${c.hook ? `<div class="mini" translate="no">🎣 ${esc(c.hook)}</div>` : ''}</div></label>`).join('');
  aiDlg('เลือกแนวเรื่อง', `<div class="hint">AI ดูคลิปทั้งหมดแล้ว — เลือกได้มากกว่า 1 แนว แต่ละแนวจะเป็น 1 คลิป</div><div class="ksheet">${sheet}</div>${cards}<div class="row"><span class="sp"></span><button class="primary" id="kNext">ต่อ: สร้าง storyboard</button></div>`, root => {
    $('#kNext', root).onclick = () => { const sel = [...root.querySelectorAll('[data-c]')].filter(x => x.checked).map(x => +x.dataset.c); if (!sel.length) return toast('เลือกอย่างน้อย 1 แนว'); kitMakeBoards(sel); };
  });
}
function kitScene(s) {
  const c = KIT.clips.find(x => x.id === s.clip); if (!c) return null; const m = c.m;
  let a = clamp(snapValley(m, toSec(s.a), .2), 0, m.duration), b = clamp(snapValley(m, toSec(s.b), .2), 0, m.duration); if (b - a < .3) { a = clamp(toSec(s.a), 0, m.duration); b = clamp(toSec(s.b), 0, m.duration); } if (b - a < .3) return null;
  return { id: uid(), role: String(s.role || ''), c, m, a, b, line1: String(s.line1 || ''), line2: String(s.line2 || ''), why: String(s.why || ''), status: 'pending', thumb: '' };
}
async function kitMakeBoards(sel) {
  if (AI.busy) return; AI.busy = true;
  try {
    KIT.boards = [];
    for (let k = 0; k < sel.length; k++) {
      const cc = KIT.concepts[sel[k]]; aiProg(`AI กำลังเขียน storyboard ${k + 1}/${sel.length}: ${cc.name}`, 10 + 80 * k / sel.length);
      const content = [{ type: 'text', text: `You build a storyboard for ONE short vertical (9:16) product video for a Lao online shop (cosmetics/supplements) from the raw clips below. ${KIT.brief ? 'Owner brief: ' + KIT.brief + '\n' : ''}Target length about ${KIT.target} seconds in total.` }, ...kitClipBlocks(),
        { type: 'text', text: `Chosen concept: ${JSON.stringify(cc)}\nTask: write a storyboard of 3-6 scenes in playing order that tells this concept and totals about ${KIT.target}s. Each scene = one continuous piece of ONE clip. ${KIT_RULES}\nReturn ONLY JSON: {"scenes":[{"role":"hook|problem|product|proof|offer|cta","clip":"c1","a":0.0,"b":3.2,"line1":"","line2":"","why":"1 short Thai sentence"}]}` }];
      const txt = await claude({ system: 'You are an expert short-form video editor producing storyboards as edit decision lists. Reply with JSON only.', content, max_tokens: 3500, useStyle: true, label: 'storyboard', estUsd: .1 });
      const scenes = (parseJsonLoose(txt).scenes || []).map(kitScene).filter(Boolean); KIT.boards.push({ concept: cc, scenes });
    }
    const all = KIT.boards.flatMap(b => b.scenes); for (let i = 0; i < all.length; i++) { aiProg(`กำลังทำภาพตัวอย่างฉาก ${i + 1}/${all.length}`, 92); try { const c = await grabFrame(all[i].m, all[i].a + .2, 120); all[i].thumb = c.toDataURL('image/jpeg', .55); } catch (e) { } }
    AI.busy = false; kitShowBoards();
  } catch (e) { aiErr(e); }
}
function kitSceneHtml(sc) {
  const segs = sc.c.tr ? sc.c.tr.segs.filter(s => s.b > sc.a && s.a < sc.b).map(s => s.text).join(' ') : '';
  return `<img src="${sc.thumb || ''}" alt=""><div class="kb"><div><span class="chip">${esc(sc.role || 'scene')}</span> <span class="mini" translate="no">${esc(sc.m.name)} · ${fmt(sc.a)}–${fmt(sc.b)} (${(sc.b - sc.a).toFixed(1)}s)</span></div>${segs ? `<div class="kt" translate="no">🎤 ${esc(segs)}</div>` : ''}${sc.why ? `<div class="kt" translate="no">${esc(sc.why)}</div>` : ''}
    <textarea data-k="txt" rows="2" placeholder="(ไม่มีข้อความบนจอ)">${esc(sc.line1 + (sc.line2 ? '\n' + sc.line2 : ''))}</textarea>
    <div class="krow"><button data-k="ok" class="primary">✓ ผ่าน</button><button data-k="rev">✎ แก้</button><button data-k="drop">✕ ตัดฉากนี้ทิ้ง</button></div>
    <div class="krev"><input data-k="note" placeholder="บอกสิ่งที่อยากแก้ เช่น ตัดสั้นลง / ใช้ช็อตอื่น"><button data-k="send">ส่ง</button></div></div>`;
}
function kitShowBoards() {
  if (!KIT.boards.length || !KIT.boards.some(b => b.scenes.length)) return aiDlg('Storyboard', '<div class="hint">AI ไม่ได้ส่งฉากที่ใช้ได้กลับมา ลองใหม่อีกครั้ง</div>');
  const html = KIT.boards.map((b, bi) => `<div class="aicard"><h4 translate="no">${bi + 1}. ${esc(b.concept.name)}</h4><div class="mini" translate="no">${esc(b.concept.pitch)}</div><div data-board="${bi}">${b.scenes.map((s, si) => `<div class="kscene" data-s="${si}">${kitSceneHtml(s)}</div>`).join('')}</div><div class="row"><span class="sp"></span><button data-allok="${bi}">ผ่านทั้งหมดของแนวนี้</button></div></div>`).join('');
  aiDlg('ตรวจ storyboard ทีละฉาก', `<div class="hint">กด ✓ ผ่าน ฉากที่ใช้ได้ · ไม่ผ่านให้กด ✎ แก้ แล้วพิมพ์บอก · ผ่านครบทุกฉากแล้วจึงสร้างคลิปได้</div>${html}<div id="kSum" class="hint"></div><div class="row"><span class="sp"></span><button class="primary" id="kBuild" disabled>สร้างคลิป</button></div>`, root => {
    const upd = () => { const pend = KIT.boards.reduce((a, b) => a + b.scenes.filter(s => s.status === 'pending').length, 0), kept = KIT.boards.reduce((a, b) => a + b.scenes.filter(s => s.status !== 'drop').length, 0); $('#kSum', root).textContent = pend ? `ยังไม่ได้ตรวจ ${pend} ฉาก` : (kept ? 'ผ่านครบแล้ว — กดสร้างคลิปได้' : 'ตัดทุกฉากทิ้งหมดแล้ว'); $('#kBuild', root).disabled = !!pend || !kept; };
    const paint = (el, sc) => { el.className = 'kscene' + (sc.status === 'ok' ? ' ok' : sc.status === 'drop' ? ' drop' : ''); };
    root.querySelectorAll('.kscene').forEach(el => { const sc = KIT.boards[+el.parentElement.dataset.board].scenes[+el.dataset.s]; paint(el, sc); });
    root.onclick = async e => {
      const all = e.target.closest('[data-allok]'); if (all) { const b = KIT.boards[+all.dataset.allok]; b.scenes.forEach(s => { if (s.status === 'pending') s.status = 'ok'; }); root.querySelectorAll(`[data-board="${all.dataset.allok}"] .kscene`).forEach((el, i) => paint(el, b.scenes[i])); return upd(); }
      const btn = e.target.closest('[data-k]'); if (!btn) return; const el = btn.closest('.kscene'); if (!el) return; const sc = KIT.boards[+el.parentElement.dataset.board].scenes[+el.dataset.s]; const k = btn.dataset.k;
      const saveTxt = () => { const v = $('[data-k=txt]', el).value.split('\n'); sc.line1 = (v[0] || '').trim(); sc.line2 = v.slice(1).join(' ').trim(); };
      if (k === 'ok') { saveTxt(); sc.status = sc.status === 'ok' ? 'pending' : 'ok'; paint(el, sc); upd(); }
      else if (k === 'drop') { sc.status = sc.status === 'drop' ? 'pending' : 'drop'; paint(el, sc); upd(); }
      else if (k === 'rev') { $('.krev', el).classList.toggle('on'); }
      else if (k === 'send') {
        const note = $('[data-k=note]', el).value.trim(); if (!note || AI.busy) return; AI.busy = true; btn.disabled = true; btn.textContent = '…';
        try { await kitRevise(el.parentElement.dataset.board, sc, note); el.innerHTML = kitSceneHtml(sc); paint(el, sc); upd(); } catch (er) { toast(er.message, 5000); btn.disabled = false; btn.textContent = 'ส่ง'; } AI.busy = false;
      }
    };
    root.onchange = e => { if (e.target.matches('[data-k=txt]')) { const el = e.target.closest('.kscene'), sc = KIT.boards[+el.parentElement.dataset.board].scenes[+el.dataset.s]; const v = e.target.value.split('\n'); sc.line1 = (v[0] || '').trim(); sc.line2 = v.slice(1).join(' ').trim(); } };
    $('#kBuild', root).onclick = kitBuild; upd();
  });
}
async function kitRevise(bi, sc, note) {
  const b = KIT.boards[+bi], idx = b.scenes.indexOf(sc);
  const cur = b.scenes.map(s => ({ role: s.role, clip: s.c.id, a: +s.a.toFixed(2), b: +s.b.toFixed(2), line1: s.line1, line2: s.line2 }));
  const txt = await claude({ system: 'You revise ONE scene of a short-video storyboard according to the owner\'s note. Reply with JSON only.', label: 'แก้ฉาก', useStyle: true, max_tokens: 1200, estUsd: .04,
    content: `Clips (id | name | duration | transcript phrases):\n${kitClipText()}\n\nConcept: ${JSON.stringify(b.concept)}\nCurrent storyboard: ${JSON.stringify(cur)}\n\nRevise ONLY scene index ${idx} following the owner's note: "${note}". ${KIT_RULES}\nReturn ONLY JSON: {"scene":{"role":"","clip":"c1","a":0.0,"b":3.2,"line1":"","line2":"","why":"1 short Thai sentence"}}` });
  const ns = kitScene(Object.assign({ role: sc.role }, parseJsonLoose(txt).scene || {})); if (!ns) throw new Error('AI ตอบกลับฉากที่ใช้ไม่ได้ ลองพิมพ์ใหม่');
  try { const c = await grabFrame(ns.m, ns.a + .2, 120); ns.thumb = c.toDataURL('image/jpeg', .55); } catch (e) { }
  Object.assign(sc, ns, { id: sc.id, status: 'pending' });
}
async function kitBuild() {
  if (AI.busy) return; AI.busy = true;
  try {
    aiProg('กำลังสร้างคลิป…', 30); const docs = [];
    for (const b of KIT.boards) {
      const sc = b.scenes.filter(s => s.status !== 'drop'); if (!sc.length) continue;
      const v = { name: b.concept.name, segs: sc.map(s => ({ m: s.m, a: s.a, b: s.b, transition: 'none' })), overlays: sc.map((s, i) => s.line1 || s.line2 ? { seg: i, line1: s.line1, line2: s.line2 } : null).filter(Boolean) };
      const doc = buildVariantDoc(v, { style: 'hl', footer: KIT.footer ? FOOTER_TEXT : '', music: KIT.music }); doc.name = b.concept.name;
      if (KIT.subs) withDoc(doc, () => { for (const mid of [...new Set(sc.map(s => s.m.id))]) { const tr = getTr(mid); if (tr) makeSubItems(mid, subChunks(tr, 24), 'sub'); } });
      docs.push(doc);
    }
    if (!docs.length) { AI.busy = false; return aiDlg('สร้างคลิป', '<div class="hint">ไม่มีฉากให้สร้างคลิป</div>'); }
    await projSaveNow();
    for (const d of docs.slice(1)) { const rec = projRec(d); await projPut(rec); if (typeof srvSync === 'function') srvSync(rec); }
    D = docs[0]; SEL = null; commit('kitti'); emit('sel'); seek(0); AI.busy = false; $('#dlgAi').close();
    toast(docs.length > 1 ? `สร้างแล้ว ${docs.length} คลิป — คลิปแรกอยู่ในไทม์ไลน์ ที่เหลืออยู่ในหน้าโปรเจกต์` : 'สร้างคลิปแล้ว — ✂ แก้ต่อได้เลย', 5000);
  } catch (e) { aiErr(e); }
}
