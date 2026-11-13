'use strict';
// ============================================================
//  Sykhai Editor — core: state, helpers, undo, factories
// ============================================================
// APP_VERSION  : 1.35
// APP_VERSION_PREV : 1.34
// APP_VERSION_PREV_OLDER : 1.33
// 1.35 : layers like CapCut / Photoshop — the timeline now lists the stack top-down (top lane = drawn on top in the preview and the export; before, V1 was listed first but drawn at the bottom); ▲▼ on every video/text lane move that layer up or down the stack (saved per project in D.lorder)
// 1.34 : the editor now checks the shop-server inbox every minute while open (desktop) and pulls new reference clips into the library by itself — no need to press the 📥 button
// 1.33 : Home shows only the projects; the reference-video library moved to its own page (one button with the clip count -> library page with back button and a search box), so 100-200 clips no longer crowd the Home page; ref cards show a Thai/Lao tag; N8N pick = top 20 Thai by plays (Lao list has no view counts)
// 1.32 : per-project media bin — a new project shows only its own media (D.bin = ids imported/added in that project + ids used by its clips); media from other projects live under 📂 older files (re-add with one tap, or delete for good); the × on a bin item removes it from this project only; AI/food/analyzer lists use the project's media only
// 1.31 : reference-video library kept apart from projects (Home page 📚 section; not in the media bin, not synced, not used by AI cut-it-all; clips pulled from the server inbox and files named <tiktok id>.mp4 are moved there automatically); media bin grid auto-fills columns (more columns + smaller thumbs when the panel is widened, CapCut-style); thumbnails 360 px / q.85 (old ones upgraded in the background); Home project cards about half the size
// 1.30 : inbox — the shop server can fetch TikTok reference clips by itself (yt-dlp, asked by N8N) into an inbox folder; the editor pulls them into the media list (🔬 analyzer button + automatic on desktop start-up); imported files move to inbox/done
// 1.29 : reference-video analyzer (AI tab 🔬) — measures how a sample short video is edited, fully in the browser: shots / cuts per 10 s / cuts in the first 3 s / hard vs soft vs flash vs dip transitions / motion level / colour (brightness, saturation, contrast, warmth) / audio type + BPM; auto-crops static phone-app chrome of screen recordings; optional Claude look at text overlay, hook type and structure; results stored locally and exported as reference-videos.json with the `style` blocks filled in + grouped summary (language/category)
// 1.28 : food one-tap — 🍜 drop food clips and press one button: local best-moment picker (sharpness/exposure/colour/motion per clip), optional AI shot order + hook text, beat detection of the imported music (local, free) with cuts landing on the beat, picked look applied (grade, short mix transition, slow push zoom); 🎵 beat-snap for an existing timeline; 3 food looks (cafe warm, vivid food, street food); transitions no longer extend a clip past the end of its source
// 1.27 : style presets tab (9 trend looks: neon big text, flash sale, talking review, soft & clean, cinematic, vintage, before/after, glitch Y2K, dark luxe) — animated preview on the project's own footage, one click applies grade + transitions + zoom + text/subtitle style + sticker bursts (undoable); new glowing condensed/neon-script text styles, glow on text, starburst/rays/grid stickers
// 1.26 : Kitti-style AI editing (AI tab) — ⭐ "let AI cut it all" wizard (many clips -> 3 story angles -> storyboard approved scene by scene, revise by typing -> 9:16 timeline with subtitles, extra angles saved as projects); ✨ auto cut (silence + filler words เอ่อ/อืม + AI retakes in one reviewed list); 💬 auto subtitles from the transcript (optional Lao/Thai translation, editable list, 2 new subtitle text styles)
// 1.25 : play pre-roll — the clock starts only after every layer at the playhead has its frame decoded (max 0.9 s); fixes the first seconds of playback running at 5-12 fps on iPhone while the playhead already moved
// 1.24 : phones show a compact live readout in the player bar while playing (render/s, ms, sync ms, decoded f/s + drift, layers, paused/muted counts) so every screen recording carries numbers
// 1.23 : iPhone fix — Safari on iOS lets only one un-muted video play at a time, stacked layers fought each other (play/pause ping-pong, sync 40-60 ms). Now only the loudest layer is un-muted on iOS; play() retries throttled; HUD shows paused/muted/play errors
// 1.22 : performance overlay (tap the version text while playing): loop rate, render/sync/ui ms, per-video decoded frames/s, dropped frames, drift
// 1.21 : player bar shows the proxy state next to the version (⚡ light copies in use / total, plus reason code); tapping it retries
// 1.20 : proxy copies already on the server are used even when the server has no ffmpeg (can be placed by hand)
// 1.19 : proxy videos — shop server makes a light 540p SDR copy (ffmpeg, auto-installed) of every uploaded video; phones preview/download the copy instead of the 4K HDR original, export swaps back to the originals
// 1.18 : phone playback performance — preview capped at ~30 fps while playing, adaptive preview resolution (auto 100/75/50%), seek-thrash guard for heavy 4K clips, tap the version text in the player bar to show a live ms/fps/quality readout
// 1.17 : smooth timeline follow while playing (continuous scroll instead of page jumps, GPU-moved playhead); version number shown in the player bar on phones
// 1.16 : per-track lock / hide picture / mute icons on the timeline (saved with the project, respected by playback and export); 5 more colour filters (vintage, faded, drama, pop, cool tone)
// 1.15 : HOTFIX for 1.14 (text did not render: layoutText lacked H) + MyCut-style left panes — text styles and stickers drawn as real previews over the project's own footage, emoji categories, new Animation tab (in/out/combo) with live hover previews, tab order like MyCut
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
const APP_VERSION = '1.35';

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
const trSt = id => (D && D.tst && D.tst[id]) || {};   // per-track state: lock / hide (picture) / mute (sound)
function trToggle(id, k) {
  D.tst = D.tst || {}; const st = D.tst[id] = D.tst[id] || {}; st[k] = !st[k];
  if (k === 'lock' && st.lock && SEL) { const it = getItem(SEL); if (it && it.track === id) select(null); }
  commit('track'); if (typeof DIRTY !== 'undefined') DIRTY = true; renderTimeline();
}
const RENDER_ORDER = ['V1', 'V2', 'V3', 'T1', 'T2', 'T3'];   // default stack, bottom -> top
// layer stack of the open project, bottom -> top. The timeline shows it top-down (top lane = top layer, like CapCut / Photoshop).
function layerOrder() { const d = D && D.lorder; return Array.isArray(d) && d.length === RENDER_ORDER.length && RENDER_ORDER.every(x => d.includes(x)) ? d : RENDER_ORDER; }
function layerMove(id, dir) {            // dir: 'up' = bring toward the top of the stack, 'down' = send toward the bottom
  const o = layerOrder().slice(), i = o.indexOf(id), j = dir === 'up' ? i + 1 : i - 1; if (i < 0 || j < 0 || j >= o.length) return;
  [o[i], o[j]] = [o[j], o[i]]; D.lorder = o; commit('track'); if (typeof DIRTY !== 'undefined') DIRTY = true; renderTimeline();
}

function newDoc() { return { pid: uid(), created: Date.now(), name: T('โปรเจกต์ใหม่'), w: 1080, h: 1920, fps: 30, items: [], markers: [], duckLevel: 0.22, ver: 1, bin: [] }; }
let D = newDoc();
// per-project media bin: D.bin = media ids the user imported/added into THIS project (plus any id used by a clip)
function binSet() { const s = new Set(D.bin || []); for (const i of D.items) if (i.mediaId) s.add(i.mediaId); return s; }
function binAdd(id) { if (!D.bin) D.bin = []; if (!D.bin.includes(id)) { D.bin.push(id); emit('doc', 'bin'); } }
function binDel(id) { if (D.bin) D.bin = D.bin.filter(x => x !== id); emit('doc', 'bin'); }
// media that belong to this project (no reference clips, no hidden/builtin)
function projMedia() { const bs = binSet(); return [...MEDIA.values()].filter(m => !m.hidden && !m.ref && !m.builtin && bs.has(m.id)); }
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
function undo() { if (HPOS > 0) { HPOS--; { const b = D.bin; D = JSON.parse(HIST[HPOS]); if (b) D.bin = b; } if (SEL && !getItem(SEL)) SEL = null; emit('doc', 'undo'); emit('sel'); } }
function redo() { if (HPOS < HIST.length - 1) { HPOS++; { const b = D.bin; D = JSON.parse(HIST[HPOS]); if (b) D.bin = b; } if (SEL && !getItem(SEL)) SEL = null; emit('doc', 'redo'); emit('sel'); } }
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
const FONT_COND = '"Anton","Bebas Neue","Prompt","Noto Sans Lao","Noto Sans Thai",sans-serif';
const FONT_SCRIPT = '"Yellowtail","Prompt","Noto Sans Lao","Noto Sans Thai",cursive';
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
  { id: 'sub', label: 'ซับไตเติล ขาว ขอบดำ', d: { size: 52, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '#000000', strokeW: 9, box: 'none', bg: '', ay: .78, text: T('ซับไตเติล') } },
  { id: 'subbox', label: 'ซับไตเติล กล่องดำ', d: { size: 44, weight: 700, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, box: 'block', bg: '#000000b3', ay: .78, text: T('ซับไตเติล') } },
  { id: 'condGlow', label: 'ตัวใหญ่แคบ แสงเรือง ขาว', d: { font: FONT_COND, size: 150, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, glow: '#ffffff', box: 'none', bg: '', ay: .42, text: T('หัวข้อใหญ่') } },
  { id: 'condOrange', label: 'ตัวใหญ่แคบ แสงเรือง ส้ม', d: { font: FONT_COND, size: 140, weight: 800, color: '#ffd3a8', color2: '#ffd3a8', stroke: '', strokeW: 0, glow: '#ff5a00', box: 'none', bg: '', ay: .4, text: T('หัวข้อใหญ่') } },
  { id: 'neonScript', label: 'ตัวเขียน นีออนเหลือง', d: { font: FONT_SCRIPT, size: 96, weight: 400, color: '#fff35c', color2: '#fff35c', stroke: '', strokeW: 0, glow: '#d6ff00', box: 'none', bg: '', ay: .74, text: T('ข้อความเน้น') } },
  { id: 'subGlow', label: 'ซับไตเติล แสงเรือง', d: { font: FONT_COND, size: 66, weight: 800, color: '#ffffff', color2: '#ffffff', stroke: '', strokeW: 0, glow: '#ff7a2f', box: 'none', bg: '', ay: .78, text: T('ซับไตเติล') } },
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
