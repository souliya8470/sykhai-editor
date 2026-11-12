'use strict';
// ============================================================
//  UI language (Lao / Thai / English)
//  Source strings in the app are Thai. For lo/en the text is translated at the DOM level
//  (text nodes + title/placeholder/aria-label) through dictionary rows [thai, english, lao]
//  defined in 00-1-i18n-*.js. User content must carry translate="no" (project names, file names,
//  transcripts ...). T(s) translates strings used by prompt()/confirm()/default content.
// ============================================================
const UI_LANGS = { lo: 'ພາສາລາວ', th: 'ภาษาไทย', en: 'English' };
let UI = 'lo';
try { const v = localStorage.getItem('sk_ui'); if (v && UI_LANGS[v]) UI = v; } catch (e) { }
const I18N_ROWS = [];
const TH_RE = /[฀-๿]/;
let _i18n = null;
function i18nBuild() {
  const col = UI === 'en' ? 1 : 2, exact = new Map(), keys = [];
  for (const r of I18N_ROWS) {
    const k = r[0].trim(), v = r[col]; if (!k || v == null || v === '') continue;
    if (!exact.has(k)) keys.push(k); exact.set(k, v);
  }
  keys.sort((a, b) => b.length - a.length);
  const esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = keys.length ? new RegExp('(?<![\\u0E00-\\u0E7F])(?:' + keys.map(esc2).join('|') + ')(?![\\u0E00-\\u0E7F])', 'g') : null;
  _i18n = { exact, re };
}
function T(s) {
  if (UI === 'th' || s == null) return s; s = String(s); if (!TH_RE.test(s)) return s;
  if (!_i18n) i18nBuild();
  const { exact, re } = _i18n; const t = s.trim(); const e = exact.get(t);
  if (e != null) return s.replace(t, () => e);
  if (!re) return s;
  return s.replace(re, (m, off, str) => {
    let o = exact.get(m); if (o == null) return m;
    const nx = str[off + m.length], pv = str[off - 1];
    if (nx && /[0-9A-Za-z]/.test(nx) && /[A-Za-z0-9຀-໿]$/.test(o)) o += ' ';
    if (pv && /[0-9A-Za-z]/.test(pv) && /^[A-Za-z຀-໿]/.test(o)) o = ' ' + o;
    return o;
  });
}
const _I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const _skip = el => !el || !el.closest || el.closest('[translate="no"],textarea,script,style');
function i18nNode(n) {
  if (n.nodeType === 3) {
    const v = n.nodeValue; if (!TH_RE.test(v) || _skip(n.parentElement)) return;
    const t = T(v); if (t !== v) n.nodeValue = t;
  } else if (n.nodeType === 1) {
    if (!n.closest('[translate="no"],script,style')) for (const a of _I18N_ATTRS) { const v = n.getAttribute(a); if (v && TH_RE.test(v)) { const t = T(v); if (t !== v) n.setAttribute(a, t); } }
    if (_skip(n)) return;
    for (const c of n.childNodes) i18nNode(c);
  }
}
function i18nStart() {
  document.documentElement.lang = UI;
  document.documentElement.style.setProperty('--droptxt', JSON.stringify(T('วางไฟล์ที่นี่')));
  if (UI === 'th') return;
  document.title = T(document.title);
  i18nNode(document.body);
  new MutationObserver(recs => {
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach(i18nNode);
      else if (r.type === 'characterData') i18nNode(r.target);
      else if (r.type === 'attributes') i18nNode(r.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: _I18N_ATTRS });
}
function i18nMountSelectors() {
  const mk = () => {
    const s = document.createElement('select'); s.className = 'uilang'; s.setAttribute('translate', 'no'); s.title = '🌐';
    s.innerHTML = Object.entries(UI_LANGS).map(([k, v]) => `<option value="${k}"${k === UI ? ' selected' : ''}>🌐 ${v}</option>`).join('');
    s.onchange = async () => {
      try { localStorage.setItem('sk_ui', s.value); } catch (e) { }
      try { if (typeof projSaveNow === 'function') await projSaveNow(); } catch (e) { }
      location.reload();
    };
    return s;
  };
  const a = document.querySelector('#btnSettings'); if (a) a.parentNode.insertBefore(mk(), a);
  const b = document.querySelector('#hmNew'); if (b) b.parentNode.insertBefore(mk(), b);
}
window.addEventListener('DOMContentLoaded', () => { i18nMountSelectors(); i18nStart(); });
