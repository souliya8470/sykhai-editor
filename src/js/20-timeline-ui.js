// ============================================================
//  Timeline UI + media bin
// ============================================================
const TL = { pps: 56, labelW: 96 };
const TRACK_H = { video: 58, text: 36, audio: 44 };
let TH = {}; try { TH = JSON.parse(localStorage.getItem('sk_trh') || '{}') || {}; } catch (e) { }
const trackH = tr => TH[tr.id] || (tr.id === 'V1' ? 84 : TRACK_H[tr.kind]);
const VOL_MAX = 1.5;
function wfHeight(it) { const tr = TRACKS.find(t => t.id === it.track); const ch = trackH(tr) - 6; return ch >= 66 ? Math.round(ch * .4) : 22; }
const tlWidth = () => Math.max(projectEnd() + 14, 40) * TL.pps;
const CLIP_COL = { video: '#2d6a8f', image: '#7a4fa3', text: '#b9852b', sticker: '#b9602b', audio: '#2f8a5b' };

function rulerTicks() {
  const total = tlWidth() / TL.pps; let step = 1; const target = 80 / TL.pps;
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) { step = s; if (s >= target) break; }
  let h = '';
  for (let t = 0; t <= total; t += step) { const x = t * TL.pps; h += `<span style="left:${x}px">${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}${step < 1 ? '.' + Math.round((t % 1) * 10) : ''}</span>`; }
  return h;
}
function clipLabel(it) {
  if (it.type === 'text') return (it.text || '').replace(/\*/g, '').replace(/\n/g, ' ');
  if (it.type === 'sticker') return { check: '✔', warning: '⚠', cursor: '☝', brackets: '▢', arrow: '⬇', star: '★', underline: '▁', circle: '◯', emoji: it.text || '😀' }[it.kind] + ' ' + it.kind;
  const m = MEDIA.get(it.mediaId); return m ? m.name : T('⚠ ไฟล์หาย: ') + mediaNameFromId(it.mediaId);
}
function renderTimeline() {
  const body = $('#tlbody'); if (!body) return;
  const sx = body.scrollLeft, sy = body.scrollTop; const W = tlWidth();
  let h = `<div id="tlinner" style="width:${TL.labelW + W}px"><div id="ruler"><div class="corner"></div><div class="rt" style="width:${W}px">${rulerTicks()}${(D.markers || []).map(m => `<i class="mk" data-id="${m.id}" style="left:${m.t * TL.pps}px" title="${T('มาร์กเกอร์ — ดับเบิลคลิกเพื่อลบ')}">⚑</i>`).join('')}</div></div>`;
  for (const tr of TRACKS) h += `<div class="trow ${tr.kind}" data-track="${tr.id}" style="height:${trackH(tr)}px"><div class="tlabel">${tr.label}</div><div class="tlane" style="width:${W}px"></div><div class="trh" title="ลากเพื่อปรับความสูงของแถว"></div></div>`;
  h += `<div id="playhead"><i></i></div></div>`;
  body.innerHTML = h;
  for (const it of D.items) {
    const lane = $(`.trow[data-track="${it.track}"] .tlane`, body); if (!lane) continue;
    const m = MEDIA.get(it.mediaId); const el = document.createElement('div');
    el.className = 'clip ' + it.type + (it.id === SEL ? ' sel' : '') + (it.hidden ? ' hid' : '');
    el.dataset.id = it.id; el.style.left = (it.start * TL.pps) + 'px'; el.style.width = Math.max(6, it.dur * TL.pps) + 'px';
    el.style.setProperty('--c', CLIP_COL[it.type] || '#555');
    let inner = '';
    if ((it.type === 'video' || it.type === 'image') && m && m.thumb) inner += `<div class="cbg" style="background-image:url(${m.thumb})"></div>`;
    const hasWf = m && (it.type === 'video' || it.type === 'audio'); const wfh = hasWf ? wfHeight(it) : 0; const tall = hasWf && wfh > 22;
    if (tall) { el.classList.add('tall'); el.style.setProperty('--wfh', wfh + 'px'); }
    if (hasWf) inner += `<canvas class="wf" style="height:${wfh}px"></canvas>`;
    if (hasWf && tall && m.hasAudio !== false) { const ch = trackH(TRACKS.find(t => t.id === it.track)) - 9; inner += `<div class="vl" style="top:${ch - wfh + wfh * (1 - clamp(it.vol ?? 1, 0, VOL_MAX) / VOL_MAX)}px"><u></u><b>${Math.round((it.vol ?? 1) * 100)}%</b></div>`; }
    inner += `<span class="cl" translate="no">${esc(clipLabel(it))}</span>`;
    if (it.transIn && it.transIn.type !== 'none') inner += `<b class="trb" title="ทรานสิชัน: ${esc((TRANS[it.transIn.type] || {}).label || '')}" style="width:${Math.max(10, it.transIn.dur * TL.pps)}px">⇄</b>`;
    if (it.speed && it.speed !== 1) inner += `<em class="spd">${it.speed}x</em>`;
    if (it.kf) for (const k in it.kf) for (const p of it.kf[k]) inner += `<s class="kfd" style="left:${p.t * TL.pps}px"></s>`;
    inner += `<i class="th l"></i><i class="th r"></i>`;
    el.innerHTML = inner; lane.appendChild(el);
    const cv = $('canvas.wf', el); if (cv) drawWave(cv, it, m);
  }
  for (const tr of TRACKS.filter(t => t.kind === 'video')) {
    const lane = $(`.trow[data-track="${tr.id}"] .tlane`, body); const list = itemsOn(tr.id).filter(i => i.type === 'video' || i.type === 'image');
    for (let i = 1; i < list.length; i++) {
      const A = list[i - 1], B = list[i]; if (Math.abs(A.start + A.dur - B.start) > .06 && !(B.transIn && B.start < A.start + A.dur)) continue;
      const j = document.createElement('div'); j.className = 'junc' + (B.transIn ? ' has' : ''); j.dataset.id = B.id; j.style.left = (B.start * TL.pps) + 'px'; j.textContent = B.transIn ? '⇄' : '+'; j.title = 'ลากทรานสิชัน/เอฟเฟกต์มาวางที่นี่ หรือกดเพื่อเลือก'; lane.appendChild(j);
    }
  }
  body.scrollLeft = sx; body.scrollTop = sy; updatePlayhead();
}
function drawWave(cv, it, m) {
  if (!m.peaks) return; const w = Math.min(4000, Math.max(4, Math.round(it.dur * TL.pps))), h = wfHeight(it); cv.width = w; cv.height = h;
  const vg = it.type === 'audio' || (it.vol ?? 1) !== 1 ? clamp(it.vol ?? 1, 0, VOL_MAX) : 1;
  const c = cv.getContext('2d'); c.fillStyle = it.type === 'audio' ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.45)';
  const P = m.peaks, md = m.duration || 1;
  for (let x = 0; x < w; x++) {
    const tt = (it.in || 0) + (x / w) * it.dur * (it.speed || 1); const idx = Math.floor(((it.loop ? tt % md : tt) / md) * P.length);
    const v = Math.min(1, (P[clamp(idx, 0, P.length - 1)] || 0) * vg); const bh = Math.max(1, Math.min(h, v * h * 1.4)); c.fillRect(x, (h - bh) / 2, 1, bh);
  }
}
function updatePlayhead() {
  const ph = $('#playhead'); if (!ph) return; ph.style.left = (TL.labelW + PB.t * TL.pps) + 'px';
  const body = $('#tlbody'); const x = PB.t * TL.pps;
  if (PB.playing && (x < body.scrollLeft || x > body.scrollLeft + body.clientWidth - TL.labelW - 40)) body.scrollLeft = Math.max(0, x - 100);
}

// ---------- add items ----------
function addMediaToTimeline(mediaId, trackId, start) {
  const m = MEDIA.get(mediaId); if (!m) return null;
  let it;
  if (m.type === 'audio') {
    const tr = trackId && TRACK_KIND[trackId] === 'audio' ? trackId : 'A1';
    const st = start ?? PB.t; it = mkAudio(tr, mediaId, st, m.duration);
    if (tr === 'A1') { it.dur = Math.max(it.dur, 0); }
  } else {
    let tr = trackId && TRACK_KIND[trackId] === 'video' ? trackId : null;
    const dur = m.type === 'image' ? 3 : m.duration;
    let st = start;
    if (st == null) { st = tr ? PB.t : D.items.filter(i => i.track === 'V1').reduce((a, i) => Math.max(a, i.start + i.dur), 0); }
    if (!tr) tr = 'V1';
    it = mkMedia(tr, mediaId, st, 0, dur);
    if (m.type === 'video') { it.vol = 1; if (m.hasAudio) it.normalize = true; }
  }
  addItem(it); commit('add'); select(it.id); return it;
}
function dropTimeFromEvent(e) { const body = $('#tlbody'); const r = body.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left + body.scrollLeft - TL.labelW) / TL.pps); }

// ---------- pointer interactions ----------
function snapPoints(excludeId) {
  const pts = [0, PB.t, ...(D.markers || []).map(m => m.t)]; for (const o of D.items) { if (o.id === excludeId) continue; pts.push(o.start, o.start + o.dur); } return pts;
}
function snapVal(v, pts, tol) { let best = v, bd = tol; for (const p of pts) { const d = Math.abs(p - v); if (d < bd) { bd = d; best = p; } } return best; }

function initTimelineEvents() {
  const body = $('#tlbody');
  body.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const jn = e.target.closest('.junc'); if (jn) { select(jn.dataset.id); showTab('trans'); return; }
    const trh = e.target.closest('.trh'); if (trh) { e.preventDefault(); rowResizeStart(e, trh.closest('.trow')); return; }
    const vlu = e.target.closest('.vl u'); if (vlu) { e.preventDefault(); e.stopPropagation(); volDragStart(e, vlu.closest('.clip')); return; }
    const clipEl = e.target.closest('.clip');
    const mkEl = e.target.closest('.mk'); if (mkEl) { const mm = (D.markers || []).find(x => x.id === mkEl.dataset.id); if (mm) { pause(); seek(mm.t); } return; }
    const rulerEl = e.target.closest('#ruler');
    if (rulerEl && !e.target.closest('.corner')) { scrubStart(e); return; }
    if (!clipEl) {
      const lane = e.target.closest('.tlane'); if (lane) { select(null); const r = $('#tlinner').getBoundingClientRect(); const t = (e.clientX - r.left - TL.labelW) / TL.pps; pause(); seek(Math.max(0, t)); scrubStart(e, true); }
      return;
    }
    const it = getItem(clipEl.dataset.id); if (!it) return;
    select(it.id);
    const mode = e.target.classList.contains('th') ? (e.target.classList.contains('l') ? 'tl' : 'tr') : 'move';
    const o = { start: it.start, dur: it.dur, in: it.in || 0, track: it.track }; const x0 = e.clientX; const pts = snapPoints(it.id); const tol = snapTol() / TL.pps; let moved = false;
    const m = MEDIA.get(it.mediaId); const sp = it.speed || 1;
    const move = ev => {
      const dt = (ev.clientX - x0) / TL.pps; if (Math.abs(ev.clientX - x0) > 2) moved = true; if (!moved && mode === 'move' && Math.abs(ev.clientY - e.clientY) < 3) return;
      if (mode === 'move') {
        let s = Math.max(0, o.start + dt); const s1 = snapVal(s, pts, tol), s2 = snapVal(s + o.dur, pts, tol) - o.dur; s = Math.abs(s1 - s) <= Math.abs(s2 - s) ? s1 : s2; it.start = Math.max(0, s);
        const rowEl = document.elementFromPoint(ev.clientX, ev.clientY); const row = rowEl && rowEl.closest ? rowEl.closest('.trow') : null;
        if (row && TRACK_KIND[row.dataset.track] === TRACK_KIND[o.track]) it.track = row.dataset.track;
      } else if (mode === 'tl') {
        let s = snapVal(o.start + dt, pts, tol); let d = s - o.start;
        if (it.type === 'video' || it.type === 'audio') d = Math.max(d, -(o.in / sp));
        d = Math.min(d, o.dur - 0.1); d = Math.max(d, -o.start);
        it.start = o.start + d; it.dur = o.dur - d; if (it.type === 'video' || it.type === 'audio') it.in = o.in + d * sp;
        if (it.kf) { /* keyframes stay relative to start */ }
      } else {
        let e2 = snapVal(o.start + o.dur + dt, pts, tol); let d = e2 - o.start; d = Math.max(0.1, d);
        if ((it.type === 'video') && m) d = Math.min(d, (m.duration - o.in) / sp);
        if (it.type === 'audio' && m && !it.loop) d = Math.min(d, m.duration - o.in);
        it.dur = d;
      }
      renderTimeline(); dirty(); emit('inspect-refresh');
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (moved) { commit('edit'); } };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    e.preventDefault();
  });
  body.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(TL.pps * (e.deltaY < 0 ? 1.15 : 0.87)); }
  }, { passive: false });
  // drag & drop from media bin
  body.addEventListener('dragover', e => {
    const ty = e.dataTransfer.types; if (ty.includes('text/mediaid')) { e.preventDefault(); return; }
    if (ty.includes('text/trans') || ty.includes('text/fx')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; showDropMark(dropTarget(e)); }
  });
  body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) showDropMark(null); });
  body.addEventListener('drop', e => {
    showDropMark(null);
    if (DRAG && (e.dataTransfer.types.includes('text/trans') || e.dataTransfer.types.includes('text/fx'))) {
      e.preventDefault(); const tg = dropTarget(e); const d = DRAG; DRAG = null; if (!tg) { toast('ปล่อยตรงรอยต่อหรือบนคลิปวิดีโอ/ภาพ'); return; }
      select(tg.it.id); if (d.kind === 'trans') applyTransition(tg.it, d.key); else if (d.kind === 'fx') applyFxPreset(tg.it, d.key); else applyMaskPreset(tg.it, d.key); return;
    }
    const id = e.dataTransfer.getData('text/mediaid'); if (!id) return; e.preventDefault();
    const row = e.target.closest('.trow'); addMediaToTimeline(id, row ? row.dataset.track : null, dropTimeFromEvent(e));
  });
}
function dropTarget(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY); const row = el && el.closest ? el.closest('.trow') : null;
  if (!row || TRACK_KIND[row.dataset.track] !== 'video') return null;
  const t = dropTimeFromEvent(e); const items = itemsOn(row.dataset.track).filter(i => i.type === 'video' || i.type === 'image');
  const over = items.find(i => t >= i.start && t < i.start + i.dur);
  if (DRAG && DRAG.kind === 'trans') { let best = null, bd = 20 / TL.pps; for (const it of items) { const d = Math.abs(it.start - t); if (d < bd) { bd = d; best = it; } } if (best) return { it: best, mode: 'cut', row }; }
  return over ? { it: over, mode: 'clip', row } : null;
}
function showDropMark(tg) {
  let m = $('#dropMark'); const inner = $('#tlinner'); if (!inner) return;
  if (!tg) { if (m) m.style.display = 'none'; return; }
  if (!m) { m = document.createElement('div'); m.id = 'dropMark'; inner.appendChild(m); } else if (!m.parentNode) inner.appendChild(m);
  const top = tg.row.offsetTop, h = tg.row.offsetHeight; m.style.display = 'block'; m.style.top = top + 'px'; m.style.height = h + 'px';
  if (tg.mode === 'cut') { m.className = 'cut'; m.style.left = (TL.labelW + tg.it.start * TL.pps - 3) + 'px'; m.style.width = '6px'; }
  else { m.className = 'clipm'; m.style.left = (TL.labelW + tg.it.start * TL.pps) + 'px'; m.style.width = (tg.it.dur * TL.pps) + 'px'; }
}
function scrubStart(e, already) {
  const body = $('#tlbody'); const wasPlaying = PB.playing; pause();
  const f = ev => { const r = $('#tlinner').getBoundingClientRect(); seek(Math.max(0, (ev.clientX - r.left - TL.labelW) / TL.pps)); };
  if (!already) f(e);
  const up = () => { window.removeEventListener('pointermove', f); window.removeEventListener('pointerup', up); if (wasPlaying) play(); };
  window.addEventListener('pointermove', f); window.addEventListener('pointerup', up);
}
function setZoom(p) { TL.pps = clamp(p, 8, 400); const z = $('#zoom'); if (z) z.value = Math.log(TL.pps); renderTimeline(); }

// ---------- editing commands ----------
function cmdSplit() {
  const t = PB.t; let target = SEL ? getItem(SEL) : null;
  const hit = it => it && t > it.start + 0.05 && t < it.start + it.dur - 0.05;
  const list = hit(target) ? [target] : D.items.filter(i => hit(i) && (i.type === 'video' || i.type === 'image' || i.type === 'audio'));
  if (!list.length) { toast('เลื่อนหัวอ่านไปกลางคลิปก่อนตัด'); return; }
  let last; list.forEach(i => { last = splitItem(i.id, t); }); commit('split'); if (last) select(last.id);
}
function cmdDelete(ripple) { if (!SEL) return; removeItem(SEL, ripple); SEL = null; commit('delete'); emit('sel'); }
function cmdCloseGaps(track) {
  const list = itemsOn(track); let t = 0; for (const it of list) { if (it.start > t + 1e-3) it.start = t; t = it.start + it.dur; } commit('gaps');
}

// ---------- media bin ----------
function renderMediaBin() {
  const box = $('#mediaList'); if (!box) return; const arr = [...MEDIA.values()].filter(m => !m.hidden);
  box.innerHTML = arr.length ? '' : '<div class="empty">ยังไม่มีไฟล์ — กดปุ่ม “นำเข้า” หรือลากไฟล์มาวางที่นี่</div>';
  for (const m of arr) {
    const d = document.createElement('div'); d.className = 'mi'; d.draggable = true; d.dataset.id = m.id;
    d.innerHTML = `<div class="mth" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}">${m.type === 'audio' ? '♪' : ''}<span class="dur">${m.type === 'image' ? 'ภาพ' : fmt(m.duration)}</span></div><div class="mn" translate="no" title="${esc(m.name)}">${esc(m.name)}</div><div class="mb"><button data-act="add">+ ใส่ไทม์ไลน์</button><button data-act="del" title="ลบ">×</button></div>${m.type === 'video' ? `<div class="mtag">${m.w}×${m.h}${m.hasAudio === false ? ' · ไม่มีเสียง' : ''}</div>` : ''}`;
    d.addEventListener('dragstart', e => { e.dataTransfer.setData('text/mediaid', m.id); });
    d.addEventListener('click', e => { if (e.target.closest('button')) return; srcOpen(m.id); });
    d.addEventListener('dblclick', () => addMediaToTimeline(m.id));
    if (SRC.m && SRC.m.id === m.id) d.classList.add('sel');
    d.querySelector('[data-act="add"]').onclick = () => addMediaToTimeline(m.id);
    d.querySelector('[data-act="del"]').onclick = () => { if (D.items.some(i => i.mediaId === m.id) && !confirm(T('ไฟล์นี้ถูกใช้ในไทม์ไลน์ — ลบคลิปที่ใช้ไฟล์นี้ด้วย?'))) return; D.items = D.items.filter(i => i.mediaId !== m.id); MEDIA.delete(m.id); dbDel(m.id); commit('media'); renderMediaBin(); };
    box.appendChild(d);
  }
}

async function importFiles(files) {
  const list = [...files]; if (!list.length) return;
  for (const f of list) {
    const type = f.type.startsWith('video') || /\.(mov|mp4|m4v|webm)$/i.test(f.name) ? 'video' : f.type.startsWith('image') ? 'image' : f.type.startsWith('audio') || /\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name) ? 'audio' : null;
    if (!type) { toast('ไม่รองรับไฟล์: ' + f.name); continue; }
    const m = { id: f.name + '|' + f.size, name: f.name, type, file: f, url: URL.createObjectURL(f), duration: 0, w: 0, h: 0 };
    try {
      if (type === 'image') {
        const img = new Image(); img.src = m.url; await img.decode(); m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.thumb = thumbFrom(img, img.naturalWidth, img.naturalHeight);
      } else {
        const el = document.createElement(type === 'video' ? 'video' : 'audio'); el.preload = 'auto'; el.muted = true; el.src = m.url;
        await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('load')); setTimeout(() => rej(new Error('timeout')), 20000); });
        m.duration = el.duration; if (type === 'video') { m.w = el.videoWidth; m.h = el.videoHeight; await seekTo(el, Math.min(0.3, m.duration / 3)); m.thumb = thumbFrom(el, m.w, m.h); }
        el.removeAttribute('src'); el.load();
      }
    } catch (e) { console.warn(e); toast('เปิดไฟล์ไม่ได้: ' + f.name + ' (ลองไฟล์ H.264 / mp4)'); URL.revokeObjectURL(m.url); continue; }
    MEDIA.set(m.id, m); renderMediaBin(); emit('media-added', m); renderTimeline();
    if (type !== 'image') analyzeAudio(m).then(() => { renderMediaBin(); renderTimeline(); dbPut(m); }); else dbPut(m);
  }
  toast('นำเข้าแล้ว ' + list.length + ' ไฟล์');
}
function seekTo(el, t) { return new Promise(res => { const done = () => { el.removeEventListener('seeked', done); res(); }; el.addEventListener('seeked', done); try { el.currentTime = t; } catch (e) { res(); } setTimeout(res, 3000); }); }
function thumbFrom(src, w, h) {
  const c = document.createElement('canvas'); const k = 160 / Math.max(w, h); c.width = Math.max(2, Math.round(w * k)); c.height = Math.max(2, Math.round(h * k));
  try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); } catch (e) { return ''; }
}

// ---------- track height drag + volume line drag ----------
function rowResizeStart(e, row) {
  const tr = TRACKS.find(t => t.id === row.dataset.track); if (!tr) return; const y0 = e.clientY, h0 = trackH(tr); const handle = $('.trh', row); handle.classList.add('drag'); document.body.classList.add('resizing');
  const mv = ev => { TH[tr.id] = clamp(Math.round(h0 + ev.clientY - y0), 26, 320); row.style.height = TH[tr.id] + 'px'; };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); try { localStorage.setItem('sk_trh', JSON.stringify(TH)); } catch (e) { } renderTimeline(); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function volDragStart(e, clipEl) {
  const it = getItem(clipEl.dataset.id); if (!it) return; if (SEL !== it.id) { select(it.id); clipEl = $(`.clip[data-id="${it.id}"]`); if (!clipEl) return; }
  const m = MEDIA.get(it.mediaId); const vl = $('.vl', clipEl), cv = $('canvas.wf', clipEl); const wfh = wfHeight(it); const chh = clipEl.clientHeight; const top0 = chh - wfh;
  const v0 = it.vol ?? 1; vl.classList.add('drag'); document.body.classList.add('resizing');
  const mv = ev => {
    const r = clipEl.getBoundingClientRect(); const y = clamp(ev.clientY - r.top - 1, top0, chh);
    let v = (1 - (y - top0) / wfh) * VOL_MAX; if (Math.abs(v - 1) < .04) v = 1; v = Math.round(v * 100) / 100; it.vol = v;
    vl.style.top = (top0 + wfh * (1 - v / VOL_MAX)) + 'px'; $('b', vl).textContent = Math.round(v * 100) + '%'; if (m && cv) drawWave(cv, it, m);
    if (typeof refreshInspectorValues === 'function') refreshInspectorValues();
  };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); vl.classList.remove('drag'); if ((it.vol ?? 1) !== v0) commit('vol'); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
// ---------- resizable panels ----------
function initSplitters() {
  const root = document.documentElement; let L = {}; try { L = JSON.parse(localStorage.getItem('sk_layout') || '{}') || {}; } catch (e) { }
  const apply = () => { if (L.lw) root.style.setProperty('--lw', L.lw + 'px'); if (L.rw) root.style.setProperty('--rw', L.rw + 'px'); if (L.tlh) root.style.setProperty('--tlh', L.tlh + 'px'); };
  apply();
  const bind = (id, get, set) => {
    const h = $(id); h.addEventListener('pointerdown', e => {
      e.preventDefault(); const x0 = e.clientX, y0 = e.clientY, v0 = get(); h.classList.add('drag'); document.body.classList.add('resizing');
      const mv = ev => { set(v0, ev.clientX - x0, ev.clientY - y0); apply(); window.dispatchEvent(new Event('resize')); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); h.classList.remove('drag'); document.body.classList.remove('resizing'); try { localStorage.setItem('sk_layout', JSON.stringify(L)); } catch (e) { } };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    h.addEventListener('dblclick', () => { delete L[id === '#spL' ? 'lw' : id === '#spR' ? 'rw' : 'tlh']; root.style.removeProperty(id === '#spL' ? '--lw' : id === '#spR' ? '--rw' : '--tlh'); try { localStorage.setItem('sk_layout', JSON.stringify(L)); } catch (e) { } });
  };
  bind('#spL', () => $('#left').getBoundingClientRect().width, (v, dx) => { L.lw = clamp(Math.round(v + dx), 200, 560); });
  bind('#spR', () => $('#right').getBoundingClientRect().width, (v, dx) => { L.rw = clamp(Math.round(v - dx), 220, 560); });
  bind('#spT', () => $('#tl').getBoundingClientRect().height, (v, dx, dy) => { L.tlh = clamp(Math.round(v - dy), 120, Math.max(160, innerHeight - 260)); });
}
