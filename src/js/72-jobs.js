// ============================================================
//  v1.82  APPROVE → the shop server exports the video by itself → copy goes to Marketing Studio
//  Two halves:
//   1) approve dialog (this computer): saves the project + its clips to the shop server, then asks the server to make a job.
//   2) jobRun() (only used by the server's own hidden Chrome, JOBMODE): opens that project from the server and exports it.
// ============================================================
const JOBMODE = (() => { try { return localStorage.getItem('sk_job') === '1'; } catch (e) { return false; } })();
const JOBST = { list: [], timer: 0, products: null, by: '' };
const jobStateTxt = j => ({ queued: '⏳ รอคิว', running: '⚙ กำลังส่งออก', uploading: '☁ กำลังส่งเข้า Marketing Studio', done: '✅ เสร็จแล้ว — เข้า Marketing Studio แล้ว', failed: '❌ ไม่สำเร็จ', cancelled: '⏹ ยกเลิกแล้ว' }[j.state] || j.state);
const jobActive = j => j && (j.state === 'queued' || j.state === 'running' || j.state === 'uploading');

async function jobsLoad() {
  if (!srvOn() || !D || !D.pid) { JOBST.list = []; return []; }
  try { const r = await srvFetch('/jobs?pid=' + srvId(D.pid)); if (r.ok) JOBST.list = await r.json(); } catch (e) { }
  return JOBST.list;
}
function approveBadge() {
  const b = $('#btnApprove'); if (!b) return;
  const j = (JOBST.list || [])[0];
  if (!j) { b.textContent = '✅ อนุมัติ'; b.title = 'อนุมัติวิดีโอนี้ — เซิร์ฟเวอร์ที่ร้านจะส่งออกเอง แล้วส่งเข้า Marketing Studio ให้แอดมิน'; return; }
  const p = j.state === 'running' && j.progress ? ' ' + Math.round(j.progress) + '%' : '';
  b.textContent = j.state === 'done' ? '✅ อนุมัติแล้ว' : j.state === 'failed' ? '⚠ อนุมัติ (ล่าสุดล้มเหลว)' : jobActive(j) ? '⏳ ' + jobStateTxt(j).replace(/^\S+\s/, '') + p : '✅ อนุมัติ';
  b.title = jobStateTxt(j) + (j.msg ? ' — ' + j.msg : '');
}
function approveRender() {
  const box = $('#apList'); if (!box) return;
  const L = JOBST.list || [];
  box.innerHTML = L.length ? L.slice(0, 6).map(j => {
    const when = new Date(j.created).toLocaleString('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const p = j.state === 'running' && j.progress ? ` ${Math.round(j.progress)}%` : '';
    const link = j.state === 'done' && j.ms && j.ms.url ? ` <a href="${esc(j.ms.url)}" target="_blank" rel="noopener">เปิดไฟล์</a>` : '';
    const cancel = jobActive(j) ? ` <button data-cancel="${esc(j.id)}">ยกเลิก</button>` : '';
    return `<div class="apRow"><b>${esc(jobStateTxt(j))}${p}</b> <span class="apMeta">${when}${j.product ? ' · ' + esc(j.product.name || '') : ''}</span>${j.msg && j.state !== 'done' ? `<div class="apMsg">${esc(j.msg)}</div>` : ''}${link}${cancel}</div>`;
  }).join('') : '<div class="apMeta">ยังไม่เคยอนุมัติโปรเจกต์นี้</div>';
  box.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { try { await srvFetch('/jobs/' + srvId(b.dataset.cancel), { method: 'DELETE' }); } catch (e) { } await jobsLoad(); approveRender(); approveBadge(); });
}
function jobsPollStart() {
  clearTimeout(JOBST.timer);
  const tick = async () => {
    await jobsLoad(); approveBadge(); if ($('#dlgApprove') && $('#dlgApprove').open) approveRender();
    if ((JOBST.list || []).some(jobActive)) JOBST.timer = setTimeout(tick, 4000);   // only while a job of THIS project is running
  };
  tick();
}
async function approveOpen() {
  if (!srvOn()) { toast('ต้องเชื่อมต่อเซิร์ฟเวอร์ร้านก่อน (⚙ ตั้งค่า → เซิร์ฟเวอร์เก็บไฟล์)', 6000); return; }
  if (!D || !D.pid || !D.items.length) { toast('ยังไม่มีอะไรในไทม์ไลน์'); return; }
  const dlg = $('#dlgApprove'); $('#apName').textContent = D.name || 'โปรเจกต์';
  try { JOBST.by = localStorage.getItem('sk_by') || ''; } catch (e) { }
  $('#apBy').value = JOBST.by;
  const sel = $('#apProd'); let saved = ''; try { saved = localStorage.getItem('sk_prod_' + D.pid) || ''; } catch (e) { }
  if (!JOBST.products) {
    sel.innerHTML = '<option value="">กำลังโหลดรายชื่อสินค้า…</option>';
    try { const r = await srvFetch('/products'); const j = r.ok ? await r.json() : null; JOBST.products = (j && j.products) || []; if (j && j.error) toast('โหลดรายชื่อสินค้าไม่ได้: ' + j.error, 5000); } catch (e) { JOBST.products = []; }
  }
  sel.innerHTML = '<option value="">— ไม่ระบุสินค้า —</option>' + JOBST.products.map(p => `<option value="${esc(p.id)}" ${p.id === saved ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('#apMsg').textContent = ''; $('#apGo').disabled = false;
  await jobsLoad(); approveRender(); if (!dlg.open) dlg.showModal(); jobsPollStart();
}
async function approveGo() {
  const msg = $('#apMsg'), go = $('#apGo'); go.disabled = true;
  try {
    const by = ($('#apBy').value || '').trim(); try { localStorage.setItem('sk_by', by); } catch (e) { }
    const pid = $('#apProd').value, pname = pid ? ($('#apProd').selectedOptions[0].textContent || '') : '';
    try { localStorage.setItem('sk_prod_' + D.pid, pid); } catch (e) { }
    msg.textContent = 'กำลังบันทึกโปรเจกต์ขึ้นเซิร์ฟเวอร์…';
    const rec = projRec(D); await projPut(rec); PS.sig.set(D.pid, JSON.stringify(D));
    if (!(await srvPushProject(rec))) { msg.textContent = '⚠ ส่งโปรเจกต์ขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (อาจมีเวอร์ชันใหม่กว่าบนเซิร์ฟเวอร์ — ดูแถบสีเขียวด้านบน)'; go.disabled = false; return; }
    msg.textContent = 'กำลังเช็กว่าคลิปทั้งหมดอยู่บนเซิร์ฟเวอร์แล้วหรือยัง…';
    await srvEnsureSizes(true);
    const ids = [...new Set(D.items.map(i => i.mediaId).filter(x => x && !String(x).startsWith('__') && !String(x).startsWith('sfx-')))];
    const need = ids.filter(id => { const m = MEDIA.get(id); return m && m.file && !m.builtin && !m.hidden && !m.proxyOnly && SRV.sizes.get(id) !== m.file.size; });
    if (need.length) { srvQueueMedia(need); msg.textContent = `⏳ กำลังอัปโหลดคลิป ${need.length} ไฟล์ขึ้นเซิร์ฟเวอร์ (ดูไอคอน ☁ ด้านบน) — พออัปโหลดเสร็จ กดอนุมัติอีกครั้ง`; go.disabled = false; return; }
    const r = await srvFetch('/jobs', { method: 'POST', body: JSON.stringify({ pid: D.pid, name: D.name, by, product: pid ? { id: pid, name: pname } : null, updated: rec.updated }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    msg.textContent = j.already ? 'โปรเจกต์นี้มีงานรออยู่แล้ว' : '✅ ส่งให้เซิร์ฟเวอร์แล้ว — ปิดหน้าต่างนี้ได้เลย ระบบส่งออกและส่งเข้า Marketing Studio เอง';
    toast(j.already ? 'มีงานของโปรเจกต์นี้รออยู่แล้ว' : '✅ อนุมัติแล้ว — เซิร์ฟเวอร์กำลังส่งออกให้', 5000);
    await jobsLoad(); approveRender(); approveBadge(); jobsPollStart();
  } catch (e) { msg.textContent = '⚠ ' + (e.message || e); }
  go.disabled = false;
}
function approveInit() {
  const b = $('#btnApprove'); if (!b) return;
  b.onclick = approveOpen; $('#apGo').onclick = approveGo; $('#apClose').onclick = () => $('#dlgApprove').close();
  document.addEventListener('keydown', () => { }, { passive: true });
}
if (!JOBMODE) window.addEventListener('sk-project-open', () => { jobsLoad().then(approveBadge); jobsPollStart(); });

// ---------- server side: runs inside the server's hidden Chrome ----------
async function jobRun(pid, opts) {
  opts = opts || {};
  const r0 = await srvFetch('/projects/' + srvId(pid)); if (!r0.ok) throw new Error('ไม่พบโปรเจกต์บนเซิร์ฟเวอร์ (HTTP ' + r0.status + ')');
  const rec = await r0.json(); await projPut(rec); SRV.upd.set(pid, rec.updated);
  await openById(pid);
  // v2.01: the clips ARE on the shop server, but this hidden Chrome sometimes fails to open one while pulling it (Tar's approve 2026-11-24: 'missing 2 files' although both were on the server). Try again up to 3 times before giving up
  let miss = srvMissingIds();
  for (let k = 0; k < 3 && miss.length; k++) { if (k) await sleep(2500 * k); try { await srvPullMissing(); } catch (e) { console.warn('jobRun pull', e); } miss = srvMissingIds(); }
  if (miss.length) throw new Error('เปิดคลิปจากเซิร์ฟเวอร์ไม่สำเร็จ (ลอง 3 รอบ) ' + miss.length + ' ไฟล์: ' + miss.map(mediaNameFromId).join(', '));
  for (const it of D.items) { if (it.type === 'video') { const m = MEDIA.get(it.mediaId); if (!m || !(m.duration > 0)) throw new Error('อ่านคลิปไม่ได้: ' + (m ? m.name : it.mediaId)); } }
  window.__jobProg = () => ({ p: parseFloat(($('#expBar') || {}).style && $('#expBar').style.width) || 0, msg: ($('#expMsg') || {}).textContent || '' });
  const blob = await runExport({ noDownload: true, coverFirst: !!D.cover });
  if (!blob || !blob.size) throw new Error('ส่งออกไม่สำเร็จ');
  const ext = (EXP.last && EXP.last.ext) || 'mp4';
  const d = new Date(), z = n => String(n).padStart(2, '0');
  const base = (D.name || 'video').replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 90) + ' ' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes());
  const file = base + '.' + ext;
  await xhrPut('/out/' + srvId(file), blob, { 'x-type': blob.type || 'video/mp4' }, p => { window.__jobUp = p; });
  return { file, size: blob.size, dur: EXP.last.dur, w: EXP.last.w, h: EXP.last.h, title: D.name || 'video', thumb: (D.cover && D.cover.thumb) || projThumb(D) || '', fast: !!(EXP.last && EXP.last.fast) };
}
// what this browser can do (the server reads it into jobs-selftest.json so problems are visible without opening the machine)
async function jobSelfTest() {
  const o = { ua: navigator.userAgent, webcodecs: !!(window.VideoEncoder && window.AudioEncoder), muxer: typeof Mp4Muxer !== 'undefined' };
  try { const s = await fxSupport(1080, 1920, 8e6); o.fast = !!s; o.fastCodecs = s || null; } catch (e) { o.fast = false; o.err = String(e); }
  const v = document.createElement('video'); o.canPlay = { h264: v.canPlayType('video/mp4; codecs="avc1.640028"'), hevc: v.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0"'), hevc2: v.canPlayType('video/mp4; codecs="hev1.1.6.L120.B0"') };
  try { o.hevcDecode = window.VideoDecoder ? (await VideoDecoder.isConfigSupported({ codec: 'hvc1.1.6.L120.B0' })).supported : null; } catch (e) { o.hevcDecode = null; }
  o.version = APP_VERSION; return o;
}
