// ============================================================
//  v1.49 — Lao font library: 4 formal + 44 decorative free fonts (OFL), lazy-loaded from fonts/ when a font is picked
//  (never embedded in index.html). Files: fonts/<Id>.woff2 (display) and fonts/<Id>-<weight>.woff2 (formal).
//  Picked fonts are stored in it.font as a CSS stack that starts with "LF-<Id>"; they are preloaded before preview/export.
// ============================================================
const LAOFONTS = [["NotoSansLao", "Noto Sans Lao", "formal"], ["NotoSerifLao", "Noto Serif Lao", "formal"], ["NotoSansLaoLooped", "Noto Sans Lao Looped", "formal"], ["Phetsarath", "Phetsarath", "formal"], ["Apsara", "Apsara", "script"], ["BaiLan", "Bai Lan", "traditional"], ["BanGuesthouse", "Ban Guesthouse", "handwritten"], ["Banteay", "Banteay", "traditional"], ["BlueMarketBrush", "Blue Market Brush", "brush"], ["CeruleanOrnament", "Cerulean Ornament", "fancy"], ["Chotmai", "Chotmai", "handwritten"], ["CivicMonoline", "Civic Monoline", "painted"], ["DekNoi", "Dek Noi", "handwritten"], ["ForestWeathered", "Forest Weathered", "brush"], ["Hankha", "Hankha", "painted"], ["HuayTem", "Huay Tem", "script"], ["IndigoChisel", "Indigo Chisel", "traditional"], ["Kamphaeng", "Kamphaeng", "stencil"], ["KdarKhien", "Kdar Khien", "handwritten"], ["Khanom", "Khanom", "fancy"], ["KouangSiWaterfall", "Kouang Si Waterfall", "handwritten"], ["Krathong", "Krathong", "script"], ["Lamvong", "Lamvong", "script"], ["NamOu", "Nam Ou", "script"], ["NganWat", "Ngan Wat", "fancy"], ["NonSawat", "Non Sawat", "script"], ["Paksong", "Paksong", "handwritten"], ["Phsar", "Phsar", "painted"], ["PreahNeak", "Preah Neak", "fancy"], ["RoadsideMenu", "Roadside Menu", "script"], ["Sila", "Sila", "traditional"], ["Songkran", "Songkran", "fancy"], ["StoneFlourish", "Stone Flourish", "script"], ["SuanAhan", "Suan Ahan", "painted"], ["Suksa", "Suksa", "script"], ["TaKot", "Ta Kot", "traditional"], ["TadFane", "Tad Fane", "painted"], ["Talat", "Talat", "handwritten"], ["TerracottaRounded", "Terracotta Rounded", "painted"], ["Thammasat", "Thammasat", "painted"], ["ThangTan", "Thang Tan", "painted"], ["TimberBrush", "Timber Brush", "brush"], ["TukTuk", "Tuk Tuk", "painted"], ["VermilionHeritage", "Vermilion Heritage", "traditional"], ["VillageNotice", "Village Notice", "handwritten"], ["WatPhou", "Wat Phou", "traditional"], ["WoodlandHook", "Woodland Hook", "painted"], ["Yaowarat", "Yaowarat", "painted"]];
const LF_CATS = [['all', 'ทั้งหมด'], ['formal', 'ทางการ'], ['handwritten', 'ลายมือ'], ['script', 'ตัวเขียนสวย'], ['brush', 'พู่กัน'], ['painted', 'แบบทาสี'], ['traditional', 'แบบโบราณ'], ['fancy', 'ตกแต่ง'], ['stencil', 'สเตนซิล']];
const LF_BY = {}; LAOFONTS.forEach(r => LF_BY[r[0]] = { id: r[0], name: r[1], cat: r[2] });
const LF_FORMAL_W = { NotoSansLao: [400, 700, 900], NotoSerifLao: [400, 700, 900], NotoSansLaoLooped: [400, 700, 900], Phetsarath: [400, 700] };
const LF_BASES = ['fonts/', 'https://editor.touktashop.online/fonts/'];
const LF_P = new Map();    // id -> Promise<boolean>
const LF_OK = new Set(), LF_FAIL = new Set();
const lfStack = id => `"LF-${id}","Noto Sans Lao","Prompt","Noto Sans Thai",sans-serif`;
const lfIdOf = font => { const m = /"LF-([A-Za-z]+)"/.exec(font || ''); return m && LF_BY[m[1]] ? m[1] : null; };
function lfEnsure(id) {
  if (!LF_BY[id]) return Promise.resolve(false);
  if (LF_P.has(id)) return LF_P.get(id);
  const faces = LF_FORMAL_W[id] ? LF_FORMAL_W[id].map(w => [w, `${id}-${w}.woff2`]) : [[400, `${id}.woff2`]];
  const p = Promise.all(faces.map(async ([w, file]) => {
    for (const b of LF_BASES) { try { const ff = new FontFace('LF-' + id, `url(${b}${file})`, { weight: String(w) }); await ff.load(); document.fonts.add(ff); return true; } catch (e) { } }
    return false;
  })).then(r => { const ok = r.every(Boolean); if (ok) { LF_OK.add(id); LF_FAIL.delete(id); } else { LF_P.delete(id); LF_FAIL.add(id); } return ok; });
  LF_P.set(id, p); return p;
}
function lfNeed(font) { const id = lfIdOf(font); if (!id || LF_OK.has(id) || LF_P.has(id) || LF_FAIL.has(id)) return; lfEnsure(id).then(ok => { if (ok) emit('doc'); }); }
async function lfPreloadDoc() { const ids = new Set(); D.items.forEach(it => { const id = lfIdOf(it.font); if (id) ids.add(id); }); await Promise.all([...ids].map(lfEnsure)); }
function lfOpen(it) {
  if (!it || it.type !== 'text') return;
  const sample = (String(it.text || '').split('\n')[0] || '').trim().slice(0, 22) || 'ສະບາຍດີ ລາຄາພິເສດ';
  const cur = lfIdOf(it.font); let cat = 'all';
  const card = r => `<button class="lfcard${cur === r[0] ? ' on' : ''}" data-lf="${r[0]}"><span class="lfn" translate="no">${esc(r[1])}</span><span class="lfs" data-lfs="${r[0]}" translate="no">${esc(sample)}</span></button>`;
  aiDlg('เลือกฟอนต์ข้อความ', `<div class="hint">ฟอนต์ลาวฟรี (ใช้งานเชิงธุรกิจได้) · กดเพื่อใช้ · ฟอนต์จะโหลดเมื่อเลื่อนมาเห็นเท่านั้น · ฟอนต์ตกแต่งส่วนใหญ่เป็นรุ่นทดลอง</div>
    <div class="lfcats">${LF_CATS.map(([k, l]) => `<button data-cat="${k}" class="${k === 'all' ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="lfgrid" id="lfGrid">${LAOFONTS.map(card).join('')}</div>
    <div class="row"><button id="lfReset">กลับไปฟอนต์เดิมของสไตล์</button></div>`, root => {
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; io.unobserve(e.target); const id = e.target.dataset.lf; lfEnsure(id).then(ok => { const s = e.target.querySelector('.lfs'); if (ok && s) s.style.fontFamily = `"LF-${id}","Noto Sans Lao",sans-serif`; }); }), { rootMargin: '200px' }) : null;
    const watch = () => root.querySelectorAll('.lfcard').forEach(c => { if (io) io.observe(c); else lfEnsure(c.dataset.lf); });
    watch();
    root.onclick = e => {
      const cb = e.target.closest('[data-cat]'), c = e.target.closest('[data-lf]');
      if (cb) { cat = cb.dataset.cat; root.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b === cb)); root.querySelectorAll('.lfcard').forEach(x => { x.hidden = !(cat === 'all' || LF_BY[x.dataset.lf].cat === cat); }); }
      else if (c) { lfApply(it, c.dataset.lf); $('#dlgAi').close(); }
      else if (e.target.id === 'lfReset') { lfApply(it, null); $('#dlgAi').close(); }
    };
  });
}
async function lfApply(it, id) {
  if (!id) { const st = TEXT_STYLES.find(s => s.id === it.style); it.font = (st && st.d && st.d.font) || FONT_STACK; commit('font'); renderInspector(); return; }
  const ok = await lfEnsure(id); if (!ok) return toast('โหลดฟอนต์ไม่ได้ (ไม่มีไฟล์ในโฟลเดอร์ fonts)');
  it.font = lfStack(id); if (LF_BY[id].cat !== 'formal') it.weight = 400;   // display fonts are already drawn heavy; do not fake-bold them
  commit('font'); renderInspector();
}
