// ============================================================
//  Home file server (v1.04) — stores projects, source media and finished videos on the
//  shop server's disk. Talks to server/server.js. No polling: syncs only when saving,
//  opening a project, exporting, or when you press the Home "sync" button.
// ============================================================
const SRV = { up: false, sizes: new Map(), q: [], busy: false, prog: null, label: '', err: '', info: null };
const srvCfg = () => { try { return JSON.parse(localStorage.getItem('sk_srv') || '{}'); } catch (e) { return {}; } };
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
  for (const id of ids) { const m = MEDIA.get(id); if (m && m.file && !m.builtin && !m.hidden && SRV.sizes.get(id) !== m.file.size && !SRV.q.includes(id)) SRV.q.push(id); }
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
      const r = await srvFetch('/media/' + srvId(id)); if (!r.ok) continue;
      const name = decodeURIComponent(r.headers.get('x-name') || '') || mediaNameFromId(id); const blob = await r.blob();
      await importFiles([new File([blob], name, { type: blob.type })]); if (MEDIA.has(id)) n++;
    } catch (e) { console.warn('srvFetchMissing', e); }
  }
  toast(n ? `โหลดไฟล์จากเซิร์ฟเวอร์แล้ว ${n} ไฟล์` : 'ไม่พบไฟล์บนเซิร์ฟเวอร์', 4000);
  return n;
}
async function srvPushOut(blob, name) {
  if (!srvOn()) return;
  try { SRV.label = 'วิดีโอ'; SRV.prog = 0; updateSrvBadge(); await xhrPut('/out/' + srvId(name), blob, { 'x-type': blob.type }, p => { SRV.prog = p; updateSrvBadge(); }); toast('เก็บวิดีโอที่ตัดเสร็จไว้ในเซิร์ฟเวอร์แล้ว: ' + name, 5000); }
  catch (e) { toast('ส่งวิดีโอขึ้นเซิร์ฟเวอร์ไม่สำเร็จ (ไฟล์ยังโหลดลงเครื่องแล้ว)', 5000); }
  SRV.prog = null; updateSrvBadge();
}
