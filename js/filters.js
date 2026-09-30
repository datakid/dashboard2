const Filters = {
  focus: -1,
  recentsKey: 'alembic-recents',

  build() {
    const host = $('#deckFilters');
    host.innerHTML = FIELDS.map(f => `
      <div class="dd" data-field="${f}">
        <span class="dd-label">${FIELD_META[f].label}</span>
        <div class="dd-wrap">
          <button class="dd-btn" type="button" data-field="${f}" aria-haspopup="listbox" aria-expanded="false">All</button>
          <button class="dd-clear" type="button" data-field="${f}" aria-label="Clear ${FIELD_META[f].label}">${icon('x')}</button>
          <div class="dd-menu" role="listbox" data-field="${f}">
            <div class="dd-grip" aria-hidden="true"></div>
            <div class="dd-title">${FIELD_META[f].label}</div>
            <div class="dd-filter">${icon('search')}<input type="search" placeholder="Filter ${FIELD_META[f].label.toLowerCase()}…" aria-label="Filter options" spellcheck="false" /></div>
            <div class="dd-list"></div>
            <div class="dd-foot"><button type="button" data-act="all">Select visible</button><button type="button" data-act="none">Clear</button><button type="button" class="dd-done" data-act="done">Done</button></div>
          </div>
        </div>
      </div>`).join('');

    host.addEventListener('click', (e) => {
      const btn = e.target.closest('.dd-btn');
      if (btn) { e.stopPropagation(); const open = btn.classList.contains('open'); this.closeAll(); if (!open) this.open(btn.dataset.field); return; }
      const clr = e.target.closest('.dd-clear');
      if (clr) { e.stopPropagation(); S.filters[clr.dataset.field] = []; App.changed(); return; }
      const item = e.target.closest('.dd-item');
      if (item) {
        e.stopPropagation();
        if (item.classList.contains('off') && !item.classList.contains('sel')) return;
        this.toggle(item.closest('.dd-menu').dataset.field, item.dataset.value);
        return;
      }
      const act = e.target.closest('.dd-foot button');
      if (act) {
        e.stopPropagation();
        const field = act.closest('.dd-menu').dataset.field;
        if (act.dataset.act === 'done') { this.closeAll(); return; }
        if (act.dataset.act === 'none') S.filters[field] = [];
        else {
          const vals = $$('.dd-item:not(.off)', act.closest('.dd-menu')).map(i => i.dataset.value);
          S.filters[field] = [...new Set([...S.filters[field], ...vals])];
        }
        App.changed();
      }
    });

    host.addEventListener('input', (e) => {
      if (e.target.matches('.dd-filter input')) { this.focus = -1; this.renderList(e.target.closest('.dd-menu').dataset.field); }
    });

    host.addEventListener('keydown', (e) => {
      const menu = e.target.closest('.dd');
      if (!menu) return;
      const field = menu.dataset.field;
      const m = $('.dd-menu', menu);
      const isOpen = m.classList.contains('open');
      const items = $$('.dd-item', m);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen) { this.open(field); return; }
        this.focus = Math.min(this.focus + 1, items.length - 1); this.paintFocus(m);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isOpen) { this.focus = Math.max(this.focus - 1, 0); this.paintFocus(m); }
      } else if (e.key === 'Enter' && isOpen && this.focus >= 0 && items[this.focus]) {
        e.preventDefault();
        const it = items[this.focus];
        if (!(it.classList.contains('off') && !it.classList.contains('sel'))) this.toggle(field, it.dataset.value);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault(); e.stopPropagation(); this.closeAll(); $('.dd-btn', menu).focus();
      }
    });

    document.addEventListener('click', (e) => { if (!e.target.closest('.dd') && !e.target.closest('#scrim')) this.closeAll(); });
    $('#scrim').addEventListener('click', () => this.closeAll());

    $('#toggleFiltersBtn').addEventListener('click', () => {
      const deck = $('#filterDeck');
      const collapsed = deck.classList.toggle('collapsed');
      $('#toggleFiltersBtn').setAttribute('aria-expanded', String(!collapsed));
      store.set('alembic-filters-collapsed', collapsed);
    });
    if (store.get('alembic-filters-collapsed', false)) {
      $('#filterDeck').classList.add('collapsed');
      $('#toggleFiltersBtn').setAttribute('aria-expanded', 'false');
    }
  },

  open(field) {
    const m = $(`.dd-menu[data-field="${field}"]`);
    const b = $(`.dd-btn[data-field="${field}"]`);
    this.focus = -1;
    const inp = $('.dd-filter input', m);
    inp.value = '';
    this.renderList(field);
    const mobile = matchMedia('(max-width: 760px)').matches;
    m.classList.toggle('sheet', mobile);
    $('#scrim').classList.toggle('on', mobile);
    document.body.classList.toggle('sheet-open', mobile);
    m.classList.add('open'); b.classList.add('open'); b.setAttribute('aria-expanded', 'true');
    if (!mobile) setTimeout(() => inp.focus(), 20); else m.tabIndex = -1;
  },

  closeAll() {
    if ($('.dd-menu.open')) { $('#scrim').classList.remove('on'); document.body.classList.remove('sheet-open'); }
    $$('.dd-menu.open').forEach(m => m.classList.remove('open'));
    $$('.dd-btn.open').forEach(b => { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
    this.focus = -1;
  },

  paintFocus(m) {
    const items = $$('.dd-item', m);
    items.forEach(i => i.classList.remove('focus'));
    const it = items[this.focus];
    if (it) { it.classList.add('focus'); it.scrollIntoView({ block: 'nearest' }); }
  },

  toggle(field, value) {
    const arr = S.filters[field];
    if (arr.includes(value)) S.filters[field] = arr.filter(v => v !== value);
    else { arr.push(value); this.addRecent(field, value); }
    App.changed();
  },

  renderList(field) {
    const m = $(`.dd-menu[data-field="${field}"]`);
    if (!m) return;
    const q = normalizeArabic($('.dd-filter input', m).value.trim());
    const stats = Data.optionStats()[field];
    const sel = S.filters[field];
    let opts = Data.options(field).map(v => ({ v, n: stats.get(v) || 0, s: sel.includes(v) }));
    sel.forEach(v => { if (!opts.find(o => o.v === v)) opts.push({ v, n: 0, s: true }); });
    if (q) opts = opts.filter(o => normalizeArabic(o.v).includes(q));
    opts.sort((a, b) => {
      const av = a.n > 0 || a.s, bv = b.n > 0 || b.s;
      if (av !== bv) return av ? -1 : 1;
      return field === 'Month' ? monthRank(a.v) - monthRank(b.v) : a.v.localeCompare(b.v);
    });
    $('.dd-list', m).innerHTML = opts.length ? opts.map(o => `
      <div class="dd-item${o.s ? ' sel' : ''}${o.n === 0 && !o.s ? ' off' : ''}" role="option" aria-selected="${o.s}" data-value="${esc(o.v)}">
        <span class="box">${icon('check')}</span><span class="lbl" dir="auto">${esc(o.v)}</span><span class="cnt">${o.n || ''}</span>
      </div>`).join('') : `<div class="empty" style="padding:1.5rem"><div class="empty-desc">No options</div></div>`;
    if (this.focus >= 0) this.paintFocus(m);
  },

  renderButtons() {
    FIELDS.forEach(f => {
      const b = $(`.dd-btn[data-field="${f}"]`);
      if (!b) return;
      const sel = S.filters[f];
      b.textContent = !sel.length ? 'All' : sel.length === 1 ? sel[0] : `${sel.length} selected`;
      b.classList.toggle('has', sel.length > 0);
      b.setAttribute('dir', 'auto');
      if ($(`.dd-menu[data-field="${f}"]`).classList.contains('open')) this.renderList(f);
    });
    const n = Data.activeCount();
    const badge = $('#filterCountBadge');
    badge.textContent = n; badge.hidden = n === 0;
  },

  getRecents() { return store.sget(this.recentsKey, store.sget('lx-recent-selections', [])); },
  addRecent(field, value) {
    const r = this.getRecents().filter(x => !(x.field === field && x.value === value));
    r.unshift({ field, value });
    store.sset(this.recentsKey, r.slice(0, 8));
  },

  persist() { const { Year, ...rest } = S.filters; store.sset('alembic-filters', rest); },

  restore() {
    const saved = store.sget('alembic-filters', store.sget('lx-dashboard-filters', null));
    const fromUrl = this.fromHash();
    const src = fromUrl || saved;
    if (!src || typeof src !== 'object') return;
    let dropped = false;
    FIELDS.forEach(k => {
      if (!Array.isArray(src[k])) return;
      const valid = new Set(Data.options(k));
      const kept = src[k].filter(v => valid.has(v));
      if (kept.length !== src[k].length) dropped = true;
      S.filters[k] = kept;
    });
    if (dropped) toast('Some saved filters no longer apply and were removed', 'info');
  },

  fromHash() {
    const h = location.hash.split('?')[1];
    if (!h) return null;
    const p = new URLSearchParams(h);
    const out = {};
    let any = false;
    FIELDS.forEach(f => { const v = p.get(f); if (v) { out[f] = v.split('|'); any = true; } });
    const y = p.get('Year');
    if (y && S.years.map(String).includes(y)) S.filters.Year = y;
    return any ? out : null;
  },

  shareLink() {
    const p = new URLSearchParams();
    p.set('Year', S.filters.Year);
    FIELDS.forEach(f => { if (S.filters[f].length) p.set(f, S.filters[f].join('|')); });
    return `${location.origin}${location.pathname}#${S.tab}?${p.toString()}`;
  },

  clearAll() { FIELDS.forEach(k => { S.filters[k] = []; }); App.changed(); }
};

const Search = {
  idx: {},
  sel: -1,
  items: [],
  scopes: { 'region:': 'Region', 'ph:': 'Pharmacy', 'month:': 'Month', 'class:': 'Class', 'med:': 'MedClass' },
  actions: [
    { id: 'overview', label: 'Go to Overview', ic: 'overview', kw: 'overview stats home', run: () => App.setTab('overview') },
    { id: 'charts', label: 'Go to Charts', ic: 'charts', kw: 'charts graphs visual png', run: () => App.setTab('charts') },
    { id: 'explore', label: 'Go to Explore', ic: 'table', kw: 'explore metrics table monthly', run: () => App.setTab('explore') },
    { id: 'missing', label: 'Go to Missing', ic: 'alert', kw: 'missing inactive records', run: () => App.setTab('missing') },
    { id: 'years', label: 'Go to Years', ic: 'calendar', kw: 'years yearly multi year arena', run: () => App.setTab('years') },
    { id: 'compare', label: 'Go to Compare', ic: 'compare', kw: 'compare versus side', run: () => App.setTab('compare') },
    { id: 'reset', label: 'Reset filters', ic: 'trash', kw: 'reset clear filters', run: () => App.confirmClear() },
    { id: 'export', label: 'Export Excel', ic: 'download', kw: 'export excel download xlsx', run: () => Exporter.excel() },
    { id: 'png', label: 'Export charts as PNG', ic: 'image', kw: 'png image charts export', run: () => { App.setTab('charts'); setTimeout(() => Charts.exportAll(), 400); } },
    { id: 'share', label: 'Copy share link', ic: 'link', kw: 'share link url copy', run: () => App.share() },
    { id: 'theme', label: 'Switch theme', ic: 'moon', kw: 'theme dark light auto appearance', run: () => Theme.cycle() },
    { id: 'refresh', label: 'Refresh data', ic: 'refresh', kw: 'refresh reload sync data', run: () => Sync.load(true) }
  ],

  buildIndex() {
    this.idx = {};
    if (!window.Fuse) return;
    FIELDS.forEach(f => {
      const opts = Data.options(f).map(item => ({ item, key: normalizeArabic(item) }));
      this.idx[f] = new Fuse(opts, { threshold: 0.35, includeMatches: true, ignoreLocation: true, minMatchCharLength: 1, keys: ['key'] });
    });
  },

  input: () => $('#universalSearchInput'),

  setOpen(open) {
    $('#universalSearchResults').classList.toggle('open', open);
    this.input().setAttribute('aria-expanded', String(open));
    if (!open) { this.sel = -1; this.input().setAttribute('aria-activedescendant', ''); }
  },

  isOpen() { return $('#universalSearchResults').classList.contains('open'); },

  highlight(text, indices) {
    if (!indices || !indices.length) return esc(text);
    let out = '', last = 0;
    indices.forEach(([s, e]) => { if (s > last) out += esc(text.slice(last, s)); out += `<mark>${esc(text.slice(s, e + 1))}</mark>`; last = e + 1; });
    return out + esc(text.slice(last));
  },

  row(id, field, value, valid, selected, count, indices) {
    const cls = ['res-item'];
    if (!valid && !selected) cls.push('disabled');
    if (selected) cls.push('selected');
    const meta = selected ? icon('check') : `<span class="res-count">${count}</span>`;
    return `<div class="${cls.join(' ')}" id="${id}" role="option" data-field="${field}" data-value="${esc(value)}"><span class="res-label" dir="auto">${this.highlight(value, indices)}</span>${meta}</div>`;
  },

  head(label, dot) { return `<div class="res-head" style="--dot:${dot}">${esc(label)}</div>`; },

  refreshItems() {
    this.items = $$('#searchResultsScroll .res-item');
    this.sel = this.items.length ? 0 : -1;
    this.paint();
  },

  paint() {
    this.items.forEach(el => el.classList.remove('focus'));
    const a = this.items[this.sel];
    if (a) { a.classList.add('focus'); a.scrollIntoView({ block: 'nearest' }); this.input().setAttribute('aria-activedescendant', a.id); }
    else this.input().setAttribute('aria-activedescendant', '');
  },

  run(query) {
    const scroll = $('#searchResultsScroll');
    const lower = query.toLowerCase();
    let scope = { field: null, text: query };
    for (const p in this.scopes) if (lower.startsWith(p)) scope = { field: this.scopes[p], text: query.slice(p.length).trim() };
    const stats = Data.optionStats();
    let i = 0, html = '', any = false;

    if (!scope.field) {
      const q = lower.trim();
      const acts = this.actions.filter(a => a.label.toLowerCase().includes(q) || a.kw.includes(q));
      if (acts.length) {
        any = true;
        html += this.head('Actions', 'var(--ink-3)');
        acts.forEach(a => { html += `<div class="res-item is-action" id="sr-${i++}" role="option" data-action="${a.id}"><span class="res-label">${icon(a.ic)}${esc(a.label)}</span></div>`; });
      }
    }

    (scope.field ? [scope.field] : FIELDS).forEach(field => {
      let items;
      if (scope.field && !scope.text) items = Data.options(field).map(item => ({ item, ind: null }));
      else {
        const nq = normalizeArabic(scope.field ? scope.text : query);
        if (!nq || !this.idx[field]) return;
        items = this.idx[field].search(nq).map(r => ({ item: r.item.item, ind: r.matches && r.matches[0] ? r.matches[0].indices : null }));
      }
      if (!items.length) return;
      const good = [], bad = [];
      items.forEach(({ item, ind }) => {
        const n = stats[field].get(item) || 0;
        const s = S.filters[field].includes(item);
        (n > 0 || s ? good : bad).push({ item, ind, n, s });
      });
      any = true;
      html += this.head(FIELD_META[field].label, FIELD_META[field].dot);
      [...good, ...bad].forEach(r => { html += this.row(`sr-${i++}`, field, r.item, r.n > 0, r.s, r.n, r.ind); });
    });

    scroll.innerHTML = any ? html : emptyHTML('No matches', `Nothing matches “${query}”. Try another spelling or a scope like ph:`, 'search');
    this.setOpen(true);
    $('#commitSearchBtn').hidden = false;
    this.refreshItems();
  },

  recents() {
    const scroll = $('#searchResultsScroll');
    const rec = Filters.getRecents();
    const stats = Data.optionStats();
    let html = '', i = 0;
    if (rec.length) {
      html += this.head('Recent', 'var(--copper)');
      rec.forEach(r => {
        if (!stats[r.field]) return;
        const n = stats[r.field].get(r.value) || 0;
        const s = (S.filters[r.field] || []).includes(r.value);
        html += this.row(`sr-${i++}`, r.field, r.value, n > 0, s, n, null);
      });
    }
    html += this.head('Jump to', 'var(--sage)');
    this.actions.slice(0, 6).forEach(a => { html += `<div class="res-item is-action" id="sr-${i++}" role="option" data-action="${a.id}"><span class="res-label">${icon(a.ic)}${esc(a.label)}</span></div>`; });
    scroll.innerHTML = html;
    this.setOpen(true);
    this.refreshItems();
  },

  refresh() { const q = this.input().value.trim(); if (q) this.run(q); else this.recents(); },

  toggleResult(field, value) {
    const n = Data.optionStats()[field].get(value) || 0;
    const s = S.filters[field].includes(value);
    if (!n && !s) return;
    Filters.toggle(field, value);
  },

  activate(keepOpen) {
    const el = this.items[this.sel];
    if (!el) return;
    if (el.dataset.action) { this.setOpen(false); this.input().blur(); this.actions.find(a => a.id === el.dataset.action).run(); return; }
    if (el.classList.contains('disabled')) return;
    this.toggleResult(el.dataset.field, el.dataset.value);
    if (keepOpen) { this.refresh(); this.input().focus(); } else this.setOpen(false);
  },

  removeLast() {
    for (let i = FIELDS.length - 1; i >= 0; i--) {
      const f = FIELDS[i];
      if (S.filters[f].length) { S.filters[f] = S.filters[f].slice(0, -1); App.changed(); return; }
    }
  },

  renderChips() {
    const host = $('#searchChips');
    let html = '';
    FIELDS.forEach(f => S.filters[f].forEach(v => {
      html += `<span class="chip" data-field="${f}"><span class="chip-cat">${FIELD_META[f].label}</span><span class="chip-val" dir="auto">${esc(v)}</span><button class="chip-x" type="button" data-field="${f}" data-value="${esc(v)}" aria-label="Remove ${esc(v)}">${icon('x')}</button></span>`;
    }));
    host.innerHTML = html;
    $('#clearAllFilters').hidden = Data.activeCount() === 0;
  },

  init() {
    const inp = this.input();
    const scroll = $('#searchResultsScroll');
    const syncBtns = () => { const has = inp.value.trim().length > 0; $('#clearSearchInput').hidden = !has; $('#commitSearchBtn').hidden = !has && !this.isOpen(); };

    scroll.addEventListener('mousedown', (e) => { if (e.target.closest('.res-item')) e.preventDefault(); });
    scroll.addEventListener('click', (e) => {
      const it = e.target.closest('.res-item');
      if (!it || it.classList.contains('disabled')) return;
      if (it.dataset.action) { this.setOpen(false); this.actions.find(a => a.id === it.dataset.action).run(); return; }
      this.toggleResult(it.dataset.field, it.dataset.value);
      this.refresh(); inp.focus();
    });

    $('#searchChips').addEventListener('click', (e) => {
      const x = e.target.closest('.chip-x');
      if (!x) return;
      e.stopPropagation();
      Filters.toggle(x.dataset.field, x.dataset.value);
      if (this.isOpen()) this.refresh();
    });

    $('#triggerSearchFocus').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isOpen()) { this.setOpen(false); inp.blur(); } else { inp.focus(); }
    });
    $('#clearSearchInput').addEventListener('click', () => { inp.value = ''; inp.focus(); this.recents(); syncBtns(); });
    $('#commitSearchBtn').addEventListener('click', () => this.setOpen(false));
    $('#clearAllFilters').addEventListener('click', async () => { this.setOpen(false); await App.confirmClear(); if (!Modal.isOpen) inp.focus(); });

    const deb = debounce(q => this.run(q), 80);
    inp.addEventListener('input', () => { syncBtns(); const q = inp.value.trim(); if (!q) { this.recents(); return; } deb(q); });
    inp.addEventListener('focus', () => { this.refresh(); syncBtns(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (this.items.length) { this.sel = Math.min(this.sel + 1, this.items.length - 1); this.paint(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.items.length) { this.sel = Math.max(this.sel - 1, 0); this.paint(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (this.sel >= 0) this.activate(e.shiftKey); else this.setOpen(false); }
      else if (e.key === 'Backspace' && inp.value === '') { if (e.metaKey || e.ctrlKey) Filters.clearAll(); else this.removeLast(); }
      else if (e.key === 'Escape') { e.stopPropagation(); this.setOpen(false); inp.blur(); }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#searchWrap')) this.setOpen(false); });
  }
};
