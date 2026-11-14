// ============================================================
//  v1.48 — permanent transcript cache. Every transcript is kept (IndexedDB, separate DB "sykhai-tr") under the clip's
//  file name + size + length, so the same video is NEVER sent to Gemini twice — in any project, after a reload.
//  Can also be exported / imported as "<video name>.transcript.json".
// ============================================================
const TRC = new Map();      // key -> { key, name, size, duration, savedAt, tr: { 'lo:gemini': {...}, 'th:whisper': {...} } }
const TRC_SAVED = new WeakSet();
function trKey(m) { return m && !m.builtin && m.file ? [m.name, m.file.size, (m.duration || 0).toFixed(1)].join('|') : null; }
function trVar(lang, engine) { return lang + ':' + (lang === 'lo' ? 'gemini' : (engine || 'gemini')); }
function trcDb() { return new Promise((res, rej) => { const r = indexedDB.open('sykhai-tr', 1); r.onupgradeneeded = () => r.result.createObjectStore('tr', { keyPath: 'key' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function trcLoad() {
  try { const db = await trcDb(); const all = await new Promise((res, rej) => { const q = db.transaction('tr').objectStore('tr').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); all.forEach(r => TRC.set(r.key, r)); }
  catch (e) { console.warn('trcLoad', e); }
}
async function trcPut(rec) {
  try { const db = await trcDb(); await new Promise((res, rej) => { const tx = db.transaction('tr', 'readwrite'); tx.objectStore('tr').put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); db.close(); }
  catch (e) { console.warn('trcPut', e); }
}
async function trcDel(key) {
  TRC.delete(key); try { if (SRV.up) srvFetch('/tr/' + encodeURIComponent(key), { method: 'DELETE' }).catch(() => { }); } catch (e) { }
  try { const db = await trcDb(); await new Promise(res => { const tx = db.transaction('tr', 'readwrite'); tx.objectStore('tr').delete(key); tx.oncomplete = res; tx.onerror = res; }); db.close(); } catch (e) { }
}
function trcRec(m) {      // exact key first; otherwise same file name + (almost) same length, e.g. a re-saved copy
  const k = trKey(m); if (!k) return null; if (TRC.has(k)) return TRC.get(k);
  for (const r of TRC.values()) if (r.name === m.name && Math.abs((r.duration || 0) - (m.duration || 0)) < .3) return r;
  return null;
}
function trcSave(m, tr) {
  const k = trKey(m); if (!k || !tr || !tr.segs) return; let rec = TRC.get(k);
  if (!rec) { rec = { key: k, name: m.name, size: m.file.size, duration: m.duration, tr: {} }; TRC.set(k, rec); }
  rec.tr[trVar(tr.lang, tr.engine)] = tr; rec.savedAt = Date.now(); TRC_SAVED.add(tr); trcPut(rec); trcPush(rec);
}
function trcFind(m, lang, engine) { const r = trcRec(m); return r && r.tr[trVar(lang, engine)] || null; }
function trcAny(m, lang) { const r = trcRec(m); if (!r) return null; const ks = Object.keys(r.tr); const k = ks.find(x => x.startsWith(lang + ':')) || ks[0]; return k ? r.tr[k] : null; }
function trcFileName(rec) { return String(rec.name || 'clip').replace(/\.[^.]+$/, '') + '.transcript.json'; }
function trcDownload(rec) {
  const blob = new Blob([JSON.stringify({ sykhaiTranscript: 1, name: rec.name, size: rec.size, duration: rec.duration, savedAt: rec.savedAt, tr: rec.tr })], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = trcFileName(rec); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function trcImport(files) {
  let n = 0;
  for (const f of files) {
    try {
      const j = JSON.parse(await f.text()); const list = Array.isArray(j) ? j : [j];
      for (const r of list) { if (!r || !r.sykhaiTranscript || !r.tr || !r.name) continue; const key = [r.name, r.size, (r.duration || 0).toFixed(1)].join('|'); const rec = { key, name: r.name, size: r.size, duration: r.duration, savedAt: r.savedAt || Date.now(), tr: r.tr }; TRC.set(key, rec); await trcPut(rec); n++; }
    } catch (e) { console.warn('trcImport', e); }
  }
  return n;
}

// ---------- v1.56: shared copy on the shop server ----------
//  A transcript is saved in this browser AND on the shop server (<SykhaiEditor>/transcripts). When any other computer / phone opens the same clip
//  (same name + size + length) it takes the text from the server instead of sending the video to Gemini again. Works only while the server is reachable;
//  otherwise everything keeps working from this browser and syncs the next time the server is reachable.
const TRS = { busy: null, at: 0, last: null };
async function trcPush(rec) {
  try {
    if (!rec || !srvOn() || !SRV.up) return false;
    const r = await srvFetch('/tr/' + encodeURIComponent(rec.key), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: rec.key, name: rec.name, size: rec.size, duration: rec.duration, savedAt: rec.savedAt, tr: rec.tr }) });
    return r.ok;
  } catch (e) { return false; }
}
async function trcSyncRun() {
  const res = { pulled: 0, pushed: 0, ok: false };
  if (!srvOn()) return res; if (!SRV.up && !(await srvPing())) return res;
  const r = await srvFetch('/tr'); if (!r.ok) return res; const list = await r.json(); if (!Array.isArray(list)) return res;
  const remote = new Map(list.map(x => [x.key, x]));
  for (const x of list) {            // server -> here: records or variants this browser does not have yet
    const loc = TRC.get(x.key); const have = loc ? Object.keys(loc.tr) : [];
    if (!(x.v || []).some(v => !have.includes(v))) continue;
    try {
      const rr = await srvFetch('/tr/' + encodeURIComponent(x.key)); if (!rr.ok) continue; const rec = await rr.json(); if (!rec || !rec.key || !rec.tr) continue;
      let cur = TRC.get(rec.key); if (!cur) { cur = { key: rec.key, name: rec.name, size: rec.size, duration: rec.duration, savedAt: rec.savedAt || Date.now(), tr: {} }; TRC.set(cur.key, cur); }
      for (const [k, v] of Object.entries(rec.tr)) if (!cur.tr[k] && v && v.segs) { cur.tr[k] = v; TRC_SAVED.add(v); }
      cur.savedAt = Math.max(cur.savedAt || 0, rec.savedAt || 0); await trcPut(cur); res.pulled++;
    } catch (e) { console.warn('trc pull', e); }
  }
  for (const rec of [...TRC.values()]) {   // here -> server: records the server has never seen
    const rv = remote.get(rec.key); const rvv = rv ? rv.v || [] : [];
    if (Object.keys(rec.tr).some(k => !rvv.includes(k))) { if (await trcPush(rec)) res.pushed++; }
  }
  res.ok = true; return res;
}
function trcSync(force) {   // one run at a time; at most every 45 s unless forced
  if (TRS.busy) return TRS.busy; if (!force && Date.now() - TRS.at < 45000) return Promise.resolve(TRS.last || { pulled: 0, pushed: 0, ok: false });
  TRS.busy = trcSyncRun().catch(e => { console.warn('trcSync', e); return { pulled: 0, pushed: 0, ok: false }; }).then(r => { TRS.busy = null; TRS.at = Date.now(); TRS.last = r; return r; }); return TRS.busy;
}
const trcSyncQuick = () => Promise.race([trcSync(false), new Promise(res => setTimeout(() => res(null), 6000))]);   // never makes the person wait long
function trcUI() {
  const rows = () => [...TRC.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const body = () => rows().length ? `<table class="aitbl">${rows().map((r, i) => `<tr><td translate="no">${escN(r.name)}</td><td>${Object.entries(r.tr).map(([k, v]) => `${k.split(':')[0].toUpperCase()} ${v.segs.length}`).join(' · ')}</td><td>${r.savedAt ? new Date(r.savedAt).toLocaleDateString() : ''}</td><td><button data-dl="${i}" title="ดาวน์โหลดไฟล์ข้อความ">⬇</button> <button data-rm="${i}" title="ลบข้อความนี้">🗑</button></td></tr>`).join('')}</table>` : `<div class="hint">ยังไม่มีข้อความที่ถอดเก็บไว้</div>`;
  aiDlg('ข้อความที่ถอดเก็บไว้', `<div class="hint">เก็บอัตโนมัติตามชื่อไฟล์วิดีโอ · คลิปเดิมไม่ต้องถอดซ้ำ (ไม่เสียเงิน API) · ใช้ได้ทุกโปรเจกต์</div><div class="hint" id="trcSrv">${srvOn() ? (SRV.up ? '☁ ' + T('แชร์กับเซิร์ฟเวอร์ร้านด้วย — ทุกเครื่องใช้ข้อความเดียวกัน ไม่ต้องถอดซ้ำ') : '☁ ' + T('ติดต่อเซิร์ฟเวอร์ร้านไม่ได้ตอนนี้ — เก็บในเครื่องนี้ก่อน แล้วจะซิงค์ให้เมื่อต่อได้')) : T('ยังไม่ได้ต่อเซิร์ฟเวอร์ร้าน — ข้อความเก็บเฉพาะในเครื่องนี้')}</div><div id="trcList">${body()}</div>
    <div class="row"><button id="trcImp">นำเข้าไฟล์ข้อความ (.json)</button><button id="trcAll">⬇ ดาวน์โหลดทั้งหมด</button><button id="trcSyn">☁ ซิงค์เซิร์ฟเวอร์</button><span class="sp"></span><input type="file" id="trcFile" accept=".json,application/json" multiple hidden></div>`, root => {
    const redraw = () => { $('#trcList', root).innerHTML = body(); };
    root.onclick = e => {
      const dl = e.target.closest('[data-dl]'), rm = e.target.closest('[data-rm]');
      if (dl) trcDownload(rows()[+dl.dataset.dl]);
      else if (rm) { const r = rows()[+rm.dataset.rm]; if (confirm(T('ลบข้อความที่ถอดของ') + ' ' + r.name + ' ?')) { trcDel(r.key).then(redraw); } }
    };
    $('#trcSyn', root).onclick = async () => { const b = $('#trcSyn', root); b.disabled = true; const r = await trcSync(true); b.disabled = false; redraw(); toast(r.ok ? T('ซิงค์แล้ว') + ` · ⬇ ${r.pulled} · ⬆ ${r.pushed}` : T('ซิงค์ไม่ได้ — ต่อเซิร์ฟเวอร์ร้านไม่ได้')); };
    $('#trcImp', root).onclick = () => $('#trcFile', root).click();
    $('#trcFile', root).onchange = async e => { const n = await trcImport([...e.target.files]); toast(n ? 'นำเข้าข้อความสำเร็จ' : 'ไฟล์ไม่ถูกต้อง'); redraw(); };
    $('#trcAll', root).onclick = () => { const all = rows(); if (!all.length) return; const blob = new Blob([JSON.stringify(all.map(r => ({ sykhaiTranscript: 1, name: r.name, size: r.size, duration: r.duration, savedAt: r.savedAt, tr: r.tr })))], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sykhai-transcripts.json'; document.body.appendChild(a); a.click(); a.remove(); };
  });
}
