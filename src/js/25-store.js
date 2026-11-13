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
    const db = await dbOpen(); const rec = { id: m.id, name: m.name, type: m.type, file: m.file, duration: m.duration, w: m.w, h: m.h, thumb: m.thumb, hasAudio: m.hasAudio, peaks: m.peaks, pcm16: m.pcm16, rms: m.rms, norm: m.norm, proxyOnly: m.proxyOnly || false, pfile: m.pfile || null, ref: !!m.ref, tv: m.tv || 0, savedAt: Date.now() };
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
    const m = Object.assign({}, r, { url: URL.createObjectURL(r.file) }); if (r.pfile) m.purl = URL.createObjectURL(r.pfile);
    if (r.type === 'image') { const img = new Image(); img.src = m.url; try { await img.decode(); } catch (e) { } m.img = img; }
    MEDIA.set(m.id, m); n++;
  }
  return n;
}
// v1.31: reference clips (TikTok ids as file names) live in the Home "reference library", not in the project media bin
const REF_NAME = /^\d{17,20}\.(mp4|mov|m4v|webm)$/i;
function migrateRefs() { let n = 0; MEDIA.forEach(m => { if (!m.ref && !m.builtin && m.type === 'video' && REF_NAME.test(m.name || '')) { m.ref = true; dbPut(m); n++; } }); return n; }
// v1.31: thumbnails were 160 px / q.7 (blurry when shown larger) — rebuild old ones at 360 px / q.85 in the background, one at a time
let _thumbBusy = false;
async function upgradeThumbs() {
  if (_thumbBusy) return; _thumbBusy = true; let n = 0;
  try {
    for (const m of [...MEDIA.values()]) {
      if (m.tv === 2 || m.builtin || m.hidden || m.type === 'audio' || !m.url) continue;
      try {
        if (m.type === 'image') { const img = m.img || new Image(); if (!m.img) { img.src = m.url; await img.decode(); } m.thumb = thumbFrom(img, img.naturalWidth, img.naturalHeight); }
        else {
          const el = document.createElement('video'); el.preload = 'auto'; el.muted = true; el.src = m.url;
          await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('load')); setTimeout(() => rej(new Error('timeout')), 15000); });
          await seekTo(el, Math.min(0.3, (el.duration || 1) / 3)); const t = thumbFrom(el, el.videoWidth, el.videoHeight); if (t) m.thumb = t;
          el.removeAttribute('src'); el.load();
        }
        m.tv = 2; await dbPut(m); n++; if (n % 4 === 0) { renderMediaBin(); if (HOME.open) renderHome(); }
      } catch (e) { m.tv = 2; }
      await sleep(150);
    }
  } finally { _thumbBusy = false; }
  if (n) { renderMediaBin(); if (HOME.open) renderHome(); }
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
