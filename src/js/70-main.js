// ============================================================
//  Main: init, preview overlay, shortcuts, project I/O, dialogs
// ============================================================
function drawOverlay() {
  const ov = $('#ov'); if (!ov) return; const c = ov.getContext('2d'); c.clearRect(0, 0, ov.width, ov.height);
  const it = SEL ? getItem(SEL) : null; if (!it || PB.exporting) return;
  if (PB.t < it.start - 1e-3 || PB.t >= it.start + it.dur) return; const b = BOUNDS[it.id]; if (!b || it.type === 'audio') return;
  c.save(); c.translate(b.cx, b.cy); c.rotate(b.rot * Math.PI / 180);
  c.strokeStyle = '#2ee6c5'; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); c.setLineDash([]);
  c.fillStyle = '#fff'; c.strokeStyle = '#2ee6c5'; const hs = 7;
  c.fillRect(b.w / 2 - hs, b.h / 2 - hs, hs * 2, hs * 2); c.strokeRect(b.w / 2 - hs, b.h / 2 - hs, hs * 2, hs * 2);
  c.beginPath(); c.moveTo(0, -b.h / 2); c.lineTo(0, -b.h / 2 - 22); c.stroke(); c.beginPath(); c.arc(0, -b.h / 2 - 26, 6, 0, 7); c.fill(); c.stroke();
  c.restore();
}
function initPreviewInteraction() {
  const ov = $('#ov'); const pt = e => { const r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) * PW / r.width, y: (e.clientY - r.top) * PH / r.height }; };
  const toLocal = (b, p) => { const a = -b.rot * Math.PI / 180, dx = p.x - b.cx, dy = p.y - b.cy; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; };
  ov.addEventListener('pointerdown', e => {
    const p = pt(e); let it = SEL ? getItem(SEL) : null; let mode = null;
    const active = () => it && PB.t >= it.start && PB.t < it.start + it.dur && BOUNDS[it.id];
    if (active()) { const b = BOUNDS[it.id], l = toLocal(b, p); if (Math.abs(l.x - b.w / 2) < 14 && Math.abs(l.y - b.h / 2) < 14) mode = 'scale'; else if (Math.hypot(l.x, l.y + b.h / 2 + 26) < 14) mode = 'rot'; }
    if (!mode) {
      let hit = null; for (let i = RENDER_ORDER.length - 1; i >= 0 && !hit; i--) { const list = activeAt(RENDER_ORDER[i], PB.t); for (let j = list.length - 1; j >= 0; j--) { const o = list[j], b = BOUNDS[o.id]; if (!b) continue; const l = toLocal(b, p); if (Math.abs(l.x) <= b.w / 2 && Math.abs(l.y) <= b.h / 2) { hit = o; break; } } }
      if (hit) { it = hit; select(hit.id); mode = 'move'; } else { select(null); return; }
    }
    const b0 = { ...BOUNDS[it.id] }; const s0 = prop(it, 's', PB.t), x0 = prop(it, 'x', PB.t), y0 = prop(it, 'y', PB.t), r0 = prop(it, 'r', PB.t); const start = p; const d0 = Math.hypot(p.x - b0.cx, p.y - b0.cy) || 1; const a0 = Math.atan2(p.y - b0.cy, p.x - b0.cx);
    pause();
    const mv = ev => {
      const q = pt(ev);
      if (mode === 'move') { setXf(it, 'x', clamp(x0 + (q.x - start.x) / PW, -1.5, 1.5)); setXf(it, 'y', clamp(y0 + (q.y - start.y) / PH, -1.5, 1.5)); }
      else if (mode === 'scale') { setXf(it, 's', clamp(s0 * Math.hypot(q.x - b0.cx, q.y - b0.cy) / d0, .1, 6)); }
      else { let r = r0 + (Math.atan2(q.y - b0.cy, q.x - b0.cx) - a0) * 180 / Math.PI; if (ev.shiftKey) r = Math.round(r / 15) * 15; setXf(it, 'r', r); }
      dirty(); refreshInspectorValues();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); commit('drag'); renderInspector(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
}

let _lastUiT = -1, _uiTick = 0;
window.onFrame = () => {
  drawOverlay(); updatePlayhead();
  $('#tpTime').textContent = fmt(PB.t) + ' / ' + fmt(projectEnd());
  if (!PB.playing && PB.t !== _lastUiT) { _lastUiT = PB.t; refreshInspectorValues(); }
};
on('transport', () => { $('#tpPlay').textContent = PB.playing ? '⏸' : '▶'; });
on('ended', () => { $('#tpPlay').textContent = '▶'; });
on('doc', () => { poolPrune(); renderTimeline(); dirty(); const n = $('#projName'); if (n && document.activeElement !== n) n.value = D.name; if (PB.t > durEnd()) PB.t = durEnd(); window.onFrame(); if (SEL) refreshInspectorValues(); });

// ---------- project I/O ----------
function saveProject() {
  const data = { app: 'sykhai-editor', version: APP_VERSION, doc: D, media: [...MEDIA.values()].filter(m => !m.builtin && !m.hidden).map(m => ({ id: m.id, name: m.name, type: m.type })) };
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = (D.name || 'project') + '.sykhai.json'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  toast('บันทึกโปรเจกต์แล้ว (ไฟล์วิดีโอต้องนำเข้าซ้ำเมื่อเปิดใหม่)');
}
async function openProject(file) {
  try {
    const j = JSON.parse(await file.text()); if (j.app !== 'sykhai-editor') throw new Error('ไม่ใช่ไฟล์โปรเจกต์');
    D = Object.assign(newDoc(), j.doc); D.pid = uid(); D.created = Date.now(); SEL = null; await ensureSfx(); HIST = []; HPOS = -1; commit('open'); emit('sel'); HOME.open = false; await projSaveNow(); HOME.started = true;
    const miss = new Set(D.items.filter(i => i.mediaId && !MEDIA.has(i.mediaId)).map(i => i.mediaId));
    toast(miss.size ? `เปิดโปรเจกต์แล้ว — ต้องนำเข้าไฟล์เดิมอีก ${miss.size} ไฟล์ (ชื่อ/ขนาดเดิม)` : 'เปิดโปรเจกต์แล้ว', 5000);
    return true;
  } catch (e) { toast('เปิดไฟล์ไม่ได้: ' + e.message); return false; }
}
async function ensureSfx() {
  const need = new Set(D.items.filter(i => i.mediaId && String(i.mediaId).startsWith('sfx-') && !MEDIA.has(i.mediaId)).map(i => i.mediaId));
  for (const id of need) {
    const kind = id.slice(4); const blob = genSfx(kind); const url = URL.createObjectURL(blob); const f = new File([blob], 'sfx-' + kind + '.wav');
    const a = new Audio(); a.src = url; await new Promise(r => { a.onloadedmetadata = r; setTimeout(r, 2000); });
    MEDIA.set(id, { id, name: 'เอฟเฟกต์ ' + kind, type: 'audio', file: f, url, duration: a.duration || 1, hasAudio: true, norm: 1, builtin: true }); SFX_CACHE[kind] = id;
  }
}

// ---------- init ----------
async function init() {
  $('#verTag').textContent = 'v' + APP_VERSION; $('#verTag2').textContent = 'Sykhai Editor v' + APP_VERSION;
  PCANVAS = $('#pv'); PCTX = PCANVAS.getContext('2d');
  $('#mnav').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#app').dataset.m = b.dataset.m; $$('#mnav button').forEach(x => x.classList.toggle('on', x === b)); setTimeout(() => { fitStage(); renderTimeline(); }, 30); };
  $('#app').dataset.m = 'tl';
  $('#verTag2').onclick = () => { PERF.hud = !PERF.hud; if (!PERF.hud) $('#verTag2').textContent = 'Sykhai Editor v' + APP_VERSION; };
  $('#ratioSel').onchange = e => { const a = ASPECTS.find(x => x[0] === e.target.value); if (!a) return; D.w = a[1]; D.h = a[2]; applyAspect(); commit('ratio'); renderInspector && renderInspector(); };
  try { new ResizeObserver(() => fitStage()).observe($('#center')); } catch (e) { }
  window.addEventListener('resize', fitStage); applyAspect();
  buildLeft(); initTimelineEvents(); initPreviewInteraction();
  try { await Promise.race([Promise.all(['800 40px Prompt', '700 40px "Noto Sans Lao"', '700 40px "Noto Sans Thai"'].map(f => document.fonts.load(f, 'กຂaA'))), sleep(4000)]); } catch (e) { }
  try { const n = await restoreMedia(); if (n) toast(`กู้คืนไฟล์ที่นำเข้าไว้ ${n} ไฟล์`); } catch (e) { console.warn(e); }
  // migrate legacy single autosave (<=1.02) into the projects list
  try { const ls = localStorage.getItem('sk_autosave'); if (ls) { const d = JSON.parse(ls); let ok = true; if (d && d.items && d.items.length) { d.pid = d.pid || uid(); d.created = d.created || Date.now(); d.name = d.name || 'โปรเจกต์เดิม'; ok = await projPut(projRec(d)); } if (ok) localStorage.removeItem('sk_autosave'); } } catch (e) { console.warn(e); }
  HIST = []; HPOS = -1; commit('init');
  renderMediaBin(); renderTimeline(); renderInspector(); updateCostBadge && updateCostBadge();
  $('#zoom').oninput = e => { TL.pps = Math.exp(parseFloat(e.target.value)); renderTimeline(); }; $('#zoom').value = Math.log(TL.pps);
  $('#tpPlay').onclick = togglePlay; $('#tpStart').onclick = () => { if (SRC.m) { if (SRC.el.pause) SRC.el.currentTime = 0; return; } pause(); seek(0); };
  $('#srcClose').onclick = srcExit;
  { const sk = $('#srcSeek'); sk.addEventListener('pointerdown', () => { sk._drag = true; }); sk.addEventListener('pointerup', () => { sk._drag = false; });
    sk.addEventListener('input', () => { const el = SRC.el; if (el && el.duration) el.currentTime = el.duration * sk.value / 1000; }); }
  $('#tlbody').addEventListener('pointerdown', () => srcExit(), true); $('#tlbar').addEventListener('pointerdown', () => srcExit(), true);
  on('doc', () => srcExit());
  $('#tpSplit').onclick = cmdSplit; $('#tpDel').onclick = () => cmdDelete(false); $('#tpRipple').onclick = () => cmdDelete(true);
  $('#hmSettings').onclick = () => $('#btnSettings').click();
  $('#btnSaveNow').onclick = async () => { await projSaveNow(); toast('บันทึกโปรเจกต์แล้ว ✔' + (srvOn() ? ' · ☁ ส่งขึ้นเซิร์ฟเวอร์แล้ว' : '')); };
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo; $('#btnSave').onclick = saveProject;
  $('#btnOpen').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => i.files[0] && openProject(i.files[0]); i.click(); };
  $('#projName').oninput = e => { D.name = e.target.value; }; $('#projName').onchange = () => commit('rename');
  // settings
  $('#btnSettings').onclick = () => { const k = loadKeys(); $('#keyClaude').value = k.claude || ''; $('#keyGemini').value = k.gemini || ''; $('#capUsd').value = loadCap(); $('#styleGuide').value = localStorage.getItem('sk_style') || ''; const sc = srvCfg(); $('#srvUrl').value = sc.url || ''; $('#srvUrl').disabled = SRV_SELF; $('#srvToken').value = sc.token || ''; $('#srvTestMsg').textContent = ''; $('#dlgSettings').showModal(); };
  $('#srvTest').onclick = async () => { localStorage.setItem('sk_srv', JSON.stringify({ url: $('#srvUrl').value.trim(), token: $('#srvToken').value.trim() })); $('#srvTestMsg').textContent = 'กำลังทดสอบ…'; const ok = await srvPing(); $('#srvTestMsg').textContent = ok ? `✔ เชื่อมต่อได้ · พื้นที่ว่าง ${SRV.info.free != null ? (SRV.info.free / 1e9).toFixed(0) + ' GB' : '-'}` : '✖ ' + SRV.err; };
  $('#setCancel').onclick = () => $('#dlgSettings').close();
  $('#setSave').onclick = () => { saveKeys({ claude: $('#keyClaude').value.trim(), gemini: $('#keyGemini').value.trim() }); localStorage.setItem('sk_cap', String(parseFloat($('#capUsd').value) || 50)); localStorage.setItem('sk_style', $('#styleGuide').value); localStorage.setItem('sk_srv', JSON.stringify({ url: $('#srvUrl').value.trim(), token: $('#srvToken').value.trim() })); srvPing().then(ok => ok && srvLoadSizes()); updateCostBadge(); $('#dlgSettings').close(); toast('บันทึกการตั้งค่าแล้ว'); };
  // export
  $('#btnExport').onclick = () => { $('#expBar').style.width = '0'; $('#expMsg').textContent = ''; $('#expGo').disabled = false; $('#dlgExport').showModal(); };
  $('#expCancel').onclick = () => { if (EXP.running) EXP.cancel = true; $('#dlgExport').close(); };
  $('#expGo').onclick = async () => { $('#expGo').disabled = true; await runExport(); $('#expGo').disabled = false; };
  $('#aiClose').onclick = () => $('#dlgAi').close();
  // drag & drop files
  let dc = 0; const dz = document.body;
  window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dc++; dz.classList.add('drop'); } });
  window.addEventListener('dragleave', () => { dc = Math.max(0, dc - 1); if (!dc) dz.classList.remove('drop'); });
  window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', e => { dc = 0; dz.classList.remove('drop'); if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles(e.dataTransfer.files); } });
  // keys
  window.addEventListener('keydown', e => {
    const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) && !(tg.type === 'range')) return; if (document.querySelector('dialog[open]') || HOME.open) return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (SEL) { const b = duplicateItem(SEL); commit('dup'); select(b.id); } }
    else if (!mod && e.key.toLowerCase() === 's') { cmdSplit(); }
    else if (!mod && e.key.toLowerCase() === 'q') { cmdTrimLeft(); }
    else if (!mod && e.key.toLowerCase() === 'w') { cmdTrimRight(); }
    else if (!mod && e.key.toLowerCase() === 'm') { cmdMarker(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cmdDelete(e.shiftKey); }
    else if (e.key === 'ArrowLeft' && SRC.m) { srcSeekBy(e.shiftKey ? -1 : -1 / 30); }
    else if (e.key === 'ArrowRight' && SRC.m) { srcSeekBy(e.shiftKey ? 1 : 1 / 30); }
    else if (e.key === 'ArrowLeft') { pause(); seek(PB.t - (e.shiftKey ? 1 : 1 / 30)); }
    else if (e.key === 'ArrowRight') { pause(); seek(PB.t + (e.shiftKey ? 1 : 1 / 30)); }
    else if (e.key === 'Home') { pause(); seek(0); }
  });
  initSplitters(); initToolbar();
  initHome(); await showHome(); if (srvOn()) srvPing().then(ok => ok && srvLoadSizes()).then(() => srvAdoptProxies());
  tick();
  window.__ready = true;
}
window.addEventListener('DOMContentLoaded', init);
