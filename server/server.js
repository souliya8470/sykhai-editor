// ============================================================
//  Sykhai Editor — file server (zero dependencies, Node 18+)
//  Stores media / projects / exported videos on this computer's disk.
//  Run:  set SK_TOKEN=yourpassword  &&  node server.js     (see start.bat)
// ============================================================
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = process.env.SK_DIR || 'D:\\SykhaiEditor';
const PORT = +process.env.SK_PORT || 8787;
const TOKEN = (process.env.SK_TOKEN || '').trim();
const HOST = process.env.SK_HOST || '0.0.0.0';
if (!TOKEN || TOKEN.length < 6 || TOKEN === 'CHANGE_ME') { console.error('ตั้งรหัสผ่านก่อน: SK_TOKEN (อย่างน้อย 6 ตัวอักษร)'); process.exit(1); }
const DIRS = { media: path.join(ROOT, 'media'), projects: path.join(ROOT, 'projects'), out: path.join(ROOT, 'out') };
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

// ------------------------------------------------------------
//  Proxy videos (v1.19): phones can't smoothly play 4K HDR iPhone clips, so for every uploaded video the server
//  makes a light 540p SDR copy (<id>.proxy.mp4). Needs ffmpeg — if it isn't installed the server downloads a
//  copy into ./tools by itself (Windows). Originals are never touched; export still uses the originals.
// ------------------------------------------------------------
const { spawn, spawnSync } = require('child_process'), os = require('os'), { pipeline } = require('stream/promises'), { Readable } = require('stream');
const TOOLS = path.join(__dirname, 'tools'); fs.mkdirSync(TOOLS, { recursive: true });
const exeName = n => n + (process.platform === 'win32' ? '.exe' : '');
const PX = { ff: null, hasZ: false, q: [], cur: null, failed: new Set(), note: 'checking', t0: 0 };
const proxyFile = key => path.join(DIRS.media, key + '.proxy.mp4');
function findFfmpeg() {
  for (const c of [process.env.SK_FFMPEG, path.join(TOOLS, exeName('ffmpeg')), 'ffmpeg']) {
    if (!c) continue;
    try { const r = spawnSync(c, ['-hide_banner', '-filters'], { timeout: 20000, encoding: 'utf8', windowsHide: true }); if (r.status === 0) return { bin: c, hasZ: /\bzscale\b/.test(r.stdout || '') && /\btonemap\b/.test(r.stdout || '') }; } catch (e) { }
  }
  return null;
}
async function downloadFfmpeg() {
  if (process.platform !== 'win32' || process.env.SK_NO_FFMPEG_DOWNLOAD) throw new Error('ไม่พบ ffmpeg — ติดตั้ง ffmpeg แล้วรีสตาร์ทเซิร์ฟเวอร์');
  const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip', zip = path.join(TOOLS, 'ffmpeg-download.zip');
  PX.note = 'downloading ffmpeg'; console.log('proxy: ไม่พบ ffmpeg — กำลังดาวน์โหลด (ประมาณ 170 MB, ครั้งเดียว)…');
  const r = await fetch(url); if (!r.ok || !r.body) throw new Error('ดาวน์โหลด ffmpeg ไม่ได้ HTTP ' + r.status);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(zip));
  console.log('proxy: ดาวน์โหลดแล้ว กำลังแตกไฟล์…'); PX.note = 'unpacking ffmpeg';
  const top = 'ffmpeg-master-latest-win64-gpl/bin/';
  let x = spawnSync('tar', ['-xf', zip, '-C', TOOLS, '--strip-components=2', top + 'ffmpeg.exe'], { encoding: 'utf8', windowsHide: true });
  if (x.status !== 0 || !fs.existsSync(path.join(TOOLS, 'ffmpeg.exe'))) {   // fallback: PowerShell
    const tmp = path.join(TOOLS, 'unz'); x = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${tmp}'`], { encoding: 'utf8', windowsHide: true });
    const src = path.join(tmp, 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TOOLS, 'ffmpeg.exe'));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { }
  }
  try { fs.unlinkSync(zip); } catch (e) { }
  if (!fs.existsSync(path.join(TOOLS, 'ffmpeg.exe'))) throw new Error('แตกไฟล์ ffmpeg ไม่สำเร็จ');
}
async function initProxy() {
  try {
    PX.ff = findFfmpeg();
    if (!PX.ff) { await downloadFfmpeg(); PX.ff = findFfmpeg(); }
    if (!PX.ff) throw new Error('ffmpeg ใช้งานไม่ได้');
    PX.note = 'ready'; console.log('proxy: ffmpeg พร้อม (' + PX.ff.bin + (PX.ff.hasZ ? ', HDR tone-map' : ', ไม่มี tone-map') + ')');
    pxScan();
  } catch (e) { PX.ff = null; PX.note = 'ffmpeg: ' + (e.message || e); console.log('proxy ปิดอยู่ — ' + PX.note); }
}
const isVideoMeta = m => m && (/^video\//i.test(m.type || '') || /\.(mov|mp4|m4v|webm)$/i.test(m.name || ''));
function pxScan() {   // queue every uploaded video that has no proxy yet (newest first)
  if (!PX.ff) return;
  const metas = fs.readdirSync(DIRS.media).filter(f => f.endsWith('.json')).map(f => ({ key: f.slice(0, -5), m: readMeta(path.join(DIRS.media, f)) })).filter(x => isVideoMeta(x.m)).sort((a, b) => (b.m.savedAt || 0) - (a.m.savedAt || 0));
  for (const x of metas) pxEnqueue(x.key);
}
function pxEnqueue(key) {
  if (!PX.ff || PX.failed.has(key) || PX.cur === key || PX.q.includes(key)) return;
  try { if (fs.statSync(proxyFile(key)).size > 1000) return; } catch (e) { }
  PX.q.push(key); pxRun();
}
function pxRun() {
  if (PX.cur || !PX.q.length || !PX.ff) return;
  const key = PX.q.shift(), src = path.join(DIRS.media, key + '.bin'), dst = proxyFile(key), tmp = dst + '.part';
  if (!fs.existsSync(src)) return pxRun();
  PX.cur = key; PX.t0 = Date.now();
  let info = ''; try { info = spawnSync(PX.ff.bin, ['-hide_banner', '-i', src], { encoding: 'utf8', timeout: 30000, windowsHide: true }).stderr || ''; } catch (e) { }
  const hdr = /arib-std-b67|smpte2084/.test(info);
  let vf = "fps=30,scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)':flags=bilinear";
  vf += hdr && PX.ff.hasZ ? ',zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p' : ',format=yuv420p';
  const args = ['-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', '-threads', '2', '-f', 'mp4', tmp];
  console.log('proxy: เริ่มสร้างสำเนาเบา ' + key.slice(0, 8) + (hdr ? ' (HDR→SDR)' : ''));
  let err = '', p; try { p = spawn(PX.ff.bin, args, { windowsHide: true }); } catch (e) { PX.failed.add(key); PX.cur = null; return pxRun(); }
  try { os.setPriority(p.pid, os.constants.priority.PRIORITY_LOW); } catch (e) { }
  p.stderr.on('data', d => { if (err.length < 2000) err += d; });
  p.on('error', e => { err += e.message; });
  p.on('close', code => {
    let ok = code === 0; try { ok = ok && fs.statSync(tmp).size > 1000; } catch (e) { ok = false; }
    if (ok) { try { fs.renameSync(tmp, dst); console.log('proxy: เสร็จ ' + key.slice(0, 8) + ' (' + Math.round((Date.now() - PX.t0) / 1000) + ' วินาที)'); } catch (e) { ok = false; } }
    if (!ok) { PX.failed.add(key); console.log('proxy: ล้มเหลว ' + key.slice(0, 8) + ' ' + err.slice(-300)); try { fs.unlinkSync(tmp); } catch (e) { } }
    PX.cur = null; setTimeout(pxRun, 200);
  });
}
function pxStatus() {
  const ready = [], pending = [], failed = [];
  for (const f of fs.readdirSync(DIRS.media)) {
    if (!f.endsWith('.json')) continue; const key = f.slice(0, -5), m = readMeta(path.join(DIRS.media, f)); if (!isVideoMeta(m)) continue;
    let has = false; try { has = fs.statSync(proxyFile(key)).size > 1000; } catch (e) { }
    if (has) ready.push(m.id); else if (PX.failed.has(key)) failed.push(m.id); else if (PX.cur === key || PX.q.includes(key)) pending.push(m.id);
  }
  return { ffmpeg: !!PX.ff, note: PX.note, ready, pending, failed };
}

const APP_DIR = path.join(__dirname, 'app'); fs.mkdirSync(APP_DIR, { recursive: true });
const APP_FILE = path.join(APP_DIR, 'index.html');
const APP_SRC = process.env.SK_APP_URL || 'https://raw.githubusercontent.com/souliya8470/sykhai-editor/main/index.html';
let refreshing = false;
async function refreshApp(force) {          // keep a local copy of the editor page; falls back to the old copy if GitHub is unreachable
  if (refreshing) return; let age = Infinity; try { age = Date.now() - fs.statSync(APP_FILE).mtimeMs; } catch (e) { }
  if (!force && age < 10 * 60e3) return; refreshing = true;
  try {
    const r = await fetch(APP_SRC + (APP_SRC.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text(); if (t.length < 100000 || !t.includes('Sykhai')) throw new Error('unexpected content');
    fs.writeFileSync(APP_FILE + '.tmp', t); fs.renameSync(APP_FILE + '.tmp', APP_FILE); console.log('editor page updated from GitHub (' + t.length + ' bytes)');
  } catch (e) { console.log('editor page not refreshed (' + (e.message || e) + ') — using local copy'); try { fs.utimesSync(APP_FILE, new Date(), new Date()); } catch (_) { } }
  finally { refreshing = false; }
}
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex');
const safeName = s => String(s).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
const fileName = s => String(s).replace(/[\\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_').slice(0, 150) || 'video';   // keeps Thai/Lao letters
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,HEAD,DELETE,OPTIONS', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Expose-Headers': 'x-name,x-type,x-size,content-length,content-range', 'Access-Control-Max-Age': '600' };
const send = (res, code, body, extra) => { const b = body == null ? '' : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); res.writeHead(code, Object.assign({ 'Content-Type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json' : 'text/plain; charset=utf-8' }, cors, extra)); res.end(b); };
const readJson = (req, limit = 80e6) => new Promise((res, rej) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > limit) { rej(new Error('too large')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { res(JSON.parse(Buffer.concat(c).toString('utf8'))); } catch (e) { rej(e); } }); req.on('error', rej); });
const readMeta = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function serveFile(req, res, file, name, type) {
  let st; try { st = fs.statSync(file); } catch (e) { return send(res, 404, 'not found'); }
  const h = { 'Content-Type': type || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'x-name': encodeURIComponent(name || ''), 'x-size': String(st.size) };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  let a = 0, b = st.size - 1, code = 200;
  if (m) { if (m[1] !== '') { a = +m[1]; if (m[2] !== '') b = Math.min(+m[2], st.size - 1); } else if (m[2] !== '') { a = Math.max(0, st.size - +m[2]); } if (a > b || a >= st.size) return send(res, 416, 'bad range', { 'Content-Range': 'bytes */' + st.size }); code = 206; h['Content-Range'] = `bytes ${a}-${b}/${st.size}`; }
  h['Content-Length'] = String(b - a + 1);
  res.writeHead(code, Object.assign(h, cors));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start: a, end: b }).pipe(res);
}
function saveStream(req, res, dst, metaPath, meta, onDone) {
  const tmp = dst + '.part' + process.pid;
  const ws = fs.createWriteStream(tmp); let ok = true;
  req.pipe(ws);
  req.on('aborted', () => { ok = false; ws.destroy(); fs.unlink(tmp, () => { }); });
  ws.on('error', e => { ok = false; fs.unlink(tmp, () => { }); send(res, 500, 'write failed: ' + e.message); });
  ws.on('finish', () => {
    if (!ok) return;
    fs.renameSync(tmp, dst); const size = fs.statSync(dst).size;
    if (metaPath) fs.writeFileSync(metaPath, JSON.stringify(Object.assign(meta, { size, savedAt: Date.now() })));
    send(res, 200, { ok: true, size }); if (onDone) { try { onDone(); } catch (e) { } }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const u = new URL(req.url, 'http://x'); const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {   // the editor page itself (no secrets inside)
      let html; try { html = fs.readFileSync(APP_FILE, 'utf8'); } catch (e) { return send(res, 503, 'ยังไม่มีไฟล์โปรแกรมตัดต่อ (app/index.html) — รอสักครู่แล้วรีเฟรช'); }
      refreshApp(false);
      html = html.replace('<head>', '<head><meta name="sk-server" content="1">');
      return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if ((req.headers['x-token'] || u.searchParams.get('t')) !== TOKEN) return send(res, 401, 'unauthorized');
    const [kind, id] = parts;
    if (kind === 'ping') { let free = null, total = null; try { const s = fs.statfsSync(ROOT); free = s.bavail * s.bsize; total = s.blocks * s.bsize; } catch (e) { } return send(res, 200, { ok: true, v: 2, root: ROOT, free, total, proxy: !!PX.ff }); }
    if (kind === 'proxies') return send(res, 200, pxStatus());
    if (kind === 'media') {
      if (!id) { const out = fs.readdirSync(DIRS.media).filter(f => f.endsWith('.json')).map(f => readMeta(path.join(DIRS.media, f))).filter(Boolean); return send(res, 200, out); }
      const key = sha(id), meta = readMeta(path.join(DIRS.media, key + '.json'));
      if (req.method === 'PUT') { const nm = decodeURIComponent(req.headers['x-name'] || id.split('|')[0]), ty = req.headers['x-type'] || 'application/octet-stream'; return saveStream(req, res, path.join(DIRS.media, key + '.bin'), path.join(DIRS.media, key + '.json'), { id, name: nm, type: ty }, () => { if (isVideoMeta({ name: nm, type: ty })) { try { fs.unlinkSync(proxyFile(key)); } catch (e) { } PX.failed.delete(key); pxEnqueue(key); } }); }
      if (req.method === 'DELETE') { [key + '.bin', key + '.json', key + '.proxy.mp4'].forEach(f => fs.unlink(path.join(DIRS.media, f), () => { })); return send(res, 200, { ok: true }); }
      if (!meta) return send(res, 404, 'not found');
      if (u.searchParams.get('proxy')) return serveFile(req, res, proxyFile(key), meta.name, 'video/mp4');
      return serveFile(req, res, path.join(DIRS.media, key + '.bin'), meta.name, meta.type);
    }
    if (kind === 'projects') {
      if (!id) { const out = fs.readdirSync(DIRS.projects).filter(f => f.endsWith('.json')).map(f => { const r = readMeta(path.join(DIRS.projects, f)); if (r) delete r.doc; return r; }).filter(Boolean); return send(res, 200, out); }
      const f = path.join(DIRS.projects, safeName(id) + '.json');
      if (req.method === 'PUT') { const rec = await readJson(req); if (!rec || rec.id !== id) return send(res, 400, 'bad project'); const old = readMeta(f); if (old && old.updated > rec.updated) return send(res, 409, { error: 'newer on server', updated: old.updated }); fs.writeFileSync(f, JSON.stringify(rec)); return send(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { fs.unlink(f, () => { }); return send(res, 200, { ok: true }); }
      const r = readMeta(f); return r ? send(res, 200, r) : send(res, 404, 'not found');
    }
    if (kind === 'out') {   // finished videos — stored under their real file name so you can open them in Explorer
      if (!id) { const out = fs.readdirSync(DIRS.out).filter(f => !f.includes('.part')).map(f => { const st = fs.statSync(path.join(DIRS.out, f)); return { name: f, size: st.size, savedAt: st.mtimeMs }; }); return send(res, 200, out); }
      const fn = fileName(id), f = path.join(DIRS.out, fn);
      if (req.method === 'PUT') return saveStream(req, res, f, null, {});
      return serveFile(req, res, f, fn, /\.mp4$/i.test(fn) ? 'video/mp4' : 'video/webm');
    }
    send(res, 404, 'not found');
  } catch (e) { console.error(e); try { send(res, 500, String(e.message || e)); } catch (_) { } }
});
// auto-restart when this file is replaced by a newer version (start.bat starts it again within 5 s)
try { fs.watchFile(__filename, { interval: 5000 }, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) { console.log('server.js เปลี่ยนแล้ว — รีสตาร์ทตัวเอง'); setTimeout(() => process.exit(0), 1500); } }); } catch (e) { }
server.requestTimeout = 0; server.headersTimeout = 60000;
server.listen(PORT, HOST, () => {
  refreshApp(true); initProxy();
  console.log(`Sykhai file server READY (port ${PORT}), files in ${ROOT}`);
  const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('OPEN THE EDITOR AT (on any computer in the shop):'); ips.forEach(ip => console.log('   http://' + ip + ':' + PORT));
});
