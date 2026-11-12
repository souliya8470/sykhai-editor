// ============================================================
//  Persistent media store (IndexedDB) — keeps imported files across reloads
// ============================================================
function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('sykhai-editor', 1); r.onupgradeneeded = () => r.result.createObjectStore('media', { keyPath: 'id' });
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
