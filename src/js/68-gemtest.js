'use strict';
// ============================================================
//  v1.46 — Gemini test: the first ~20 s of the chosen clip is sent to several Gemini models, the answers are shown side by side
//  (time taken + text), and one tap makes a model the default for transcription
// ============================================================
const GT_VARIANTS = [   // [label, model, thinking level ('' = model default), plain-text prompt?]
  ['Gemini 3.8 Flash · ปกติ', 'gemini-3.8-flash', '', false],
  ['Gemini 3.8 Flash · คิดน้อย', 'gemini-3.8-flash', 'low', false],
  ['Gemini 3.7 Flash · ปกติ', 'gemini-3.7-flash', '', false],
  ['Gemini Flash (ล่าสุด) · ปกติ', 'gemini-flash-latest', '', false],
  ['Gemini 3.8 Flash · ข้อความล้วน (ไม่บังคับ JSON)', 'gemini-3.8-flash', '', true],
];
async function aiGemTest() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (!m.pcm16) return toast('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ'); if (AI.busy) return;
  const lang = $('#aiLang').value === 'th' ? 'Thai' : 'Lao', dur = Math.min(20, m.pcm16.length / 16000);
  const rows = GT_VARIANTS.map((v, i) => `<tr id="gtr${i}"><td style="width:150px"><b>${esc(T(v[0]))}</b></td><td id="gtc${i}" class="mini">${T('รอคิว…')}</td></tr>`).join('');
  aiDlg('ทดสอบ Gemini', `<div class="hint">${T('ส่งเสียง 20 วินาทีแรกของคลิปไปให้ Gemini หลายโมเดล เทียบผลกัน แล้วกด "ใช้โมเดลนี้" ที่อ่านออกถูกที่สุด')}</div><table class="aitbl">${rows}</table>`, bd => {
    bd.onclick = e => { const b = e.target.closest('[data-gt]'); if (!b) return; const v = GT_VARIANTS[+b.dataset.gt]; localStorage.setItem('sk_gmodel', v[1]); localStorage.setItem('sk_gthink', v[2]); toast('ตั้งโมเดลถอดเสียงแล้ว'); b.textContent = T('✓ ใช้อยู่'); };
  });
  const wav = wavB64(m.pcm16, 16000, 0, dur);
  for (let i = 0; i < GT_VARIANTS.length; i++) {
    const v = GT_VARIANTS[i], cell = () => document.getElementById('gtc' + i); if (!cell()) return;   // dialog closed
    cell().textContent = T('กำลังทดสอบ…'); const t0 = performance.now();
    try {
      const prompt = v[3] ? `Transcribe this ${lang}-language audio exactly as spoken, in ${lang} script, no translation. Output only the text.` : trPrompt(lang);
      const txt = await gemini([{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav } }], { json: !v[3], model: v[1], think: v[2], label: 'ทดสอบ Gemini' });
      let out = txt; if (!v[3]) { try { const j = parseJsonLoose(txt); out = (j.segments || j).map(s => s.text).join(' / '); } catch (e) { out = txt; } }
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      if (cell()) cell().innerHTML = `<div class="mini">${sec} ${T('วินาที')}</div><div style="font-size:14px;line-height:1.5;margin:3px 0">${escN(out.slice(0, 600))}</div>` + (v[3] ? '' : `<button data-gt="${i}">${T('ใช้โมเดลนี้')}</button>`);
    } catch (e) { if (cell()) cell().innerHTML = `<div style="color:#ff8a95" class="mini">${escN(String(e.message || e).slice(0, 220))}</div>`; }
  }
}
