// ============================================================
//  Home page — project list (like CapCut home)
// ============================================================
const fmtDate = ts => { try { return new Date(ts).toLocaleString({ lo: 'lo-LA', en: 'en-GB', th: 'th-TH' }[UI] || 'th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const fmtDur = t => { t = Math.round(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

async function showHome() {
  pause(); if (typeof srcExit === 'function') srcExit(); await projSaveNow();
  HOME.open = true; $('#home').hidden = false; setRefPage(false);
  $('#hmBack').hidden = !HOME.started; $('#hmSync').hidden = !srvOn();
  await renderHome();
}
// live status of the server-side TikTok downloader, shown on the library page (refreshed every 8 s while the page is open)
let _refStatT = null;
async function refStatus() {
  const el = $('#refStat'); if (!el) return;
  if (!HOME.ref || !srvOn()) { el.hidden = true; return; }
  try {
    const r = await srvFetch('/fetch'); if (!r.ok) throw 0; const j = await r.json();
    const parts = [];
    parts.push(j.running ? T('⏬ เซิร์ฟเวอร์กำลังโหลด') + ' …' + String(j.running).slice(-6) : T('เซิร์ฟเวอร์ไม่ได้โหลดอยู่ตอนนี้'));
    if (j.queued) parts.push(T('รอคิว') + ' ' + j.queued);
    parts.push(T('รอดึงเข้าโปรแกรม') + ' ' + j.inbox);
    parts.push(T('โหลดแล้วทั้งหมด') + ' ' + j.fetched);
    el.textContent = parts.join(' · '); el.hidden = false;
  } catch (e) { el.textContent = T('เช็กสถานะเซิร์ฟเวอร์ไม่ได้'); el.hidden = false; }
}
function setRefPage(on) { HOME.ref = !!on; clearInterval(_refStatT); if (on) { refStatus(); _refStatT = setInterval(refStatus, 8000); } else { const e = $('#refStat'); if (e) e.hidden = true; } $('#homeMain').hidden = !!on; $('#refPage').hidden = !on; if (on) { const q = $('#refQ'); if (q) q.value = ''; } renderRefLib(); const w = $('#home'); if (w) w.scrollTop = 0; }
function hideHome() { HOME.open = false; $('#home').hidden = true; HOME.started = true; }

async function renderHome() {
  const [list, keys] = await Promise.all([projAll(), mediaKeys()]);
  const have = new Set(keys); MEDIA.forEach((m, id) => have.add(id));
  list.forEach(r => PS.known.add(r.id));
  list.sort((a, b) => b.updated - a.updated);
  const box = $('#homeList');
  if (!list.length) { box.innerHTML = '<div class="hempty">ยังไม่มีโปรเจกต์ — กด “+ โปรเจกต์ใหม่” เพื่อเริ่มตัดต่อ</div>'; }
  else box.innerHTML = list.map(r => {
    const miss = (r.mids || []).filter(id => !have.has(id)).length;
    return `<div class="pcard" data-id="${esc(r.id)}">
      <div class="pthumb" style="${r.thumb ? `background-image:url(${r.thumb})` : ''}">${r.thumb ? '' : '<span class="pnone">🎬</span>'}<span class="pdur">${fmtDur(r.dur)}</span></div>
      <div class="pname" translate="no" title="${esc(r.name)}">${esc(r.name)}</div>
      <div class="pmeta">${fmtDate(r.updated)} · ${r.n} คลิป${miss ? ` <span class="pwarn" title="ไฟล์วิดีโอในเครื่องนี้หาย ต้องนำเข้าใหม่">⚠ ไฟล์หาย ${miss}</span>` : ''}</div>
      <div class="pact"><button data-a="rename" title="เปลี่ยนชื่อ">✎</button><button data-a="dup" title="ทำสำเนา">⧉</button><button data-a="del" class="danger" title="ลบ">🗑</button></div>
    </div>`;
  }).join('');
  renderRefLib();
  try {
    const e = await navigator.storage.estimate();
    const sv = SRV.info && SRV.info.free != null ? ` · เซิร์ฟเวอร์ว่าง ${(SRV.info.free / 1e9).toFixed(0)} GB` : '';
    $('#homeFoot').textContent = `พื้นที่ในเครื่องนี้ที่ใช้ไป ${(e.usage / 1e9).toFixed(2)} GB จาก ${(e.quota / 1e9).toFixed(0)} GB · ${list.length} โปรเจกต์ · โปรเจกต์ถูกบันทึกอัตโนมัติทุกครั้งที่แก้ไข${sv}`;
  } catch (e) { $('#homeFoot').textContent = list.length + ' โปรเจกต์ · บันทึกอัตโนมัติ'; }
}

function renderRefLib() {
  const box = $('#refList'); if (!box) return;
  const all = [...MEDIA.values()].filter(m => m.ref && m.type === 'video').sort((a, b) => (a.name < b.name ? -1 : 1));
  const hn = $('#hmRefN'); if (hn) hn.textContent = all.length;
  if (!HOME.ref) return;                       // library page is closed — only the count on the Home button matters
  const q = ($('#refQ') ? $('#refQ').value : '').trim().toLowerCase();
  const labelOf = m => { const key = typeof anMatch === 'function' ? anMatch(m) : null, r = key && typeof anRefOf === 'function' ? anRefOf(key) : null; return r ? ((r.creator || '') + ' ' + (r.topic_note || '')).trim() : m.name; };
  const refs = q ? all.filter(m => (m.name + ' ' + labelOf(m)).toLowerCase().includes(q)) : all;
  if (!refs.length) { box.innerHTML = '<div class="hempty small">ยังไม่มีคลิปอ้างอิง — กด “ดึงคลิปจากกล่องรับของเซิร์ฟเวอร์” หรือ “+ เพิ่มคลิปอ้างอิง”</div>'; return; }
  box.innerHTML = refs.map(m => {
    const key = typeof anMatch === 'function' ? anMatch(m) : null, r = key && typeof anRefOf === 'function' ? anRefOf(key) : null, done = typeof REFAN !== 'undefined' && REFAN.res[key || 'name:' + m.name];
    const label = r ? ((r.creator || '') + ' ' + (r.topic_note || '')).trim() : m.name;
    const tag = r && r.language ? ({ thai: 'ไทย', lao: 'ລາວ' }[r.language] || '') : '';
    return `<div class="pcard rcard" data-id="${esc(m.id)}">
      <div class="pthumb" style="${m.thumb ? `background-image:url(${m.thumb})` : ''}"><span class="pdur">${fmtDur(m.duration)}</span>${done ? '<span class="rdone" title="วิเคราะห์แล้ว">✔</span>' : ''}${tag ? `<span class="rlang">${tag}</span>` : ''}</div>
      <div class="pname" translate="no" title="${esc(m.name)}">${esc(label)}</div>
      <div class="pact"><button data-a="refdel" class="danger" title="ลบออกจากคลัง">✕</button></div>
    </div>`;
  }).join('');
}
function resetDoc(doc) {
  D = doc; SEL = null; HIST = []; HPOS = -1; PB.t = 0;
  commit('open'); emit('sel'); renderMediaBin && renderMediaBin(); renderInspector && renderInspector(); seek(0);
}
async function newProject() {
  pause(); await projSaveNow();
  resetDoc(newDoc()); hideHome();
}
async function openById(id) {
  const rec = await projGet(id); if (!rec) { toast('ไม่พบโปรเจกต์'); return renderHome(); }
  pause(); await projSaveNow();
  let doc; try { doc = Object.assign(newDoc(), JSON.parse(rec.doc)); } catch (e) { toast('ไฟล์โปรเจกต์เสียหาย'); return; }
  doc.pid = rec.id; doc.created = doc.created || rec.created;
  D = doc; await ensureSfx();
  resetDoc(D); hideHome();
  const miss = [...new Set(D.items.filter(i => i.mediaId && !MEDIA.has(i.mediaId)).map(i => mediaNameFromId(i.mediaId)))];
  const missIds = [...new Set(D.items.filter(i => i.mediaId && !MEDIA.has(i.mediaId)).map(i => i.mediaId))];
  if (missIds.length && srvOn()) await srvPullMissing();
  const still = [...new Set(D.items.filter(i => i.mediaId && !MEDIA.has(i.mediaId)).map(i => mediaNameFromId(i.mediaId)))];
  if (still.length) toast('ไฟล์เหล่านี้หายจากเครื่องนี้ ต้องนำเข้าใหม่: ' + still.join(', '), 7000);
  else { srvQueueMedia([...new Set(D.items.map(i => i.mediaId).filter(Boolean))]); srvAdoptProxies(); }
}
async function homeAction(id, a) {
  const rec = await projGet(id); if (!rec) return renderHome();
  if (a === 'rename') {
    const n = prompt(T('ชื่อโปรเจกต์'), rec.name); if (n == null || !n.trim()) return;
    const doc = JSON.parse(rec.doc); doc.name = n.trim(); rec.doc = JSON.stringify(doc); rec.name = doc.name; rec.updated = Date.now(); await projPut(rec); srvPushProject(rec);
  } else if (a === 'dup') {
    const doc = JSON.parse(rec.doc); doc.pid = uid(); doc.created = Date.now(); doc.name = rec.name + T(' (สำเนา)');
    const r2 = Object.assign({}, rec, { id: doc.pid, name: doc.name, doc: JSON.stringify(doc), created: doc.created, updated: Date.now() }); await projPut(r2); srvPushProject(r2);
  } else if (a === 'del') {
    if (!confirm(T('ลบโปรเจกต์ “') + rec.name + T('” ?\n(ไฟล์วิดีโอที่นำเข้าไว้ไม่ถูกลบ)'))) return;
    await projDel(id); srvDeleteProject(id);
    if (D && D.pid === id) { D = newDoc(); SEL = null; HIST = []; HPOS = -1; commit('init'); emit('sel'); HOME.started = false; }
  }
  renderHome();
}
function initHome() {
  $('#hmNew').onclick = newProject;
  $('#hmBack').onclick = hideHome; $('#hmSync').onclick = srvSyncAll;
  $('#btnHome').onclick = showHome;
  $('#hmImport').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { if (i.files[0]) { const ok = await openProject(i.files[0]); if (ok) hideHome(); } }; i.click(); };
  $('#hmRefInbox').onclick = async () => { await srvInboxImport(); renderHome(); };
  $('#hmRefAdd').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*,.mov,.mp4'; i.multiple = true; i.onchange = async () => { if (i.files.length) { await importFiles(i.files, { ref: true }); renderHome(); } }; i.click(); };
  $('#hmRefAn').onclick = () => anUI();
  $('#hmRefOpen').onclick = () => setRefPage(true); $('#hmRefBack').onclick = () => setRefPage(false);
  $('#refQ').oninput = () => renderRefLib();
  $('#refList').addEventListener('click', e => {
    const c = e.target.closest('.rcard'); if (!c) return; const m = MEDIA.get(c.dataset.id); if (!m) return;
    if (e.target.closest('[data-a="refdel"]')) {
      if (!confirm(T('ลบคลิปนี้ออกจากคลังอ้างอิง?') + '\n' + m.name)) return;
      MEDIA.delete(m.id); dbDel(m.id); try { URL.revokeObjectURL(m.url); } catch (_) { } renderRefLib(); return;
    }
    window.open(m.url, '_blank');
  });
  $('#homeList').addEventListener('click', e => {
    const c = e.target.closest('.pcard'); if (!c) return; const b = e.target.closest('button[data-a]');
    if (b) { e.stopPropagation(); homeAction(c.dataset.id, b.dataset.a); } else openById(c.dataset.id);
  });
}
