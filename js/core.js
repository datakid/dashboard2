const SHEET_ID = '122uThrt83Vs8rUtOe4PCmsWjLSxv8A-OmUbT0Y3PZeg';
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const AUTO_SYNC_MS = 5 * 60 * 1000;

const MED_CATS = ['المسكنات', 'مضادات حيوية', 'كلي', 'نفسية و عصبية', 'قلب', 'سكر حقن', 'سكر فم', 'نسا', 'كبد', 'جهاز هضمي', 'جهاز تنفسي', 'امراض جلدية', 'عيون و رمد', 'انف و اذن', 'مضادات تقلصات', 'اورام', 'فيتامينات', 'مختلفة'];
const FIELDS = ['Region', 'Pharmacy', 'Month', 'Class', 'MedClass'];
const FIELD_META = {
  Region: { label: 'Region', dot: 'var(--sage)' },
  Pharmacy: { label: 'Pharmacy', dot: 'var(--copper)' },
  Month: { label: 'Month', dot: 'var(--moss)' },
  Class: { label: 'Classification', dot: 'var(--plum)' },
  MedClass: { label: 'Medication', dot: 'var(--rose)' }
};
const MONTH_ORDER = {
  july: 1, august: 2, september: 3, october: 4, november: 5, december: 6,
  january: 7, february: 8, march: 9, april: 10, may: 11, june: 12,
  'يوليو': 1, 'أغسطس': 2, 'سبتمبر': 3, 'أكتوبر': 4, 'نوفمبر': 5, 'ديسمبر': 6,
  'يناير': 7, 'فبراير': 8, 'مارس': 9, 'أبريل': 10, 'مايو': 11, 'يونيو': 12
};

const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
  charts: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m7 14 4-4 3 3 5-6"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  compare: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a7 7 0 0 0 10.6 10.6z"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2.5"/><path d="M8 21h8M12 16.5V21"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15.5h6"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  pill: '<path d="m10.5 20.5-7-7a5 5 0 1 1 7-7l7 7a5 5 0 1 1-7 7z"/><path d="m8.5 8.5 7 7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
};

const icon = (name) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-i]').forEach(el => { el.outerHTML = icon(el.dataset.i); });

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>'"`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;' }[m]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const compact = (v) => {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
};
const monthRank = (m) => m ? MONTH_ORDER[String(m).trim().toLowerCase()] || 99 : 99;
const fyLabel = (y) => `${Number(y) - 1} – ${y}`;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const normalizeArabic = (s) => s ? String(s).toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي') : '';
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  sget(k, fallback) { try { const v = sessionStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const S = {
  data: [],
  duplicates: [],
  years: [],
  filtered: [],
  missing: [],
  tab: 'overview',
  filters: { Year: null, Region: [], Pharmacy: [], Month: [], Class: [], MedClass: [] },
  exploreSort: { col: null, dir: 1 },
  missingSort: { col: null, dir: 1 },
  missingQuery: '',
  yearsScope: [],
  yearsFilters: { Region: 'all', Pharmacy: 'all', Month: 'all', Class: 'all' },
  cmpA: { Year: 'all', Region: 'all', Pharmacy: 'all', Month: 'all', Class: 'all' },
  cmpB: { Year: 'all', Region: 'all', Pharmacy: 'all', Month: 'all', Class: 'all' },
  yearSortDesc: true,
  lastSync: null,
  syncing: false,
  autoSync: store.get('alembic-auto-sync', localStorage.getItem('da-auto-sync') === 'true'),
  firstLoad: true,
  statsCache: { sig: null, stats: null }
};

const toast = (message, type = 'info', ms = 3200) => {
  const ic = { success: 'check', error: 'alert', info: 'bolt' }[type] || 'bolt';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-ic">${icon(ic)}</span><span>${esc(message)}</span>`;
  const bye = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', bye);
  $('#toastStack').appendChild(el);
  setTimeout(bye, ms);
};

const emptyHTML = (title, desc, ic = 'layers', err = false) => `<div class="empty${err ? ' error' : ''}"><div class="empty-icon">${icon(ic)}</div><div class="empty-title">${esc(title)}</div><div class="empty-desc">${esc(desc)}</div></div>`;

const animateNumber = (el, end, ms = 750) => {
  if (!isFinite(end) || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(end); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / ms, 1);
    el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const downloadBlob = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

const copyText = async (text) => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
};

const Modal = {
  open(title, bodyHTML, footHTML = '', wide = false) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHTML;
    $('#modalFoot').innerHTML = footHTML;
    $('.modal-card').style.width = wide ? 'min(760px, 100%)' : '';
    $('#modal').hidden = false;
    this.lastFocus = document.activeElement;
    setTimeout(() => { const f = $('#modal input, #modal textarea, #modal button:not(#modalClose)'); (f || $('#modalClose')).focus(); }, 30);
  },
  close() {
    $('#modal').hidden = true;
    if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
  },
  get isOpen() { return !$('#modal').hidden; }
};

const Theme = {
  pref: 'auto',
  mq: matchMedia('(prefers-color-scheme: dark)'),
  init() {
    this.pref = document.documentElement.getAttribute('data-theme-pref') || 'auto';
    $$('#themeSeg button').forEach(b => b.addEventListener('click', () => this.set(b.dataset.themeValue)));
    this.mq.addEventListener('change', () => { if (this.pref === 'auto') this.apply(); });
    this.apply(true);
  },
  set(p) { this.pref = p; localStorage.setItem('alembic-theme', p); this.apply(); },
  cycle() { const o = ['light', 'dark', 'auto']; this.set(o[(o.indexOf(this.pref) + 1) % o.length]); },
  apply(silent) {
    const dark = this.pref === 'dark' || (this.pref === 'auto' && this.mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-pref', this.pref);
    const btns = $$('#themeSeg button');
    btns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeValue === this.pref)));
    const idx = btns.findIndex(b => b.dataset.themeValue === this.pref);
    const thumb = $('#themeSeg .theme-thumb');
    if (thumb && idx >= 0) thumb.style.transform = `translateX(${btns[idx].offsetLeft}px)`;
    if (!silent && typeof Charts !== 'undefined') Charts.refreshTheme();
  }
};
