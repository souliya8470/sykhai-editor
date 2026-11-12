// ============================================================
//  Home page — project list (like CapCut home)
// ============================================================
const fmtDate = ts => { try { return new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
const fmtDur = t => { t = Math.round(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

async function showHome() {
  pause(); if (typeof srcExit === 'function') srcExit(); await projSaveNow();
  HOME.open = true; $('#home').hidden = false;
  $('#hmBack').hidden = !HOME.started; $('#hmSync').hidden = !srvOn();
  await renderHome();
}
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
      <div class="pname" title="${esc(r.name)}">${esc(r.name)}</div>
      <div class="pmeta">${fmtDate(r.updated)} · ${r.n} คลิป${miss ? ` <span class="pwarn" title="ไฟล์วิดีโอในเครื่องนี้หาย ต้องนำเข้าใหม่">⚠ ไฟล์หาย ${miss}</span>` : ''}</div>
      <div class="pact"><button data-a="rename" title="เปลี่ยนชื่อ">✎</button><button data-a="dup" title="ทำสำเนา">⧉</button><button data-a="del" class="danger" title="ลบ">🗑</button></div>
    </div>`;
  }).join('');
  try {
    const e = await navigator.storage.estimate();
    const sv = SRV.info && SRV.info.free != null ? ` · เซิร์ฟเวอร์ว่าง ${(SRV.info.free / 1e9).toFixed(0)} GB` : '';
    $('#homeFoot').textContent = `พื้นที่ในเครื่องนี้ที่ใช้ไป ${(e.usage / 1e9).toFixed(2)} GB จาก ${(e.quota / 1e9).toFixed(0)} GB · ${list.length} โปรเจกต์ · โปรเจกต์ถูกบันทึกอัตโนมัติทุกครั้งที่แก้ไข${sv}`;
  } catch (e) { $('#homeFoot').textContent = list.length + ' โปรเจกต์ · บันทึกอัตโนมัติ'; }
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
  if (missIds.length && srvOn()) { await srvFetchMissing(missIds); renderMediaBin(); renderTimeline(); window.onFrame(); }
  const still = [...new Set(D.items.filter(i => i.mediaId && !MEDIA.has(i.mediaId)).map(i => mediaNameFromId(i.mediaId)))];
  if (still.length) toast('ไฟล์เหล่านี้หายจากเครื่องนี้ ต้องนำเข้าใหม่: ' + still.join(', '), 7000);
  else srvQueueMedia([...new Set(D.items.map(i => i.mediaId).filter(Boolean))]);
}
async function homeAction(id, a) {
  const rec = await projGet(id); if (!rec) return renderHome();
  if (a === 'rename') {
    const n = prompt('ชื่อโปรเจกต์', rec.name); if (n == null || !n.trim()) return;
    const doc = JSON.parse(rec.doc); doc.name = n.trim(); rec.doc = JSON.stringify(doc); rec.name = doc.name; rec.updated = Date.now(); await projPut(rec); srvPushProject(rec);
  } else if (a === 'dup') {
    const doc = JSON.parse(rec.doc); doc.pid = uid(); doc.created = Date.now(); doc.name = rec.name + ' (สำเนา)';
    const r2 = Object.assign({}, rec, { id: doc.pid, name: doc.name, doc: JSON.stringify(doc), created: doc.created, updated: Date.now() }); await projPut(r2); srvPushProject(r2);
  } else if (a === 'del') {
    if (!confirm(`ลบโปรเจกต์ “${rec.name}” ?\n(ไฟล์วิดีโอที่นำเข้าไว้ไม่ถูกลบ)`)) return;
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
  $('#homeList').addEventListener('click', e => {
    const c = e.target.closest('.pcard'); if (!c) return; const b = e.target.closest('button[data-a]');
    if (b) { e.stopPropagation(); homeAction(c.dataset.id, b.dataset.a); } else openById(c.dataset.id);
  });
}
