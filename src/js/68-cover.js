// ============================================================
//  Video cover (v1.37): pick the frame you want as the cover — like CapCut's "Cover"
//  D.cover = { t, thumb }  (saved with the project; also shown as the project card picture; downloaded as JPG next to the exported MP4)
// ============================================================
async function coverStill(t, W, H) {          // full composite of the project at time t -> canvas
  pause(); const tt = clamp(t, 0, Math.max(0, durEnd() - 0.001)); PB.t = tt; syncMedia(true);
  const t0 = performance.now(); await sleep(40);
  while (performance.now() - t0 < 4000) {          // wait (without re-seeking every tick) until every video under the playhead shows the right frame
    syncMedia(false);
    const act = D.items.filter(i => i.type === 'video' && tt >= i.start - 1e-3 && tt < i.start + i.dur);
    if (act.every(i => { const r = POOL.get(i.id); return r && r.el.readyState >= 2 && !r.el.seeking && !r.want; })) break; await sleep(40);
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { alpha: false }); renderFrame(ctx, W, H, tt); return cv;
}
const CV = { t: 0, busy: false, again: false, film: 0, keep: 0 };
async function coverPreview() {
  if (CV.busy) { CV.again = true; return; } CV.busy = true;
  try {
    do {
      CV.again = false; const t = CV.t; const cv = $('#cvPrev'); const asp = (D.w || 1080) / (D.h || 1920);
      const h = 640, w = Math.round(h * asp); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      const st = await coverStill(t, w, h); if (CV.t === t) cv.getContext('2d').drawImage(st, 0, 0); else CV.again = true;
    } while (CV.again);
  } finally { CV.busy = false; }
}
function coverSetT(t) {
  const end = Math.max(0.05, durEnd() - 0.001);
  CV.t = clamp(t, 0, end); $('#cvTime').textContent = tcFmt(CV.t);
  const st = $('#cvStrip'); $('#cvHandle').style.left = (CV.t / end * st.clientWidth) + 'px'; coverPreview();
}
async function coverFilm(token) {          // v1.79: real frames along the whole project, filled in one by one so the strip is usable straight away
  const st = $('#cvStrip'), cv = $('#cvFilm'); const FW = st.clientWidth, FH = st.clientHeight, asp = (D.w || 1080) / (D.h || 1920);
  cv.width = FW * 2; cv.height = FH * 2; const ctx = cv.getContext('2d'); ctx.fillStyle = '#15171c'; ctx.fillRect(0, 0, cv.width, cv.height);
  const tw = FH * asp, n = Math.max(2, Math.ceil(FW / tw)), end = Math.max(0.05, durEnd() - 0.001);
  for (let i = 0; i < n; i++) {
    if (CV.film !== token) return;
    while (CV.busy) { await sleep(60); if (CV.film !== token) return; }
    CV.busy = true; let img = null;
    try { img = await coverStill(((i + .5) / n) * end, Math.round(tw * 2), FH * 2); } catch (e) { }
    finally { CV.busy = false; }
    if (CV.film !== token) return;
    if (img) ctx.drawImage(img, i * (FW / n) * 2, 0, (FW / n) * 2, FH * 2);
    if (CV.again) coverPreview();
  }
  coverSetT(CV.t);
}
function coverOpen() {
  if (!D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return; }
  CV.keep = PB.t; $('#cvDel').style.display = D.cover ? '' : 'none';
  const dlg = $('#dlgCover'); dlg.showModal(); const token = ++CV.film;
  coverSetT(D.cover && D.cover.t != null ? D.cover.t : PB.t); coverFilm(token);
}
async function coverDownload(quiet) {
  if (!D.cover) return; const W = D.w || 1080, H = D.h || 1920; const keep = PB.t;
  const cv = await coverStill(D.cover.t, W, H); PB.t = keep; seek(keep);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .93)); if (!blob) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (D.name || 'video') + '-cover.jpg'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); }, 2000);
  if (!quiet) toast('ดาวน์โหลดรูปปกแล้ว ✔');
}
function coverInit() {
  const fr = 1 / ((D && D.fps) || 30), end = () => Math.max(0.05, durEnd() - 0.001);
  const strip = $('#cvStrip');
  const fromX = e => { const r = strip.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * end(); };
  strip.onpointerdown = e => { e.preventDefault(); strip.setPointerCapture(e.pointerId); strip.focus(); coverSetT(fromX(e)); strip.onpointermove = ev => coverSetT(fromX(ev)); strip.onpointerup = strip.onpointercancel = () => { strip.onpointermove = null; }; };
  const step = n => coverSetT(CV.t + n * ((D && D.fps) ? 1 / D.fps : fr));
  const hold = (btn, dir) => {     // press and hold = keeps stepping
    let tm = null, iv = null; const stop = () => { clearTimeout(tm); clearInterval(iv); };
    btn.onpointerdown = e => { e.preventDefault(); step(dir); tm = setTimeout(() => { iv = setInterval(() => step(dir), 70); }, 350); };
    btn.onpointerup = btn.onpointerleave = btn.onpointercancel = stop;
  };
  hold($('#cvPrevF'), -1); hold($('#cvNextF'), 1);
  $('#dlgCover').addEventListener('keydown', e => {
    const k = e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    e.preventDefault(); if (k === 'Home') coverSetT(0); else if (k === 'End') coverSetT(end()); else step((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
  });
  $('#dlgCover').addEventListener('close', () => { CV.film++; PB.t = CV.keep; seek(CV.keep); });   // put the playhead back where it was
  $('#cvHead').onclick = () => coverSetT(CV.keep);
  $('#cvClose').onclick = () => $('#dlgCover').close();
  $('#cvSet').onclick = async () => {
    const th = document.createElement('canvas'); const asp = (D.w || 1080) / (D.h || 1920); th.height = 300; th.width = Math.round(300 * asp);
    CV.film++; while (CV.busy) await sleep(40);
    const st = await coverStill(CV.t, th.width, th.height); th.getContext('2d').drawImage(st, 0, 0);
    D.cover = { t: CV.t, thumb: th.toDataURL('image/jpeg', .8) }; commit('cover');
    $('#dlgCover').close(); toast('ตั้งหน้าปกแล้ว ✔');
  };
  $('#cvDel').onclick = () => { D.cover = null; commit('cover'); $('#dlgCover').close(); };
  $('#cvDl').onclick = async () => {
    const keep = D.cover; const th = { t: CV.t }; D.cover = th; await coverDownload(false); D.cover = keep;
  };
}
