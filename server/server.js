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
function saveStream(req, res, dst, metaPath, meta) {
  const tmp = dst + '.part' + process.pid;
  const ws = fs.createWriteStream(tmp); let ok = true;
  req.pipe(ws);
  req.on('aborted', () => { ok = false; ws.destroy(); fs.unlink(tmp, () => { }); });
  ws.on('error', e => { ok = false; fs.unlink(tmp, () => { }); send(res, 500, 'write failed: ' + e.message); });
  ws.on('finish', () => {
    if (!ok) return;
    fs.renameSync(tmp, dst); const size = fs.statSync(dst).size;
    if (metaPath) fs.writeFileSync(metaPath, JSON.stringify(Object.assign(meta, { size, savedAt: Date.now() })));
    send(res, 200, { ok: true, size });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const u = new URL(req.url, 'http://x'); const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if ((req.headers['x-token'] || u.searchParams.get('t')) !== TOKEN) return send(res, 401, 'unauthorized');
    const [kind, id] = parts;
    if (kind === 'ping') { let free = null, total = null; try { const s = fs.statfsSync(ROOT); free = s.bavail * s.bsize; total = s.blocks * s.bsize; } catch (e) { } return send(res, 200, { ok: true, v: 1, root: ROOT, free, total }); }
    if (kind === 'media') {
      if (!id) { const out = fs.readdirSync(DIRS.media).filter(f => f.endsWith('.json')).map(f => readMeta(path.join(DIRS.media, f))).filter(Boolean); return send(res, 200, out); }
      const key = sha(id), meta = readMeta(path.join(DIRS.media, key + '.json'));
      if (req.method === 'PUT') return saveStream(req, res, path.join(DIRS.media, key + '.bin'), path.join(DIRS.media, key + '.json'), { id, name: decodeURIComponent(req.headers['x-name'] || id.split('|')[0]), type: req.headers['x-type'] || 'application/octet-stream' });
      if (req.method === 'DELETE') { [key + '.bin', key + '.json'].forEach(f => fs.unlink(path.join(DIRS.media, f), () => { })); return send(res, 200, { ok: true }); }
      if (!meta) return send(res, 404, 'not found');
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
server.requestTimeout = 0; server.headersTimeout = 60000;
server.listen(PORT, HOST, () => {
  console.log(`Sykhai file server READY (port ${PORT}), files in ${ROOT}`);
  const ips = Object.values(require('os').networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('Use this address in the editor settings:'); ips.forEach(ip => console.log('   http://' + ip + ':' + PORT));
});
