// ============================================================
//  Sykhai Editor server — AUTO EXPORT JOBS (v1.66, zero dependencies)
//  "Approve" in the editor → POST /jobs → this worker opens a HIDDEN, separate Chrome (own temp profile, never the courier-bill profiles),
//  loads the editor page from this same server, runs the project export there (WebCodecs, see editor v1.81), saves the MP4 in out/,
//  then sends it to Marketing Studio through the Supabase function "editor-video-intake" (key in ms-intake.json next to server.js).
// ============================================================
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), https = require('https'), crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

module.exports = function initJobs(ctx) {
  const { ROOT, PORT, TOKEN, DIRS, PX, safeName, dir } = ctx;
  const JOBS = path.join(ROOT, 'jobs'); fs.mkdirSync(JOBS, { recursive: true });
  const LOG = path.join(dir, 'jobs.log');
  const log = (...a) => { const s = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' ' + a.join(' '); console.log('[jobs] ' + a.join(' ')); try { fs.appendFileSync(LOG, s + '\n'); const st = fs.statSync(LOG); if (st.size > 2e6) fs.writeFileSync(LOG, s + '\n'); } catch (e) { } };
  const W = { busy: false, cur: null, chrome: null, selftest: null, note: 'idle', products: null, productsAt: 0, kill: null };
  const jf = id => path.join(JOBS, safeName(id) + '.json');
  const readJob = id => { try { return JSON.parse(fs.readFileSync(jf(id), 'utf8')); } catch (e) { return null; } };
  const saveJob = j => { j.touched = Date.now(); const f = jf(j.id); fs.writeFileSync(f + '.tmp', JSON.stringify(j)); fs.renameSync(f + '.tmp', f); };
  const allJobs = () => { try { return fs.readdirSync(JOBS).filter(f => f.endsWith('.json')).map(f => { try { return JSON.parse(fs.readFileSync(path.join(JOBS, f), 'utf8')); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.created - a.created); } catch (e) { return []; } };
  const pub = j => { const o = Object.assign({}, j); delete o.logs; delete o._t; return o; };
  const msCfg = () => {
    if (process.env.SK_MS_URL && process.env.SK_MS_KEY) return { url: process.env.SK_MS_URL, key: process.env.SK_MS_KEY };
    try { const c = JSON.parse(fs.readFileSync(path.join(dir, 'ms-intake.json'), 'utf8')); if (c.url && c.key) return c; } catch (e) { }
    return null;
  };

  // ---------- find Chrome / Edge ----------
  function findChrome() {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '';
    const c = [process.env.SK_CHROME, pf + '\\Google\\Chrome\\Application\\chrome.exe', pf86 + '\\Google\\Chrome\\Application\\chrome.exe', la && la + '\\Google\\Chrome\\Application\\chrome.exe',
      pf86 + '\\Microsoft\\Edge\\Application\\msedge.exe', pf + '\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    for (const p of c) { if (p && fs.existsSync(p)) return p; }
    return null;
  }

  // ---------- tiny WebSocket client (Chrome DevTools protocol) ----------
  function wsConnect(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url), key = crypto.randomBytes(16).toString('base64');
      const req = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' } });
      req.on('error', reject);
      req.on('upgrade', (res, sock, head) => {
        let buf = Buffer.alloc(0), frag = [], fop = 0; const api = { id: 0, pend: new Map(), on: {}, closed: false };
        const sendFrame = (op, payload) => {
          const mask = crypto.randomBytes(4), n = payload.length; let h;
          if (n < 126) h = Buffer.from([0x80 | op, 0x80 | n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 0x80 | 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(n), 2); }
          const m = Buffer.alloc(n); for (let i = 0; i < n; i++) m[i] = payload[i] ^ mask[i & 3];
          try { sock.write(Buffer.concat([h, mask, m])); } catch (e) { }
        };
        const onMsg = txt => {
          let m; try { m = JSON.parse(txt); } catch (e) { return; }
          if (m.id && api.pend.has(m.id)) { const p = api.pend.get(m.id); api.pend.delete(m.id); m.error ? p.rej(new Error(m.error.message || 'cdp error')) : p.res(m.result); }
          else if (m.method && api.on[m.method]) api.on[m.method](m.params);
        };
        const parse = () => {
          for (;;) {
            if (buf.length < 2) return; const b0 = buf[0], b1 = buf[1]; let len = b1 & 0x7f, off = 2;
            if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
            if (buf.length < off + len) return; const data = buf.subarray(off, off + len); buf = buf.subarray(off + len);
            const op = b0 & 0x0f, fin = !!(b0 & 0x80);
            if (op === 8) { api.close(); return; } if (op === 9) { sendFrame(10, data); continue; } if (op === 10) continue;
            if (op === 1 || op === 2) { fop = op; frag = [data]; } else if (op === 0) frag.push(data);
            if (fin) { onMsg(Buffer.concat(frag).toString('utf8')); frag = []; }
          }
        };
        sock.on('data', d => { buf = Buffer.concat([buf, d]); parse(); }); if (head && head.length) { buf = Buffer.concat([buf, head]); parse(); }
        api.close = () => { if (api.closed) return; api.closed = true; for (const [, p] of api.pend) p.rej(new Error('connection closed')); api.pend.clear(); try { sock.destroy(); } catch (e) { } };
        sock.on('close', () => api.close()); sock.on('error', () => api.close());
        api.send = (method, params) => new Promise((res, rej) => { if (api.closed) return rej(new Error('connection closed')); const id = ++api.id; api.pend.set(id, { res, rej }); sendFrame(1, Buffer.from(JSON.stringify({ id, method, params: params || {} }))); });
        resolve(api);
      });
      req.end();
    });
  }
  const httpJson = (url, method) => new Promise((res, rej) => { const u = new URL(url); const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET' }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error('bad json from chrome')); } }); }); r.on('error', rej); r.end(); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- run one page task inside a fresh hidden Chrome ----------
  // task(page) gets { eval(expr, awaitPromise), cdp, con } ; everything is cleaned up afterwards
  async function withChrome(label, task, isCancelled) {
    const chrome = findChrome(); if (!chrome) throw Object.assign(new Error('ไม่พบ Chrome หรือ Edge บนเซิร์ฟเวอร์'), { fatal: true });
    W.chrome = chrome;
    const prof = path.join(ROOT, 'tools', 'job-chrome-' + Date.now()); fs.mkdirSync(prof, { recursive: true });
    const args = ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required', '--window-size=1280,900', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=Translate,CalculateNativeWinOcclusion'];
    if (process.env.SK_CHROME_NOSANDBOX || (process.platform === 'linux' && process.getuid && process.getuid() === 0)) args.push('--no-sandbox');
    args.push('about:blank');
    const proc = spawn(chrome, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let exited = null; proc.on('exit', c => { exited = 'Chrome ปิดตัวเอง (code ' + c + ')'; });
    const killAll = () => { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }); else proc.kill('SIGKILL'); } catch (e) { } };
    W.kill = killAll; let cdp = null; const con = [];
    try {
      const wsUrl = await new Promise((res, rej) => {
        let b = ''; const t = setTimeout(() => rej(new Error('Chrome เปิดไม่ขึ้นภายใน 40 วินาที')), 40000);
        proc.stderr.on('data', d => { b += d; const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(b); if (m) { clearTimeout(t); res(m[1]); } });
        proc.on('exit', c => { clearTimeout(t); rej(new Error('Chrome ปิดตัวตอนเปิด (code ' + c + ')')); }); proc.on('error', e => { clearTimeout(t); rej(e); });
      });
      const port = new URL(wsUrl).port; let page = null;
      for (let i = 0; i < 20 && !page; i++) { const l = await httpJson(`http://127.0.0.1:${port}/json/list`); page = l.find(x => x.type === 'page'); if (!page) await sleep(300); }
      if (!page) throw new Error('ไม่พบหน้าเว็บใน Chrome');
      cdp = await wsConnect(page.webSocketDebuggerUrl);
      cdp.on['Runtime.consoleAPICalled'] = p => { con.push((p.type || '') + ': ' + (p.args || []).map(a => a.value != null ? a.value : a.description || '').join(' ').slice(0, 300)); if (con.length > 60) con.shift(); };
      cdp.on['Runtime.exceptionThrown'] = p => { con.push('EXC: ' + ((p.exceptionDetails && (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)) || '').slice(0, 300)); };
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      const boot = `try{localStorage.setItem('sk_srv',JSON.stringify({url:location.origin,token:${JSON.stringify(TOKEN)}}));localStorage.setItem('sk_job','1');localStorage.setItem('sk_ui','th');}catch(e){}${process.env.SK_FX_OPUS ? 'window.__fxOpus=true;' : ''}`;
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: boot });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const ev = async (expr, aw) => {
        if (exited) throw Object.assign(new Error(exited), { retry: true });
        const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: !!aw, returnByValue: true });
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text || 'script error').slice(0, 400));
        return r.result && r.result.value;
      };
      const t0 = Date.now(); for (;;) { let ok = false; try { ok = await ev('window.__ready===true'); } catch (e) { if (e.retry) throw e; } if (ok) break; if (Date.now() - t0 > 90000) throw new Error('หน้าโปรแกรมตัดต่อโหลดไม่ขึ้น (เกิน 90 วินาที)'); await sleep(500); }
      return await task({ ev, cdp, con, isCancelled: () => !!(isCancelled && isCancelled()), exited: () => exited });
    } catch (e) { e.con = con.slice(-12); throw e; }
    finally {
      try { cdp && cdp.close(); } catch (e) { } killAll(); W.kill = null;
      setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { } }, 4000);
    }
  }

  // ---------- Marketing Studio intake ----------
  const reqJson = (url, opt, body) => new Promise((res, rej) => {
    const u = new URL(url), lib = u.protocol === 'http:' ? http : https;
    const r = lib.request({ host: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: u.pathname + u.search, method: opt.method || 'POST', headers: opt.headers || {} }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } res({ status: x.statusCode, json: j, text: b }); }); });
    r.on('error', rej); r.setTimeout(120000, () => r.destroy(new Error('timeout'))); r.end(body);
  });
  const msCall = async (cfg, body) => {
    const r = await reqJson(cfg.url, { headers: { 'content-type': 'application/json', 'x-sk-key': cfg.key } }, JSON.stringify(body));
    if (r.status >= 300) throw new Error('Marketing Studio ตอบ ' + r.status + (r.json && r.json.error ? ': ' + r.json.error : ''));
    return r.json || {};
  };
  function putFile(url, file, headers, onp) {
    return new Promise((resolve, reject) => {
      const u = new URL(url), lib = u.protocol === 'http:' ? http : https, size = fs.statSync(file).size;
      const r = lib.request({ host: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: u.pathname + u.search, method: 'PUT', headers: Object.assign({ 'content-length': String(size) }, headers) }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => resolve({ status: x.statusCode, text: b })); });
      r.on('error', reject); r.setTimeout(30 * 60e3, () => r.destroy(new Error('upload timeout')));
      let sent = 0; const rs = fs.createReadStream(file); rs.on('data', d => { sent += d.length; onp && onp(sent / size); }); rs.on('error', reject); rs.pipe(r);
    });
  }
  function shrink(file, dur, targetBytes) {   // re-encode smaller with ffmpeg when Supabase refuses the size
    if (!PX.ff || !PX.ff.bin) throw new Error('ไม่มี ffmpeg สำหรับบีบไฟล์');
    const out = file.replace(/\.mp4$/i, '') + '.small.mp4', vb = Math.max(1.2e6, Math.floor(targetBytes * 8 / Math.max(5, dur) - 160000));
    const r = spawnSync(PX.ff.bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(vb), '-maxrate', String(Math.floor(vb * 1.3)), '-bufsize', String(vb * 2), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { windowsHide: true, timeout: 30 * 60e3 });
    if (r.status !== 0 || !fs.existsSync(out)) throw new Error('บีบไฟล์ไม่สำเร็จ');
    return out;
  }
  async function sendToMS(job, file, meta) {
    const cfg = msCfg(); if (!cfg) throw Object.assign(new Error('ยังไม่ได้ตั้งค่าเชื่อม Marketing Studio (ไม่มีไฟล์ ms-intake.json)'), { noRetry: true });
    let f = file, note = '', size = fs.statSync(f).size;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ini = await msCall(cfg, { action: 'init', file_name: meta.file_name, title: meta.title, product_id: job.product && job.product.id || '' });
      const hdr = { 'content-type': 'video/mp4', 'x-upsert': 'false', 'cache-control': 'max-age=3600' }; if (ini.apikey) { hdr.apikey = ini.apikey; hdr.authorization = 'Bearer ' + ini.apikey; }
      const up = await putFile(ini.signedUrl, f, hdr, p => { job.progress = 100 * p; job._t = job._t || 0; if (Date.now() - job._t > 1500) { job._t = Date.now(); job.msg = 'กำลังส่งเข้า Marketing Studio ' + Math.round(100 * p) + '%'; saveJob(job); } });
      if (up.status < 300) {
        const d = await msCall(cfg, Object.assign({ action: 'done', path: ini.path, size_bytes: fs.statSync(f).size, note: note || meta.note || '' }, meta.done));
        if (f !== file) { try { fs.unlinkSync(f); } catch (e) { } }
        return { id: d.id, url: d.public_url, size: fs.statSync(file).size, note };
      }
      if (up.status === 413 || /exceed|too large|maximum allowed size/i.test(up.text)) {
        if (attempt === 0) { job.msg = 'ไฟล์ใหญ่เกินที่ Supabase รับ — กำลังบีบให้เล็กลง'; saveJob(job); f = shrink(file, meta.done.duration_sec || 60, 45e6); note = 'บีบไฟล์ให้เล็กลง (Supabase จำกัดขนาด) — ไฟล์เต็มคุณภาพอยู่ในเซิร์ฟเวอร์ร้าน'; log('shrunk', job.id, size, '->', fs.statSync(f).size); continue; }
        throw new Error('ไฟล์ยังใหญ่เกินที่ Supabase รับ (เพิ่ม Upload file size limit ใน Supabase → Storage → Settings)');
      }
      throw new Error('อัปโหลดเข้า Marketing Studio ไม่สำเร็จ HTTP ' + up.status + ' ' + up.text.slice(0, 120));
    }
  }

  // ---------- the job runner ----------
  const upd = (j, p) => { Object.assign(j, p); saveJob(j); };
  async function runJob(job) {
    const fresh = () => readJob(job.id) || job; const cancelled = () => !!fresh().cancel;
    upd(job, { state: 'running', started: Date.now(), progress: 0, msg: 'กำลังเปิดตัวส่งออกบนเซิร์ฟเวอร์…', tries: (job.tries || 0) + 1 });
    let res = null, lastErr = null;
    for (let attempt = 0; attempt < 2 && !res; attempt++) {
      try {
        res = await withChrome('job', async pg => {
          await pg.ev(`window.__jobDone=null; jobRun(${JSON.stringify(job.pid)}).then(r=>{window.__jobDone={ok:1,r}},e=>{window.__jobDone={err:String(e&&e.message||e)}}); 1`);
          const t0 = Date.now();
          for (;;) {
            if (cancelled()) { throw Object.assign(new Error('ยกเลิกแล้ว'), { cancelled: true, noRetry: true }); }
            const st = await pg.ev('({d:window.__jobDone, p:(window.__jobProg?window.__jobProg():null)})');
            if (st && st.p) { job.progress = Math.min(100, st.p.p || 0); job.msg = String(st.p.msg || '').slice(0, 160); saveJob(job); }
            if (st && st.d) { if (st.d.err) throw Object.assign(new Error(st.d.err), { noRetry: /ขาดไฟล์|ไม่พบโปรเจกต์|อ่านคลิปไม่ได้/.test(st.d.err) }); return st.d.r; }
            if (Date.now() - t0 > 120 * 60e3) throw new Error('ส่งออกนานเกิน 2 ชั่วโมง');
            await sleep(2000);
          }
        }, cancelled);
      } catch (e) { lastErr = e; log('job', job.id, 'attempt', attempt + 1, 'failed:', e.message, (e.con || []).slice(-4).join(' | ')); if (e.noRetry || e.cancelled || e.fatal) break; await sleep(3000); }
    }
    if (!res) { if (lastErr && lastErr.cancelled) return upd(job, { state: 'cancelled', msg: 'ยกเลิกแล้ว', finished: Date.now() }); return upd(job, { state: 'failed', msg: String(lastErr && lastErr.message || 'ส่งออกไม่สำเร็จ').slice(0, 300), finished: Date.now() }); }
    const file = path.join(DIRS.out, res.file);
    upd(job, { state: 'uploading', progress: 100, msg: 'ส่งออกเสร็จ กำลังส่งเข้า Marketing Studio…', out: { file: res.file, size: res.size, dur: res.dur, w: res.w, h: res.h, fast: res.fast } });
    try {
      const ms = await sendToMS(job, file, { file_name: res.file, title: job.name || res.title, note: '', done: { product_id: job.product && job.product.id || null, product_name: job.product && job.product.name || null, title: job.name || res.title, file_name: res.file, width: res.w, height: res.h, duration_sec: res.dur, project_id: job.pid, job_id: job.id, uploaded_by: job.by ? job.by + ' (ผ่านโปรแกรมตัดต่อ)' : 'Sykhai Editor', thumb: res.thumb || '' } });
      upd(job, { state: 'done', progress: 100, msg: ms.note || '', ms, finished: Date.now() });
      log('job', job.id, 'done', res.file);
    } catch (e) { log('job', job.id, 'upload failed', e.message); upd(job, { state: 'failed', msg: 'ส่งออกเสร็จแล้ว (ไฟล์อยู่ในโฟลเดอร์ out) แต่ส่งเข้า Marketing Studio ไม่สำเร็จ: ' + e.message, finished: Date.now() }); }
  }
  async function pump() {
    if (W.busy) return; W.busy = true;
    try {
      for (;;) {
        const next = allJobs().filter(j => j.state === 'queued').sort((a, b) => a.created - b.created)[0]; if (!next) break;
        W.cur = next.id; W.note = 'running ' + next.id;
        try { await runJob(next); } catch (e) { log('runJob crashed', e && e.stack || e); try { upd(next, { state: 'failed', msg: String(e.message || e), finished: Date.now() }); } catch (_) { } }
        W.cur = null;
      }
    } finally { W.busy = false; W.note = 'idle'; }
  }
  async function selftest() {
    if (W.busy) return W.selftest;
    W.busy = true; W.note = 'selftest';
    try {
      const r = await withChrome('selftest', pg => pg.ev('jobSelfTest()', true));
      W.selftest = Object.assign({ at: new Date().toISOString(), chrome: W.chrome, ok: true }, r);
    } catch (e) { W.selftest = { at: new Date().toISOString(), chrome: W.chrome, ok: false, error: e.message, console: e.con }; }
    finally { W.busy = false; W.note = 'idle'; }
    try { fs.writeFileSync(path.join(dir, 'jobs-selftest.json'), JSON.stringify(W.selftest, null, 1)); } catch (e) { }
    log('selftest', JSON.stringify(W.selftest).slice(0, 600)); pump(); return W.selftest;
  }

  // ---------- products list for the approve dialog ----------
  async function products() {
    if (W.products && Date.now() - W.productsAt < 10 * 60e3) return W.products;
    const cfg = msCfg(); if (!cfg) return { products: [], error: 'ยังไม่ได้ตั้งค่า Marketing Studio' };
    try { const j = await msCall(cfg, { action: 'products' }); W.products = { products: j.products || [] }; W.productsAt = Date.now(); return W.products; }
    catch (e) { return { products: [], error: e.message }; }
  }

  // ---------- HTTP routes (called from server.js after the token check) ----------
  async function handle(req, res, u, parts, send, readJson) {
    const [kind, id] = parts;
    if (kind === 'products') { send(res, 200, await products()); return true; }
    if (kind !== 'jobs') return false;
    if (!id) {
      if (req.method === 'POST') {
        const b = await readJson(req, 2e5) || {}; const pid = String(b.pid || ''); if (!pid) { send(res, 400, { error: 'ไม่มีรหัสโปรเจกต์' }); return true; }
        if (!fs.existsSync(path.join(DIRS.projects, safeName(pid) + '.json'))) { send(res, 404, { error: 'โปรเจกต์นี้ยังไม่ถูกส่งขึ้นเซิร์ฟเวอร์' }); return true; }
        const dup = allJobs().find(j => j.pid === pid && j.state === 'queued'); if (dup) { send(res, 200, Object.assign(pub(dup), { already: true })); return true; }
        const job = { id: 'j' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), pid, name: String(b.name || '').slice(0, 120), by: String(b.by || '').slice(0, 40), product: b.product && b.product.id ? { id: String(b.product.id).slice(0, 60), name: String(b.product.name || '').slice(0, 120) } : null, state: 'queued', progress: 0, msg: '', created: Date.now(), updated: b.updated || 0 };
        saveJob(job); log('queued', job.id, job.name); setImmediate(pump); send(res, 200, pub(job)); return true;
      }
      if (req.method === 'GET') { const pid = u.searchParams.get('pid'); send(res, 200, allJobs().filter(j => !pid || j.pid === pid).slice(0, 100).map(pub)); return true; }
    }
    if (id === 'status') { send(res, 200, { busy: W.busy, cur: W.cur, note: W.note, chrome: W.chrome || findChrome(), ms: !!msCfg(), selftest: W.selftest, queued: allJobs().filter(j => j.state === 'queued').length }); return true; }
    if (id === 'selftest' && req.method === 'POST') { selftest(); send(res, 200, { ok: true, started: true }); return true; }
    const j = id && readJob(id); if (!j) { send(res, 404, { error: 'ไม่พบงาน' }); return true; }
    if (req.method === 'DELETE') {
      if (j.state === 'queued') { upd(j, { state: 'cancelled', msg: 'ยกเลิกแล้ว', finished: Date.now() }); }
      else if (j.state === 'running') { upd(j, { cancel: true }); try { if (W.kill) W.kill(); } catch (e) { } }
      send(res, 200, pub(readJob(id))); return true;
    }
    send(res, 200, pub(j)); return true;
  }
  function start() {
    // jobs interrupted by a restart go back in the queue (the Chrome that was working for them is gone)
    for (const j of allJobs()) { if (j.state === 'running' && (j.tries || 0) < 3) { j.state = 'queued'; j.msg = 'เริ่มใหม่หลังเซิร์ฟเวอร์รีสตาร์ต'; saveJob(j); } else if (j.state === 'uploading') { j.state = 'queued'; j.msg = 'เริ่มใหม่หลังเซิร์ฟเวอร์รีสตาร์ต'; saveJob(j); } }
    // old chrome temp profiles from a crash
    try { for (const d of fs.readdirSync(path.join(ROOT, 'tools'))) if (/^job-chrome-/.test(d)) fs.rmSync(path.join(ROOT, 'tools', d), { recursive: true, force: true }); } catch (e) { }
    setTimeout(() => { if (!allJobs().some(j => j.state === 'queued')) selftest(); else pump(); }, 15000);
  }
  return { handle, start, status: () => ({ busy: W.busy, cur: W.cur }) };
};
