'use strict';
// ============================================================
//  Sykhai Editor — core: state, helpers, undo, factories
// ============================================================
// APP_VERSION  : 1.14
// APP_VERSION_PREV : 1.13
// APP_VERSION_PREV_OLDER : 1.12
// 1.14 : aspect ratio selector in the player (9:16, 1:1, 4:5, 16:9, 4:3) — preview, overlay handles and MP4 export follow the project size; text/blur scale by the short side
// 1.13 : MyCut-style look — rounded card panels, icon tabs on the left, media filter (all/video/image/audio), teal timecode + big round play button, inspector sections as cards with their own reset button
// 1.12 : CapCut-style clip look (teal, thumbnails, timecode label), fade in/out handles on clips, tabbed inspector (Video/Audio/Speed/Animation/Adjust), number boxes + reset on every slider, blend/canvas/chroma key/masks, voice changer, clip animations, curves/colour wheel/HSL
// 1.11 : CapCut-style timeline toolbar (import, undo/redo, split, trim left/right Q/W, delete, ripple delete, markers M, magnet on Video 1, snapping toggle, zoom fit/in/out)
// 1.10 : Save-now button in the editor header; Settings button on the Home page (needed on phones to enter the server password); Home header wraps on narrow screens
// 1.09 : UI language selector (Lao / Thai / English) in header + home; dictionary-based DOM translation, Noto Sans Lao for Lao; user content protected with translate=no
// 1.08 : draggable panel splitters (left/right/timeline height, saved), draggable track heights, tall clips show waveform + draggable volume line, live level meter
// 1.07 : click a file in the media bin to watch it in the preview in real time (play/pause/seek) before adding it to the timeline
// 1.06 : editing style guide (paste notes from ChatGPT brainstorming) used by key-points + 4-variant AI
// 1.05 : editor page can be served by the shop server itself (same-origin, avoids Chrome local-network blocking); server URL auto-set
// 1.04 : home file server (server/server.js): projects + source media + finished videos stored on shop server; manual sync; auto-download missing media on open
// 1.03 : Home page (project list), per-project autosave in IndexedDB, rename/duplicate/delete
// 1.02 : imported media persisted in IndexedDB (survives reload/new version), missing-file labels
// 1.01 : animated hover previews for transitions/effects, drag transitions/effects onto timeline junctions/clips, junction (+) markers
// 1.00 : first full build (timeline, transitions, effects, text, audio, AI hooks, export)
const APP_VERSION = '1.14';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t % 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// span that the UI-language translator must not touch (user content)
const escN = (s) => '<span translate="no">' + esc(s) + '</span>';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EASE = {
  lin: t => t,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  io: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};

const bus = new EventTarget();
const emit = (n, d) => bus.dispatchEvent(new CustomEvent(n, { detail: d }));
const on = (n, fn) => bus.addEventListener(n, e => fn(e.detail));

// media registry (not serialised): id -> {id,name,type,url,file,duration,w,h,img,thumb,peaks}
const MEDIA = new Map();

const TRACKS = [
  { id: 'V1', kind: 'video', label: 'วิดีโอ 1' },
  { id: 'V2', kind: 'video', label: 'วิดีโอ 2 / ภาพแทรก' },
  { id: 'V3', kind: 'video', label: 'ภาพซ้อน' },
  { id: 'T1', kind: 'text', label: 'ข้อความ 1' },
  { id: 'T2', kind: 'text', label: 'ข้อความ 2' },
  { id: 'T3', kind: 'text', label: 'ข้อความ 3' },
  { id: 'A1', kind: 'audio', label: 'เพลง' },
  { id: 'A2', kind: 'audio', label: 'เสียงเอฟเฟกต์' },
];
const TRACK_KIND = Object.fromEntries(TRACKS.map(t => [t.id, t.kind]));
const RENDER_ORDER = ['V1', 'V2', 'V3', 'T1', 'T2', 'T3'];

function newDoc() { return { pid: uid(), created: Date.now(), name: T('โปรเจกต์ใหม่'), w: 1080, h: 1920, fps: 30, items: [], markers: [], duckLevel: 0.22, ver: 1 }; }
let D = newDoc();
let SEL = null;             // selected item id
const getItem = (id) => D.items.find(i => i.id === id);
const projectEnd = () => D.items.reduce((m, i) => Math.max(m, i.start + i.dur), 0);
const itemsOn = (tr) => D.items.filter(i => i.track === tr).sort((a, b) => a.start - b.start);

// ---------- undo / redo ----------
let HIST = [], HPOS = -1;
function commit(label) {
  if (typeof magnetFix === 'function') magnetFix(label);
  const snap = JSON.stringify(D);
  if (HIST[HPOS] === snap) { emit('doc'); return; }
  HIST = HIST.slice(0, HPOS + 1); HIST.push(snap); if (HIST.length > 120) HIST.shift(); HPOS = HIST.length - 1;
  emit('doc', label);
}
function undo() { if (HPOS > 0) { HPOS--; D = JSON.parse(HIST[HPOS]); if (SEL && !getItem(SEL)) SEL = null; emit('doc', 'undo'); emit('sel'); } }
function redo() { if (HPOS < HIST.length - 1) { HPOS++; D = JSON.parse(HIST[HPOS]); if (SEL && !getItem(SEL)) SEL = null; emit('doc', 'redo'); emit('sel'); } }
function select(id) { SEL = id; emit('sel'); }

// ---------- keyframes ----------
const XF0 = () => ({ x: 0, y: 0, s: 1, r: 0, o: 1 });
function prop(it, k, t) {
  const base = it.xf[k];
  const kf = it.kf && it.kf[k];
  if (!kf || !kf.length) return base;
  const lt = t - it.start;
  if (lt <= kf[0].t) return kf[0].v;
  for (let i = 1; i < kf.length; i++) {
    if (lt <= kf[i].t) { const a = kf[i - 1], b = kf[i]; const p = (lt - a.t) / Math.max(1e-6, b.t - a.t); return lerp(a.v, b.v, EASE.io(p)); }
  }
  return kf[kf.length - 1].v;
}

// ---------- item factories ----------
function mkMedia(track, mediaId, start, inT, dur) {
  const m = MEDIA.get(mediaId);
  const isImg = m.type === 'image';
  return {
    id: uid(), track, type: isImg ? 'image' : 'video', mediaId, start, dur: dur ?? (isImg ? 3 : m.duration), in: inT || 0, speed: 1, vol: 1,
    xf: XF0(), kf: {}, fit: 'cover', fx: {}, mask: { type: 'none' }, transIn: null, kb: 'none',
  };
}
function mkAudio(track, mediaId, start, dur) {
  const m = MEDIA.get(mediaId);
  return { id: uid(), track, type: 'audio', mediaId, start, dur: dur ?? m.duration, in: 0, vol: track === 'A1' ? 0.35 : 0.8, fadeIn: 0.3, fadeOut: 0.6, duck: track === 'A1', loop: track === 'A1' };
}
function mkSticker(kind, start, dur, extra) {
  return Object.assign({ id: uid(), track: 'T3', type: 'sticker', kind, start, dur: dur || 2, size: 180, color: '#FFD60A', text: '', ay: .5, xf: XF0(), kf: {}, anim: { in: 'pop', out: 'fade', d: .25 } }, extra || {});
}

// ---------- text presets ----------
const FONT_STACK = '"Prompt","Noto Sans Lao","Noto Sans Thai","Noto Sans Lao Looped",sans-serif';
const TEXT_STYLES = [
  { id: 'hl', label: 'ขาว + เหลือง (2 บรรทัด)', d: { size: 64, weight: 800, color: '#ffffff', color2: '#FFE14D', stroke: '#000000', strokeW: 9, box: 'none', bg: '', ay: .62, text: T('บรรทัดที่ 1\nบรรทัดที่ 2') } },
  { id: 'clean', label: 'ขาว ขอบดำ', d: { size: 60, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '#000000', strokeW: 9, box: 'none', bg: '', ay: .62, text: T('ข้อความ') } },
  { id: 'big', label: 'หัวข้อใหญ่ เหลือง', d: { size: 112, weight: 900, color: '#FFE14D', color2: '#ffffff', stroke: '#000000', strokeW: 14, box: 'none', bg: '', ay: .3, text: T('หัวข้อ') } },
  { id: 'box', label: 'กล่องดำ ตัวขาว', d: { size: 44, weight: 700, color: '#ffffff', color2: '#FFE14D', stroke: '', strokeW: 0, box: 'line', bg: '#000000d9', ay: .1, text: T('ข้อความในกล่อง') } },
  { id: 'boxred', label: 'กล่องดำ + แถบแดง', d: { size: 42, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, box: 'line2', bg: '#000000d9', bg2: '#E02B3A', ay: .1, text: T('บรรทัดบน\nบรรทัดล่างแถบแดง') } },
  { id: 'pill', label: 'ป้ายเขียวมุมโค้ง', d: { size: 44, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, box: 'block', bg: '#0E7A5F', ay: .22, text: T('ป้ายข้อความ') } },
  { id: 'promo', label: 'ป้ายโปรโมชันแดง', d: { size: 50, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, box: 'block', bg: '#E0143C', ay: .2, text: T('โปรตอนนี้') } },
  { id: 'price', label: 'ราคา (เหลืองใหญ่)', d: { size: 70, weight: 800, color: '#ffffff', color2: '#FFE14D', stroke: '#000000', strokeW: 10, box: 'none', bg: '', ay: .72, text: T('ซื้อ 1 แถม 2\n390,000 กีบ') } },
  { id: 'blue', label: 'น้ำเงิน ขอบขาว', d: { size: 52, weight: 800, color: '#2B2BE0', color2: '#E02B3A', stroke: '#ffffff', strokeW: 9, box: 'none', bg: '', ay: .08, text: T('ข้อความสีน้ำเงิน') } },
  { id: 'plain', label: 'ขาว เงานุ่ม', d: { size: 52, weight: 700, color: '#ffffff', color2: '#FFE14D', stroke: '', strokeW: 0, box: 'none', bg: '', shadow: true, ay: .8, text: T('ข้อความทั่วไป') } },
  { id: 'footer', label: 'ข้อความท้ายจอ (เล็ก)', d: { size: 30, weight: 600, color: '#ffffffd9', color2: '#ffffffd9', stroke: '', strokeW: 0, box: 'none', bg: '', shadow: true, ay: .965, text: T('ผลลัพธ์ที่ได้ขึ้นอยู่กับแต่ละบุคคล') } },
];
function mkText(styleId, text, start, dur, extra) {
  const st = TEXT_STYLES.find(s => s.id === styleId) || TEXT_STYLES[0];
  const it = {
    id: uid(), track: 'T1', type: 'text', style: st.id, start, dur: dur || 3, font: FONT_STACK, align: 'center',
    xf: XF0(), kf: {}, anim: { in: 'pop', out: 'fade', d: .25 }, reveal: 0, maxW: .88,
  };
  Object.assign(it, JSON.parse(JSON.stringify(st.d)));
  if (text != null) it.text = text;
  return Object.assign(it, extra || {});
}

// ---------- editing primitives ----------
function freeTrack(kind, start, dur, prefer) {
  const ids = TRACKS.filter(t => t.kind === kind).map(t => t.id);
  const order = prefer ? [prefer, ...ids.filter(i => i !== prefer)] : ids;
  for (const tr of order) {
    if (!D.items.some(i => i.track === tr && i.start < start + dur - 1e-3 && i.start + i.dur > start + 1e-3)) return tr;
  }
  return order[0];
}
function addItem(it) { D.items.push(it); return it; }
function removeItem(id, ripple) {
  const it = getItem(id); if (!it) return;
  D.items = D.items.filter(i => i.id !== id);
  if (ripple) D.items.forEach(o => { if (o.track === it.track && o.start >= it.start + it.dur - 1e-3) o.start = Math.max(0, o.start - it.dur); });
}
function splitItem(id, t) {
  const it = getItem(id); if (!it) return null;
  const lt = t - it.start; if (lt < 0.05 || lt > it.dur - 0.05) return null;
  const b = JSON.parse(JSON.stringify(it)); b.id = uid();
  const sp = it.speed || 1;
  b.start = t; b.dur = it.dur - lt; if (it.in != null) b.in = it.in + lt * sp;
  it.dur = lt;
  b.transIn = null; it.transOut = null;
  if (it.kf) { for (const k in it.kf) { b.kf[k] = it.kf[k].map(p => ({ t: p.t - lt, v: p.v })).filter(p => p.t >= 0 || true); } }
  D.items.push(b); return b;
}
function duplicateItem(id) {
  const it = getItem(id); if (!it) return null; const b = JSON.parse(JSON.stringify(it)); b.id = uid(); b.start = it.start + it.dur; D.items.push(b); return b;
}
// time mapping between a source-time of media and the timeline
function srcToTimeline(it, srcT) { return it.start + (srcT - (it.in || 0)) / (it.speed || 1); }
function timelineToSrc(it, t) { return (it.in || 0) + (t - it.start) * (it.speed || 1); }

// toast
function toast(msg, ms = 2600) {
  let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms);
}
