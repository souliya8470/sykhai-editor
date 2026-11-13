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
const CV = { t: 0, busy: false, again: false };
async function coverPreview() {
  if (CV.busy) { CV.again = true; return; } CV.busy = true;
  try {
    do {
      CV.again = false; const t = CV.t; const cv = $('#cvPrev'); const asp = (D.w || 1080) / (D.h || 1920);
      const h = 440, w = Math.round(h * asp); cv.width = w; cv.height = h;
      const st = await coverStill(t, w, h); if (CV.t === t) cv.getContext('2d').drawImage(st, 0, 0); else CV.again = true;
    } while (CV.again);
  } finally { CV.busy = false; }
}
function coverSetT(t, fromSlider) {
  CV.t = clamp(t, 0, Math.max(0, durEnd() - 0.001)); const s = $('#cvT'); if (!fromSlider) s.value = CV.t;
  $('#cvTime').textContent = tcFmt(CV.t); PB.t = CV.t; seek(CV.t); coverPreview();
}
function coverOpen() {
  if (!D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return; }
  const s = $('#cvT'); s.max = Math.max(0.1, durEnd() - 0.001); s.step = 1 / ((D.fps) || 30);
  $('#cvDel').style.display = D.cover ? '' : 'none';
  $('#dlgCover').showModal(); coverSetT(D.cover ? D.cover.t : PB.t);
}
async function coverDownload(quiet) {
  if (!D.cover) return; const W = D.w || 1080, H = D.h || 1920; const keep = PB.t;
  const cv = await coverStill(D.cover.t, W, H); PB.t = keep; seek(keep);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .93)); if (!blob) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (D.name || 'video') + '-cover.jpg'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); }, 2000);
  if (!quiet) toast('ดาวน์โหลดรูปปกแล้ว ✔');
}
function coverInit() {
  $('#cvT').oninput = e => coverSetT(parseFloat(e.target.value), true);
  $('#cvPrevF').onclick = () => coverSetT(CV.t - 1 / ((D.fps) || 30));
  $('#cvNextF').onclick = () => coverSetT(CV.t + 1 / ((D.fps) || 30));
  $('#cvHead').onclick = () => coverSetT(PB.t);
  $('#cvClose').onclick = () => $('#dlgCover').close();
  $('#cvSet').onclick = async () => {
    const cv = $('#cvPrev'); const th = document.createElement('canvas'); const asp = (D.w || 1080) / (D.h || 1920); th.height = 300; th.width = Math.round(300 * asp);
    const st = await coverStill(CV.t, th.width, th.height); th.getContext('2d').drawImage(st, 0, 0);
    D.cover = { t: CV.t, thumb: th.toDataURL('image/jpeg', .8) }; commit('cover');
    $('#dlgCover').close(); toast('ตั้งหน้าปกแล้ว ✔');
  };
  $('#cvDel').onclick = () => { D.cover = null; commit('cover'); $('#dlgCover').close(); };
  $('#cvDl').onclick = async () => {
    const keep = D.cover; const th = { t: CV.t }; D.cover = th; await coverDownload(false); D.cover = keep;
  };
}
