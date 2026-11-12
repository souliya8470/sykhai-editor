// ============================================================
//  AI module: keys, cost cap, transcription, price handling, key points,
//  silence / retake cutting, edit variants, image enhance
// ============================================================
const AI = { variants: [], busy: false };
const CLAUDE_MODEL = 'claude-sonnet-5-5';
const PRICE = { claudeIn: 2, claudeOut: 10, gemIn: 1.5, gemOut: 9 };   // USD per 1M tokens (Gemini = conservative estimate)
const FOOTER_TEXT = 'ຜົນທີ່ໄດ້ຮັບຂຶ້ນຢູ່ກັບແຕ່ລະບຸກຄົນ';

// ---------- keys / cost ----------
function loadKeys() { try { return JSON.parse(localStorage.getItem('sk_keys') || '{}'); } catch (e) { return {}; } }
function saveKeys(k) { localStorage.setItem('sk_keys', JSON.stringify(k)); }
function loadCap() { return parseFloat(localStorage.getItem('sk_cap') || '50'); }
function costState() {
  let s = null; try { s = JSON.parse(localStorage.getItem('sk_cost') || 'null'); } catch (e) { }
  const mk = new Date().toISOString().slice(0, 7); if (!s || s.month !== mk) s = { month: mk, usd: 0, log: [] }; return s;
}
function costAdd(usd, label) {
  const s = costState(); s.usd += usd; s.log.unshift({ t: Date.now(), usd: +usd.toFixed(5), label }); s.log = s.log.slice(0, 40);
  try { localStorage.setItem('sk_cost', JSON.stringify(s)); } catch (e) { } updateCostBadge();
}
function updateCostBadge() {
  const b = $('#costBadge'); if (!b) return; const s = costState(), cap = loadCap();
  b.textContent = `AI $${s.usd.toFixed(2)} / $${cap}`; b.classList.toggle('warn', s.usd >= cap * .8 && s.usd < cap); b.classList.toggle('over', s.usd >= cap);
}
function costGuard(est) { const s = costState(), cap = loadCap(); if (s.usd + est > cap) { toast(`งบ AI เดือนนี้ครบเพดาน $${cap} แล้ว (ใช้ไป $${s.usd.toFixed(2)}) — ปรับเพดานได้ที่ ตั้งค่า`, 5000); return false; } return true; }

// ---------- API calls ----------
const loadStyle = () => (localStorage.getItem('sk_style') || '').trim().slice(0, 8000);
async function claude({ system, content, max_tokens = 3000, label = 'claude', estUsd = 0.05, useStyle = false }) {
  const st = useStyle ? loadStyle() : ''; if (st) { system += '\n\nThe shop owner\'s own editing style guide follows (collected from his brainstorming with another AI; may be Thai/Lao/English). Follow it wherever it applies to this task, but never break the JSON/output format required above:\n<style_guide>\n' + st + '\n</style_guide>'; estUsd += st.length / 3 * 3 / 1e6 + 0.002; }
  const key = loadKeys().claude; if (!key) throw new Error('ยังไม่ได้ใส่ Claude API key (กดปุ่ม ⚙ ตั้งค่า)');
  if (!costGuard(estUsd)) throw new Error('งบ AI ครบเพดาน');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens, system, messages: [{ role: 'user', content }] }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Claude: ' + (j.error && j.error.message || r.status));
  const u = j.usage || {}; costAdd(((u.input_tokens || 0) * PRICE.claudeIn + (u.output_tokens || 0) * PRICE.claudeOut) / 1e6, label);
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}
async function gemini(parts, { json = true, label = 'gemini' } = {}) {
  const key = loadKeys().gemini; if (!key) throw new Error('ยังไม่ได้ใส่ Gemini API key (กดปุ่ม ⚙ ตั้งค่า)');
  if (!costGuard(0.03)) throw new Error('งบ AI ครบเพดาน');
  const model = localStorage.getItem('sk_gmodel') || 'gemini-flash-latest';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: Object.assign({ temperature: 0.1 }, json ? { responseMimeType: 'application/json' } : {}) }),
  });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Gemini: ' + (j.error && j.error.message || r.status));
  const u = j.usageMetadata || {}; costAdd(((u.promptTokenCount || 0) * PRICE.gemIn + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * PRICE.gemOut) / 1e6, label);
  return ((j.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
}
function parseJsonLoose(s) {
  s = String(s).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch (e) { const i = s.search(/[\[{]/); const j = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')); if (i >= 0 && j > i) return JSON.parse(s.slice(i, j + 1)); throw new Error('AI ตอบกลับในรูปแบบที่อ่านไม่ได้'); }
}
const toSec = v => { if (typeof v === 'number') return v; v = String(v).trim(); if (v.includes(':')) return v.split(':').reduce((a, x) => a * 60 + parseFloat(x), 0); return parseFloat(v) || 0; };

// ---------- audio helpers ----------
function wavB64(pcm, sr, a, b) {
  const s = Math.max(0, Math.floor(a * sr)), e = Math.min(pcm.length, Math.floor(b * sr)); const n = e - s;
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf); const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, clamp(pcm[s + i], -1, 1) * 32767, true);
  const u = new Uint8Array(buf); let str = ''; for (let i = 0; i < u.length; i += 32768) str += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(str);
}
function envelope(m) {   // 10 ms RMS frames
  if (m.env) return m.env; const p = m.pcm16; if (!p) return null; const N = Math.floor(p.length / 160), e = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = i * 160; j < i * 160 + 160; j++) s += p[j] * p[j]; e[i] = Math.sqrt(s / 160); }
  return m.env = e;
}
function snapValley(m, t, win = 0.22) {
  const e = envelope(m); if (!e) return t; const c = Math.round(t * 100), w = Math.round(win * 100); let best = c, bv = Infinity;
  for (let i = Math.max(0, c - w); i <= Math.min(e.length - 1, c + w); i++) { const v = (e[i] + (e[i - 1] || e[i]) + (e[i + 1] || e[i])) / 3 + Math.abs(i - c) * 1e-5; if (v < bv) { bv = v; best = i; } }
  return (best + .5) / 100;
}
function findSilences(m, a, b, minSil = .45, pad = .12) {
  const e = envelope(m); if (!e) return []; const i0 = Math.floor(a * 100), i1 = Math.min(e.length, Math.floor(b * 100));
  const arr = Array.from(e.slice(i0, i1)).sort((x, y) => x - y); if (!arr.length) return [];
  const floor = arr[Math.floor(arr.length * .1)], thr = Math.max(floor * 2.8, 0.009); const out = []; let s = -1;
  for (let i = i0; i <= i1; i++) {
    const low = i < i1 && e[i] < thr;
    if (low && s < 0) s = i; else if (!low && s >= 0) { const len = (i - s) / 100; if (len >= minSil) { const x = s / 100 + pad, y = i / 100 - pad; if (y - x > .12) out.push([x, y]); } s = -1; }
  }
  return out;
}

// ---------- transcript store ----------
function getTr(id) { return D.tr && D.tr[id]; }
function setTr(id, tr) { D.tr = D.tr || {}; D.tr[id] = tr; commit('tr'); }
const trText = tr => tr.segs.map((s, i) => `${i}: ${s.text}`).join('\n');

// ---------- progress dialog ----------
function aiDlg(title, html, mount) {
  $('#aiTitle').textContent = title; $('#aiBody').innerHTML = html; const d = $('#dlgAi'); if (!d.open) d.showModal(); if (mount) mount($('#aiBody'));
}
function aiProg(msg, pct) { aiDlg('AI กำลังทำงาน…', `<div class="hint">${esc(msg)}</div><div class="progress"><div style="height:100%;width:${pct == null ? 40 : pct}%;background:var(--ac)"></div></div>`); }
function aiErr(e) { console.error(e); aiDlg('เกิดข้อผิดพลาด', `<div class="hint" style="color:#ff8a95">${esc(e.message || e)}</div>`); AI.busy = false; }
function selMedia() { const s = $('#aiClip'); return s && s.value ? MEDIA.get(s.value) : null; }

// ---------- transcription ----------
let _asr = null;
async function getWhisper() {
  if (_asr) return _asr;
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
  const cb = p => { if (p.status === 'progress' && p.file) aiProg(`ดาวน์โหลดโมเดลถอดเสียงไทย (ครั้งแรกครั้งเดียว ~300MB): ${(p.file || '').split('/').pop()} ${Math.round(p.progress || 0)}%`, p.progress || 5); };
  const id = 'onnx-community/whisper-small_timestamped';
  try { _asr = await pipeline('automatic-speech-recognition', id, { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4' }, progress_callback: cb }); }
  catch (e) { console.warn('webgpu failed, wasm', e); _asr = await pipeline('automatic-speech-recognition', id, { device: 'wasm', dtype: 'q8', progress_callback: cb }); }
  return _asr;
}
function groupWords(words) {
  const segs = []; let cur = null;
  for (const w of words) {
    if (!cur || w.a - cur.b > .5 || w.b - cur.a > 7 || (cur.text.length > 38 && w.a - cur.b > .2)) { cur = { a: w.a, b: w.b, text: '' }; segs.push(cur); }
    cur.text += w.text; cur.b = w.b;
  }
  segs.forEach(s => s.text = s.text.trim()); return segs.filter(s => s.text);
}
async function transcribe(m, lang, engine) {
  if (!m.pcm16) throw new Error('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ');
  if (lang === 'th' && engine === 'whisper') {
    aiProg('กำลังโหลดโมเดลถอดเสียง…', 5); const asr = await getWhisper(); aiProg('กำลังถอดเสียงไทย…', 50);
    const out = await asr(m.pcm16, { language: 'thai', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    const words = (out.chunks || []).map(c => ({ a: c.timestamp[0], b: c.timestamp[1] ?? c.timestamp[0] + .3, text: c.text })).filter(w => w.text.trim());
    const tr = { lang, engine: 'whisper', words, segs: groupWords(words) }; setTr(m.id, tr); return tr;
  }
  const lname = lang === 'lo' ? 'Lao' : 'Thai'; const dur = m.pcm16.length / 16000; const segs = [];
  for (let off = 0; off < dur; off += 110) {
    aiProg(`กำลังถอดเสียง (Gemini) ${Math.round(off)}/${Math.round(dur)} วิ…`, 15 + 70 * off / dur);
    const a = off, b = Math.min(dur, off + 110);
    const prompt = `Transcribe this ${lname}-language audio exactly as spoken, in ${lname} script, no translation. Split it into short natural spoken phrases (about 2-7 seconds each). For each phrase give start and end time in seconds measured from the beginning of THIS audio clip (decimal numbers). Return only JSON: {"segments":[{"start":0.0,"end":2.4,"text":"..."}]}`;
    const txt = await gemini([{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wavB64(m.pcm16, 16000, a, b) } }], { label: 'ถอดเสียง ' + lname });
    const j = parseJsonLoose(txt); (j.segments || j).forEach(s => { const t = String(s.text || '').trim(); if (t) segs.push({ a: toSec(s.start) + a, b: toSec(s.end) + a, text: t }); });
  }
  segs.sort((x, y) => x.a - y.a); const tr = { lang, engine: 'gemini', segs }; setTr(m.id, tr); return tr;
}

// ---------- ripple cut ----------
const isMediaLike = it => it.type === 'video' || it.type === 'image' || it.type === 'audio';
function rippleCut(t0, t1) {
  const d = t1 - t0; if (d < .02) return;
  for (const edge of [t0, t1]) for (const it of [...D.items]) { if (it.track !== 'A1' && isMediaLike(it)) splitItem(it.id, edge); }
  D.items = D.items.filter(it => !(it.track !== 'A1' && isMediaLike(it) && it.start >= t0 - 1e-3 && it.start + it.dur <= t1 + 1e-3));
  const map = x => x <= t0 ? x : x >= t1 ? x - d : t0;
  for (const it of [...D.items]) {
    if (it.track === 'A1') continue;
    if (isMediaLike(it)) { if (it.start >= t1 - 1e-3) it.start -= d; }
    else { const s = map(it.start), e = map(it.start + it.dur); if (e - s < .15) D.items = D.items.filter(o => o !== it); else { it.start = s; it.dur = e - s; } }
  }
  const vEnd = D.items.filter(i => i.track !== 'A1').reduce((a, i) => Math.max(a, i.start + i.dur), 0);
  D.items.forEach(i => { if (i.track === 'A1' && i.start + i.dur > vEnd + .01) i.dur = Math.max(.1, vEnd - i.start); });
}
function tlTimes(mediaId, srcT) {
  const out = []; for (const it of D.items) if (it.type === 'video' && it.mediaId === mediaId) { const sp = it.speed || 1; if (srcT >= it.in - 1e-3 && srcT <= it.in + it.dur * sp + 1e-3) out.push(srcToTimeline(it, srcT)); } return out;
}
function cutSourceRanges(mediaId, ranges) {   // ranges in source seconds, applied descending
  const tl = []; for (const [a, b] of ranges) { const ta = tlTimes(mediaId, a)[0], tb = tlTimes(mediaId, b)[0]; if (ta != null && tb != null && tb > ta) tl.push([ta, tb]); }
  tl.sort((x, y) => y[0] - x[0]); tl.forEach(([x, y]) => rippleCut(x, y)); return tl.length;
}

// ============================================================
//  1) transcribe UI
// ============================================================
async function aiTranscribeUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); const lang = $('#aiLang').value, eng = $('#aiEng').value;
  if (AI.busy) return; AI.busy = true;
  try { const tr = await transcribe(m, lang, lang === 'lo' ? 'gemini' : eng); AI.busy = false; showTranscript(m, tr); renderAiPane(); }
  catch (e) { aiErr(e); }
}
function showTranscript(m, tr) {
  aiDlg('ข้อความที่ถอดได้: ' + m.name, `<div class="hint">${tr.segs.length} ประโยค · ${tr.engine}</div><table class="aitbl">${tr.segs.map(s => `<tr><td style="width:96px">${fmt(s.a)}–${fmt(s.b)}</td><td>${esc(s.text)}</td></tr>`).join('')}</table>`);
}

// ============================================================
//  2) prices
// ============================================================
function regexPrices(tr) {
  const out = []; const W = tr.words; if (!W) return out; const numRe = /^[0-9๐-๙,.]+$|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ยี่|เอ็ด|ร้อย|พัน|หมื่น|แสน|ล้าน|ศูนย์/;
  W.forEach((w, i) => { if (/บาท/.test(w.text)) { let j = i - 1; while (j >= 0 && numRe.test(w.text === '' ? '' : W[j].text.trim())) j--; j++; if (j < i) out.push({ a: W[j].a, b: W[i].b, text: W.slice(j, i + 1).map(x => x.text).join('') }); } });
  return out;
}
async function aiPriceUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); let tr = getTr(m.id);
  if (!tr) return toast('ถอดเสียงคลิปนี้ก่อน (ปุ่มที่ 1)'); if (AI.busy) return; AI.busy = true;
  try {
    aiProg('AI กำลังหาช่วงที่พูดราคา…', 40); let found = [];
    if (loadKeys().claude) {
      const lines = tr.words ? tr.words.map((w, i) => `${i}|${w.text}`).join('\n') : tr.segs.map((s, i) => `${i}|${s.text}`).join('\n');
      const sys = 'You find spoken prices in transcripts of Thai/Lao product videos. Reply with JSON only.';
      const txt = await claude({ system: sys, label: 'หาราคา', max_tokens: 1500, estUsd: .03, content: `Transcript lines as "index|text" (${tr.words ? 'each line is one word' : 'each line is one phrase'}). Find every place where the speaker states a price/amount of money (baht, kip, or any currency) — including numbers said in words. Give the first and last line index that make up the price expression only (not the whole sentence). Return {"prices":[{"from":i,"to":j,"amount":"as spoken, short","currency":"THB|LAK|other"}]}\n\n${lines}` });
      const j = parseJsonLoose(txt);
      found = (j.prices || []).map(p => { const f = clamp(p.from | 0, 0, (tr.words || tr.segs).length - 1), t = clamp(p.to | 0, f, (tr.words || tr.segs).length - 1); const A = tr.words ? tr.words : tr.segs; let a = A[f].a, b = A[t].b; if (!tr.words) { const sg = A[f]; const L = sg.text.length || 1; const k = (p.amount && sg.text.indexOf(p.amount)); if (k >= 0 && f === t) { a = sg.a + (sg.b - sg.a) * k / L; b = sg.a + (sg.b - sg.a) * (k + p.amount.length) / L; } } return { a, b, text: (p.amount || '') + (p.currency ? ' (' + p.currency + ')' : ''), approx: !tr.words }; });
    } else found = regexPrices(tr);
    AI.busy = false; showPrices(m, found);
  } catch (e) { aiErr(e); }
}
function showPrices(m, found) {
  if (!found.length) return aiDlg('ราคา', '<div class="hint">ไม่พบช่วงที่พูดราคาในคลิปนี้</div>');
  const rows = found.map((p, i) => `<tr><td><input type="checkbox" data-i="${i}" checked></td><td>${esc(p.text)}${p.approx ? '<br><span class="mini">ตำแหน่งโดยประมาณ</span>' : ''}</td><td>${fmt(p.a)}–${fmt(p.b)}</td><td><select data-act="${i}"><option value="cut">ตัดออก</option><option value="mute">ปิดเสียง</option><option value="none">ไม่แตะเสียง</option></select></td><td><input data-kip="${i}" placeholder="เช่น 299,000 ກີບ" style="width:140px"></td></tr>`).join('');
  aiDlg('พบราคาที่พูดในคลิป', `<div class="hint">เลือกวิธีจัดการ และพิมพ์ราคากีบที่จะแสดงบนจอ (เว้นว่าง = ไม่ใส่ข้อความ) · ต้องวางคลิปนี้ในไทม์ไลน์ก่อน</div><table class="aitbl"><tr><th></th><th>ราคาที่พูด</th><th>เวลา</th><th>เสียง</th><th>ราคากีบบนจอ</th></tr>${rows}</table><div class="row"><span class="sp"></span><button class="primary" id="prApply">ทำตามที่เลือก</button></div>`, root => {
    $('#prApply', root).onclick = () => {
      const picks = found.map((p, i) => ({ p, i, on: $(`[data-i="${i}"]`, root).checked, act: $(`[data-act="${i}"]`, root).value, kip: $(`[data-kip="${i}"]`, root).value.trim() })).filter(x => x.on).sort((x, y) => y.p.a - x.p.a);
      let n = 0; const overlays = [];
      for (const x of picks) {
        const a = snapValley(m, x.p.a - .02, .12), b = snapValley(m, x.p.b + .02, .12); const ta = tlTimes(m.id, a)[0]; if (ta == null) continue;
        if (x.act === 'cut') { cutSourceRanges(m.id, [[a, b]]); } else if (x.act === 'mute') { D.items.filter(it => it.type === 'video' && it.mediaId === m.id && a >= it.in && a <= it.in + it.dur * (it.speed || 1)).forEach(it => { it.mutes = (it.mutes || []).concat([{ a, b }]); }); }
        if (x.kip) overlays.push({ t: ta, text: x.kip, dur: x.act === 'cut' ? 2.8 : Math.max(2.2, tlTimes(m.id, b)[0] - ta + .8) }); n++;
      }
      overlays.forEach(o => { const it = mkText('price', o.text, Math.max(0, o.t - .2), o.dur); it.track = freeTrack('text', it.start, it.dur, 'T2'); addItem(it); });
      commit('price'); $('#dlgAi').close(); toast(`จัดการราคาแล้ว ${n} จุด`);
    };
  });
}

// ============================================================
//  3) key selling points -> on-screen text
// ============================================================
async function aiKeyPointsUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); const tr = getTr(m.id); if (!tr) return toast('ถอดเสียงคลิปนี้ก่อน (ปุ่มที่ 1)'); if (AI.busy) return; AI.busy = true;
  try {
    aiProg('AI กำลังเลือกประโยคเด่น…', 40);
    const sys = 'You are a short-video editor for a Lao online shop selling cosmetics and supplements. You pick the key selling moments that deserve on-screen text. Reply with JSON only.';
    const txt = await claude({ system: sys, label: 'ประโยคเด่น', useStyle: true, max_tokens: 2500, estUsd: .04, content: `Transcript phrases ("index: text", language: ${tr.lang === 'lo' ? 'Lao' : 'Thai'}):\n${trText(tr)}\n\nPick 4-8 key selling points actually said (ingredients, benefits, results, how to use, promotion, guarantee, target problem). NOT full subtitles. For each, give the phrase index where it is spoken and the on-screen text WRITTEN IN LAO SCRIPT (translate if the speech is Thai), natural marketing Lao, very short: line1 (2-5 words, wrap the single most important word in *asterisks*) and optional line2 (short detail, may be empty). Prefer distinct points in speaking order. Return {"points":[{"seg":3,"line1":"...","line2":"...","kind":"benefit|ingredient|promo|usage|problem"}]}` });
    const j = parseJsonLoose(txt); AI.busy = false;
    const pts = (j.points || []).filter(p => tr.segs[p.seg | 0]);
    const rows = pts.map((p, i) => { const s = tr.segs[p.seg | 0]; return `<tr><td><input type="checkbox" data-i="${i}" checked></td><td style="width:64px">${fmt(s.a)}</td><td><textarea data-t="${i}" rows="2">${esc(p.line1 + (p.line2 ? '\n' + p.line2 : ''))}</textarea><div class="mini">${esc(s.text)}</div></td></tr>`; }).join('');
    aiDlg('ประโยคเด่นที่ AI เลือก', `<div class="hint">แก้ข้อความได้ (บรรทัดบน = ตัวขาว, *คำ* = เหลือง, บรรทัดล่าง = เหลือง) แล้วกดใส่เข้าไทม์ไลน์ — จะขึ้นตอนที่พูดประโยคนั้น</div><table class="aitbl">${rows}</table>
      <div class="fld" style="margin-top:8px"><label>สไตล์ข้อความ</label><select id="kpStyle"><option value="hl">ขาว + เหลือง</option><option value="box">กล่องดำ</option><option value="boxred">กล่องดำ + แถบแดง</option><option value="pill">ป้ายเขียว</option><option value="big">หัวข้อใหญ่</option></select></div>
      <div class="row"><span class="sp"></span><button class="primary" id="kpApply">ใส่เข้าไทม์ไลน์</button></div>`, root => {
      $('#kpApply', root).onclick = () => {
        let n = 0; pts.forEach((p, i) => {
          if (!$(`[data-i="${i}"]`, root).checked) return; const s = tr.segs[p.seg | 0]; const ta = tlTimes(m.id, s.a)[0]; if (ta == null) return;
          const dur = clamp(s.b - s.a + .6, 1.8, 4); const it = mkText($('#kpStyle', root).value, $(`[data-t="${i}"]`, root).value, Math.max(0, ta - .05), dur); it.track = freeTrack('text', it.start, dur, 'T1'); it.reveal = it.text.includes('\n') ? .35 : 0; addItem(it); n++;
        });
        commit('keypoints'); $('#dlgAi').close(); toast(n ? `ใส่ข้อความ ${n} จุดแล้ว` : 'ไม่ได้ใส่ — วางคลิปนี้ในไทม์ไลน์ก่อน');
      };
    });
  } catch (e) { aiErr(e); }
}

// ---------- translate selected text ----------
async function aiTranslateText(it) {
  try { toast('กำลังแปล…'); const txt = await claude({ system: 'Translate Thai marketing text to natural Lao (Lao script). Keep line breaks and *asterisk* highlights exactly. Output ONLY the translation.', content: it.text, max_tokens: 500, label: 'แปลข้อความ', estUsd: .01 }); it.text = txt.trim(); commit('translate'); renderInspector(); } catch (e) { toast(e.message, 5000); }
}

// ============================================================
//  4) silence + retake cutting
// ============================================================
function aiSilenceUI() {
  const m = selMedia(); if (!m || !m.pcm16) return toast('เลือกคลิปที่มีเสียงก่อน');
  const items = D.items.filter(it => it.type === 'video' && it.mediaId === m.id); if (!items.length) return toast('วางคลิปนี้ในไทม์ไลน์ก่อน');
  aiDlg('ตัดช่วงเงียบ', `<div class="hint">ตัดช่วงที่ไม่มีเสียงพูดออกและดึงคลิปต่อกัน (ข้อความ/สติกเกอร์เลื่อนตาม)</div>
    <div class="fld"><label>เงียบนานกว่า (วิ)</label><input id="sMin" type="range" min=".25" max="1.5" step=".05" value=".5"><output>0.5</output></div>
    <div class="fld"><label>เว้นหัวท้าย (วิ)</label><input id="sPad" type="range" min=".03" max=".4" step=".01" value=".12"><output>0.12</output></div>
    <div id="sInfo" class="hint"></div><div class="row"><span class="sp"></span><button class="primary" id="sGo">ตัดเลย</button></div>`, root => {
    const calc = () => { const min = +$('#sMin', root).value, pad = +$('#sPad', root).value; $('#sMin', root).nextElementSibling.textContent = min; $('#sPad', root).nextElementSibling.textContent = pad; const rs = []; items.forEach(it => findSilences(m, it.in, it.in + it.dur * (it.speed || 1), min, pad).forEach(r => rs.push(r))); root._rs = rs; const tot = rs.reduce((a, r) => a + r[1] - r[0], 0); $('#sInfo', root).textContent = `พบช่วงเงียบ ${rs.length} จุด รวม ${tot.toFixed(1)} วินาที`; };
    root.oninput = calc; calc();
    $('#sGo', root).onclick = () => { const n = cutSourceRanges(m.id, root._rs || []); commit('silence'); $('#dlgAi').close(); toast(`ตัดแล้ว ${n} จุด`); };
  });
}
async function aiRetakeUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); const tr = getTr(m.id); if (!tr) return toast('ถอดเสียงคลิปนี้ก่อน (ปุ่มที่ 1)'); if (AI.busy) return; AI.busy = true;
  try {
    aiProg('AI กำลังหาเทคที่พูดซ้ำ/พูดผิด…', 40);
    const txt = await claude({ system: 'You review raw takes of a spoken product video and find false starts, stumbles and repeated takes of the same sentence. Reply with JSON only.', label: 'หาเทคซ้ำ', max_tokens: 1500, estUsd: .03, content: `Phrases ("index: text", ${tr.lang === 'lo' ? 'Lao' : 'Thai'}), in recording order:\n${trText(tr)}\n\nFind phrases that should be DROPPED: incomplete/false starts, stumbles, and earlier attempts when the same sentence is repeated later (keep the best, most complete/fluent take — usually the last). Never drop the only occurrence of an idea. Return {"drop":[{"seg":2,"why":"short reason in Thai"}]}` });
    const j = parseJsonLoose(txt); AI.busy = false; const dr = (j.drop || []).filter(d => tr.segs[d.seg | 0]);
    if (!dr.length) return aiDlg('เทคซ้ำ', '<div class="hint">ไม่พบเทคที่ควรตัดทิ้ง</div>');
    aiDlg('เทคที่แนะนำให้ตัดทิ้ง', `<table class="aitbl">${dr.map((d, i) => { const s = tr.segs[d.seg | 0]; return `<tr><td><input type="checkbox" data-i="${i}" checked></td><td style="width:92px">${fmt(s.a)}–${fmt(s.b)}</td><td>${esc(s.text)}<div class="mini">${esc(d.why || '')}</div></td></tr>`; }).join('')}</table><div class="row"><span class="sp"></span><button class="primary" id="rtGo">ตัดที่เลือก</button></div>`, root => {
      $('#rtGo', root).onclick = () => { const rs = dr.filter((d, i) => $(`[data-i="${i}"]`, root).checked).map(d => { const s = tr.segs[d.seg | 0]; return [snapValley(m, s.a - .03, .15), snapValley(m, s.b + .05, .15)]; }); const n = cutSourceRanges(m.id, rs); commit('retake'); $('#dlgAi').close(); toast(`ตัดแล้ว ${n} จุด`); };
    });
  } catch (e) { aiErr(e); }
}

// ============================================================
//  5) image analysis + enhance
// ============================================================
const _probe = {};
async function grabFrame(m, t, w = 270) {
  let v = _probe[m.id]; if (!v) { v = _probe[m.id] = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = m.url; await new Promise(r => { v.onloadeddata = r; setTimeout(r, 8000); }); }
  await seekTo(v, clamp(t, 0, Math.max(0, m.duration - .05))); const h = Math.round(w * v.videoHeight / v.videoWidth); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(v, 0, 0, w, h); return c;
}
function analyzePixels(c) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data; const L = new Float32Array(w * h); const hist = new Uint32Array(256); let sat = 0, sum = 0;
  for (let i = 0; i < w * h; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; const l = (.299 * r + .587 * g + .114 * b); L[i] = l; hist[l | 0]++; sum += l; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); sat += mx ? (mx - mn) / mx : 0; }
  const n = w * h, mean = sum / n / 255; const pct = p => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * p) return i / 255; } return 1; };
  let lap = 0, lapN = 0, noise = 0, noiseN = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const l = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - w] - L[i + w]; lap += l * l; lapN++; const gx = Math.abs(L[i + 1] - L[i - 1]), gy = Math.abs(L[i + w] - L[i - w]); if (gx + gy < 6) { noise += Math.abs(l); noiseN++; } }
  return { mean, p5: pct(.05), p95: pct(.95), sat: sat / n, sharp: lap / lapN, noise: noiseN > n * .05 ? noise / noiseN : 0 };
}
function recommendFx(a) {
  const fx = {}; const notes = [];
  if (a.mean < .38) { fx.brightness = +clamp(.46 / Math.max(a.mean, .15), 1, 1.35).toFixed(2); notes.push('ภาพค่อนข้างมืด → เพิ่มความสว่าง'); } else if (a.mean > .66) { fx.brightness = +clamp(.56 / a.mean, .8, 1).toFixed(2); notes.push('ภาพสว่างจัด → ลดความสว่าง'); }
  if (a.p95 - a.p5 < .62) { fx.contrast = +clamp(1 + (.7 - (a.p95 - a.p5)) * .8, 1.05, 1.3).toFixed(2); notes.push('คอนทราสต์ต่ำ → เพิ่มคอนทราสต์'); }
  if (a.sat < .26) { fx.saturate = +clamp(1 + (.3 - a.sat) * 2.2, 1.08, 1.4).toFixed(2); notes.push('สีซีด → เพิ่มความสด'); }
  if (a.sharp < 40) { fx.sharpen = 2; notes.push('ภาพนุ่ม/ไม่คมมาก → เพิ่มความคมชัดมาก'); } else if (a.sharp < 110) { fx.sharpen = 1; notes.push('ภาพไม่คมเต็มที่ → เพิ่มความคมเล็กน้อย'); }
  if (a.noise > 2.4) { fx.denoise = 1; notes.push('มีนอยส์ → ลดนอยส์'); }
  if (!notes.length) notes.push('ภาพดีอยู่แล้ว ไม่ต้องปรับ'); return { fx, notes };
}
async function enhanceItem(it, silent) {
  const m = MEDIA.get(it.mediaId); if (!m) return null; let c;
  if (it.type === 'image') { c = document.createElement('canvas'); c.width = 270; c.height = Math.round(270 * m.h / m.w); c.getContext('2d').drawImage(m.img, 0, 0, c.width, c.height); }
  else c = await grabFrame(m, (it.in || 0) + it.dur * (it.speed || 1) * .5);
  const a = analyzePixels(c), rec = recommendFx(a); if (!silent) return { a, rec }; Object.assign(it.fx, rec.fx); return { a, rec };
}
async function aiEnhanceUI(it) {
  if (!it) { const sel = SEL && getItem(SEL); it = sel && (sel.type === 'video' || sel.type === 'image') ? sel : D.items.find(i => i.type === 'video' || i.type === 'image'); }
  if (!it) return toast('วางคลิปในไทม์ไลน์ก่อน'); aiProg('กำลังวิเคราะห์ภาพ…', 50);
  try {
    const { a, rec } = await enhanceItem(it, false);
    aiDlg('ผลวิเคราะห์ภาพ', `<table class="aitbl"><tr><td>ความสว่างเฉลี่ย</td><td>${(a.mean * 100).toFixed(0)}%</td></tr><tr><td>ช่วงคอนทราสต์</td><td>${((a.p95 - a.p5) * 100).toFixed(0)}%</td></tr><tr><td>ความสดของสี</td><td>${(a.sat * 100).toFixed(0)}%</td></tr><tr><td>ความคมชัด (ยิ่งสูงยิ่งคม)</td><td>${a.sharp.toFixed(0)}</td></tr><tr><td>นอยส์</td><td>${a.noise.toFixed(1)}</td></tr></table><div class="hint" style="margin-top:8px">${rec.notes.map(esc).join('<br>')}</div>
    <div class="row"><span class="sp"></span><button id="enOne">ใช้กับคลิปนี้</button><button class="primary" id="enAll">ใช้กับทุกคลิปในไทม์ไลน์</button></div>`, root => {
      $('#enOne', root).onclick = () => { Object.assign(it.fx, rec.fx); commit('enhance'); renderInspector(); $('#dlgAi').close(); };
      $('#enAll', root).onclick = async () => { $('#dlgAi').close(); toast('กำลังปรับทุกคลิป…'); for (const x of D.items.filter(i => i.type === 'video' || i.type === 'image')) { try { await enhanceItem(x, true); } catch (e) { } } commit('enhance'); renderInspector(); toast('ปรับภาพทุกคลิปแล้ว'); };
    });
  } catch (e) { aiErr(e); }
}

// ============================================================
//  6) edit variants for staff
// ============================================================
function picksSummary() { let p = []; try { p = JSON.parse(localStorage.getItem('sk_picks') || '[]'); } catch (e) { } if (!p.length) return ''; const c = {}; p.forEach(x => c[x.style] = (c[x.style] || 0) + 1); return Object.entries(c).map(([k, v]) => `${k}: ${v}`).join(', '); }
function recordPick(v) { let p = []; try { p = JSON.parse(localStorage.getItem('sk_picks') || '[]'); } catch (e) { } p.push({ t: Date.now(), style: v.style, len: v.len }); localStorage.setItem('sk_picks', JSON.stringify(p.slice(-60))); }
const VAR_TRANS = { none: 'none', fade: 'fade', punch: 'punch', wipe: 'wipeBlur', slide: 'slideL', card: 'card3d', blur: 'blur' };

async function aiVariantsUI() {
  const vids = [...MEDIA.values()].filter(m => m.type === 'video'); if (!vids.length) return toast('นำเข้าคลิปวิดีโอก่อน'); if (AI.busy) return;
  if (!loadKeys().claude) return toast('ต้องใส่ Claude API key ก่อน (⚙ ตั้งค่า)'); AI.busy = true;
  try {
    const lang = $('#aiLang').value, eng = $('#aiEng').value; const clips = [];
    for (let i = 0; i < vids.length; i++) {
      const m = vids[i]; let tr = getTr(m.id); if (!tr && m.pcm16) { aiProg(`ถอดเสียงคลิป ${i + 1}/${vids.length}: ${m.name}`, 5 + 30 * i / vids.length); tr = await transcribe(m, lang, lang === 'lo' ? 'gemini' : eng); }
      aiProg(`กำลังดูภาพคลิป ${i + 1}/${vids.length}`, 35 + 20 * i / vids.length); const frames = [];
      for (const q of [.15, .5, .85]) { const c = await grabFrame(m, m.duration * q, 288); const a = analyzePixels(c); frames.push({ b64: c.toDataURL('image/jpeg', .6).split(',')[1], a }); }
      clips.push({ id: 'c' + (i + 1), m, tr, frames, sharp: Math.round(frames.reduce((s, f) => s + f.a.sharp, 0) / 3), bright: +(frames.reduce((s, f) => s + f.a.mean, 0) / 3).toFixed(2) });
    }
    aiProg('AI กำลังตัดต่อ 4 แบบ…', 65);
    const content = [{ type: 'text', text: 'You will propose edits for a vertical (9:16) short product video for a Lao online shop (cosmetics/supplements) from the raw clips below. Sample frames follow each clip description.' }];
    for (const c of clips) {
      content.push({ type: 'text', text: `--- CLIP ${c.id} "${c.m.name}" duration ${c.m.duration.toFixed(1)}s, sharpness ${c.sharp}, brightness ${c.bright}. ${c.tr ? 'Transcript phrases (start-end seconds | text):\n' + c.tr.segs.map(s => `${s.a.toFixed(1)}-${s.b.toFixed(1)} | ${s.text}`).join('\n') : 'No transcript (no speech).'}\nSample frames at 15%, 50%, 85%:` });
      c.frames.forEach(f => content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.b64 } }));
    }
    const hist = picksSummary();
    content.push({ type: 'text', text: `\nTask: produce EXACTLY 4 different edit variants, each a different strategy:\n1 "hook": strongest hook in the first 2-3 seconds, fast pace, 15-30s total.\n2 "story": natural order, problem -> product -> result, 30-50s.\n3 "benefit": benefit/proof focused and ends with the offer/price moment, 20-40s.\n4 "clean": minimal, most polished takes only, 15-25s.\nRules: use only clip ids above; segment start/end are SOURCE seconds and must align with phrase boundaries (never cut a sentence in half); prefer the best complete take, skip stumbles/repeats/dead air; avoid blurry or dark clips unless it is the only take; keep the speaker's voice continuous. Add 2-6 on-screen overlays per variant: "seg" = index (0-based) in YOUR segments array where it appears, "line1" short Lao-script text (2-5 words, wrap the key word in *asterisks*), "line2" optional short Lao detail. If speech is Thai, translate the overlay text to Lao. Choose a cut transition between consecutive segments from: none, fade, punch, wipe, slide, card, blur (use mostly none/punch/fade; at most 2 fancy ones).${hist ? `\nStaff previously chose these styles (soft preference only, still make all 4): ${hist}` : ''}\nReturn ONLY JSON: {"variants":[{"style":"hook|story|benefit|clean","name":"short Thai name","why":"1 short Thai sentence","segments":[{"clip":"c1","a":0.0,"b":3.2,"transition":"none"}],"overlays":[{"seg":0,"line1":"...","line2":""}]}]}` });
    const txt = await claude({ system: 'You are an expert short-form video editor producing edit decision lists. Reply with JSON only.', content, max_tokens: 6000, useStyle: true, label: 'ตัดต่อ 4 แบบ', estUsd: .12 });
    const j = parseJsonLoose(txt); const byId = Object.fromEntries(clips.map(c => [c.id, c]));
    AI.variants = (j.variants || []).map(v => { const segs = (v.segments || []).filter(s => byId[s.clip] && toSec(s.b) > toSec(s.a) + .3).map(s => { const c = byId[s.clip], m = c.m; let a = clamp(snapValley(m, toSec(s.a), .2), 0, m.duration), b = clamp(snapValley(m, toSec(s.b), .2), 0, m.duration); if (b - a < .3) { a = toSec(s.a); b = toSec(s.b); } return { m, a, b, transition: VAR_TRANS[s.transition] || 'none' }; }); return Object.assign({}, v, { segs, len: segs.reduce((x, s) => x + s.b - s.a, 0) }); }).filter(v => v.segs.length);
    AI.busy = false; showVariants();
  } catch (e) { aiErr(e); }
}
function buildVariantDoc(v, opts) {
  const doc = newDoc(); doc.tr = D.tr; doc.name = D.name; const prev = D; D = doc; let t = 0; const starts = [];
  try {
    v.segs.forEach((s, i) => {
      const dur = s.b - s.a; const it = mkMedia('V1', s.m.id, t, s.a, dur); it.vol = 1; if (s.m.hasAudio) it.normalize = true;
      const p = i > 0 ? D.items.filter(x => x.track === 'V1').slice(-1)[0] : null;
      if (p && s.transition && s.transition !== 'none') { const d = .35, pm = MEDIA.get(p.mediaId); if (p.in + (p.dur + d) <= pm.duration - .05 && dur > d * 2) { p.dur += d; it.transIn = { type: s.transition, dur: d, ext: d, prevId: p.id }; } }
      starts.push(t); D.items.push(it); t += dur;
    });
    (v.overlays || []).forEach(o => { const si = clamp(o.seg | 0, 0, v.segs.length - 1); const seg = v.segs[si]; const dur = Math.min(3.6, Math.max(1.6, seg.b - seg.a)); const tx = mkText(opts.style || 'hl', (o.line1 || '') + (o.line2 ? '\n' + o.line2 : ''), starts[si] + .1, Math.min(dur, t - starts[si])); tx.track = freeTrack('text', tx.start, tx.dur, 'T1'); tx.reveal = o.line2 ? .35 : 0; D.items.push(tx); });
    if (opts.footer) { const f = mkText('footer', opts.footer, 0, t, { track: 'T3', anim: { in: 'fade', out: 'none', d: .4 } }); D.items.push(f); }
    const mus = [...MEDIA.values()].find(m => m.type === 'audio' && !m.builtin); if (mus && opts.music) { const a = mkAudio('A1', mus.id, 0, t); a.dur = t; D.items.push(a); }
  } finally { D = prev; } return doc;
}
function showVariants() {
  const vs = AI.variants; if (!vs.length) return aiDlg('ผลลัพธ์', '<div class="hint">AI ไม่ได้ส่งแบบที่ใช้ได้กลับมา ลองใหม่อีกครั้ง</div>');
  const cards = vs.map((v, i) => `<div class="vcard" data-i="${i}"><div class="vt"><b>${i + 1}. ${esc(v.name || v.style)}</b> <span class="chip">${esc(v.style)}</span> <span class="chip">${v.len.toFixed(0)} วิ</span><div class="hint">${esc(v.why || '')}</div><div class="mini">${v.segs.length} ช่วง · ข้อความ ${(v.overlays || []).length} จุด</div></div><button data-use="${i}" class="primary">ใช้แบบนี้</button></div>`).join('');
  aiDlg('เลือกแบบที่ต้องการ', `<div class="hint">กด “ใช้แบบนี้” เพื่อโหลดเข้าไทม์ไลน์ (ดูแล้วไม่ชอบ กด ↶ ย้อนกลับ แล้วเปิดหน้านี้เลือกใหม่ได้) — ระบบจดจำว่าทีมเลือกแบบไหน</div>${cards}
    <div class="fld chk"><label><input type="checkbox" id="vFoot" checked> ใส่ข้อความท้ายจอ</label></div><div class="fld"><input id="vFootT" value="${esc(FOOTER_TEXT)}" style="flex:1"></div>
    <div class="fld chk"><label><input type="checkbox" id="vMus" checked> ใส่เพลงพื้นหลังที่นำเข้าไว้ (ถ้ามี)</label></div>`, root => {
    root.onclick = e => { const b = e.target.closest('[data-use]'); if (!b) return; const v = vs[+b.dataset.use]; const doc = buildVariantDoc(v, { style: 'hl', footer: $('#vFoot', root).checked ? $('#vFootT', root).value : '', music: $('#vMus', root).checked }); D = doc; SEL = null; commit('variant'); emit('sel'); recordPick(v); $('#dlgAi').close(); seek(0); toast(`โหลดแบบ “${v.name || v.style}” แล้ว — ✂ แก้ต่อได้เลย`); };
  });
}

// ============================================================
//  AI panel + inspector hooks
// ============================================================
function renderAiPane() {
  const box = $('#pane-ai'); if (!box) return; const keep = $('#aiClip') ? $('#aiClip').value : ''; const vids = [...MEDIA.values()].filter(m => m.type === 'video'); const s = costState();
  box.innerHTML = `<div class="hint">ขั้นตอนแนะนำ: ① ถอดเสียง → ② ราคา → ③ ประโยคเด่น → ④ ตัดช่วงเงียบ/เทคซ้ำ → ⑤ ปรับภาพ หรือกด ⑥ ให้ AI ตัดต่อให้ 4 แบบจากทุกคลิป</div>
  <div class="fld col"><label>คลิปที่ใช้</label><select id="aiClip">${vids.map(m => `<option value="${m.id}" ${m.id === keep ? 'selected' : ''}>${esc(m.name)}${getTr(m.id) ? ' ✔' : ''}</option>`).join('') || '<option value="">(ยังไม่มีคลิป)</option>'}</select></div>
  <div class="fld"><label>ภาษาในคลิป</label><select id="aiLang"><option value="lo">ลาว (Gemini)</option><option value="th">ไทย</option></select></div>
  <div class="fld"><label>ตัวถอดเสียงไทย</label><select id="aiEng"><option value="whisper">Whisper ในเครื่อง (ฟรี แม่น)</option><option value="gemini">Gemini</option></select></div>
  <div class="aicard"><h4>① ถอดเสียง</h4><button class="wide" id="ai1">ถอดเสียงคลิปนี้</button></div>
  <div class="aicard"><h4>② ราคาที่พูด</h4><div class="mini">ตัด/ปิดเสียงราคาบาท แล้วใส่ราคากีบที่พิมพ์เอง</div><button class="wide" id="ai2">ตรวจจับราคา</button></div>
  <div class="aicard"><h4>③ ประโยคเด่นขึ้นจอ</h4><div class="mini">เลือกจุดขาย แล้วขึ้นข้อความตอนที่พูด (ไม่ใช่ซับทั้งหมด)</div><button class="wide" id="ai3">เลือกประโยคเด่น</button></div>
  <div class="aicard"><h4>④ ตัดช่วงเงียบ / เทคซ้ำ</h4><div class="btnrow"><button id="ai4a">ตัดช่วงเงียบ</button><button id="ai4b">ตัดเทคซ้ำ (AI)</button></div></div>
  <div class="aicard"><h4>⑤ ปรับภาพให้ชัด/สวย</h4><button class="wide" id="ai5">วิเคราะห์และปรับอัตโนมัติ</button></div>
  <div class="aicard"><h4>⑥ ให้ AI ตัดต่อ 4 แบบ</h4><div class="mini">ใช้ทุกคลิปในรายการสื่อ แล้วให้พนักงานเลือกแบบที่ชอบ</div><button class="wide primary" id="ai6">สร้าง 4 แบบ</button></div>
  <div class="hint small">ใช้ AI เดือนนี้ $${s.usd.toFixed(2)} จากเพดาน $${loadCap()}</div>`;
  const lg = localStorage.getItem('sk_lang'); if (lg) $('#aiLang').value = lg; $('#aiLang').onchange = e => localStorage.setItem('sk_lang', e.target.value);
  $('#ai1').onclick = aiTranscribeUI; $('#ai2').onclick = aiPriceUI; $('#ai3').onclick = aiKeyPointsUI; $('#ai4a').onclick = aiSilenceUI; $('#ai4b').onclick = aiRetakeUI; $('#ai5').onclick = () => aiEnhanceUI(null); $('#ai6').onclick = aiVariantsUI;
}
AI.inspectorAction = (act, it) => {
  if (act === 'enhance') aiEnhanceUI(it);
  else if (act === 'translate') aiTranslateText(it);
  else if (act === 'silence' || act === 'aiclip') { showTab('ai'); const s = $('#aiClip'); if (s && it.mediaId) s.value = it.mediaId; if (act === 'silence') aiSilenceUI(); }
};
on('media', () => { if ($('#pane-ai.on')) renderAiPane(); }); on('media-added', () => { if ($('#pane-ai.on')) renderAiPane(); });
