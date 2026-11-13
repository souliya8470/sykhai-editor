// ============================================================
//  Home file server (v1.04) — stores projects, source media and finished videos on the
//  shop server's disk. Talks to server/server.js. No polling: syncs only when saving,
//  opening a project, exporting, or when you press the Home "sync" button.
// ============================================================
const SRV = { up: false, sizes: new Map(), q: [], busy: false, prog: null, label: '', err: '', info: null };
const SRV_SELF = !!document.querySelector('meta[name="sk-server"]');      // page is served by the shop server itself -> same-origin, no CORS/https problems
const srvCfg = () => { let c = {}; try { c = JSON.parse(localStorage.getItem('sk_srv') || '{}'); } catch (e) { } if (SRV_SELF) c.url = location.origin; return c; };
const srvOn = () => { const c = srvCfg(); return !!(c.url && c.token); };
const srvUrl = p => srvCfg().url.trim().replace(/\/+$/, '') + p;
const srvFetch = (p, o = {}) => fetch(srvUrl(p), Object.assign({}, o, { headers: Object.assign({ 'x-token': srvCfg().token }, o.headers) }));
const srvId = id => encodeURIComponent(id);

function updateSrvBadge() {
  const b = $('#srvBadge'); if (!b) return;
  if (!srvOn()) { b.hidden = true; return; }
  b.hidden = false; b.classList.toggle('off', !SRV.up);
  b.textContent = SRV.prog != null ? `☁ ${SRV.label} ${Math.round(SRV.prog * 100)}%` : SRV.q.length ? `☁ รอส่ง ${SRV.q.length} ไฟล์` : SRV.up ? '☁ เซิร์ฟเวอร์พร้อม' : '☁ ออฟไลน์';
  b.title = SRV.up ? 'เชื่อมต่อเซิร์ฟเวอร์ที่ร้านอยู่' : ('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' + (SRV.err ? ': ' + SRV.err : ''));
}
async function srvPing() {
  if (!srvOn()) { SRV.up = false; updateSrvBadge(); return false; }
  try { const r = await srvFetch('/ping'); if (!r.ok) throw new Error(r.status === 401 ? 'รหัสผ่านไม่ถูก' : 'HTTP ' + r.status); SRV.info = await r.json(); SRV.up = true; SRV.err = ''; }
  catch (e) { SRV.up = false; SRV.info = null; SRV.err = e.message === 'Failed to fetch' ? 'ติดต่อไม่ได้ (ที่อยู่ผิด / เซิร์ฟเวอร์ปิด / https-http ไม่ตรงกัน)' : e.message; }
  updateSrvBadge(); return SRV.up;
}
async function srvLoadSizes() {
  try { const r = await srvFetch('/media'); if (r.ok) { SRV.sizes = new Map((await r.json()).map(m => [m.id, m.size])); } } catch (e) { }
}
function xhrPut(path, body, headers, onp) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('PUT', srvUrl(path)); x.setRequestHeader('x-token', srvCfg().token);
    for (const k in headers) x.setRequestHeader(k, headers[k]);
    x.upload.onprogress = e => onp && onp(e.loaded / (e.total || 1));
    x.onload = () => x.status < 300 ? res() : rej(new Error('HTTP ' + x.status)); x.onerror = () => rej(new Error('Failed to fetch')); x.send(body);
  });
}
// ----- uploads of source media (sequential queue) -----
function srvQueueMedia(ids) {
  if (!srvOn()) return;
  for (const id of ids) { const m = MEDIA.get(id); if (m && m.file && !m.builtin && !m.hidden && !m.ref && !m.proxyOnly && SRV.sizes.get(id) !== m.file.size && !SRV.q.includes(id)) SRV.q.push(id); }
  updateSrvBadge(); srvRun();
}
async function srvRun() {
  if (SRV.busy) return; SRV.busy = true;
  try {
    while (SRV.q.length) {
      if (!SRV.up && !(await srvPing())) { SRV.q = []; break; }
      const id = SRV.q[0], m = MEDIA.get(id);
      if (m && m.file) {
        SRV.label = m.name.length > 14 ? m.name.slice(0, 12) + '…' : m.name; SRV.prog = 0; updateSrvBadge();
        try { await xhrPut('/media/' + srvId(id), m.file, { 'x-name': encodeURIComponent(m.name), 'x-type': m.file.type || 'application/octet-stream' }, p => { SRV.prog = p; updateSrvBadge(); }); SRV.sizes.set(id, m.file.size); }
        catch (e) { SRV.up = false; SRV.err = e.message; toast('ส่งไฟล์ขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ' + m.name, 5000); SRV.q = []; break; }
      }
      SRV.q.shift();
    }
  } finally { SRV.busy = false; SRV.prog = null; updateSrvBadge(); }
  srvAdoptProxies();
}
// ----- projects -----
async function srvPushProject(rec) {
  if (!srvOn()) return false;
  try {
    const r = await srvFetch('/projects/' + srvId(rec.id), { method: 'PUT', body: JSON.stringify(rec) });
    if (r.status === 409) { toast('โปรเจกต์ “' + rec.name + '” บนเซิร์ฟเวอร์ใหม่กว่า — ไม่เขียนทับ (กดซิงค์ในหน้าโปรเจกต์เพื่อดึง)', 6000); return false; }
    SRV.up = r.ok; updateSrvBadge(); return r.ok;
  } catch (e) { SRV.up = false; SRV.err = 'ติดต่อไม่ได้'; updateSrvBadge(); return false; }
}
async function srvSync(rec) {          // called after every local autosave
  if (!srvOn()) return;
  if (!SRV.sizes.size && !SRV.up) await srvPing() && await srvLoadSizes();
  if (await srvPushProject(rec)) srvQueueMedia(rec.mids || []);
}
async function srvDeleteProject(id) { if (srvOn()) { try { await srvFetch('/projects/' + srvId(id), { method: 'DELETE' }); } catch (e) { } } }
async function srvSyncAll() {          // manual button on Home
  if (!srvOn()) { toast('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — เปิด ⚙ ตั้งค่า'); return; }
  toast('กำลังซิงค์กับเซิร์ฟเวอร์…', 8000);
  if (!await srvPing()) { toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + SRV.err, 7000); return; }
  await srvLoadSizes();
  let remote = []; try { remote = await (await srvFetch('/projects')).json(); } catch (e) { toast('อ่านรายการจากเซิร์ฟเวอร์ไม่ได้'); return; }
  const local = await projAll(); const lm = new Map(local.map(r => [r.id, r])), rm = new Map(remote.map(r => [r.id, r]));
  let down = 0, up = 0;
  for (const r of remote) { const l = lm.get(r.id); if (!l || l.updated < r.updated) { try { const full = await (await srvFetch('/projects/' + srvId(r.id))).json(); if (await projPut(full)) down++; } catch (e) { } } }
  for (const l of local) { const r = rm.get(l.id); if (!r || r.updated > 0 && r.updated < l.updated) { if (await srvPushProject(l)) up++; } srvQueueMedia(l.mids || []); }
  toast(`ซิงค์แล้ว — ดึงลงเครื่อง ${down} โปรเจกต์ · ส่งขึ้นเซิร์ฟเวอร์ ${up} โปรเจกต์` + (SRV.q.length ? ` · กำลังส่งไฟล์วิดีโอ ${SRV.q.length} ไฟล์` : ''), 6000);
  renderHome();
}
// ----- download media that this computer doesn't have yet -----
async function srvFetchMissing(ids) {
  if (!srvOn() || !ids.length) return 0;
  if (!SRV.up && !(await srvPing())) return 0;
  let n = 0, i = 0;
  for (const id of ids) {
    i++; try {
      toast(`กำลังโหลดไฟล์จากเซิร์ฟเวอร์ (${i}/${ids.length}) ${mediaNameFromId(id)}`, 60000);
      if (IS_PHONE() && /\.(mov|mp4|m4v|webm)$/i.test(id.split('|')[0])) {      // phones: take the light proxy copy (540p) instead of the 4K original
        const pf = await srvGetProxy(id, true); if (pf) { await importFiles([pf], { id, name: mediaNameFromId(id), proxyOnly: true, quiet: true }); if (MEDIA.has(id)) { n++; continue; } }
      }
      const r = await srvFetch('/media/' + srvId(id)); if (!r.ok) continue;
      const name = decodeURIComponent(r.headers.get('x-name') || '') || mediaNameFromId(id); const blob = await r.blob();
      await importFiles([new File([blob], name, { type: blob.type })]); if (MEDIA.has(id)) n++;
    } catch (e) { console.warn('srvFetchMissing', e); }
  }
  toast(n ? `โหลดไฟล์จากเซิร์ฟเวอร์แล้ว ${n} ไฟล์` : 'ไม่พบไฟล์บนเซิร์ฟเวอร์', 4000);
  return n;
}
// ----- inbox (v1.30): clips the shop server fetched for us (N8N -> yt-dlp). Pulled into the media list, then moved to inbox/done on the server -----
SRV.inbox = [];
async function srvInboxList() {
  if (!srvOn()) return null; if (!SRV.up && !(await srvPing())) return null;
  try { const r = await srvFetch('/inbox'); if (!r.ok) return null; SRV.inbox = (await r.json()).filter(x => /\.(mp4|mov|m4v|webm)$/i.test(x.name)); return SRV.inbox; } catch (e) { return null; }
}
let _inboxBusy = false;
async function srvInboxImport(opts) {
  opts = opts || {}; if (_inboxBusy) return 0;
  const list = await srvInboxList(); if (!list) { if (!opts.quiet) toast('เซิร์ฟเวอร์ไม่พร้อม — ตรวจ ⚙ ตั้งค่า', 5000); return 0; }
  if (!list.length) { if (!opts.quiet) toast('กล่องรับว่าง — ยังไม่มีคลิปใหม่', 4000); return 0; }
  _inboxBusy = true; let n = 0, i = 0;
  try {
    for (const f of list) {
      i++; toast(`กำลังดึงคลิปจากกล่องรับ (${i}/${list.length}) ${f.name}`, 60000);
      try {
        const r = await srvFetch('/inbox/' + srvId(f.name)); if (!r.ok) continue;
        const blob = await r.blob(); const file = new File([blob], f.name, { type: blob.type || 'video/mp4' });
        await importFiles([file], { quiet: true, ref: true });
        if ([...MEDIA.values()].some(m => m.name === f.name)) { await srvFetch('/inbox/' + srvId(f.name), { method: 'DELETE' }); n++; }
      } catch (e) { console.warn('srvInboxImport', e); }
    }
  } finally { _inboxBusy = false; }
  toast(n ? `ดึงคลิปเข้ามาแล้ว ${n} คลิป (อยู่ในคลังอ้างอิงที่หน้าโปรเจกต์)` : 'ดึงคลิปจากกล่องรับไม่สำเร็จ', 5000); if (n && HOME.open) renderHome();
  return n;
}
async function srvInboxAuto() {         // on start-up: desktop pulls new clips by itself, phones only get a hint (mobile data / small screen)
  const list = await srvInboxList(); if (!list || !list.length) return;
  if (IS_PHONE()) { toast(`มีคลิปใหม่ ${list.length} คลิปรอในกล่องรับ — เปิด 🔬 วิเคราะห์ เพื่อดึงเข้า`, 8000); return; }
  await srvInboxImport({ quiet: true });
}
// ----- proxy copies (v1.19): light 540p copies made by the shop server, used for preview on phones -----
const IS_PHONE = () => matchMedia('(max-width:820px)').matches || matchMedia('(pointer:coarse)').matches;
SRV.px = { ready: new Set(), pending: new Set(), ffmpeg: null, note: '' };
async function srvLoadProxies() {
  try { const r = await srvFetch('/proxies'); if (!r.ok) return false; const j = await r.json(); SRV.px = { ready: new Set(j.ready), pending: new Set(j.pending), ffmpeg: j.ffmpeg, note: j.note || '' }; return true; } catch (e) { return false; }
}
async function srvGetProxy(id, wait) {            // -> File (mp4) or null. wait=true: wait (up to 4 min) while the server is still building it
  if (!srvOn()) return null; if (!SRV.up && !(await srvPing())) return null;
  const t0 = Date.now();
  for (;;) {
    if (!await srvLoadProxies()) return null;
    if (SRV.px.ready.has(id)) break;
    if (!wait || !SRV.px.ffmpeg || !SRV.px.pending.has(id) || Date.now() - t0 > 240000) return null;
    toast('เซิร์ฟเวอร์กำลังสร้างสำเนาเบาของ ' + mediaNameFromId(id) + ' (ครั้งเดียว) …', 8000); await sleep(4000);
  }
  try { const r = await srvFetch('/media/' + srvId(id) + '?proxy=1'); if (!r.ok) return null; const b = await r.blob(); return new File([b], mediaNameFromId(id).replace(/\.[^.]+$/, '') + '.proxy.mp4', { type: 'video/mp4' }); } catch (e) { return null; }
}
let _adoptBusy = false, _adoptTimer = 0, _adoptTries = 0;
function proxyTag() {
  const vs = projMedia().filter(m => m.type === 'video'); if (!vs.length) return '';
  const n = vs.filter(m => m.purl || m.proxyOnly).length;
  return ' · ⚡' + n + '/' + vs.length + (n < vs.length && SRV.adoptNote ? ' (' + SRV.adoptNote + ')' : '');
}
function verText() { return 'Sykhai Editor v' + APP_VERSION + proxyTag(); }
async function srvAdoptProxies() {                // phone has big local originals that are already on the server -> use the light copy for preview
  if (_adoptBusy) return; if (!srvOn()) { SRV.adoptNote = 'no-server'; return; } if (!IS_PHONE()) { SRV.adoptNote = 'desktop'; return; } _adoptBusy = true; let again = false, n = 0; SRV.adoptNote = '';
  try {
    if (!SRV.up && !(await srvPing())) { SRV.adoptNote = 'offline'; return; } if (!SRV.sizes.size) await srvLoadSizes();
    const cand = [...MEDIA.values()].filter(m => m.type === 'video' && !m.proxyOnly && !m.purl && !m.builtin && !m.hidden && !m.ref && m.file && SRV.sizes.get(m.id) === m.file.size && Math.max(m.w || 0, m.h || 0) > 1300);
    if (!cand.length) { const raw = [...MEDIA.values()].filter(m => m.type === 'video' && !m.hidden && !m.ref && !m.builtin && !m.proxyOnly && !m.purl); SRV.adoptNote = raw.length ? (raw.some(m => m.file && SRV.sizes.get(m.id) !== m.file.size) ? 'not-uploaded' : 'small') : ''; return; } await srvLoadProxies(); if (!SRV.px.ffmpeg) again = /download|unpack|checking/.test(SRV.px.note || '');
    for (const m of cand) {
      if (SRV.px.ready.has(m.id)) { const f = await srvGetProxy(m.id, false); if (f) { m.pfile = f; m.purl = URL.createObjectURL(f); dbPut(m); n++; } else { again = true; SRV.adoptNote = 'download-failed'; } }
      else if (SRV.px.pending.has(m.id)) { again = true; SRV.adoptNote = 'server-busy'; }
      else SRV.adoptNote = 'no-proxy';
    }
  } finally { _adoptBusy = false; }
  if (n) { poolResetAll(); toast('ใช้สำเนาเบาสำหรับดูตัวอย่างแล้ว ' + n + ' คลิป (ตอนส่งออกยังใช้ไฟล์ต้นฉบับ)', 5000); }
  if (again && ++_adoptTries < 120) { clearTimeout(_adoptTimer); _adoptTimer = setTimeout(srvAdoptProxies, 8000); } else if (!again) _adoptTries = 0;
}
async function exportUseOriginals(msgEl) {         // export must use the full-quality originals: swap proxies out, return a function that swaps them back
  const back = []; const ids = [...new Set(D.items.map(i => i.mediaId).filter(Boolean))];
  for (const id of ids) {
    const m = MEDIA.get(id); if (!m) continue;
    if (m.purl) { back.push(() => { m.purl = m._purl; }); m._purl = m.purl; m.purl = null; }
    else if (m.proxyOnly) {
      if (msgEl) msgEl.textContent = 'กำลังดึงไฟล์ต้นฉบับจากเซิร์ฟเวอร์: ' + m.name + ' …';
      try { const r = await srvFetch('/media/' + srvId(id)); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob(); const old = m.url, nu = URL.createObjectURL(b); m.url = nu; back.push(() => { m.url = old; URL.revokeObjectURL(nu); }); }
      catch (e) { toast('ดึงไฟล์ต้นฉบับ ' + m.name + ' ไม่ได้ — ส่งออกจากสำเนาเบา (ความละเอียดต่ำกว่า)', 7000); }
    }
  }
  poolResetAll();
  return () => { back.forEach(f => f()); poolResetAll(); };
}
async function srvPushOut(blob, name) {
  if (!srvOn()) return;
  try { SRV.label = 'วิดีโอ'; SRV.prog = 0; updateSrvBadge(); await xhrPut('/out/' + srvId(name), blob, { 'x-type': blob.type }, p => { SRV.prog = p; updateSrvBadge(); }); toast('เก็บวิดีโอที่ตัดเสร็จไว้ในเซิร์ฟเวอร์แล้ว: ' + name, 5000); }
  catch (e) { toast('ส่งวิดีโอขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (ไฟล์ยังโหลดลงเครื่องแล้ว)', 5000); }
  SRV.prog = null; updateSrvBadge();
}
