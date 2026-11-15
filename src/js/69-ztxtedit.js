// ============================================================
//  v1.59 — Text-based editing (like Premiere's Transcript panel)
//   AI tab -> "แก้ไขตามข้อความ": the transcript of a clip as clickable text. Tabs: text / pauses / filler words.
//   Pick text (click, shift+click for a range) or use the search box, then delete -> the matching video is cut from the timeline.
//   Extract = cut and close the gap (ripple).  Lift = cut but leave the gap.  Everything can be undone (↶).
//   Lao transcripts made with Gemini only have sentences (no word times), so Lao text is selected sentence by sentence;
//   Thai (Whisper) transcripts have word times, so Thai text is selected word by word.
//   It only reuses what exists: getTr, findSilences, findFillers, snapValley, srcPieces, rippleCut.
// ============================================================
const TE = { m: null, tr: null, tab: 'txt', mode: 'ext', min: .5, q: '', S: new Set(), U: null, P: null, F: null, hist: [], last: null, anchor: null };
try { const s = JSON.parse(localStorage.getItem('sk_te') || '{}'); if (s.mode === 'lift') TE.mode = 'lift'; if (s.min >= .25 && s.min <= 1.5) TE.min = +s.min; } catch (e) { }
const teSave = () => { try { localStorage.setItem('sk_te', JSON.stringify({ mode: TE.mode, min: TE.min })); } catch (e) { } };

function liftCut(t0, t1) {   // like rippleCut, but the gap stays (later clips are not moved)
  if (t1 - t0 < .02) return;
  for (const edge of [t0, t1]) for (const it of [...D.items]) { if (it.track !== 'A1' && isMediaLike(it)) splitItem(it.id, edge); }
  D.items = D.items.filter(it => !(it.track !== 'A1' && isMediaLike(it) && it.start >= t0 - 1e-3 && it.start + it.dur <= t1 + 1e-3));
}
function teCut(mediaId, ranges, lift) {   // ranges in source seconds -> cut; returns { n, t0 }
  let tl = []; for (const [a, b] of ranges) srcPieces(mediaId, a, b).forEach(p => tl.push([p[0], p[1]]));
  tl = mergeRanges(tl, 0); if (!tl.length) return { n: 0, t0: 0 };
  const t0 = tl[0][0]; tl.sort((x, y) => y[0] - x[0]); tl.forEach(([x, y]) => lift ? liftCut(x, y) : rippleCut(x, y)); return { n: tl.length, t0 };
}
const teAlive = (m, u) => tlTimes(m.id, (u.a + u.b) / 2).length > 0;   // still on the timeline?

function teUnits(tr) {
  if (tr.words && tr.words.length) return { word: true, u: tr.words.filter(w => String(w.text || '').trim()).map(w => ({ a: w.a, b: w.b, t: String(w.text).trim() })) };
  return { word: false, u: tr.segs.map(s => ({ a: s.a, b: s.b, t: String(s.text || '').trim() })).filter(s => s.t) };
}
function teHits(U, q) {   // search: spaces ignored (Lao/Thai have none); a match may run across several words
  const nq = String(q || '').replace(/\s+/g, '').toLowerCase(); const hit = new Set(); let count = 0; if (!nq) return { hit, count };
  let C = '', map = []; U.forEach((u, i) => { const s = u.t.replace(/\s+/g, '').toLowerCase(); for (let k = 0; k < s.length; k++) map.push(i); C += s; });
  for (let p = C.indexOf(nq); p >= 0; p = C.indexOf(nq, p + nq.length)) { count++; for (let k = p; k < p + nq.length; k++) hit.add(map[k]); }
  return { hit, count };
}

// ---------- entry ----------
function teUI() {
  const m = selMedia(); if (!m) return toast('เลือกคลิปก่อน'); if (!m.pcm16) return toast('คลิปนี้ไม่มีเสียง หรือยังวิเคราะห์เสียงไม่เสร็จ');
  ensureOnTimeline(m); const tr = getTr(m.id);
  Object.assign(TE, { m, tr: tr && tr.segs && tr.segs.length ? tr : null, tab: 'txt', q: '', S: new Set(), U: null, P: null, F: null, hist: [], last: null, anchor: null });
  teShow();
}
function teProbe() {   // lists that depend on the timeline as it is now
  const m = TE.m, tr = TE.tr;
  TE.U = tr ? teUnits(tr) : null;
  TE.P = []; D.items.filter(it => it.type === 'video' && it.mediaId === m.id).forEach(it => findSilences(m, it.in, it.in + it.dur * (it.speed || 1), TE.min, .12).forEach(r => TE.P.push({ a: r[0], b: r[1], on: true })));
  TE.P = mergeRanges(TE.P.map(r => [r.a, r.b]), .02).map(r => ({ a: r[0], b: r[1], on: true }));
  TE.F = tr ? findFillers(tr).map(f => ({ a: snapValley(m, f.a - .02, .1), b: snapValley(m, f.b + .03, .1), text: f.text, approx: f.approx, on: !f.approx })).filter(r => tlTimes(m.id, (r.a + r.b) / 2).length) : [];
}
function teRanges() {   // what the current tab would delete (source seconds)
  const m = TE.m; let rs = [];
  if (TE.tab === 'txt') { if (!TE.U) return []; [...TE.S].sort((x, y) => x - y).forEach(i => { const u = TE.U.u[i]; if (u && teAlive(m, u)) rs.push([snapValley(m, u.a - .03, .1), snapValley(m, u.b + .04, .1)]); }); }
  else (TE.tab === 'pau' ? TE.P : TE.F).forEach(r => { if (r.on) rs.push([r.a, r.b]); });
  return mergeRanges(rs, .03);
}
function teSummary(root) {
  const rs = teRanges(), n = rs.length, sec = rs.reduce((a, r) => a + r[1] - r[0], 0);
  const el = $('#teSum', root); if (el) el.innerHTML = n ? `${T('เลือกไว้')} <b>${n}</b> ${T('จุด')} · ${T('จะลดไป')} <b>${sec.toFixed(1)}</b> ${T('วินาที')}` : T('ยังไม่ได้เลือกอะไร');
  const b = $('#teDel', root); if (b) b.disabled = !n;
  const u = $('#teUndo', root); if (u) u.disabled = !TE.hist.length;
}

// ---------- dialog ----------
function teShow() {
  teProbe(); const m = TE.m, tr = TE.tr, tab = TE.tab;
  const tabs = [['txt', 'ข้อความ'], ['pau', 'ช่วงเงียบ'], ['fil', 'คำอ้ำอึ้ง']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${T(l)}</button>`).join('');
  let body = '';
  const needTr = `<div class="hint">${T('คลิปนี้ยังไม่มีข้อความที่ถอดเสียง — ถอดเสียงก่อน (ทำครั้งเดียว เก็บไว้ใช้ต่อ)')}</div><div class="row"><button class="primary" id="teTr">${T('ถอดเสียงตอนนี้')}</button></div>`;
  if (tab === 'txt') {
    if (!tr) body = needTr;
    else {
      const { word, u } = TE.U, H = teHits(u, TE.q);
      TE._hit = H.hit;
      const units = u.map((x, i) => {
        const dead = !teAlive(m, x), cls = 'te-u' + (dead ? ' dead' : '') + (TE.S.has(i) ? ' on' : '') + (H.hit.has(i) ? ' hit' : '');
        return word ? `<span class="${cls}" data-i="${i}" title="${fmt(x.a)}" translate="no">${esc(x.t)}</span> `
          : `<div class="te-s${dead ? ' dead' : ''}"><span class="te-t" data-seek="${i}" title="${T('ไปที่ตำแหน่งนี้')}">${fmt(x.a)}</span><span class="${cls}" data-i="${i}" translate="no">${esc(x.t)}</span></div>`;
      }).join('');
      body = `<div class="fld col"><input id="teQ" type="text" placeholder="${T('ค้นหาคำหรือประโยค')}" value="${esc(TE.q)}"></div>
        <div class="row" style="margin:4px 0"><span class="mini" id="teHitN">${TE.q ? `${T('พบ')} <b>${H.count}</b> ${T('แห่ง')}` : ''}</span><span class="sp"></span><button id="teSelHits" ${H.count ? '' : 'disabled'}>${T('เลือกผลที่พบทั้งหมด')}</button><button id="teClr">${T('ล้างที่เลือก')}</button></div>
        <div class="te-box${word ? ' w' : ''}" id="teBox">${units}</div>
        <div class="mini">${word ? T('กดคำเพื่อเลือก · กด Shift ค้างแล้วกดอีกคำเพื่อเลือกเป็นช่วง') : T('ข้อความลาวที่ถอดด้วย Gemini แบ่งเป็นประโยค จึงเลือกทีละประโยค · กดเวลาด้านหน้าเพื่อไปดูที่ตำแหน่งนั้น')}</div>`;
    }
  } else if (tab === 'pau') {
    body = `<div class="fld"><label>${T('เงียบนานกว่า (วิ)')}</label><input id="teMin" type="range" min=".25" max="1.5" step=".05" value="${TE.min}"><output>${TE.min}</output></div>`
      + (TE.P.length ? `<div class="sillist">${TE.P.map((r, i) => `<div class="silrow"><input type="checkbox" data-li="${i}" ${r.on ? 'checked' : ''}><span class="te-t" data-seekt="${r.a}">${fmt(r.a)}</span><span class="d">${(r.b - r.a).toFixed(2)} ${T('วินาที')}</span></div>`).join('')}</div>` : `<div class="hint">${T('ไม่พบช่วงเงียบ')}</div>`);
  } else {
    body = !tr ? needTr : (TE.F.length ? `<div class="sillist">${TE.F.map((r, i) => `<div class="silrow"><input type="checkbox" data-li="${i}" ${r.on ? 'checked' : ''}><span class="te-t" data-seekt="${r.a}">${fmt(r.a)}</span><span class="d" translate="no">${esc(r.text || '')}</span>${r.approx ? `<span class="mini">${T('ตำแหน่งโดยประมาณ')}</span>` : ''}</div>`).join('')}</div>` : `<div class="hint">${T('ไม่พบคำอ้ำอึ้ง')}</div>`);
  }
  const listTab = tab !== 'txt', listArr = tab === 'pau' ? TE.P : TE.F;
  aiDlg(T('แก้ไขตามข้อความ'), `<div class="lfcats">${tabs}</div><div class="mini" translate="no" style="margin-bottom:4px">${esc(m.name)}</div>${body}
    <div class="te-foot">
      <div class="te-mode"><label><input type="radio" name="teMode" value="ext" ${TE.mode === 'ext' ? 'checked' : ''}> ${T('ตัดแล้วดึงเข้าหากัน (Extract)')}</label><label><input type="radio" name="teMode" value="lift" ${TE.mode === 'lift' ? 'checked' : ''}> ${T('ตัดแล้วเว้นช่องว่างไว้ (Lift)')}</label></div>
      <div class="hint" id="teSum"></div>
      <div class="row"><button id="teUndo">↶ ${T('ย้อนกลับ')}</button><button id="tePlay">▶ ${T('ดูผลลัพธ์')}</button>${listTab && listArr.length ? `<button id="teAll">${T('เลือก/ไม่เลือกทั้งหมด')}</button>` : ''}<span class="sp"></span><button class="primary danger" id="teDel">${T('ลบที่เลือก')}</button></div>
    </div>`, root => teWire(root));
}

function teWire(root) {
  teSummary(root);
  const goto = t => { if (t != null) seek(t); };
  const tlOf = srcT => tlTimes(TE.m.id, srcT)[0];
  root.onclick = e => {
    const el = e.target.closest('[data-tab],[data-seek],[data-seekt],.te-u,#teTr,#teDel,#teUndo,#tePlay,#teAll,#teSelHits,#teClr'); if (!el) return;
    if (el.dataset.tab) { TE.tab = el.dataset.tab; return teShow(); }
    if (el.dataset.seek != null) { const u = TE.U.u[+el.dataset.seek]; return goto(tlOf(u.a)); }
    if (el.dataset.seekt != null) return goto(tlOf(+el.dataset.seekt));
    if (el.id === 'teTr') { if (AI.busy) return; AI.busy = true; aiProg('กำลังถอดเสียง…', 20); ensureTranscript(TE.m).then(t => { AI.busy = false; TE.tr = t && t.segs && t.segs.length ? t : null; teShow(); }).catch(aiErr); return; }
    if (el.classList.contains('te-u')) {
      const i = +el.dataset.i, u = TE.U.u[i]; if (!teAlive(TE.m, u)) return;
      if (e.shiftKey && TE.anchor != null) { const [x, y] = [Math.min(TE.anchor, i), Math.max(TE.anchor, i)]; for (let k = x; k <= y; k++) if (teAlive(TE.m, TE.U.u[k])) TE.S.add(k); }
      else { if (TE.S.has(i)) TE.S.delete(i); else TE.S.add(i); TE.anchor = i; }
      $$('.te-u', root).forEach(s => s.classList.toggle('on', TE.S.has(+s.dataset.i))); return teSummary(root);
    }
    if (el.id === 'teSelHits') { (TE._hit || new Set()).forEach(i => { if (teAlive(TE.m, TE.U.u[i])) TE.S.add(i); }); $$('.te-u', root).forEach(s => s.classList.toggle('on', TE.S.has(+s.dataset.i))); return teSummary(root); }
    if (el.id === 'teClr') { TE.S.clear(); $$('.te-u', root).forEach(s => s.classList.remove('on')); return teSummary(root); }
    if (el.id === 'teAll') { const arr = TE.tab === 'pau' ? TE.P : TE.F, v = !arr.every(r => r.on); arr.forEach(r => r.on = v); $$('[data-li]', root).forEach(c => c.checked = v); return teSummary(root); }
    if (el.id === 'tePlay') { $('#dlgAi').close(); seek(Math.max(0, (TE.last == null ? 0 : TE.last) - 1.5)); play(); return; }
    if (el.id === 'teUndo') {
      if (!TE.hist.length) return; if (HPOS !== TE.hist[TE.hist.length - 1]) return toast('มีการแก้ไขต่อจากนี้แล้ว — ใช้ปุ่ม ↶ ย้อนกลับทีละขั้นแทน');
      undo(); TE.hist.pop(); toast('ย้อนกลับแล้ว'); return teShow();
    }
    if (el.id === 'teDel') {
      const rs = teRanges(); if (!rs.length) return toast('ยังไม่ได้เลือกอะไร');
      const lift = TE.mode === 'lift'; if (lift && TLS.magnet) { $('#tbMagnet').click(); toast('ปิดแม่เหล็กวิดีโอ 1 ให้แล้ว เพื่อเว้นช่องว่างไว้'); }   // the magnetic main track would close the gap again
      const r = teCut(TE.m.id, rs, lift); if (!r.n) return toast('ช่วงที่เลือกถูกลบไปแล้ว');
      commit('textedit'); TE.hist.push(HPOS); TE.last = r.t0; TE.S.clear(); toast(`${T('ลบแล้ว')} ${r.n} ${T('จุด')}`); return teShow();
    }
  };
  root.onchange = e => {
    const t = e.target;
    if (t.name === 'teMode') { TE.mode = t.value === 'lift' ? 'lift' : 'ext'; teSave(); }
    else if (t.dataset && t.dataset.li != null) { (TE.tab === 'pau' ? TE.P : TE.F)[+t.dataset.li].on = t.checked; teSummary(root); }
    else if (t.id === 'teMin') { TE.min = +t.value; teSave(); teShow(); }
  };
  root.oninput = e => {
    if (e.target.id === 'teMin') e.target.nextElementSibling.textContent = e.target.value;
    else if (e.target.id === 'teQ') {   // only the highlights change, so typing never loses focus or scroll
      TE.q = e.target.value; const H = teHits(TE.U.u, TE.q); TE._hit = H.hit;
      $$('.te-u', root).forEach(s => s.classList.toggle('hit', H.hit.has(+s.dataset.i)));
      $('#teHitN', root).innerHTML = TE.q ? `${T('พบ')} <b>${H.count}</b> ${T('แห่ง')}` : ''; $('#teSelHits', root).disabled = !H.count;
    }
  };
}
