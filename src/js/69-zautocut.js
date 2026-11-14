// ============================================================
//  v1.56 — Auto Cut: ONE button.
//   transcribe once (Lao = Gemini, Thai = Whisper in the browser; kept forever and shared through the shop server)
//   -> cut silences + filler words (+ retakes when a Claude key exists)
//   -> animated captions (every word, or only the key words / prices chosen by AI)
//   -> the project stays open for checking; "undo everything" goes back to before Auto Cut.
//  It only chains tools that already exist (findSilences, findFillers, cutSourceRanges, capApply, capKeywords).
// ============================================================
const ACUT = { o: { sil: true, min: .5, fil: true, ret: false, cap: true, look: '', rows: 1, kw: 'all' } };
try { Object.assign(ACUT.o, JSON.parse(localStorage.getItem('sk_ac') || '{}')); } catch (e) { }

function acUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (!m.pcm16) return toast('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ');
  const o = ACUT.o, hasC = !!loadKeys().claude, look = o.look || CAPS.look;
  aiDlg('Auto Cut', `<div class="hint">เลือกสิ่งที่ให้ทำ แล้วกดเริ่ม · ถอดเสียงแค่ 1 ครั้ง (เก็บไว้ ไม่ถอดซ้ำ) · ทำเสร็จแล้วกดยกเลิกทั้งหมดได้</div>
    <div class="fld col"><label>คลิปที่ใช้</label><div translate="no">${esc(m.name)}</div></div>
    <div class="fld chk"><label><input type="checkbox" id="acSil" ${o.sil ? 'checked' : ''}> ✂ ตัดช่วงเงียบ</label></div>
    <div class="fld"><label>เงียบนานกว่า (วิ)</label><input id="acMin" type="range" min=".25" max="1.5" step=".05" value="${o.min}"><output>${o.min}</output></div>
    <div class="fld chk"><label><input type="checkbox" id="acFil" ${o.fil ? 'checked' : ''}> ✂ ตัดคำอ้ำอึ้ง (เอ่อ อืม)</label></div>
    <div class="fld chk"><label><input type="checkbox" id="acRet" ${hasC && o.ret ? 'checked' : ''} ${hasC ? '' : 'disabled'}> ✂ ตัดเทคพูดผิด/พูดซ้ำ (ต้องใช้ Claude API key)</label></div>
    <div class="fld chk"><label><input type="checkbox" id="acCap" ${o.cap ? 'checked' : ''}> 💬 ใส่ซับแอนิเมชัน</label></div>
    <div class="fld"><label>หน้าตาซับ</label><select id="acLook">${CAP_LOOKS.map(l => `<option value="${l[0]}" ${l[0] === look ? 'selected' : ''}>${esc(T(l[1]))}</option>`).join('')}</select></div>
    <div class="fld"><label>จำนวนแถว</label><select id="acRows"><option value="1" ${o.rows !== 2 ? 'selected' : ''}>1 แถว</option><option value="2" ${o.rows === 2 ? 'selected' : ''}>ซ้อน 2 แถว (คนพูดเร็ว)</option></select></div>
    <div class="fld"><label>ข้อความที่แสดง</label><select id="acKw"><option value="all" ${o.kw !== 'key' ? 'selected' : ''}>ทุกคำที่พูด</option><option value="key" ${o.kw === 'key' ? 'selected' : ''}>เฉพาะคำสำคัญ (AI เลือก)</option></select></div>
    <div class="row"><span class="sp"></span><button class="primary" id="acGo">เริ่ม Auto Cut</button></div>`, root => {
    $('#acMin', root).oninput = e => { e.target.nextElementSibling.textContent = e.target.value; };
    $('#acGo', root).onclick = () => {
      const v = { sil: $('#acSil', root).checked, min: +$('#acMin', root).value, fil: $('#acFil', root).checked, ret: $('#acRet', root).checked, cap: $('#acCap', root).checked, look: $('#acLook', root).value, rows: +$('#acRows', root).value === 2 ? 2 : 1, kw: $('#acKw', root).value === 'key' ? 'key' : 'all' };
      if (!v.sil && !v.fil && !v.ret && !v.cap) return toast('เลือกอย่างน้อย 1 อย่าง');
      ACUT.o = v; try { localStorage.setItem('sk_ac', JSON.stringify(v)); } catch (e) { }
      acRun(m, v);
    };
  });
}

async function acRun(m, o) {
  if (AI.busy) return; AI.busy = true;
  const h0 = HPOS, st = { cuts: 0, saved: 0, caps: 0, tr: 0, notes: [] };
  try {
    aiProg('กำลังเตรียมคลิป…', 3); ensureOnTimeline(m);
    let tr = null;
    if (o.fil || o.ret || o.cap) { tr = getTr(m.id) || await ensureTranscript(m); st.tr = tr.segs.length; }
    // ---- 1) cut ----
    const rs = [];
    if (o.sil) { aiProg('กำลังหาช่วงเงียบ…', 55); D.items.filter(it => it.type === 'video' && it.mediaId === m.id).forEach(it => findSilences(m, it.in, it.in + it.dur * (it.speed || 1), o.min, .12).forEach(r => rs.push([r[0], r[1]]))); }
    if (o.fil && tr) findFillers(tr).filter(f => !f.approx).forEach(f => rs.push([snapValley(m, f.a - .02, .1), snapValley(m, f.b + .03, .1)]));   // only fillers whose position is exact (never a guessed spot)
    if (o.ret && tr) { aiProg('AI กำลังหาเทคที่พูดซ้ำ/พูดผิด…', 62); try { (await findRetakes(m, tr)).forEach(r => rs.push([r.a, r.b])); } catch (e) { console.warn('retakes', e); st.notes.push('retake'); } }
    const merged = mergeRanges(rs);
    if (merged.length) { st.saved = merged.reduce((a, r) => a + r[1] - r[0], 0); st.cuts = cutSourceRanges(m.id, merged); commit('autocut'); }
    // ---- 2) captions ----
    if (o.cap) {
      if (!tr || !tr.segs.length) st.notes.push('nospeech');
      else {
        CAPS.look = o.look || CAPS.look; CAPS.rows = o.rows; CAPS.kw = o.kw; let kw = null;
        if (CAPS.kw === 'key') { aiProg('กำลังให้ AI เลือกคำสำคัญจากข้อความที่ถอดไว้…', 75); try { kw = await capKeywords(tr); } catch (e) { console.warn('capKeywords', e); st.notes.push('kwfail'); CAPS.kw = 'all'; } }
        if (CAPS.font) { try { await lfEnsure(CAPS.font); } catch (e) { } }
        aiProg('กำลังใส่ซับ…', 90); st.caps = capApply(m, tr, kw);
        if (!st.caps) st.notes.push(kw ? 'nokey' : 'nospeech');
      }
    }
    AI.busy = false; acDone(m, st, h0, HPOS);
  } catch (e) { aiErr(e); }
}

function acDone(m, st, h0, hEnd) {
  const L = [];
  L.push(st.cuts ? `<li>✂ ${T('ตัดออก')} <b>${st.cuts}</b> ${T('จุด')} · ${T('ลดไป')} <b>${st.saved.toFixed(1)}</b> ${T('วินาที')}</li>` : `<li>✂ ${T('ไม่ได้ตัดอะไร (ไม่พบช่วงเงียบ/คำอ้ำอึ้ง)')}</li>`);
  if (st.caps) L.push(`<li>💬 ${T('ใส่ซับ')} <b>${st.caps}</b> ${T('ช่วง')}</li>`);
  const N = { nospeech: 'ไม่พบข้อความพูดในคลิปนี้ จึงยังไม่ได้ใส่ซับ', nokey: 'AI ไม่พบคำสำคัญในคลิปนี้ จึงยังไม่ได้ใส่ซับ', kwfail: 'AI เลือกคำสำคัญไม่ได้ จึงใส่ซับทุกคำที่พูดแทน', retake: 'หาเทคที่พูดซ้ำไม่ได้ (ข้ามขั้นนี้)' };
  st.notes.forEach(k => N[k] && L.push(`<li style="color:#ffb86b">⚠ ${T(N[k])}</li>`));
  aiDlg('Auto Cut เสร็จแล้ว', `<ul style="margin:0 0 8px 18px;padding:0">${L.join('')}</ul>
    <div class="hint">ตรวจดูทั้งคลิปก่อนโพสต์ทุกครั้ง — AI อาจตัดหรือเลือกคำพลาดได้ แก้ต่อที่ไทม์ไลน์ได้เลย</div>
    <div class="row"><button class="primary" id="acPlay">▶ ดูผลลัพธ์</button><button id="acUndo">↶ ยกเลิกทั้งหมด</button><span class="sp"></span><button id="acClose">ปิด</button></div>`, root => {
    $('#acPlay', root).onclick = () => { $('#dlgAi').close(); seek(0); play(); };
    $('#acClose', root).onclick = () => $('#dlgAi').close();
    $('#acUndo', root).onclick = () => {
      if (HPOS !== hEnd) return toast('มีการแก้ไขต่อจาก Auto Cut แล้ว — ใช้ปุ่ม ↶ ย้อนกลับทีละขั้นแทน');
      for (let i = hEnd - h0; i > 0; i--) undo(); $('#dlgAi').close(); toast('ยกเลิก Auto Cut แล้ว');
    };
  });
}
