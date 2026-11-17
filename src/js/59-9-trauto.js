// ============================================================
//  v1.63 — auto-transcribe the clips that arrive from VELARIS (the marketing team), so nobody has to press anything.
//  It NEVER pays twice: a clip that already has a transcript in the permanent cache (this browser or the shop server; same file name + size + length,
//  also when VELARIS put a random prefix in front of the name) is skipped. One clip at a time; on the first error everything stops (no retry loop that burns API money).
//  Lao = Gemini (needs the Gemini key from ⚙), Thai = the chosen engine. The text goes only into the permanent cache, never into the open project.
//  Off switch: AI tab -> "auto-transcribe clips from the team" (localStorage sk_autotr = 0). Phones skip it (mobile data).
// ============================================================
let _trQuiet = 0, _trBusy = false, _trNoKeyToast = false; const _trQ = [];
const trAutoOn = () => localStorage.getItem('sk_autotr') !== '0';
function trAutoLang() { return localStorage.getItem('sk_lang') === 'th' ? 'th' : 'lo'; }
function trAutoEngine(lang) { return lang === 'lo' ? 'gemini' : ((($('#aiEng') || {}).value) || 'whisper'); }
const trHas = (m, lang) => { const r = trcRec(m); return !!(r && Object.keys(r.tr || {}).some(k => k.startsWith(lang + ':'))); };
async function trWaitPcm(m) {   // importFiles() already started analyzeAudio(); wait for it (4K files take a few seconds), never decode twice
  for (let i = 0; i < 360 && !m.pcm16 && m.hasAudio !== false; i++) await new Promise(r => setTimeout(r, 500));
  return !!m.pcm16;
}
async function trAutoRun(ids) {
  if (!trAutoOn() || (typeof IS_PHONE === 'function' && IS_PHONE())) return;
  for (const id of ids) if (!_trQ.includes(id)) _trQ.push(id);
  if (_trBusy) return; _trBusy = true;
  const st = { fresh: 0, reused: 0 }; let told = false;
  try {
    try { await trcSyncQuick(); } catch (e) { }   // first look on the shop server: another computer may already have the text
    while (_trQ.length) {
      const m = MEDIA.get(_trQ.shift()); if (!m || m.type !== 'video' || !m.file) continue;
      const lang = trAutoLang(), eng = trAutoEngine(lang);
      if (trHas(m, lang)) { st.reused++; continue; }              // already transcribed -> no API call at all
      if (!(await trWaitPcm(m))) continue;                          // no audio track
      if (lang === 'lo' && !(loadKeys().gemini)) { if (!_trNoKeyToast) { _trNoKeyToast = true; toast('ถอดเสียงอัตโนมัติ: ยังไม่ได้ใส่ Gemini API key (กด ⚙ ตั้งค่า) — ข้ามไปก่อน', 9000); } _trQ.length = 0; break; }
      if (!told) { told = true; toast('กำลังถอดเสียงคลิปจากทีมงานอัตโนมัติ… (คลิปที่เคยถอดแล้วจะข้าม ไม่เสียเงินซ้ำ)', 6000); }
      _trQuiet++; try { const tr = await transcribeCore(m, lang, eng); trcSave(m, tr); st.fresh++; } finally { _trQuiet--; }
    }
  } catch (e) { console.warn('trAutoRun', e); _trQ.length = 0; toast('ถอดเสียงอัตโนมัติหยุดแล้ว: ' + String(e && e.message || e).slice(0, 140) + ' — กดถอดเสียงเองได้ที่แท็บ AI', 12000); }
  finally { _trBusy = false; }
  if (st.fresh || st.reused) toast(`ถอดเสียงอัตโนมัติ: ถอดใหม่ ${st.fresh} คลิป · ใช้ข้อความเดิม ${st.reused} คลิป (ไม่เสียเงิน)`, 9000);
  if (st.fresh && typeof renderAiPane === 'function' && $('#pane-ai')) renderAiPane();
}
