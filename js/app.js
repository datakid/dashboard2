const Exporter = {
  xlsxPromise: null,

  loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (this.xlsxPromise) return this.xlsxPromise;
    this.xlsxPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = res;
      s.onerror = () => { this.xlsxPromise = null; rej(); };
      document.head.appendChild(s);
    });
    return this.xlsxPromise;
  },

  async excel() {
    const btn = $('#exportExcelBtn');
    btn.disabled = true;
    try {
      await this.loadXLSX();
      const header = [[`Alembic export · Fiscal year ${fyLabel(S.filters.Year)} · ${Data.summary()}`], []];
      const wb = XLSX.utils.book_new();
      const agg = Data.aggregate(S.filtered);
      const { months, rows } = Data.exploreRows(agg);
      const addSheet = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
      const tab = S.tab;
      const exploreAoa = [...header, ['Metric', ...months, 'Total'], ...rows.map(r => [r.Metric, ...months.map(m => r[m] || 0), r._sum])];
      const missingAoa = [...header, ['Region', 'Pharmacy', 'Month', 'Status'], ...S.missing.map(r => [r.Region, r.Pharmacy, r.Month, r.Status])];
      const cleanRows = S.filtered.map(r => { const o = { ...r }; return o; });
      const headers = cleanRows.length ? Object.keys(cleanRows[0]) : ['No data available'];
      const dataAoa = [...header, headers, ...cleanRows.map(r => headers.map(h => r[h]))];
      if (tab === 'explore') addSheet('Explore', exploreAoa);
      else if (tab === 'missing') addSheet('Missing', missingAoa);
      else addSheet('Data', dataAoa);
      if (tab !== 'explore') addSheet('Explore', exploreAoa);
      if (tab !== 'missing') addSheet('Missing', missingAoa);
      if (tab === 'explore' || tab === 'missing') addSheet('Data', dataAoa);
      const catAoa = [...header, ['Medication class', 'Value', 'Share %'], ...Data.cats().map(c => { const t = Data.sumCats(agg.byCat); return [c, agg.byCat[c] || 0, t ? +((agg.byCat[c] || 0) / t * 100).toFixed(2) : 0]; })];
      addSheet('Classes', catAoa);
      XLSX.writeFile(wb, `alembic-FY${S.filters.Year}-${stamp()}.xlsx`);
      toast('Excel workbook ready — check your downloads', 'success');
    } catch (e) {
      toast('Could not load the export module — check your connection', 'error');
    } finally { btn.disabled = false; }
  },

  csvCell(v) { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; },

  toCsv(meta, head, rows) {
    const lines = meta.map(([k, v]) => `${this.csvCell(k)},${this.csvCell(v)}`);
    lines.push('');
    lines.push(head.map(h => this.csvCell(h)).join(','));
    rows.forEach(r => lines.push(r.map(c => this.csvCell(c)).join(',')));
    return lines.join('\r\n');
  },

  deliver(csv, name) {
    downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), name);
    Modal.open('Export generated',
      `<p class="note"><strong>Download started.</strong> If your browser blocked it, copy the CSV below and paste it into Excel or a .csv file.</p><textarea class="csv-box" id="csvBox" readonly></textarea>`,
      `<button class="btn primary" type="button" id="copyCsv">${icon('copy')}<span>Copy to clipboard</span></button>`);
    $('#csvBox').value = csv;
    $('#copyCsv').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const ok = await copyText(csv);
      b.innerHTML = `${icon('check')}<span>${ok ? 'Copied' : 'Copy failed'}</span>`;
      setTimeout(() => { b.innerHTML = `${icon('copy')}<span>Copy to clipboard</span>`; }, 1800);
    });
  },

  yearsCsv() {
    if (!S.yearsScope.length) { toast('Choose at least one year first', 'info'); return; }
    const f = S.yearsFilters;
    const years = S.yearsScope.slice().sort((a, b) => b - a);
    const map = {};
    years.forEach(y => { map[y] = Data.scopedMetrics({ ...f, Year: y }); });
    const csv = this.toCsv(
      [['Dashboard view', 'Years'], ['Applied filters', `Region: ${f.Region} | Pharmacy: ${f.Pharmacy} | Month: ${f.Month} | Class: ${f.Class}`]],
      ['Metric', ...years.map(y => `${y - 1}-${y}`)],
      SCOPED_METRICS.map(m => [m, ...years.map(y => Math.round(map[y][m]))])
    );
    this.deliver(csv, `alembic-years-${stamp()}.csv`);
  },

  compareCsv() {
    const a = S.cmpA, b = S.cmpB;
    const ma = Data.scopedMetrics(a), mb = Data.scopedMetrics(b);
    const lab = (f) => f.Year === 'all' ? 'All' : `${f.Year - 1}-${f.Year}`;
    const desc = (f) => `Year: ${f.Year} | Region: ${f.Region} | Pharmacy: ${f.Pharmacy} | Month: ${f.Month} | Class: ${f.Class}`;
    const csv = this.toCsv(
      [['Dashboard view', 'Compare'], ['Side A', desc(a)], ['Side B', desc(b)]],
      ['Metric', `Side A (${lab(a)})`, `Side B (${lab(b)})`, 'Difference', 'Change % (A vs B)'],
      SCOPED_METRICS.map(m => [m, Math.round(ma[m]), Math.round(mb[m]), Math.round(ma[m] - mb[m]), mb[m] ? ((ma[m] - mb[m]) / mb[m] * 100).toFixed(1) : ''])
    );
    this.deliver(csv, `alembic-compare-${stamp()}.csv`);
  }
};

const Sync = {
  controller: null,
  timer: null,
  clock: null,

  label() {
    const d = S.lastSync;
    if (!d) return 'Not synced';
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 10) return 'Synced just now';
    if (s < 60) return `Synced ${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `Synced ${m}m ago`;
    return `Synced ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  },

  paint(state) {
    const el = $('#syncStatus');
    if (state) el.dataset.state = state;
    else el.dataset.state = S.lastSync && Date.now() - S.lastSync.getTime() > AUTO_SYNC_MS ? 'stale' : 'idle';
    $('#syncLabel').textContent = state === 'syncing' ? 'Syncing…' : state === 'error' ? 'Sync failed' : this.label();
    $('#syncBtn').title = `${this.label()} · Refresh (R)`;
  },

  setAuto(on, announce) {
    S.autoSync = on;
    store.set('alembic-auto-sync', on);
    $('#autoSyncToggle').setAttribute('aria-pressed', String(on));
    clearInterval(this.timer);
    if (on) this.timer = setInterval(() => { if (!document.hidden) this.load(false, true); }, AUTO_SYNC_MS);
    if (announce) toast(on ? 'Auto-sync on · every 5 minutes' : 'Auto-sync off', 'info');
  },

  async load(manual = false, auto = false) {
    if (!window.Papa) { setTimeout(() => this.load(manual, auto), 120); return; }
    if (this.controller) this.controller.abort();
    const ctrl = new AbortController();
    this.controller = ctrl;
    S.syncing = true;
    $('#syncBtn').classList.add('spinning');
    this.paint('syncing');
    try {
      const res = await fetch(`${SHEET_URL}&t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error('bad');
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      parsed.data.forEach((r, i) => { r._rowNum = i + 2; });
      const { clean, duplicates } = Data.process(parsed.data);
      S.data = clean;
      S.duplicates = duplicates;
      S.years = [...new Set(clean.map(r => r.Year))].filter(Boolean).map(Number).sort((a, b) => a - b);
      S.statsCache = { sig: null, stats: null };
      S.lastSync = new Date();
      App.onData();
      this.paint();
      if (manual) toast('Data refreshed', 'success');
      else if (auto) toast('Auto-synced', 'success');
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.paint('error');
      if (!S.data.length) App.loadError();
      toast('Could not reach the data source — check your connection', 'error');
    } finally {
      if (this.controller === ctrl) { $('#syncBtn').classList.remove('spinning'); S.syncing = false; }
    }
  },

  init() {
    $('#syncBtn').addEventListener('click', () => this.load(true));
    $('#autoSyncToggle').addEventListener('click', () => this.setAuto(!S.autoSync, true));
    this.setAuto(S.autoSync, false);
    this.clock = setInterval(() => { if (!S.syncing && S.lastSync) this.paint(); }, 20000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.autoSync && S.lastSync && Date.now() - S.lastSync.getTime() > AUTO_SYNC_MS) this.load(false, true);
    });
  }
};

const App = {
  tabs: ['overview', 'charts', 'explore', 'missing', 'years', 'compare'],
  filterTabs: ['overview', 'charts', 'explore', 'missing'],

  setTab(tab, fromHash) {
    if (!this.tabs.includes(tab)) tab = 'overview';
    S.tab = tab;
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $$('.view').forEach(v => { v.hidden = v.id !== `view-${tab}`; });
    $('#filterDeck').hidden = !this.filterTabs.includes(tab);
    this.moveThumb();
    if (!fromHash) history.replaceState(null, '', `#${tab}`);
    store.set('alembic-tab', tab);
    const active = $(`.tab[data-tab="${tab}"]`);
    if (active && active.scrollIntoView && innerWidth < 1080) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (S.data.length) this.renderTab();
  },

  moveThumb() {
    const a = $('.tab[aria-selected="true"]');
    const th = $('.tab-thumb');
    if (!a || !th) return;
    th.style.width = `${a.offsetWidth}px`;
    th.style.transform = `translateX(${a.offsetLeft}px)`;
  },

  renderTab() {
    const agg = this.filterTabs.includes(S.tab) ? Data.aggregate(S.filtered) : null;
    if (S.tab === 'overview') Overview.render(agg);
    else if (S.tab === 'charts') Charts.render(agg);
    else if (S.tab === 'explore') Explore.render(agg);
    else if (S.tab === 'missing') Missing.render();
    else if (S.tab === 'years') Years.render();
    else if (S.tab === 'compare') Compare.render();
  },

  refreshStatus() {
    const rc = $('#resultsCount');
    rc.classList.remove('skeleton');
    rc.textContent = `${fmt(S.filtered.length)} results`;
    const mc = $('#missingResultsCount');
    mc.hidden = !S.missing.length;
    mc.textContent = `${fmt(S.missing.length)} missing`;
    const badge = $('#missingTabBadge');
    badge.hidden = !S.missing.length;
    badge.textContent = S.missing.length > 99 ? '99+' : S.missing.length;
    const dups = S.duplicates.filter(d => String(d.Year) === String(S.filters.Year));
    const dc = $('#duplicateResultsCount');
    dc.hidden = !dups.length;
    dc.textContent = `${dups.length} duplicates merged`;
    $('#filterSummary').textContent = Data.summary();
    $('#filterSummary').title = Data.summary();
    document.title = Data.activeCount() ? `Alembic · ${Data.summary()}` : 'Alembic — Pharmacy Intelligence';
  },

  changed: debounce(function () {
    S.statsCache = { sig: null, stats: null };
    Data.applyFilters();
    Data.findMissing();
    Filters.persist();
    Filters.renderButtons();
    Search.renderChips();
    App.refreshStatus();
    App.renderTab();
  }, 60),

  populateYears() {
    const sel = $('#yearFilter');
    sel.innerHTML = S.years.slice().reverse().map(y => `<option value="${y}">${fyLabel(y)}</option>`).join('');
    const keep = S.filters.Year && S.years.map(String).includes(String(S.filters.Year));
    S.filters.Year = keep ? String(S.filters.Year) : String(Math.max(...S.years));
    sel.value = S.filters.Year;
  },

  onData() {
    if (!S.years.length) { this.loadError('The sheet returned no rows with a Year.'); return; }
    if (S.firstLoad) Filters.fromHash();
    this.populateYears();
    if (S.firstLoad) {
      Filters.restore();
      Compare.init();
      S.firstLoad = false;
    }
    Search.buildIndex();
    S.statsCache = { sig: null, stats: null };
    Data.applyFilters();
    Data.findMissing();
    Filters.renderButtons();
    Search.renderChips();
    this.refreshStatus();
    this.renderTab();
  },

  loadError(msg) {
    const html = emptyHTML('Could not load data', msg || 'The prescription sheet could not be reached. Check your connection and press refresh.', 'alert', true);
    $('#statsTotalRow').innerHTML = `<div class="card">${html}</div>`;
    $('#statsCoreRow').innerHTML = '';
    $('#resultsCount').classList.remove('skeleton');
    $('#resultsCount').textContent = 'No data';
  },

  async share() {
    const ok = await copyText(Filters.shareLink());
    toast(ok ? 'Share link copied' : 'Could not copy link', ok ? 'success' : 'error');
  },

  duplicates() {
    const d = S.duplicates.filter(x => String(x.Year) === String(S.filters.Year));
    Modal.open('Merged duplicates', d.map(x => `<div class="dup-item"><div class="dup-top"><span dir="auto">${esc(x.Year)} · ${esc(x.Pharmacy)} · ${esc(x.Month)}</span><span class="pill plum">${x.count} merged</span></div><div class="dup-ids">${esc(x.Region)} · ${esc(x.Class)} · Sheet rows ${esc(x.rows)}</div></div>`).join(''));
  },

  shortcuts() {
    const rows = [
      ['Search & command', ['⌘', 'K']], ['Switch tab', ['1', '–', '6']], ['Refresh data', ['R']], ['Toggle filters panel', ['F']],
      ['Export Excel', ['E']], ['Cycle theme', ['T']], ['Copy share link', ['S']], ['Remove last filter', ['⌫']], ['Clear all filters', ['⌘', '⌫']], ['Close / dismiss', ['Esc']], ['This help', ['?']]
    ];
    Modal.open('Keyboard shortcuts', `<div class="shortcut-list">${rows.map(([l, k]) => `<div class="shortcut-row"><span>${l}</span><span>${k.map(x => `<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`);
  },

  keys() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#universalSearchInput').focus(); return; }
      if (e.key === 'Escape') {
        if (Modal.isOpen) { Modal.close(); return; }
        Search.setOpen(false); Filters.closeAll();
        return;
      }
      const typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey || Modal.isOpen) return;
      const k = e.key.toLowerCase();
      if (/^[1-6]$/.test(k)) { this.setTab(this.tabs[Number(k) - 1]); }
      else if (k === 'r') Sync.load(true);
      else if (k === 'f' && this.filterTabs.includes(S.tab)) $('#toggleFiltersBtn').click();
      else if (k === 'e') Exporter.excel();
      else if (k === 't') Theme.cycle();
      else if (k === 's') this.share();
      else if (k === '?' || (k === '/' && e.shiftKey)) this.shortcuts();
      else if (k === '/') { e.preventDefault(); $('#universalSearchInput').focus(); }
    });
  },

  init() {
    hydrateIcons();
    Theme.init();
    Charts.restoreOpts();
    Filters.build();
    Search.init();
    Overview.init();
    Explore.init();
    Missing.init();
    Years.init();
    Compare.bind();
    Sync.init();
    this.keys();

    $('#tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) this.setTab(t.dataset.tab); });
    $('#tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = this.tabs.indexOf(S.tab);
      const n = this.tabs[(i + (e.key === 'ArrowRight' ? 1 : this.tabs.length - 1)) % this.tabs.length];
      this.setTab(n); $(`.tab[data-tab="${n}"]`).focus();
    });
    $('#yearFilter').addEventListener('change', (e) => {
      S.filters.Year = e.target.value;
      FIELDS.forEach(k => { S.filters[k] = []; });
      Search.buildIndex();
      this.changed();
    });
    $('#exportExcelBtn').addEventListener('click', () => Exporter.excel());
    $('#missingResultsCount').addEventListener('click', () => this.setTab('missing'));
    $('#duplicateResultsCount').addEventListener('click', () => this.duplicates());
    $('#shortcutsBtn').addEventListener('click', () => this.shortcuts());
    $('#modalClose').addEventListener('click', () => Modal.close());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') Modal.close(); });
    $('#scrollTopBtn').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    addEventListener('scroll', debounce(() => $('#scrollTopBtn').classList.toggle('show', scrollY > 480), 60), { passive: true });
    addEventListener('resize', debounce(() => { this.moveThumb(); Theme.apply(true); }, 100));
    addEventListener('hashchange', () => { const t = location.hash.slice(1).split('?')[0]; if (t && t !== S.tab) this.setTab(t, true); });

    const initial = location.hash.slice(1).split('?')[0] || store.get('alembic-tab', 'overview');
    this.setTab(this.tabs.includes(initial) ? initial : 'overview', !!location.hash);
    if (document.fonts) document.fonts.ready.then(() => { this.moveThumb(); Theme.apply(true); });
    Sync.load(false);
    this.embedBridge();
  },

  embedBridge() {
    if (window.parent === window) return;
    const send = (msg) => { try { window.parent.postMessage(msg, '*'); } catch (e) {} };
    const ready = () => {
      send({ t: 'lx:ready', title: document.title });
      let last = document.title;
      const el = $('title');
      if (el) new MutationObserver(() => { if (document.title !== last) { last = document.title; send({ t: 'lx:title', title: last }); } }).observe(el, { childList: true });
    };
    if (document.readyState === 'complete') ready(); else addEventListener('load', ready);
  }
};

const bootStart = Date.now();
const boot = () => {
  if ((!window.Chart || !window.Fuse || !window.Papa) && Date.now() - bootStart < 8000) { setTimeout(boot, 40); return; }
  App.init();
};
boot();
