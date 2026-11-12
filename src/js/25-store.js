// ============================================================
//  Persistent media store (IndexedDB) — keeps imported files across reloads
// ============================================================
function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('sykhai-editor', 2); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' }); if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbPut(m) {
  try {
    const db = await dbOpen(); const rec = { id: m.id, name: m.name, type: m.type, file: m.file, duration: m.duration, w: m.w, h: m.h, thumb: m.thumb, hasAudio: m.hasAudio, peaks: m.peaks, pcm16: m.pcm16, rms: m.rms, norm: m.norm, savedAt: Date.now() };
    await new Promise((res, rej) => { const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    db.close(); return true;
  } catch (e) { console.warn('dbPut', e); toast('บันทึกไฟล์ไว้ในเครื่องไม่ได้ (พื้นที่เต็ม?) — เปิดใหม่ต้องนำเข้าไฟล์อีกครั้ง', 5000); return false; }
}
async function dbDel(id) { try { const db = await dbOpen(); await new Promise(res => { const tx = db.transaction('media', 'readwrite'); tx.objectStore('media').delete(id); tx.oncomplete = res; tx.onerror = res; }); db.close(); } catch (e) { } }
async function dbAll() {
  try { const db = await dbOpen(); const all = await new Promise((res, rej) => { const q = db.transaction('media').objectStore('media').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); return all; }
  catch (e) { console.warn('dbAll', e); return []; }
}
async function restoreMedia() {
  const all = await dbAll(); let n = 0;
  for (const r of all) {
    if (MEDIA.has(r.id) || !r.file) continue;
    const m = Object.assign({}, r, { url: URL.createObjectURL(r.file) });
    if (r.type === 'image') { const img = new Image(); img.src = m.url; try { await img.decode(); } catch (e) { } m.img = img; }
    MEDIA.set(m.id, m); n++;
  }
  return n;
}
function mediaNameFromId(id) { return String(id || '').split('|')[0] || '?'; }


// ============================================================
//  Projects store (IndexedDB 'projects') — per-project autosave for the Home page
// ============================================================
const HOME = { open: true, started: false };
const PS = { timer: 0, known: new Set() };
async function idbTx(store, mode, fn) {
  const db = await dbOpen();
  try {
    return await new Promise((res, rej) => {
      const t = db.transaction(store, mode); let out; const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { out = rq.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  } finally { db.close(); }
}
const projPut = async rec => { try { await idbTx('projects', 'readwrite', s => s.put(rec)); PS.known.add(rec.id); return true; } catch (e) { console.warn('projPut', e); return false; } };
const projGet = async id => { try { return await idbTx('projects', 'readonly', s => s.get(id)); } catch (e) { return null; } };
const projAll = async () => { try { return (await idbTx('projects', 'readonly', s => s.getAll())) || []; } catch (e) { return []; } };
const projDel = async id => { try { await idbTx('projects', 'readwrite', s => s.delete(id)); PS.known.delete(id); } catch (e) { } };
const mediaKeys = async () => { try { return (await idbTx('media', 'readonly', s => s.getAllKeys())) || []; } catch (e) { return []; } };

function projThumb(doc) {
  const vis = (doc.items || []).filter(i => i.mediaId && (i.type === 'video' || i.type === 'image')).sort((a, b) => a.start - b.start);
  for (const it of vis) { const m = MEDIA.get(it.mediaId); if (m && m.thumb) return m.thumb; }
  if (doc === D && !HOME.open && PCANVAS) { try { const c = document.createElement('canvas'); c.width = 90; c.height = 160; c.getContext('2d').drawImage(PCANVAS, 0, 0, 90, 160); return c.toDataURL('image/jpeg', .6); } catch (e) { } }
  return '';
}
function projRec(doc) {
  const items = doc.items || [];
  return {
    id: doc.pid, name: doc.name || 'โปรเจกต์', doc: JSON.stringify(doc), thumb: projThumb(doc), n: items.length,
    dur: items.reduce((m, i) => Math.max(m, i.start + i.dur), 0),
    mids: [...new Set(items.map(i => i.mediaId).filter(x => x && !String(x).startsWith('sfx-')))],
    created: doc.created || Date.now(), updated: Date.now(),
  };
}
async function projSaveNow() {
  clearTimeout(PS.timer); PS.timer = 0;
  if (!D || !D.pid || HOME.open) return;
  if (!D.items.length && !PS.known.has(D.pid)) return;
  const rec = projRec(D); const ok = await projPut(rec); if (ok && typeof srvSync === 'function') srvSync(rec); return ok;
}
function projSaveSoon() { clearTimeout(PS.timer); PS.timer = setTimeout(projSaveNow, 700); }
on('doc', l => { if (l && l !== 'init' && l !== 'open') projSaveSoon(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') projSaveNow(); });
window.addEventListener('pagehide', () => { projSaveNow(); });
