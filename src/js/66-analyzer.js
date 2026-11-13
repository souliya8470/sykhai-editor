// ============================================================
//  Reference-video analyzer (v1.29)
//   Measures HOW a short product video is edited, so the numbers can be turned into presets:
//   shots / cuts per 10 s / hook in the first 3 s / transitions / colour / audio type (+ optional AI look at text & structure).
//   Everything numeric runs in the browser (no ffmpeg, no API). Only the measured numbers are kept — never the clip itself.
//   Result is stored in localStorage (sk_refan) and exported as reference-videos.json with the `style` blocks filled in.
// ============================================================
const REFAN = { refs: [], res: {}, opt: { crop: 1, ai: 1 } };
function refLoad() { try { const j = JSON.parse(localStorage.getItem('sk_refan') || '{}'); REFAN.refs = j.refs || []; REFAN.res = j.res || {}; } catch (e) { } }
function refSave() { try { localStorage.setItem('sk_refan', JSON.stringify({ refs: REFAN.refs, res: REFAN.res })); } catch (e) { toast('บันทึกผลวิเคราะห์ไม่ได้ (พื้นที่เต็ม) — ดาวน์โหลดไฟล์ผลเก็บไว้ก่อน', 6000); } }
refLoad();
const median = a => { a = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const r2 = x => x == null ? null : Math.round(x * 100) / 100;

// ---------- 1) sample frames (real-time playback, fast; falls back to seeking) ----------
async function anSample(m, prog) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = m.purl || m.url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('เปิดคลิปไม่ได้')); setTimeout(res, 12000); });
  const dur = v.duration || m.duration, vw = v.videoWidth, vh = v.videoHeight; if (!vw || !dur || !isFinite(dur)) throw new Error('อ่านขนาด/ความยาวคลิปไม่ได้');
  const W = 96, H = Math.max(24, Math.round(W * vh / vw)), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true });
  const STEP = 1 / 15, frames = [];
  const grab = t => { cx.drawImage(v, 0, 0, W, H); const d = cx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H); for (let i = 0, k = 0; i < g.length; i++, k += 4) g[i] = (d[k] * 77 + d[k + 1] * 151 + d[k + 2] * 28) >> 8; frames.push({ t, g, d: frames.length % 5 === 0 ? d.slice() : null }); };
  if (v.requestVideoFrameCallback) {
    await new Promise(async resolve => {
      let last = -1, lastTick = performance.now(); const done = () => { clearInterval(wd); try { v.pause(); } catch (e) { } resolve(); };
      const wd = setInterval(() => { if (performance.now() - lastTick > 7000) done(); }, 1000);
      const cb = (now, meta) => { lastTick = performance.now(); const t = meta.mediaTime; if (t - last >= STEP - 1e-3) { last = t; grab(t); } prog(Math.min(1, t / dur)); if (v.ended || t >= dur - .04) return done(); v.requestVideoFrameCallback(cb); };
      v.onended = done; v.requestVideoFrameCallback(cb); v.playbackRate = (m.purl ? 4 : 2); try { await v.play(); } catch (e) { done(); }
    });
  }
  if (frames.length < 10) {   // fallback: seeking at ~6 fps
    frames.length = 0; const st = 1 / 6; for (let t = 0; t < dur - .05; t += st) { await seekTo(v, t); grab(t); prog(t / dur); }
  }
  if (frames.length < 6) throw new Error('ดึงภาพจากคลิปได้น้อยเกินไป');
  return { frames, W, H, dur, vw, vh };
}

// ---------- 2) crop away static app chrome (screen recordings) ----------
function anCrop(S, on) {
  const { frames, W, H } = S, n = frames.length, full = { x0: 0, y0: 0, x1: W - 1, y1: H - 1, auto: false };
  if (!on || n < 12) return full;
  const sum = new Float32Array(W * H), sq = new Float32Array(W * H);
  for (const f of frames) for (let i = 0; i < W * H; i++) { const g = f.g[i]; sum[i] += g; sq[i] += g * g; }
  const act = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { const mu = sum[i] / n, sd = Math.sqrt(Math.max(0, sq[i] / n - mu * mu)); act[i] = sd > 7 ? 1 : 0; }
  const rf = new Float32Array(H), cf = new Float32Array(W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (act[y * W + x]) { rf[y]++; cf[x]++; }
  let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1; while (y0 < H - 1 && rf[y0] / W < .15) y0++; while (y1 > y0 && rf[y1] / W < .15) y1--; while (x0 < W - 1 && cf[x0] / H < .15) x0++; while (x1 > x0 && cf[x1] / H < .15) x1--;
  const area = (x1 - x0 + 1) * (y1 - y0 + 1); if (area > .88 * W * H || area < .2 * W * H) return full; return { x0, y0, x1, y1, auto: true };
}

// ---------- 3) cuts / transitions / pace ----------
function anCuts(S, C) {
  const { frames, W } = S, GX = 6, GY = 8, cw = C.x1 - C.x0 + 1, ch = C.y1 - C.y0 + 1; const blocks = [], lum = [];
  for (const f of frames) {
    const b = new Float32Array(GX * GY), cnt = new Float32Array(GX * GY); let ls = 0;
    for (let y = C.y0; y <= C.y1; y++) for (let x = C.x0; x <= C.x1; x++) { const g = f.g[y * W + x], bi = Math.min(GY - 1, ((y - C.y0) * GY / ch) | 0) * GX + Math.min(GX - 1, ((x - C.x0) * GX / cw) | 0); b[bi] += g; cnt[bi]++; ls += g; }
    for (let i = 0; i < b.length; i++) b[i] /= Math.max(1, cnt[i]); blocks.push(b); lum.push(ls / (cw * ch));
  }
  const bf = [0], pd = [0];
  for (let i = 1; i < frames.length; i++) {
    let ch2 = 0; for (let k = 0; k < GX * GY; k++) if (Math.abs(blocks[i][k] - blocks[i - 1][k]) > 18) ch2++; bf.push(ch2 / (GX * GY));
    let s = 0, c = 0; const a = frames[i].g, b = frames[i - 1].g; for (let y = C.y0; y <= C.y1; y += 2) for (let x = C.x0; x <= C.x1; x += 2) { s += Math.abs(a[y * W + x] - b[y * W + x]); c++; } pd.push(s / Math.max(1, c) / 255);
  }
  const cuts = []; const trans = { hard: 0, soft: 0, flash: 0, dip: 0 };
  for (let i = 1; i < frames.length; i++) {
    if (bf[i] >= .45 && pd[i] >= .08 && (bf[i - 1] || 0) < .4) {
      const t = frames[i].t, near = lum.slice(Math.max(0, i - 2), i + 3), mx = Math.max(...near), mn = Math.min(...near);
      const kind = mx > 228 ? 'flash' : mn < 18 ? 'dip' : 'hard'; if (cuts.length && t - cuts[cuts.length - 1].t < .25) continue; cuts.push({ t: r2(t), kind }); trans[kind]++;
    }
  }
  // soft transitions: 3+ consecutive medium-change samples that did not already end in a hard cut
  for (let i = 1; i < frames.length - 3; i++) { if (bf[i] >= .12 && bf[i] < .45 && bf[i + 1] >= .12 && bf[i + 1] < .45 && bf[i + 2] >= .12 && bf[i + 2] < .45 && pd[i] + pd[i + 1] + pd[i + 2] > .1) { const t = frames[i].t; if (!cuts.some(c => Math.abs(c.t - t) < .7)) { cuts.push({ t: r2(t), kind: 'soft' }); trans.soft++; } i += 3; } }
  cuts.sort((a, b) => a.t - b.t);
  const dur = S.dur, edges = [0, ...cuts.map(c => c.t), dur], shots = []; for (let i = 1; i < edges.length; i++) shots.push(edges[i] - edges[i - 1]);
  const quiet = pd.filter((x, i) => bf[i] < .12); const motion = quiet.length ? quiet.reduce((a, b) => a + b, 0) / quiet.length : 0;
  const bins = Math.ceil(dur / 5), curve = Array(bins).fill(0); cuts.forEach(c => { curve[Math.min(bins - 1, (c.t / 5) | 0)]++; });
  return { cuts, trans, shots: shots.length, cuts_per_10s: r2(cuts.length / dur * 10), avg_shot_s: r2(dur / shots.length), median_shot_s: r2(median(shots)), shortest_shot_s: r2(Math.min(...shots)), longest_shot_s: r2(Math.max(...shots)), cuts_first3s: cuts.filter(c => c.t < 3).length, cuts_first10s: cuts.filter(c => c.t < 10).length, motion: r2(motion), motion_level: motion < .015 ? 'static' : motion < .045 ? 'moderate' : 'high', cuts_per_5s_curve: curve };
}

// ---------- 4) colour ----------
function anColor(S, C) {
  const { frames, W } = S; let R = 0, G = 0, B = 0, sat = 0, n = 0; const L = [];
  for (const f of frames) { if (!f.d) continue; for (let y = C.y0; y <= C.y1; y += 2) for (let x = C.x0; x <= C.x1; x += 2) { const k = (y * W + x) * 4, r = f.d[k], g = f.d[k + 1], b = f.d[k + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); R += r; G += g; B += b; sat += mx ? (mx - mn) / mx : 0; n++; L.push((r * .299 + g * .587 + b * .114)); } }
  if (!n) return null; L.sort((a, b) => a - b);
  return { brightness: r2((R * .299 + G * .587 + B * .114) / n / 255), saturation: r2(sat / n), contrast: r2((L[Math.floor(L.length * .95)] - L[Math.floor(L.length * .05)]) / 255), warmth: r2((R - B) / n / 255) };
}

// ---------- 5) audio (voice / music / none, estimated) ----------
async function anAudio(m) {
  if (!m.pcm16) { try { await analyzeAudio(m); } catch (e) { } }
  if (!m.pcm16) return { type: 'none', note: 'no decodable audio' };
  m.env = null; const e = envelope(m); if (!e || e.length < 200) return { type: 'none' };
  const sm = new Float32Array(e.length); for (let i = 0; i < e.length; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - 3); j <= Math.min(e.length - 1, i + 3); j++) { s += e[j]; c++; } sm[i] = s / c; }
  const srt = Array.from(sm).sort((a, b) => a - b), p90 = srt[Math.floor(srt.length * .9)] || 0; if (p90 < .003) return { type: 'none', note: 'silent' };
  const thr = .08 * p90; let sil = 0, act = [], pk = 0; for (let i = 0; i < sm.length; i++) { if (sm[i] < thr) sil++; else act.push(sm[i]); }
  for (let i = 6; i < sm.length - 6; i++) { if (sm[i] > .25 * p90 && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1]) { let ok = true; for (let j = i - 6; j <= i + 6; j++) if (sm[j] > sm[i]) { ok = false; break; } if (ok) pk++; } }
  const mean = act.reduce((a, b) => a + b, 0) / Math.max(1, act.length), sd = Math.sqrt(act.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, act.length)), cv = mean ? sd / mean : 0, secs = Math.max(1, act.length / 100), peakRate = pk / secs;
  const bt = detectBeats(m), beatConf = bt ? bt.conf : 0;
  const music = !!bt && beatConf >= 4 && cv < 1.05, voice = peakRate >= 2 && peakRate <= 8 && sil / sm.length > .05 && cv >= .65;
  const type = voice && music ? 'voice+music' : music ? 'music' : voice ? 'voice' : 'unclear';
  return { type, bpm: bt && beatConf >= 4 ? bt.bpm : null, beat_conf: r2(beatConf), silence_ratio: r2(sil / sm.length), syllable_peaks_per_s: r2(peakRate), level_variation: r2(cv) };
}

// ---------- 6) optional AI look: text overlay, hook, structure ----------
async function anAi(m, S, C, loc) {
  const times = [.4, 1.4, 2.6]; const rest = 7, a0 = Math.min(5, S.dur * .3), a1 = Math.max(a0 + 1, S.dur - .6); for (let i = 0; i < rest; i++) times.push(a0 + (a1 - a0) * i / (rest - 1)); const ts = times.filter(t => t < S.dur - .1);
  const content = [{ type: 'text', text: `You study how ONE short vertical product video (cosmetics or health supplement, Thai/Lao market, TikTok style) is edited, to turn it into an editing preset. Below are ${ts.length} frames in time order (timestamp before each). Ignore any phone/app interface around the video (like/share buttons, captions of the app) — describe only what the creator edited into the video. Local measurements: duration ${S.dur.toFixed(0)}s, ${loc.cuts.length} cuts (${loc.cuts_per_10s} per 10s), cuts in first 3s: ${loc.cuts_first3s}.\n` }];
  for (const t of ts) { try { const c = await grabFrame(m, t, 270); const sx = Math.round(C.x0 / S.W * c.width), sy = Math.round(C.y0 / S.H * c.height), sw = Math.round((C.x1 - C.x0 + 1) / S.W * c.width), sh = Math.round((C.y1 - C.y0 + 1) / S.H * c.height); const o = document.createElement('canvas'); o.width = sw; o.height = sh; o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh); content.push({ type: 'text', text: `t=${t.toFixed(1)}s` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: o.toDataURL('image/jpeg', .6).split(',')[1] } }); } catch (e) { } }
  content.push({ type: 'text', text: 'Return ONLY JSON: {"hook":{"type":"talking_face|product_closeup|text_question|before_after|demo_application|unboxing|other","first3s_text":"text visible in the first 3 seconds or empty","summary":"max 15 words"},"text_overlay":{"coverage":"none|light|moderate|heavy","position":"top|middle|bottom|mixed","style":"max 12 words: font weight, colour, outline/box, animation","language":"th|lo|en|mixed|none"},"shot_types":["face_to_camera|product_closeup|texture_swatch|application_on_skin|before_after|packshot|text_card|screen_capture|b_roll"],"structure":"max 20 words, order of the beats, e.g. hook > problem > product > result > CTA","cta_or_price_visible":true,"visual_effects":"max 12 words: zoom punches, filters, stickers, flashes, speed ramps","notes":"max 25 words that a copycat editor should know"}' });
  const txt = await claude({ system: 'You are an expert short-form video editor analysing reference videos. Reply with JSON only.', content, max_tokens: 900, label: 'วิเคราะห์เทคนิคตัดต่อ', estUsd: .03 });
  return parseJsonLoose(txt);
}

// ---------- run one clip ----------
async function anRunClip(m, o, ref, prog) {
  const S = await anSample(m, p => prog('กำลังดูภาพคลิป', p * .7)); prog('กำลังวัดจังหวะตัด', .72);
  const C = anCrop(S, o.crop), loc = anCuts(S, C), col = anColor(S, C); prog('กำลังฟังเสียง', .8); const au = await anAudio(m);
  let ai = null, aiErr = ''; if (o.ai && loadKeys().claude) { prog('AI กำลังดูข้อความ/โครงเรื่อง', .88); try { ai = await anAi(m, S, C, loc); } catch (e) { if (/งบ/.test(e.message)) throw e; aiErr = e.message; } }
  const vidAspect = S.vw / S.vh;
  return { name: m.name, analysed: new Date().toISOString().slice(0, 10), duration_s: r2(S.dur), resolution: `${S.vw}x${S.vh}`, aspect: r2(vidAspect), cropped_ui: C.auto ? { x: r2(C.x0 / S.W), y: r2(C.y0 / S.H), w: r2((C.x1 - C.x0 + 1) / S.W), h: r2((C.y1 - C.y0 + 1) / S.H) } : null, pace: { cuts_per_10s: loc.cuts_per_10s, shots: loc.shots, avg_shot_s: loc.avg_shot_s, median_shot_s: loc.median_shot_s, shortest_shot_s: loc.shortest_shot_s, longest_shot_s: loc.longest_shot_s, cuts_first3s: loc.cuts_first3s, cuts_first10s: loc.cuts_first10s, cuts_per_5s_curve: loc.cuts_per_5s_curve, motion_level: loc.motion_level, motion: loc.motion }, transitions: loc.trans, cut_times: loc.cuts, color: col, audio: au, ai, ai_error: aiErr || undefined };
}

// ---------- map to the reference-videos.json `style` block ----------
function anStyle(a) {
  const ai = a.ai || {}, h = ai.hook || {}, t = ai.text_overlay || {}, tr = a.transitions || {}, au = a.audio || {};
  const trs = []; if (tr.hard) trs.push(tr.hard + ' hard cuts'); if (tr.soft) trs.push(tr.soft + ' soft/dissolve'); if (tr.flash) trs.push(tr.flash + ' white flash'); if (tr.dip) trs.push(tr.dip + ' dip to black');
  return {
    hook: ai.hook ? `${h.type || 'other'}${h.first3s_text ? ' · text: ' + h.first3s_text : ''}${h.summary ? ' — ' + h.summary : ''} (cuts in first 3s: ${a.pace.cuts_first3s})` : `cuts in first 3s: ${a.pace.cuts_first3s}`,
    cuts_per_10s: a.pace.cuts_per_10s,
    text_overlay: ai.text_overlay ? `${t.coverage || '?'} · ${t.position || '?'} · ${t.language || '?'} · ${t.style || ''}` : null,
    transitions: trs.join(', ') || 'no cuts detected' + (ai.visual_effects ? ' · effects: ' + ai.visual_effects : ''),
    music: `${au.type}${au.bpm ? ' ~' + au.bpm + ' BPM' : ''}`,
    notes: ai.notes ? `${ai.structure ? ai.structure + ' | ' : ''}${ai.notes}` : (ai.structure || null),
  };
}

// ---------- grouped summary ----------
function anRefOf(key) { return REFAN.refs.find(r => r.video_id === key); }
function anRows() {
  return Object.entries(REFAN.res).map(([key, a]) => { const r = anRefOf(key) || {}; return Object.assign({ key }, a, { category: a.category || r.category || 'other', language: a.language || r.language || 'other', creator: r.creator || '', topic: r.topic_note || '' }); });
}
function anSummary(rows) {
  const groups = {}; rows.forEach(a => { const k = `${a.language}/${a.category}`; (groups[k] = groups[k] || []).push(a); });
  const tally = (arr) => { const c = {}; arr.filter(Boolean).forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', '); };
  return Object.entries(groups).map(([k, g]) => ({
    group: k, videos: g.length, median_duration_s: r2(median(g.map(a => a.duration_s))), median_cuts_per_10s: r2(median(g.map(a => a.pace.cuts_per_10s))), median_avg_shot_s: r2(median(g.map(a => a.pace.avg_shot_s))),
    pct_with_cut_in_first3s: Math.round(100 * g.filter(a => a.pace.cuts_first3s > 0).length / g.length), motion: tally(g.map(a => a.pace.motion_level)), audio: tally(g.map(a => a.audio && a.audio.type)),
    median_bpm: median(g.map(a => a.audio && a.audio.bpm)), brightness: r2(median(g.map(a => a.color && a.color.brightness))), saturation: r2(median(g.map(a => a.color && a.color.saturation))), warmth: r2(median(g.map(a => a.color && a.color.warmth))),
    hook_types: tally(g.map(a => a.ai && a.ai.hook && a.ai.hook.type)), text_coverage: tally(g.map(a => a.ai && a.ai.text_overlay && a.ai.text_overlay.coverage)), text_position: tally(g.map(a => a.ai && a.ai.text_overlay && a.ai.text_overlay.position)),
    transitions_total: ['hard', 'soft', 'flash', 'dip'].map(k2 => k2 + ' ' + g.reduce((s, a) => s + ((a.transitions || {})[k2] || 0), 0)).join(', '),
  }));
}
function anExport() {
  const rows = anRows(); if (!rows.length) return toast('ยังไม่มีผลวิเคราะห์');
  const videos = REFAN.refs.map(r => { const a = REFAN.res[r.video_id]; return a ? Object.assign({}, r, { style: anStyle(a), reviewed: true, analysis: a }) : r; });
  rows.filter(a => !anRefOf(a.key)).forEach(a => videos.push({ platform: 'local', language: a.language, category: a.category, creator: '', video_id: a.key, url: '', topic_note: a.name, duration_s: a.duration_s, style: anStyle(a), reviewed: true, analysis: a }));
  const out = { collected: new Date().toISOString().slice(0, 10), source: 'sykhai-editor analyzer v1.29 (measured numbers only)', count: videos.length, analysed: rows.length, summary: anSummary(rows), videos };
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = 'reference-videos-analysed.json'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 3000);
  toast(`ดาวน์โหลดแล้ว — ${rows.length} คลิปที่วิเคราะห์`, 5000);
}

// ---------- UI ----------
const AN_CAT = [['cosmetics', 'เครื่องสำอาง'], ['supplement', 'อาหารเสริม'], ['other', 'อื่น ๆ']], AN_LANG = [['lao', 'ลาว'], ['thai', 'ไทย'], ['other', 'อื่น ๆ']];
function anMatch(m) { const id = (m.name.match(/\d{17,19}/) || [])[0]; return id && anRefOf(id) ? id : ''; }
function anResultsHtml() {
  const rows = anRows(); if (!rows.length) return '';
  return `<div class="aicard"><h4>ผลที่วัดได้ (${rows.length} คลิป)</h4><table class="aitbl"><tr><td><b>คลิป</b></td><td><b>ยาว</b></td><td><b>ตัด/10 วิ</b></td><td><b>ตัดช่วง 3 วิแรก</b></td><td><b>เสียง</b></td></tr>${rows.map(a => `<tr><td translate="no">${esc(a.creator || a.name)}</td><td>${a.duration_s}s</td><td>${a.pace.cuts_per_10s}</td><td>${a.pace.cuts_first3s}</td><td>${esc((a.audio || {}).type || '')}</td></tr>`).join('')}</table></div>`;
}
function anUI() {
  const vids = [...MEDIA.values()].filter(m => m.type === 'video' && !m.builtin && !m.hidden).sort((a, b) => (b.ref ? 1 : 0) - (a.ref ? 1 : 0)), hasKey = !!loadKeys().claude;
  const refOpts = REFAN.refs.map(r => `<option value="${r.video_id}" translate="no">${esc((r.creator || '') + ' · ' + (r.topic_note || ''))}</option>`).join('');
  const sel = (arr, cls, v) => `<select class="${cls}">${arr.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  aiDlg('🔬 วิเคราะห์เทคนิคตัดต่อ (วิดีโออ้างอิง)', `<div class="hint">นำคลิปตัวอย่าง (ที่ดาวน์โหลด/อัดหน้าจอมา) เข้าโปรแกรม แล้วให้โปรแกรมวัดว่าเขาตัดต่ออย่างไร: จังหวะตัด, ฮุกใน 3 วินาทีแรก, ทรานสิชัน, สี, ชนิดเสียง และ (ถ้าเปิด AI) ข้อความบนจอ/โครงเรื่อง เก็บเฉพาะตัวเลขที่วัดได้ ไม่เก็บตัวคลิป</div>
    <div class="row"><button id="anInbox">📥 ดึงคลิปจากกล่องรับของเซิร์ฟเวอร์</button><span class="mini" id="anInboxN"></span></div>
    <div class="row"><button id="anImp">นำเข้า reference-videos.json</button><span class="mini" id="anImpN">${REFAN.refs.length ? 'มีรายการอ้างอิง ' + REFAN.refs.length + ' รายการ' : 'ยังไม่ได้นำเข้า (ไม่จำเป็น)'}</span><input type="file" id="anFile" accept=".json,application/json" style="display:none"></div>
    ${vids.length ? `<div class="kclips">${vids.map(m => { const mt = anMatch(m), r = mt ? anRefOf(mt) : null, done = REFAN.res[mt || 'name:' + m.name]; return `<div class="kcl" data-m="${m.id}"><label><input type="checkbox" class="anck" ${done ? '' : 'checked'}> <span translate="no">${esc(m.name)}</span> <span class="mini">${fmt(m.duration)}${done ? ' ✔' : ''}</span></label>
      <div class="mini"><select class="anref"><option value="">(ไม่ระบุคลิปอ้างอิง)</option>${refOpts.replace(`value="${mt}"`, `value="${mt}" selected`)}</select> ${sel(AN_LANG, 'anlang', r ? r.language : 'lao')} ${sel(AN_CAT, 'ancat', r ? r.category : 'cosmetics')}</div></div>`; }).join('')}</div>` : '<div class="hint">ยังไม่มีคลิปวิดีโอ — นำเข้าคลิปตัวอย่างที่แท็บ “สื่อ” ก่อน</div>'}
    <div class="fld chk"><label><input type="checkbox" id="anCrop" ${REFAN.opt.crop ? 'checked' : ''}> ตัดขอบแอปออกอัตโนมัติ (กรณีอัดหน้าจอมือถือ)</label></div>
    <div class="fld chk"><label><input type="checkbox" id="anAi" ${REFAN.opt.ai && hasKey ? 'checked' : ''} ${hasKey ? '' : 'disabled'}> ให้ AI ดูภาพช่วย (ข้อความบนจอ ฮุก โครงเรื่อง) ${hasKey ? '' : '(ต้องใส่ Claude API key ก่อน)'}</label></div>
    <div class="row"><span class="sp"></span><button id="anSum">ดูสรุปเป็นกลุ่ม</button><button id="anDl">ดาวน์โหลดผล (JSON)</button><button class="primary" id="anGo" ${vids.length ? '' : 'disabled'}>เริ่มวิเคราะห์</button></div>${anResultsHtml()}`, root => {
    $('#anImp', root).onclick = () => $('#anFile', root).click();
    $('#anInbox', root).onclick = async () => { const n = await srvInboxImport(); if (n && !AI.busy) anUI(); };
    $('#anInboxN', root).textContent = srvOn() ? 'กำลังตรวจกล่องรับ…' : 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์';
    if (srvOn()) srvInboxList().then(l => { const el = $('#anInboxN'); if (el) el.textContent = l ? (l.length ? 'มีคลิปรอ ' + l.length + ' คลิป' : 'กล่องรับว่าง') : 'เซิร์ฟเวอร์ไม่พร้อม'; });
    $('#anFile', root).onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); REFAN.refs = (j.videos || j).filter(v => v.video_id); refSave(); toast(`นำเข้าแล้ว ${REFAN.refs.length} รายการ`); anUI(); } catch (er) { toast('ไฟล์ JSON อ่านไม่ได้', 4000); } };
    $('#anDl', root).onclick = anExport;
    $('#anSum', root).onclick = () => { const rows = anRows(); if (!rows.length) return toast('ยังไม่มีผลวิเคราะห์'); const s = anSummary(rows); aiDlg('สรุปเป็นกลุ่ม (ภาษา/หมวด)', s.map(g => `<div class="aicard"><h4 translate="no">${esc(g.group)} · ${g.videos}</h4><table class="aitbl" translate="no">${Object.entries(g).filter(([k]) => k !== 'group').map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v == null ? '-' : String(v))}</td></tr>`).join('')}</table></div>`).join('') + '<div class="row"><span class="sp"></span><button id="anBack">กลับ</button><button class="primary" id="anDl2">ดาวน์โหลดผล (JSON)</button></div>', r2d => { $('#anBack', r2d).onclick = anUI; $('#anDl2', r2d).onclick = anExport; }); };
    $('#anGo', root).onclick = () => {
      const picks = [...root.querySelectorAll('.kcl')].filter(d => $('.anck', d).checked).map(d => ({ m: MEDIA.get(d.dataset.m), ref: $('.anref', d).value, lang: $('.anlang', d).value, cat: $('.ancat', d).value })).filter(p => p.m);
      if (!picks.length) return toast('เลือกคลิปก่อน'); REFAN.opt.crop = $('#anCrop', root).checked ? 1 : 0; REFAN.opt.ai = $('#anAi', root).checked ? 1 : 0; anRunAll(picks);
    };
  });
}
async function anRunAll(picks) {
  if (AI.busy) return; AI.busy = true; let ok = 0; const bad = [];
  try {
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i], key = p.ref || 'name:' + p.m.name, rf = p.ref ? anRefOf(p.ref) : null;
      try {
        const a = await anRunClip(p.m, REFAN.opt, rf, (msg, f) => aiProg(`คลิป ${i + 1}/${picks.length}: ${p.m.name} — ${msg}`, ((i + f) / picks.length) * 100));
        a.language = p.lang; a.category = p.cat; REFAN.res[key] = a; refSave(); ok++;
      } catch (e) { if (/งบ/.test(e.message)) throw e; console.warn(e); bad.push(p.m.name + ': ' + e.message); }
    }
    AI.busy = false; anUI(); toast(`วิเคราะห์เสร็จ ${ok}/${picks.length} คลิป${bad.length ? ' — ผิดพลาด: ' + bad.join(' | ') : ''}`, 7000);
  } catch (e) { aiErr(e); }
}
