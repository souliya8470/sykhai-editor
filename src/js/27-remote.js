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
// v1.50: is the server "away" (reached over the internet, not the shop network / Tailscale)?  Then big videos are pulled as light 540p copies.
const SRV_PRIV = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|.*\.local$)/i;
const srvAway = () => { try { return !SRV_PRIV.test(new URL(srvCfg().url).hostname); } catch (e) { return false; } };
const srvPullMode = () => { try { return localStorage.getItem('sk_pull') || 'auto'; } catch (e) { return 'auto'; } };   // auto | light | full
const srvLight = () => { const m = srvPullMode(); return m === 'light' ? true : m === 'full' ? false : (IS_PHONE() || srvAway()); };

// v1.50: staff link  https://editor.touktashop.online/#sk=<base64url {u,t}>  — the part after # is never sent to any server;
// it is read once, the address bar is cleaned, and the user confirms before the shop server is saved on this device.
SRV.link = null;
(function () {
  try {
    const m = /^#sk=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return;
    const j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (/^https?:\/\/[^\s/]+/i.test(j.u || '') && String(j.t || '').length >= 6) SRV.link = { u: String(j.u).trim().replace(/\/+$/, ''), t: String(j.t).trim() };
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { }
})();
function srvStaffLink() {
  let c = {}; try { c = JSON.parse(localStorage.getItem('sk_srv') || '{}'); } catch (e) { }
  const u = (c.url || (SRV_SELF ? location.origin : '')).trim().replace(/\/+$/, ''), t = (c.token || '').trim();
  if (!u || !t) return { err: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (ที่อยู่ + รหัสผ่าน) — กรอกแล้วกดบันทึกก่อน' };
  let host = ''; try { host = new URL(u).hostname; } catch (e) { return { err: 'ที่อยู่เซิร์ฟเวอร์ไม่ถูกต้อง' }; }
  const b = btoa(unescape(encodeURIComponent(JSON.stringify({ u, t })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const base = /(^|\.)(touktashop\.online|pages\.dev)$/i.test(location.hostname) ? location.origin + '/' : 'https://editor.touktashop.online/';
  return { link: base + '#sk=' + b, lan: SRV_PRIV.test(host) };
}
async function srvCopyStaffLink() {              // -> { ok, lan, err, link }   (the caller shows the result INSIDE the settings dialog: a toast would sit behind the modal)
  const r = srvStaffLink(); if (r.err) return { ok: false, err: r.err };
  let ok = false;
  try { await navigator.clipboard.writeText(r.link); ok = true; } catch (e) { }
  if (!ok) {                                       // older browser / plain http page: copy through a temporary textarea placed inside the open dialog
    try { const host = document.getElementById('dlgSettings') || document.body, ta = document.createElement('textarea'); ta.value = r.link; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; host.appendChild(ta); ta.focus(); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (e) { }
  }
  return { ok, lan: r.lan, link: r.link };
}
async function srvApplyLink() {
  const L = SRV.link; if (!L) return; SRV.link = null;
  let host = ''; try { host = new URL(L.u).host; } catch (e) { return; }
  const cur = srvCfg();
  if (!confirm(T('เชื่อมต่อเซิร์ฟเวอร์ร้านตามลิงก์พนักงานนี้?') + '\n' + host + (cur.url && cur.url.replace(/\/+$/, '') !== L.u && !SRV_SELF ? '\n' + T('(จะแทนที่เซิร์ฟเวอร์เดิม)') : ''))) return;
  try { localStorage.setItem('sk_srv', JSON.stringify({ url: L.u, token: L.t })); } catch (e) { }
  const ok = await srvPing();
  toast(ok ? 'เชื่อมต่อเซิร์ฟเวอร์ร้านแล้ว ✔ กำลังซิงค์โปรเจกต์…' : 'บันทึกแล้ว แต่ติดต่อเซิร์ฟเวอร์ไม่ได้: ' + SRV.err, 6000);
  if (ok) { await srvLoadSizes(); srvSyncAll(); }
}

// v1.50: download with a visible progress bar; if the connection drops it resumes from the byte it reached (server supports Range)
SRV.dl = null; SRV.cancel = false;
function srvDlShow(d) {            // d = { name, i, n, got, total, note } or null to hide
  let el = document.getElementById('srvDl');
  if (!d) { if (el) el.hidden = true; SRV.dl = null; updateSrvBadge(); return; }
  SRV.dl = d; const now = Date.now(); if (!d.force && SRV.dlT && now - SRV.dlT < 200) return; SRV.dlT = now;
  if (!el) {
    el = document.createElement('div'); el.id = 'srvDl';
    el.innerHTML = '<div class="dlt"><span class="lb"></span> <span class="nm" translate="no"></span></div><progress max="100" value="0"></progress><div class="dlm"></div><button class="dlx">ยกเลิก</button>';
    el.querySelector('.dlx').onclick = () => { SRV.cancel = true; };
    document.body.appendChild(el);
  }
  el.hidden = false;
  const pct = d.total ? Math.min(100, d.got / d.total * 100) : 0, mb = x => (x / 1048576).toFixed(x > 1e8 ? 0 : 1);
  const lb = el.querySelector('.lb'), lt = d.pre || (d.light ? 'ดึงสำเนาเบา' : 'ดึงไฟล์'); if (lb.dataset.k !== lt) { lb.dataset.k = lt; lb.textContent = lt; }
  el.querySelector('.nm').textContent = (d.n > 1 ? `(${d.i}/${d.n}) ` : '') + d.name;
  const p = el.querySelector('progress'); if (d.total) { p.max = 100; p.value = pct; } else p.removeAttribute('value');
  const dm = el.querySelector('.dlm'); const dt = d.note ? d.note : d.total ? `${mb(d.got)} / ${mb(d.total)} MB · ${Math.round(pct)}%` : `${mb(d.got)} MB`; if (dm.dataset.k !== dt) { dm.dataset.k = dt; dm.textContent = dt; }
  updateSrvBadge();
}
async function srvDownload(path, onp) {
  const parts = []; let got = 0, total = 0, hdr = null, fails = 0;
  for (;;) {
    if (SRV.cancel) throw new Error('cancelled');
    let r; try { r = await srvFetch(path, got ? { headers: { Range: 'bytes=' + got + '-' } } : {}); } catch (e) { if (++fails > 8) throw e; await sleep(1500 * fails); continue; }
    if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
    if (!hdr) hdr = r.headers;
    if (r.status === 200 && got) { parts.length = 0; got = 0; }                       // server ignored Range -> start over
    total = +r.headers.get('x-size') || (got + (+r.headers.get('content-length') || 0));
    if (!r.body || !r.body.getReader) { parts.push(await r.blob()); got = total = total || 1; onp && onp(got, total); break; }
    const rd = r.body.getReader();
    try { for (;;) { if (SRV.cancel) { try { rd.cancel(); } catch (_) { } throw new Error('cancelled'); } const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onp && onp(got, total); } }
    catch (e) { if (e.message === 'cancelled') throw e; if (++fails > 8) throw e; await sleep(1500 * fails); continue; }
    if (!total || got >= total) break;
    if (++fails > 8) throw new Error('incomplete');
  }
  return { blob: new Blob(parts, { type: hdr.get('content-type') || '' }), headers: hdr };
}

function updateSrvBadge() {
  const b = $('#srvBadge'); if (!b) return;
  if (!srvOn()) { b.hidden = true; return; }
  b.hidden = false; b.classList.toggle('off', !SRV.up);
  b.textContent = SRV.dl ? `☁ ⬇ ${SRV.dl.total ? Math.round(Math.min(100, SRV.dl.got / SRV.dl.total * 100)) + '%' : '…'}` : SRV.prog != null ? `☁ ${SRV.label} ${Math.round(SRV.prog * 100)}%` : SRV.q.length ? `☁ รอส่ง ${SRV.q.length} ไฟล์` : SRV.up ? '☁ เซิร์ฟเวอร์พร้อม' : '☁ ออฟไลน์';
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
let _fmBusy = false;
async function srvFetchMissing(ids) {
  if (!srvOn() || !ids.length || _fmBusy) return 0;
  if (!SRV.up && !(await srvPing())) { toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ' + SRV.err, 6000); return 0; }
  _fmBusy = true; SRV.cancel = false; let n = 0, i = 0, cancelled = false, failed = 0;
  try {
    for (const id of ids) {
      if (SRV.cancel) { cancelled = true; break; }
      i++; const name = mediaNameFromId(id), isVid = /\.(mov|mp4|m4v|webm)$/i.test(id.split('|')[0]), light = isVid && srvLight();
      try {
        srvDlShow({ name, i, n: ids.length, got: 0, total: 0, light, note: 'กำลังเชื่อมต่อ…', force: true });
        if (light) {                         // light 540p copy: phones, or any device that reaches the shop over the internet (v1.50)
          const pf = await srvGetProxy(id, true, (g, t) => srvDlShow({ name, i, n: ids.length, got: g, total: t, light: true }));
          if (pf) { await importFiles([pf], { id, name, proxyOnly: true, quiet: true }); if (MEDIA.has(id)) { n++; continue; } }
        }
        const { blob, headers } = await srvDownload('/media/' + srvId(id), (g, t) => srvDlShow({ name, i, n: ids.length, got: g, total: t, light: false }));
        const fname = decodeURIComponent(headers.get('x-name') || '') || name;
        await importFiles([new File([blob], fname, { type: blob.type })]); if (MEDIA.has(id)) n++; else failed++;
      } catch (e) { if (e.message === 'cancelled') { cancelled = true; break; } failed++; console.warn('srvFetchMissing', e); }
    }
  } finally { _fmBusy = false; srvDlShow(null); SRV.cancel = false; }
  toast(cancelled ? `ยกเลิกแล้ว — โหลดแล้ว ${n} ไฟล์ (กด “ดึงไฟล์จากเซิร์ฟเวอร์” เพื่อโหลดต่อ)` : n ? `โหลดไฟล์จากเซิร์ฟเวอร์แล้ว ${n} ไฟล์` + (failed ? ` · ไม่สำเร็จ ${failed} ไฟล์ (กด “ดึงไฟล์จากเซิร์ฟเวอร์” เพื่อลองใหม่)` : '') : 'ดึงไฟล์ไม่สำเร็จ — ตรวจว่าไฟล์อยู่บนเซิร์ฟเวอร์ และกด “ดึงไฟล์จากเซิร์ฟเวอร์” เพื่อลองใหม่', 6000);
  srvPullUpdate();
  return n;
}
function srvMissingIds() { return [...new Set((D ? D.items : []).filter(i => i.mediaId && !String(i.mediaId).startsWith('__') && !MEDIA.has(i.mediaId)).map(i => i.mediaId))]; }
async function srvPullMissing() {                  // the visible “pull files from server” button + used when a project is opened
  const ids = srvMissingIds(); if (!ids.length) { srvPullUpdate(); return 0; }
  const n = await srvFetchMissing(ids);
  if (typeof renderMediaBin === 'function') { renderMediaBin(); renderTimeline(); window.onFrame && window.onFrame(); }
  return n;
}
function srvPullUpdate() {
  const b = $('#srvPull'); if (!b) return;
  const k = srvOn() && !_fmBusy ? srvMissingIds().length : 0;
  b.hidden = !k; if (k && b._k !== k) { b._k = k; b.textContent = `⬇ ดึงไฟล์จากเซิร์ฟเวอร์ (${k})`; }
}
setInterval(() => { try { srvPullUpdate(); } catch (e) { } }, 3000);
// ----- inbox (v1.30): clips the shop server fetched for us (N8N -> yt-dlp). Pulled into the media list, then moved to inbox/done on the server -----
SRV.inbox = [];
// v1.36: the server keeps every reference clip (inbox + inbox/done), so a 2nd computer pulls the same library.
// Clips this computer already has (same name) or already pulled once (and the user later removed) are skipped.
const refSeenGet = () => { try { return new Set(JSON.parse(localStorage.getItem('sk_refseen') || '[]')); } catch (e) { return new Set(); } };
const refSeenAdd = name => { try { const s = refSeenGet(); s.add(name); localStorage.setItem('sk_refseen', JSON.stringify([...s])); } catch (e) { } };
async function srvInboxList() {
  if (!srvOn()) return null; if (!SRV.up && !(await srvPing())) return null;
  try {
    const r = await srvFetch('/inbox?all=1'); if (!r.ok) return null;
    const have = new Set([...MEDIA.values()].map(m => m.name)), seen = refSeenGet();
    SRV.inbox = (await r.json()).filter(x => /\.(mp4|mov|m4v|webm)$/i.test(x.name) && (!x.done || (!have.has(x.name) && !seen.has(x.name))));
    return SRV.inbox;
  } catch (e) { return null; }
}
let _inboxBusy = false; const _inboxFail = new Set();
async function srvInboxImport(opts) {
  opts = opts || {}; if (_inboxBusy) return 0;
  const list = await srvInboxList(); if (!list) { if (!opts.quiet) toast('เซิร์ฟเวอร์ไม่พร้อม — ตรวจ ⚙ ตั้งค่า', 5000); return 0; }
  if (!list.length) { if (!opts.quiet) toast('กล่องรับว่าง — ยังไม่มีคลิปใหม่', 4000); return 0; }
  _inboxBusy = true; let n = 0, i = 0;
  try {
    for (const f of list) {
      if (_inboxFail.has(f.name)) continue;
      i++; if (!opts.silent) toast(`กำลังดึงคลิปจากกล่องรับ (${i}/${list.length}) ${f.name}`, 60000);
      try {
        const r = await srvFetch('/inbox/' + srvId(f.name)); if (!r.ok) continue;
        const blob = await r.blob(); const file = new File([blob], f.name, { type: blob.type || 'video/mp4' });
        await importFiles([file], { quiet: true, ref: true });
        if ([...MEDIA.values()].some(m => m.name === f.name)) { refSeenAdd(f.name); if (!f.done) await srvFetch('/inbox/' + srvId(f.name), { method: 'DELETE' }); n++; }
      } catch (e) { console.warn('srvInboxImport', e); _inboxFail.add(f.name); }
    }
  } finally { _inboxBusy = false; }
  if (!opts.silent || n) toast(n ? `ดึงคลิปเข้ามาแล้ว ${n} คลิป (อยู่ในคลังอ้างอิงที่หน้าโปรเจกต์)` : 'ดึงคลิปจากกล่องรับไม่สำเร็จ', 5000); if (n && HOME.open) renderHome();
  if (n && typeof renderRefLib === 'function') renderRefLib();
  return n;
}
async function srvInboxAuto() {         // on start-up: desktop pulls new clips by itself, phones only get a hint (mobile data / small screen)
  const list = await srvInboxList(); if (!list || !list.length) return;
  if (IS_PHONE()) { toast(`มีคลิปใหม่ ${list.length} คลิปรอในกล่องรับ — เปิด 🔬 วิเคราะห์ เพื่อดึงเข้า`, 8000); return; }
  await srvInboxImport({ quiet: true });
}
// v1.34: while the editor stays open on a desktop, check the server inbox every minute and pull new reference clips in by itself (no button needed)
let _inboxTimer = null;
function srvInboxWatch() {
  if (_inboxTimer || IS_PHONE()) return;
  _inboxTimer = setInterval(async () => {
    if (document.hidden || _inboxBusy || !srvOn()) return;
    const l = await srvInboxList(); if (l && l.length) await srvInboxImport({ quiet: true, silent: true });
  }, 60000);
}
// ----- proxy copies (v1.19): light 540p copies made by the shop server, used for preview on phones -----
const IS_PHONE = () => matchMedia('(max-width:820px)').matches || matchMedia('(pointer:coarse)').matches;
SRV.px = { ready: new Set(), pending: new Set(), ffmpeg: null, note: '' };
async function srvLoadProxies() {
  try { const r = await srvFetch('/proxies'); if (!r.ok) return false; const j = await r.json(); SRV.px = { ready: new Set(j.ready), pending: new Set(j.pending), ffmpeg: j.ffmpeg, note: j.note || '' }; return true; } catch (e) { return false; }
}
async function srvGetProxy(id, wait, onp) {            // -> File (mp4) or null. wait=true: wait (up to 4 min) while the server is still building it. onp(got,total) = download progress (v1.50)
  if (!srvOn()) return null; if (!SRV.up && !(await srvPing())) return null;
  const t0 = Date.now();
  for (;;) {
    if (SRV.cancel) return null;
    if (!await srvLoadProxies()) return null;
    if (SRV.px.ready.has(id)) break;
    if (!wait || !SRV.px.ffmpeg || !SRV.px.pending.has(id) || Date.now() - t0 > 240000) return null;
    if (SRV.dl) srvDlShow(Object.assign({}, SRV.dl, { note: 'เซิร์ฟเวอร์กำลังสร้างสำเนาเบา (ครั้งเดียว) …', force: true })); else toast('เซิร์ฟเวอร์กำลังสร้างสำเนาเบาของ ' + mediaNameFromId(id) + ' (ครั้งเดียว) …', 8000);
    await sleep(4000);
  }
  try { const { blob } = await srvDownload('/media/' + srvId(id) + '?proxy=1', onp); return new File([blob], mediaNameFromId(id).replace(/\.[^.]+$/, '') + '.proxy.mp4', { type: 'video/mp4' }); } catch (e) { if (e.message === 'cancelled') SRV.cancel = true; return null; }
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
      try { SRV.cancel = false; const { blob: b } = await srvDownload('/media/' + srvId(id), (g, t) => srvDlShow({ name: m.name, pre: 'ดึงไฟล์ต้นฉบับสำหรับส่งออก', i: 1, n: 1, got: g, total: t })); const old = m.url, nu = URL.createObjectURL(b); m.url = nu; back.push(() => { m.url = old; URL.revokeObjectURL(nu); }); }
      catch (e) { toast('ดึงไฟล์ต้นฉบับ ' + m.name + ' ไม่ได้ — ส่งออกจากสำเนาเบา (ความละเอียดต่ำกว่า)', 7000); }
      finally { srvDlShow(null); SRV.cancel = false; }
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
