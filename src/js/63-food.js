// ============================================================
//  Food one-tap (v1.28): shoot food -> drop the clips in -> press one button
//   A) local best-moment picker (sharpness / exposure / colour / motion, no API)
//   B) beat detection of the music (local, free) + cuts that land on the beat
//   C) optional AI: shot order (outside -> detail -> process -> hero) and a hook line
//   D) the chosen look (preset) applied: grade, short mix transition, slow push zoom
// ============================================================

// ---------- B) beat detection (from the 16 kHz mono PCM that analyzeAudio() keeps) ----------
function onsetCurve(p, N, lowpass) {
  const e = new Float32Array(N); let y = 0; const a = 1 - Math.exp(-2 * Math.PI * 160 / 16000);
  for (let i = 0; i < N; i++) {
    let s = 0; for (let j = i * 160; j < i * 160 + 160; j++) { const x = p[j]; if (lowpass) { y += a * (x - y); s += y * y; } else s += x * x; }
    e[i] = Math.sqrt(s / 160);
  }
  const on = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - 8); j < i; j++) { s += e[j]; c++; } on[i] = Math.max(0, e[i] - (c ? s / c : 0)); }
  const srt = Array.from(on).sort((x, y) => x - y), ref = srt[Math.floor(srt.length * .95)] || 1e-6;
  for (let i = 0; i < N; i++) on[i] /= ref; return on;
}
function detectBeats(m) {
  if (m.beats !== undefined) return m.beats;
  const p = m.pcm16; if (!p || p.length < 16000 * 6) return (m.beats = null);
  const N = Math.min(Math.floor(p.length / 160), 15000), full = onsetCurve(p, N, false), low = onsetCurve(p, N, true), on = new Float32Array(N);
  for (let i = 0; i < N; i++) on[i] = full[i] + 1.2 * low[i];
  let mean = 0; for (let i = 0; i < N; i++) mean += on[i]; mean /= N;
  const ac = new Float32Array(240);
  for (let L = 25; L <= 120; L++) { let s = 0; for (let i = 0; i + L < N; i++) s += on[i] * on[i + L]; ac[L] = s / (N - L); }
  let bestL = 0, bestS = -1;
  for (let L = 30; L <= 100; L++) {
    const bpm = 6000 / L, prior = Math.exp(-.5 * Math.pow(Math.log2(bpm / 112) / .7, 2));
    const sc = (ac[L] + .5 * (ac[L * 2] || 0) + .25 * ac[Math.round(L / 2)]) * prior; if (sc > bestS) { bestS = sc; bestL = L; }
  }
  if (!bestL) return (m.beats = null);
  const a0 = ac[bestL - 1], a2 = ac[bestL + 1], c0 = ac[bestL], dn = a0 - 2 * c0 + a2; let P = bestL + (dn < 0 ? .5 * (a0 - a2) / dn : 0); if (!isFinite(P) || Math.abs(P - bestL) > 1) P = bestL;
  const at = x => { const i = Math.round(x); return i >= 0 && i < N ? Math.max(on[i], on[i - 1] || 0, on[i + 1] || 0) : 0; };
  let off = 0, offS = -1; for (let o = 0; o < Math.ceil(P); o++) { let s = 0; for (let x = o; x < N; x += P) s += at(x); if (s > offS) { offS = s; off = o; } }
  const beats = []; let cur = off; while (cur - P >= 0) cur -= P;
  const seek = Math.max(2, Math.round(P * .15));
  for (; cur < N; cur += P) {
    let pos = cur, bv = at(cur); for (let d = -seek; d <= seek; d++) { const v = at(cur + d); if (v > bv * 1.15) { bv = v; pos = cur + d; } }
    if (bv > .6) cur += (pos - cur) * .6;   // follow slow tempo drift
    beats.push(+((cur + .5) / 100).toFixed(3));
  }
  let bs = 0; beats.forEach(b => { bs += at(b * 100 - .5); }); const conf = (bs / Math.max(1, beats.length)) / Math.max(mean, 1e-6);
  return (m.beats = { bpm: Math.round(6000 / P), period: P / 100, beats, conf: +conf.toFixed(2) });
}
async function ensureBeats(m) { if (!m.pcm16) { try { await analyzeAudio(m); } catch (e) { } } return detectBeats(m); }
// beat times on the TIMELINE for a music item (handles in-point and looping)
function musicBeatsOnTimeline(a, tEnd) {
  const m = MEDIA.get(a.mediaId), b = m && detectBeats(m); if (!b) return null; const md = m.duration, out = [], inT = a.in || 0, loop = a.loop && md < a.dur + inT;
  for (let rep = 0; rep < 80; rep++) {
    for (const bt of b.beats) { const tl = a.start + bt + rep * md - inT; if (tl < a.start - 1e-6) continue; if (tl > tEnd || tl > a.start + a.dur) return out; out.push(tl); }
    if (!loop) break;
  }
  return out;
}

// ---------- A) best moment of a clip ----------
async function bestWindow(m, want) {
  const dur = m.duration, W = Math.min(want, dur);
  const grabMid = async (a, w) => { try { return (await grabFrame(m, a + w / 2, 256)).toDataURL('image/jpeg', .6).split(',')[1]; } catch (e) { return ''; } };
  if (m.type === 'image') return { a: 0, b: Math.min(want, 3), score: .5, img: true, b64: '' };
  if (dur <= W + .5) { const a = dur > 1.6 ? .15 : 0, b = dur > 1.6 ? dur - .1 : dur; return { a, b, score: .5, b64: await grabMid(a, b - a) }; }
  const n = clamp(Math.round(dur / .6), 6, 18), step = (dur - .5) / (n - 1), fr = [];
  let prevL = null;
  for (let i = 0; i < n; i++) {
    const t = .25 + i * step; let c; try { c = await grabFrame(m, t, 96); } catch (e) { continue; }
    const a = analyzePixels(c), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, L = new Float32Array(c.width * c.height); for (let k = 0; k < L.length; k++) L[k] = (.299 * d[k * 4] + .587 * d[k * 4 + 1] + .114 * d[k * 4 + 2]) / 255;
    let mo = 0; if (prevL && prevL.length === L.length) { for (let k = 0; k < L.length; k += 3) mo += Math.abs(L[k] - prevL[k]); mo /= L.length / 3; } prevL = L;
    fr.push({ t, a, mo });
  }
  if (fr.length < 3) { const a = Math.max(0, dur / 2 - W / 2); return { a, b: a + W, score: .4, b64: await grabMid(a, W) }; }
  const maxSharp = Math.max(...fr.map(f => f.a.sharp), 1);
  fr.forEach(f => { const expo = 1 - Math.min(1, Math.abs(f.a.mean - .45) / .35), sat = Math.min(1, f.a.sat / .5), act = f.mo > .3 ? 0 : Math.min(1, f.mo / .06); f.s = .45 * (f.a.sharp / maxSharp) + .25 * expo + .15 * sat + .15 * act; });
  let best = -1, bi = 0;
  for (let i = 0; i < fr.length; i++) { let s = 0, c = 0; for (const f of fr) if (f.t >= fr[i].t - .3 && f.t <= fr[i].t + W - .3) { s += f.s; c++; } if (c) { s /= c; if (s > best) { best = s; bi = i; } } }
  let a = clamp(fr[bi].t - .3, 0, Math.max(0, dur - W)); const b = Math.min(dur - .05, a + W);
  return { a, b, score: best, b64: await grabMid(a, b - a) };
}

// ---------- C) AI: shot order + hook (optional) ----------
async function foodAiPlan(shots, brief) {
  const content = [{ type: 'text', text: `You edit a short vertical (9:16) video for a Lao food/cafe/restaurant business from the shots below (one best moment per clip, one frame each). ${brief ? 'Owner note: ' + brief + '\n' : ''}Order the shots like a good café/food reel: establishing shot (outside / signboard / place) -> menu & detail close-ups -> making process (pouring, cooking, hands) -> the hero shot (best-looking dish or drink) last or second to last; a person talking to camera goes first or last. If two shots are near duplicates or clearly poor (blurry, dark, accidental), put their ids in "skip" (at most ${Math.floor(shots.length / 4)} ids). Also write ONE short hook line for the first seconds: Lao script (not Thai), 2-5 words, wrap the key word in *asterisks*. Return ONLY JSON: {"order":["s1","s2"],"skip":[],"hook":""}` }];
  shots.forEach((s, i) => { content.push({ type: 'text', text: `--- s${i + 1} "${s.m.name}" ${s.isImg ? 'photo' : (s.m.duration).toFixed(1) + 's clip'}` }); if (s.b64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.b64 } }); });
  const txt = await claude({ system: 'You are an expert short-form food video editor. Reply with JSON only.', content, max_tokens: 800, label: 'จัดลำดับอาหาร', estUsd: .04, useStyle: true });
  const j = parseJsonLoose(txt); const ids = shots.map((_, i) => 's' + (i + 1));
  const order = (j.order || []).filter(x => ids.includes(x)).filter((x, i, a) => a.indexOf(x) === i); ids.forEach(x => { if (!order.includes(x)) order.push(x); });
  const skip = (j.skip || []).filter(x => ids.includes(x)).slice(0, Math.floor(shots.length / 4));
  return { order: order.map(x => +x.slice(1) - 1), skip: skip.map(x => +x.slice(1) - 1), hook: String(j.hook || '').trim().slice(0, 60) };
}

// ---------- D) build ----------
const FOOD = { want: 30, preset: 'cafe', brief: '' };
function foodPlanTimes(shots, target, beats) {
  const n = shots.length; let want = clamp(target / Math.max(1, n), 1.6, 5);
  const period = beats ? beats.period : 0;
  if (beats && period > 0) { const k = Math.max(1, Math.round(want / period)); want = k * period; }
  return { want, period };
}
function foodBuild(shots, o) {
  // shots in play order: {m, a, b (best window), score, isImg}
  const bt = o.beats || null;
  let t = 0; const segs = [];
  shots.forEach((s, i) => {
    const maxLen = s.isImg ? 6 : Math.max(.5, s.m.duration - .12); let len = Math.min(s.want, maxLen);
    if (bt && bt.length) {
      const target = t + len; let bb = null, bd = 1e9; for (const x of bt) { const l = x - t; if (l < 1 || l > maxLen) continue; const d = Math.abs(x - target); if (d < bd) { bd = d; bb = x; } } if (bb != null) len = bb - t;
    }
    const mid = (s.a + s.b) / 2; let a = s.isImg ? 0 : clamp(mid - len / 2, .05, Math.max(.05, s.m.duration - len - .08));
    if (!s.isImg && a + len > s.m.duration - .04) len = Math.max(.5, s.m.duration - .04 - a);
    segs.push({ m: s.m, a, b: a + len, transition: 'none' }); t += len;
  });
  const v = { name: T('คลิปอาหาร'), segs, overlays: o.hook ? [{ seg: 0, line1: o.hook, line2: '' }] : [] };
  const doc = buildVariantDoc(v, { style: 'hl', footer: '', music: false }); doc.name = T('คลิปอาหาร');
  withDoc(doc, () => {
    const vids = D.items.filter(i => i.track === 'V1');
    const keep = o.music ? .35 : 1; vids.forEach(i => { i.vol = keep; });
    if (o.music) { const a = mkAudio('A1', o.music, 0, t); a.vol = .8; a.duck = false; D.items.push(a); }
    const p = PRESETS.find(x => x.id === o.preset) || PRESETS[0]; applyPresetTo(p, { grade: 1, trans: 1, zoom: 1, text: 1, subs: 0, stick: 1 }); D.preset = p.id; D.presetSub = p.sub;
  });
  return { doc, total: t, n: segs.length };
}

async function foodRun(o) {
  if (AI.busy) return; AI.busy = true;
  try {
    const ms = o.ids.map(id => MEDIA.get(id)).filter(Boolean); if (!ms.length) throw new Error('ยังไม่ได้เลือกคลิป');
    let mus = o.music ? MEDIA.get(o.music) : null, bi = null;
    if (mus && o.beat) { aiProg('กำลังฟังจังหวะเพลง…', 4); bi = await ensureBeats(mus); }
    const beatOk = bi && bi.beats.length > 8 && bi.conf >= 1.2;
    const planN = ms.length, tmp = foodPlanTimes(Array(planN), o.len, beatOk ? bi : null);
    const shots = [];
    for (let i = 0; i < ms.length; i++) {
      aiProg(`กำลังหาช่วงที่สวยที่สุดของคลิป ${i + 1}/${ms.length}`, 8 + 60 * i / ms.length);
      const w = await bestWindow(ms[i], tmp.want); shots.push(Object.assign({ m: ms[i], isImg: ms[i].type === 'image', want: tmp.want }, w));
    }
    let order = shots.map((_, i) => i), hook = '', aiNote = '';
    if (o.ai && loadKeys().claude) {
      try { aiProg('AI กำลังจัดลำดับช็อตและคิดข้อความฮุก…', 74); const pl = await foodAiPlan(shots, o.brief); order = pl.order.filter(i => !pl.skip.includes(i)); hook = pl.hook; aiNote = 'ai'; }
      catch (e) { if (/งบ/.test(e.message)) throw e; console.warn(e); aiNote = 'fail'; }
    }
    let seq = order.map(i => shots[i]);
    // too many shots for the target length: drop the weakest (never the first / last)
    const minPer = Math.max(1.6, tmp.want * .75); let guard = 0;
    while (seq.length > 3 && seq.length * minPer > o.len * 1.15 && guard++ < 30) { let wi = -1, ws = 9; seq.forEach((s, i) => { if (i && i < seq.length - 1 && s.score < ws) { ws = s.score; wi = i; } }); if (wi < 0) break; seq.splice(wi, 1); }
    aiProg('กำลังตัดต่อ…', 92);
    let beatsTl = null; if (beatOk) { const probe = { type: 'audio', mediaId: mus.id, start: 0, in: 0, dur: o.len * 3, loop: true }; beatsTl = musicBeatsOnTimeline(probe, o.len * 3); }
    const r = foodBuild(seq, { beats: beatsTl, hook, music: mus ? mus.id : null, preset: o.preset });
    await projSaveNow(); D = r.doc; SEL = null; commit('food'); emit('sel'); seek(0); AI.busy = false; $('#dlgAi').close();
    const pn = (PRESETS.find(x => x.id === o.preset) || {}).name || '';
    toast(`${T('สร้างคลิปอาหารแล้ว')} · ${r.n} ${T('ช็อต')} · ${r.total.toFixed(0)} ${T('วินาที')}${beatOk ? ' · ' + T('ตัดตามบีต') + ' ' + bi.bpm + ' BPM' : (o.beat && mus ? ' · ' + T('จับจังหวะเพลงไม่ได้') : '')} — ${T('กด ↶ ย้อนกลับได้')}${aiNote === 'fail' ? ' · ' + T('AI ไม่ตอบ ใช้ลำดับเดิม') : ''}`, 7000);
  } catch (e) { aiErr(e); }
}

function foodUI() {
  const ms = projMedia().filter(m => m.type === 'video' || m.type === 'image');
  if (!ms.length) return toast('นำเข้าคลิปอาหารก่อน');
  const mus = projMedia().filter(m => m.type === 'audio'), hasKey = !!loadKeys().claude;
  const foodIds = ['cafe', 'food', 'street'], others = PRESETS.filter(p => !foodIds.includes(p.id));
  const opt = p => `<option value="${p.id}" ${p.id === (D.preset || FOOD.preset) ? 'selected' : ''}>${p.ico} ${esc(p.name)}</option>`;
  aiDlg('🍜 โยนฟุตอาหาร → ตัดให้อัตโนมัติ', `<div class="hint">เลือกคลิป → กดปุ่มเดียว → โปรแกรมเลือกช่วงที่สวยที่สุดของแต่ละคลิป ตัดให้สั้น จัดลำดับ ใส่สี/ทรานสิชัน/ซูม และตัดตามจังหวะเพลง แล้วแก้ต่อได้</div>
    <div class="kclips">${ms.map(m => `<label class="kcl"><input type="checkbox" data-m="${m.id}" checked> <span translate="no">${esc(m.name)}</span> <span class="mini">${m.type === 'image' ? '🖼' : fmt(m.duration)}</span></label>`).join('')}</div>
    <div class="fld"><label>ความยาวที่ต้องการ</label><select id="fLen"><option value="15">ประมาณ 15 วินาที</option><option value="20">ประมาณ 20 วินาที</option><option value="30" selected>ประมาณ 30 วินาที</option><option value="45">ประมาณ 45 วินาที</option></select></div>
    <div class="fld"><label>สไตล์ (พรีเซ็ต)</label><select id="fPre">${PRESETS.filter(p => foodIds.includes(p.id)).map(opt).join('')}<option disabled>──────</option>${others.map(opt).join('')}</select></div>
    <div class="fld"><label>เพลง</label><select id="fMus"><option value="">ไม่ใส่เพลง</option>${mus.map(m => `<option value="${m.id}" translate="no">${esc(m.name)}</option>`).join('')}</select></div>
    ${mus.length ? '' : '<div class="mini">อยากได้เพลง: นำเข้าไฟล์เพลงที่แท็บ “สื่อ” ก่อน แล้วเปิดหน้านี้อีกครั้ง</div>'}
    <div class="fld chk"><label><input type="checkbox" id="fBeat" ${mus.length ? 'checked' : 'disabled'}> ตัดตามจังหวะเพลง (บีต)</label></div>
    <div class="fld chk"><label><input type="checkbox" id="fAi" ${hasKey ? 'checked' : 'disabled'}> ให้ AI จัดลำดับช็อต + คิดข้อความฮุก ${hasKey ? '' : '(ต้องใส่ Claude API key ก่อน)'}</label></div>
    <div class="fld col"><label>ชื่อร้าน / เมนูเด่น (ไม่ใส่ก็ได้ ใช้ช่วย AI คิดข้อความ)</label><input id="fBrief" placeholder="เช่น ร้านกาแฟ ลาเต้ศิลป์"></div>
    <div class="row"><span class="sp"></span><button class="primary" id="fGo">สร้างคลิปให้เลย</button></div>`, root => {
    $('#fMus', root).onchange = e => { const b = $('#fBeat', root); if (!e.target.value) b.checked = false; else if (!b.disabled) b.checked = true; };
    if (mus.length) $('#fMus', root).value = mus[0].id;
    $('#fGo', root).onclick = () => {
      const ids = [...root.querySelectorAll('[data-m]')].filter(x => x.checked).map(x => x.dataset.m); if (!ids.length) return toast('เลือกคลิปก่อน');
      foodRun({ ids: ids.slice(0, 30), len: +$('#fLen', root).value, preset: $('#fPre', root).value, music: $('#fMus', root).value || '', beat: $('#fBeat', root).checked && !!$('#fMus', root).value, ai: $('#fAi', root).checked, brief: $('#fBrief', root).value.trim() });
    };
  });
}

// ---------- beat-snap an existing timeline ----------
async function beatSnapTimeline() {
  const a = D.items.filter(i => i.type === 'audio' && i.track === 'A1').sort((x, y) => x.start - y.start)[0];
  if (!a) return toast('ใส่เพลงลงแทร็กเพลงก่อน');
  const vids = D.items.filter(i => i.track === 'V1' && (i.type === 'video' || i.type === 'image')).sort((x, y) => x.start - y.start);
  if (vids.length < 2) return toast('ต้องมีอย่างน้อย 2 คลิปบนวิดีโอ 1');
  const m = MEDIA.get(a.mediaId); const bi = m && await ensureBeats(m);
  if (!bi || bi.conf < 1.2 || bi.beats.length < 8) return toast('จับจังหวะเพลงนี้ไม่ได้ชัด ลองเพลงที่มีจังหวะกลองชัดกว่า', 5000);
  const bt = musicBeatsOnTimeline(a, projectEnd() + 30); if (!bt || bt.length < 4) return toast('จับจังหวะเพลงนี้ไม่ได้ชัด ลองเพลงที่มีจังหวะกลองชัดกว่า', 5000);
  const trs = vids.map(it => it.transIn ? { type: it.transIn.type, dur: it.transIn.dur } : null);
  vids.forEach(it => { const tr = it.transIn; if (tr && tr.prevId && tr.ext) { const p = D.items.find(x => x.id === tr.prevId); if (p) p.dur = Math.max(.1, p.dur - tr.ext); } it.transIn = null; });
  const oldB = [vids[0].start], newB = [vids[0].start]; let cur = vids[0].start, moved = 0;
  vids.forEach((it, i) => {
    const old = it.dur, m2 = it.type === 'video' ? MEDIA.get(it.mediaId) : null, sp = it.speed || 1;
    const maxLen = m2 && m2.duration ? ((m2.duration - .03) - (it.in || 0)) / sp : 1e9; let len = old;
    if (i < vids.length - 1) { const target = cur + old; let bb = null, bd = 1e9; for (const x of bt) { const l = x - cur; if (l < .6 || l > maxLen) continue; const d = Math.abs(x - target); if (d < bd) { bd = d; bb = x; } } if (bb != null) len = bb - cur; }
    if (Math.abs(len - old) > .02) moved++;
    const r = len / old; if (it.kf) for (const k of Object.keys(it.kf)) it.kf[k] = it.kf[k].map(f => ({ t: f.t * r, v: f.v }));
    it.start = cur; it.dur = len; oldB.push(oldB[oldB.length - 1] + old); cur += len; newB.push(cur);
  });
  const map = x => { if (x <= oldB[0]) return x - oldB[0] + newB[0]; for (let i = 1; i < oldB.length; i++) if (x <= oldB[i]) return newB[i - 1] + (x - oldB[i - 1]) * (newB[i] - newB[i - 1]) / Math.max(1e-6, oldB[i] - oldB[i - 1]); return x - oldB[oldB.length - 1] + newB[newB.length - 1]; };
  D.items.forEach(it => { if (it.track === 'V1' || it.track === 'A1') return; const s = map(it.start), e = map(it.start + it.dur); it.start = s; it.dur = Math.max(.15, e - s); });
  vids.forEach((it, i) => { if (i && trs[i]) setTransIn(it, trs[i].type, trs[i].dur); });
  commit('beatsnap');
  toast(`${T('ตัดตามบีต')} ${bi.bpm} BPM · ${moved ? T('ขยับจุดตัด') + ' ' + moved + ' ' + T('จุด') : T('จุดตัดตรงบีตอยู่แล้ว')} — ${T('กด ↶ ย้อนกลับได้')}`, 6000);
}
