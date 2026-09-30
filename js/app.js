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
      const header = [[`Alembic export · ${Data.periodLabel()} · ${Data.summary()}`], []];
      const wb = XLSX.utils.book_new();
      const agg = Data.aggregate(S.filtered);
      const { months, labels, rows } = Data.exploreRows(agg);
      const addSheet = (name, aoa) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
      const tab = S.tab;
      const exploreAoa = [...header, ['Metric', ...labels, 'Total'], ...rows.map(r => [r.Metric, ...months.map(m => r[m] || 0), r._sum])];
      const missingAoa = [...header, ['Fiscal year', 'Region', 'Pharmacy', 'Month', 'Status'], ...S.missing.map(r => [fyLabel(r.Year), r.Region, r.Pharmacy, r.Month, r.Status])];
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
      XLSX.writeFile(wb, `alembic-${Data.periodSlug()}-${stamp()}.xlsx`);
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
      S.dataVersion += 1;
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

const Timeline = {
  multi: store.get('alembic-multi-year', false),

  set(years, silent) {
    const all = S.years.map(String);
    let ys = [...new Set(years.map(String))].filter(y => all.includes(y)).sort((a, b) => a - b);
    if (ys.length === all.length && all.length > 1) ys = [];
    const same = ys.join() === S.filters.Years.join();
    S.filters.Years = ys;
    store.set('alembic-period', ys);
    if (same && !silent) return;
    S.statsCache = { sig: null, stats: null };
    Search.buildIndex();
    this.render();
    App.changed();
  },

  toggleYear(y, additive) {
    const cur = S.filters.Years;
    if (additive) {
      const base = cur.length ? cur : [];
      this.set(base.includes(y) ? base.filter(x => x !== y) : [...base, y]);
    } else this.set(cur.length === 1 && cur[0] === y ? [] : [y]);
  },

  step(d) {
    const ys = S.years.map(String);
    if (!ys.length) return;
    const cur = S.filters.Years;
    if (!cur.length) { this.set([ys[d > 0 ? 0 : ys.length - 1]]); return; }
    const i = ys.indexOf(d > 0 ? cur[cur.length - 1] : cur[0]);
    const n = Math.max(0, Math.min(ys.length - 1, i + d));
    this.set([ys[n]]);
  },

  render() {
    const track = $('#timelineTrack');
    if (!track || !S.years.length) return;
    const tot = Data.yearTotals();
    const years = S.years.map(String);
    const max = Math.max(1, ...years.map(y => tot[y].v));
    const sel = new Set(S.filters.Years);
    const all = !sel.size;
    const allV = years.reduce((s, y) => s + tot[y].v, 0);
    track.innerHTML = `<button type="button" class="tl-all${all ? ' on' : ''}" data-all role="option" aria-selected="${all}">
        <span class="tl-all-ic">${icon('layers')}</span><span class="tl-meta"><span class="tl-name">All time</span><span class="tl-val">${compact(allV)}</span></span>
      </button><span class="tl-sep" aria-hidden="true"></span>` +
      years.map((y, i) => {
        const on = all || sel.has(y);
        const h = Math.max(6, tot[y].v / max * 100);
        return `<button type="button" class="tl-year${sel.has(y) ? ' on' : ''}${all ? ' in-all' : ''}${!tot[y].n ? ' empty' : ''}" data-y="${y}" role="option" aria-selected="${on}" style="--h:${h.toFixed(1)}%;--i:${i}" data-tip="FY ${fyLabel(y)} · ${fmt(tot[y].v)}">
          <span class="tl-bar"><i></i></span>
          <span class="tl-meta"><span class="tl-name">FY ${fyShort(y)}</span><span class="tl-val">${tot[y].n ? compact(tot[y].v) : '—'}</span></span>
          ${sel.has(y) ? `<span class="tl-check">${icon('check')}</span>` : ''}
        </button>`;
      }).join('');
    const label = Data.periodLabel();
    $('#periodLabel').textContent = label;
    $('#periodPillText').textContent = label;
    $('#multiYearToggle').setAttribute('aria-pressed', String(this.multi));
    const g = $('#grainSeg');
    g.hidden = !Data.multiYear();
    $$('button', g).forEach(b => b.classList.toggle('on', b.dataset.v === S.grain));
  },

  init() {
    $('#timelineTrack').addEventListener('click', (e) => {
      if (e.target.closest('[data-all]')) { this.set([]); return; }
      const b = e.target.closest('.tl-year');
      if (b) this.toggleYear(b.dataset.y, this.multi || e.shiftKey || e.metaKey || e.ctrlKey);
    });
    $('#timelineTrack').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const items = $$('#timelineTrack button');
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      n.focus();
    });
    $('#multiYearToggle').addEventListener('click', () => {
      this.multi = !this.multi;
      store.set('alembic-multi-year', this.multi);
      this.render();
      toast(this.multi ? 'Multi-year on · tap years to add or remove them' : 'Multi-year off · tapping a year selects just that year', 'info', 2600);
    });
    $('#grainSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.dataset.v === S.grain) return;
      S.grain = b.dataset.v;
      store.set('alembic-grain', S.grain);
      this.render();
      App.renderTab();
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
    $('#periodPill').hidden = !this.filterTabs.includes(tab);
    this.moveThumb();
    if (!fromHash) history.replaceState(null, '', `#${tab}`);
    store.set('alembic-tab', tab);
    const active = $(`.tab[data-tab="${tab}"]`);
    if (active && $('#tabs').scrollWidth > $('#tabs').clientWidth) { const t = $('#tabs'); t.scrollTo({ left: active.offsetLeft - (t.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' }); }
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
    else if (S.tab === 'missing') { Data.findMissing(); Missing.render(); }
    else if (S.tab === 'years') Years.render();
    else if (S.tab === 'compare') Compare.render();
  },

  refreshStatus(quick) {
    const rc = $('#resultsCount');
    rc.classList.remove('skeleton');
    rc.textContent = `${fmt(S.filtered.length)} results`;
    if (quick) { $('#filterSummary').textContent = Data.summary(); return; }
    const mc = $('#missingResultsCount');
    mc.hidden = !S.missing.length;
    mc.textContent = `${fmt(S.missing.length)} missing`;
    const badge = $('#missingTabBadge');
    badge.hidden = !S.missing.length;
    badge.textContent = S.missing.length > 99 ? '99+' : S.missing.length;
    const ys = new Set(Data.scopeYears());
    const dups = S.duplicates.filter(d => ys.has(String(d.Year)));
    const dc = $('#duplicateResultsCount');
    dc.hidden = !dups.length;
    dc.textContent = `${dups.length} duplicates merged`;
    $('#filterSummary').textContent = Data.summary();
    $('#filterSummary').dataset.tip = Data.summary();
    document.title = Data.activeCount() || !Data.isAllTime() ? `Alembic · ${Data.periodLabel()}${Data.activeCount() ? ' · ' + Data.summary() : ''}` : 'Alembic — Pharmacy Intelligence';
  },

  _raf: 0,
  _idle: 0,

  changed() {
    if (App._raf) return;
    App._raf = requestAnimationFrame(() => {
      App._raf = 0;
      S.statsCache = { sig: null, stats: null };
      Data.applyFilters();
      App.renderTab();
      Filters.renderButtons();
      Search.renderChips();
      App.refreshStatus(true);
      clearTimeout(App._idle);
      App._idle = setTimeout(() => {
        Data.findMissing();
        Filters.persist();
        Timeline.render();
        App.refreshStatus();
        if (S.tab === 'missing') Missing.render();
      }, 0);
    });
  },

  populateYears() {
    const valid = new Set(S.years.map(String));
    S.filters.Years = S.filters.Years.map(String).filter(y => valid.has(y));
  },

  async confirmClear() {
    const n = Data.activeCount();
    if (!n) return;
    if (n > 1) {
      const ok = await Modal.confirm({ title: 'Clear all filters?', message: `This removes ${n} active filters. The selected period (${Data.periodLabel()}) stays as it is.`, confirm: 'Clear filters', ic: 'trash' });
      if (!ok) return;
    }
    Filters.clearAll();
    toast('Filters cleared', 'success', 2200);
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
    Timeline.render();
    this.refreshStatus();
    this.renderTab();
  },

  loadError(msg) {
    const html = emptyHTML('Could not load data', msg || 'The prescription sheet could not be reached. Check your connection and press refresh.', 'alert', true);
    $('#statsTotalRow').innerHTML = `<div class="card">${html}</div>`;
    $('#statsCoreRow').innerHTML = '';
    Overview.built = false;
    $('#resultsCount').classList.remove('skeleton');
    $('#resultsCount').textContent = 'No data';
  },

  async share() {
    const ok = await copyText(Filters.shareLink());
    toast(ok ? 'Share link copied' : 'Could not copy link', ok ? 'success' : 'error');
  },

  duplicates() {
    const ys = new Set(Data.scopeYears());
    const d = S.duplicates.filter(x => ys.has(String(x.Year)));
    Modal.open('Merged duplicates', d.map(x => `<div class="dup-item"><div class="dup-top"><span dir="auto">${esc(x.Year)} · ${esc(x.Pharmacy)} · ${esc(x.Month)}</span><span class="pill plum">${x.count} merged</span></div><div class="dup-ids">${esc(x.Region)} · ${esc(x.Class)} · Sheet rows ${esc(x.rows)}</div></div>`).join(''));
  },

  shortcuts() {
    const rows = [
      ['Search & command', ['⌘', 'K']], ['Switch tab', ['1', '–', '6']], ['Previous / next year', ['[', ']']], ['All time', ['A']], ['Refresh data', ['R']], ['Toggle filters panel', ['F']],
      ['Export Excel', ['E']], ['Cycle theme', ['T']], ['Copy share link', ['S']], ['Remove last filter', ['⌫']], ['Clear all filters', ['⌘', '⌫']], ['Close / dismiss', ['Esc']], ['This help', ['?']]
    ];
    Modal.open('Keyboard shortcuts', `<div class="shortcut-list">${rows.map(([l, k]) => `<div class="shortcut-row"><span>${l}</span><span>${k.map(x => `<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`);
  },

  keys() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#universalSearchInput').focus(); return; }
      if (e.key === 'Escape') {
        if (Select.isOpen) { Select.close(); return; }
        if (Modal.isOpen) { Modal.close(); return; }
        const busy = $('.dd-menu.open') || Search.isOpen();
        Search.setOpen(false); Filters.closeAll();
        if (!busy && !e.target.closest('input, textarea') && (S.tab === 'overview' || S.tab === 'charts') && Overview.clearCats()) toast('Class focus cleared', 'info', 1600);
        return;
      }
      const typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey || Modal.isOpen || Select.isOpen || $('.dd-menu.open')) return;
      const k = e.key.toLowerCase();
      if (/^[1-6]$/.test(k)) { this.setTab(this.tabs[Number(k) - 1]); }
      else if (k === 'r') Sync.load(true);
      else if (k === 'f' && this.filterTabs.includes(S.tab)) $('#toggleFiltersBtn').click();
      else if (k === 'e') Exporter.excel();
      else if (k === 't') Theme.cycle();
      else if (k === 's') this.share();
      else if (k === '[' || k === ']') Timeline.step(k === ']' ? 1 : -1);
      else if (k === 'a' && this.filterTabs.includes(S.tab)) Timeline.set([]);
      else if (k === '?' || (k === '/' && e.shiftKey)) this.shortcuts();
      else if (k === '/') { e.preventDefault(); $('#universalSearchInput').focus(); }
    });
  },

  init() {
    hydrateIcons();
    Tip.init();
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
    Timeline.init();
    $('#periodPill').addEventListener('click', () => {
      const deck = $('#filterDeck');
      scrollTo({ top: Math.max(0, deck.getBoundingClientRect().top + scrollY - 90), behavior: 'smooth' });
      const el = $('#timeline'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    });
    $('#exportExcelBtn').addEventListener('click', () => Exporter.excel());
    $('#missingResultsCount').addEventListener('click', () => this.setTab('missing'));
    $('#duplicateResultsCount').addEventListener('click', () => this.duplicates());
    $('#shortcutsBtn').addEventListener('click', () => this.shortcuts());
    $('#modalClose').addEventListener('click', () => Modal.close());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') Modal.close(); });
    $('#scrollTopBtn').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    addEventListener('scroll', debounce(() => { $('#scrollTopBtn').classList.toggle('show', scrollY > 480); $('#navbar').classList.toggle('stuck', scrollY > 70); }, 30), { passive: true });
    let lastW = innerWidth;
    addEventListener('resize', debounce(() => {
      this.moveThumb(); Theme.apply(true);
      if (Math.abs(innerWidth - lastW) > 40 && S.tab === 'charts' && S.data.length) Charts.render(Data.aggregate(S.filtered));
      lastW = innerWidth;
    }, 160));
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
