// ============================================================
//  Animated preview tiles for transitions / effects (hover = play, drag = drop on timeline)
// ============================================================
const MK_PRESETS = [['pip', 'วงกลมมุมขวาล่าง'], ['card', 'การ์ดกรอบขาว'], ['round', 'มุมมน'], ['fTop', 'ฟุ้งขอบบน'], ['fBot', 'ฟุ้งขอบล่าง'], ['fAll', 'ฟุ้งรอบด้าน'], ['kbIn', 'ซูมเข้า'], ['kbOut', 'ซูมออก'], ['kbPan', 'แพน']];
const PV = { W: 108, H: 192, ready: null, key: '', anim: null };
let DRAG = null;

function synthSample(kind) {
  const c = document.createElement('canvas'); c.width = 180; c.height = 320; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 180, 320); if (kind === 'A') { g.addColorStop(0, '#2bb5c8'); g.addColorStop(1, '#2d4f9a'); } else { g.addColorStop(0, '#ffb347'); g.addColorStop(1, '#e0457b'); }
  x.fillStyle = g; x.fillRect(0, 0, 180, 320);
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(90, 130, 42, 0, 7); x.fill(); x.beginPath(); x.ellipse(90, 290, 80, 100, 0, 0, 7); x.fill();
  x.fillStyle = 'rgba(0,0,0,.35)'; x.font = '800 60px sans-serif'; x.textAlign = 'center'; x.fillText(kind, 90, 150); return c.toDataURL('image/png');
}
function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; }); }
async function pvSamples() {
  const meds = [...MEDIA.values()].filter(m => m.thumb && !m.hidden && m.type !== 'audio'); const key = meds.slice(0, 2).map(m => m.id).join('|');
  if (PV.key === key && MEDIA.has('__pvA')) return;
  const a = await loadImg(meds[0] ? meds[0].thumb : synthSample('A')), b = await loadImg(meds[1] ? meds[1].thumb : (meds[0] ? meds[0].thumb : synthSample('B')));
  const mk = (id, img) => MEDIA.set(id, { id, name: id, type: 'image', img, w: img.naturalWidth || 180, h: img.naturalHeight || 320, duration: 0, hidden: true, hasAudio: false });
  mk('__pvA', a); mk('__pvB', meds[1] ? b : await loadImg(synthSample('B'))); PV.key = key;
}
const pvItem = (id, media, start, dur, extra) => Object.assign({ id, track: 'V1', type: 'image', mediaId: media, start, dur, in: 0, speed: 1, vol: 1, xf: XF0(), kf: {}, fit: 'cover', fx: {}, mask: { type: 'none' }, transIn: null, kb: 'none' }, extra || {});
function pvDraw(cv, kind, key, ph) {   // ph 0..1 position inside the loop
  const ctx = cv.getContext('2d'); const prev = D; const W = cv.width, H = cv.height;
  try {
    if (kind === 'trans') {
      const A = pvItem('__a', '__pvA', 0, 3), B = pvItem('__b', '__pvB', 1, 2, { transIn: key === 'none' ? null : { type: key, dur: 1 } });
      D = { items: [A, B], duckLevel: .22 }; const t = key === 'none' ? (ph < .5 ? .6 : 1.4) : lerp(.55, 2.15, ph); renderFrame(ctx, W, H, t);
    } else if (kind === 'preset') {
      const d = presetPreviewDoc(key); D = d; renderFrame(ctx, W, H, clamp(ph, 0, .99) * d.len);
    } else if (kind === 'anim') {
      const [g, k] = key.split(':'); const an = { in: 'none', out: 'none', combo: 'none', dIn: .6, dOut: .6 }; an[g] = k; const dur = g === 'combo' ? 2.2 : 1.6;
      const it = pvItem('__a', '__pvA', 0, dur, { anim: an }); D = { items: [it], duckLevel: .22 }; renderFrame(ctx, W, H, ph * (dur - .02));
    } else {
      const it = pvItem('__a', '__pvA', 0, 2.4); if (kind === 'fx') it.fx = JSON.parse(JSON.stringify((FX_PRESETS.find(p => p.id === key) || { fx: {} }).fx)); else applyMaskTo(it, key);
      D = { items: [it], duckLevel: .22 }; renderFrame(ctx, W, H, ph * 2.3);
    }
  } catch (e) { console.warn(e); } finally { D = prev; }
}
async function buildTiles() {
  const fill = (id, kind, list) => {
    const box = $(id); if (!box) return; box.innerHTML = '';
    list.forEach(([key, label]) => {
      const t = document.createElement('div'); t.className = 'tile'; t.draggable = true; t.dataset.key = key; t.dataset.kind = kind;
      t.innerHTML = `<canvas width="${PV.W}" height="${PV.H}"></canvas><span>${esc(label)}</span>`; box.appendChild(t);
      t.addEventListener('dragstart', e => { DRAG = { kind, key }; e.dataTransfer.setData(kind === 'trans' ? 'text/trans' : 'text/fx', kind + ':' + key); e.dataTransfer.effectAllowed = 'copy'; });
      t.addEventListener('dragend', () => { DRAG = null; });
      t.addEventListener('click', () => { const it = getItem(SEL); if (kind === 'trans') applyTransition(it, key); else if (kind === 'fx') applyFxPreset(it, key); else applyMaskPreset(it, key); });
      t.addEventListener('mouseenter', () => pvStart(t)); t.addEventListener('mouseleave', () => pvStop(t));
    });
  };
  fill('#tilesTrans', 'trans', Object.entries(TRANS).map(([k, v]) => [k, v.label]));
  fill('#tilesFx', 'fx', FX_PRESETS.map(p => [p.id, p.label]));
  fill('#tilesMk', 'mk', MK_PRESETS);
  await pvSamples(); pvPosters();
}
function pvPosters() {
  $$('.tile').forEach(t => pvDraw($('canvas', t), t.dataset.kind, t.dataset.key, t.dataset.kind === 'trans' ? .45 : t.dataset.kind === 'preset' ? .22 : t.dataset.kind === 'anim' ? ({ in: .2, out: .9, combo: .3 }[t.dataset.key.split(':')[0]]) : .5));
}
function pvStart(t) {
  pvStop(); const cv = $('canvas', t); const t0 = performance.now(); PV.anim = { t, raf: 0 };
  const loop = now => { if (!PV.anim || PV.anim.t !== t) return; const ph = ((now - t0) % 2200) / 2200; pvDraw(cv, t.dataset.kind, t.dataset.key, ph); PV.anim.raf = requestAnimationFrame(loop); };
  PV.anim.raf = requestAnimationFrame(loop);
}
function pvStop(t) { if (PV.anim) { cancelAnimationFrame(PV.anim.raf); const old = PV.anim.t; PV.anim = null; pvDraw($('canvas', old), old.dataset.kind, old.dataset.key, old.dataset.kind === 'trans' ? .45 : old.dataset.kind === 'preset' ? .22 : .5); } }
let _pvT = 0; on('media-added', () => { clearTimeout(_pvT); _pvT = setTimeout(async () => { await pvSamples(); pvPosters(); }, 300); });
