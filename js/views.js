const TONES = [
  ['var(--sage)', 'var(--sage-soft)'],
  ['var(--copper)', 'var(--copper-soft)'],
  ['var(--plum)', 'var(--plum-soft)'],
  ['var(--moss)', 'var(--moss-soft)'],
  ['var(--rose)', 'var(--rose-soft)']
];

const sortMark = '<span class="sort">▲</span>';

const Overview = {
  sparkChart: null,
  built: false,
  sparkKeys: [],

  render(agg) {
    const cats = Data.cats();
    const total = Data.sumCats(agg.byCat, cats);
    const presc = agg.totals.presc;
    const insured = agg.totals.insured;
    const active = agg.totals.pharmacies.size;
    const yearPh = new Set(Data.yearRows().map(r => r.Pharmacy).filter(Boolean)).size;
    const series = Data.series(agg, 'month');
    const months = series.map(b => b.label);
    const monthVals = series.map(b => Data.sumCats(b.byCat, cats));
    const peakIdx = monthVals.length ? monthVals.indexOf(Math.max(...monthVals)) : -1;
    const avg = monthVals.length ? total / monthVals.length : 0;
    const multi = Data.multiYear();
    let mom = null, momLabel = 'Last vs previous month';
    if (multi) {
      const yrs = Data.series(agg, 'year');
      momLabel = 'Latest year vs prior';
      if (yrs.length > 1) { const a = Data.sumCats(yrs[yrs.length - 1].byCat, cats), b = Data.sumCats(yrs[yrs.length - 2].byCat, cats); mom = b ? (a - b) / b * 100 : null; }
    } else if (monthVals.length > 1) {
      const a = monthVals[monthVals.length - 1], b = monthVals[monthVals.length - 2];
      mom = b ? (a - b) / b * 100 : null;
    }
    const nYears = Data.scopeYears().length;
    const sel = S.filters.MedClass;
    const focus = sel.length > 0;

    if (!this.built || !$('#heroValue')) this.build();
    const none = !S.filtered.length && S.data.length > 0;
    $('#noMatchBar').hidden = !none;
    if (none) $('#noMatchScope').textContent = `${Data.summary()} · ${Data.periodLabel()}`;

    $('#heroEyebrow').textContent = `${focus ? 'Focused value' : 'Total value'} · ${Data.periodLabel()}`;
    const hv = $('#heroValue');
    hv.dataset.tip = fmt(total);
    animateNumber(hv, total, 700);
    $('#heroMeta').innerHTML = `${multi ? `<span class="pill accent">${nYears} years</span>` : ''}<span class="pill ${multi ? 'plain' : 'accent'}">${months.length} months</span>`
      + (focus ? `<button type="button" class="pill copper pill-x" data-clear-cats data-tip="Clear class focus · Esc">${sel.length} of ${MED_CATS.length} classes${icon('x')}</button>` : `<span class="pill copper">${cats.length} classes</span>`)
      + `<span class="pill plum">${fmt(S.filtered.length)} records</span>`;
    const facts = $('#heroFacts');
    facts.children[0].querySelector('dd').textContent = compact(avg);
    facts.children[1].querySelector('dd').textContent = peakIdx >= 0 ? periodTitle(series[peakIdx].key).main : '—';
    facts.children[2].querySelector('dt').textContent = momLabel;
    facts.children[2].querySelector('dd').innerHTML = mom === null ? '—' : `<span class="delta ${mom >= 0 ? 'pos' : 'neg'}">${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%</span>`;

    const core = [
      { value: presc, pct: null, note: `${compact(months.length ? presc / months.length : 0)} per month` },
      { value: insured, pct: presc > 0 ? insured / presc * 100 : null, pctLabel: 'Share of prescriptions', note: 'No prescriptions' },
      { value: active, pct: yearPh > 0 ? active / yearPh * 100 : 0, pctLabel: `Of ${yearPh} pharmacies in this period` }
    ];
    $$('#statsCoreRow .stat-card').forEach((card, i) => {
      const c = core[i];
      animateNumber($('.stat-value', card), c.value);
      const hasPct = c.pct !== null;
      $('.bar', card).hidden = !hasPct;
      const p = $('.stat-pct', card);
      p.hidden = !hasPct;
      $('.stat-note', card).hidden = hasPct;
      $('.stat-note', card).textContent = c.note || '';
      if (hasPct) { p.textContent = `${c.pct.toFixed(1)}%`; p.dataset.tip = c.pctLabel || ''; $('.bar-fill', card).style.width = Math.min(100, c.pct) + '%'; }
    });

    const base = focus ? Data.catTotals(true) : agg.byCat;
    const grand = MED_CATS.reduce((s, c) => s + (base[c] || 0), 0);
    const rank = new Map(MED_CATS.map(c => ({ c, v: base[c] || 0 })).sort((a, b) => b.v - a.v).map((r, i) => [r.c, i + 1]));
    const grid = $('#statsCategoryGrid');
    grid.classList.toggle('focusing', focus);
    $$('.cat-card', grid).forEach(card => {
      const c = card.dataset.cat;
      const v = base[c] || 0;
      const pct = grand > 0 ? v / grand * 100 : 0;
      const on = sel.includes(c);
      card.classList.toggle('active', on);
      card.classList.toggle('dim', focus && !on);
      card.classList.toggle('zero', !v);
      card.setAttribute('aria-pressed', String(on));
      card.setAttribute('aria-label', `${c}: ${fmt(v)} · ${on ? 'in focus' : 'focus on this class'}`);
      $('.cat-rank', card).textContent = String(rank.get(c)).padStart(2, '0');
      animateNumber($('.cat-value', card), v, 600);
      $('.stat-pct', card).textContent = `${pct.toFixed(1)}%`;
      $('.bar-fill', card).style.width = pct + '%';
    });
    $('#catNote').textContent = focus
      ? `${sel.length} in focus · click another to switch, ${this.touch() ? 'long-press' : '⌘/Ctrl-click'} to add, Esc to clear`
      : `Click a class to focus the whole dashboard on it · ${this.touch() ? 'long-press' : '⌘/Ctrl-click'} to pick several`;
    $('#clearCatsBtn').hidden = !focus;
    $('#clearCatsCount').textContent = sel.length;

    this.spark(monthVals, series.map(b => b.key));
  },

  touch() { return matchMedia('(hover: none)').matches; },

  build() {
    $('#statsTotalRow').innerHTML = `
      <article class="card hero-card">
        <div class="hero-main">
          <div class="hero-eyebrow"><span class="hero-dot"></span><span id="heroEyebrow"></span></div>
          <div class="hero-value" id="heroValue">0</div>
          <div class="hero-meta" id="heroMeta"></div>
        </div>
        <div class="hero-side">
          <dl class="hero-facts" id="heroFacts">
            <div><dt>Monthly average</dt><dd>—</dd></div>
            <div><dt>Peak month</dt><dd>—</dd></div>
            <div><dt>Last vs previous month</dt><dd>—</dd></div>
          </dl>
          <div class="hero-spark"><canvas id="heroSpark" aria-label="Monthly total trend"></canvas></div>
        </div>
      </article>`;
    const core = [['Prescriptions', 'pill', 0], ['Insurance covered', 'shield', 1], ['Active pharmacies', 'building', 2]];
    $('#statsCoreRow').innerHTML = core.map(([label, ic, tone], i) => {
      const [t, ts] = TONES[tone];
      return `<article class="card stat-card" style="--i:${i};--tone:${t};--tone-soft:${ts}">
        <div class="stat-top"><span class="stat-icon">${icon(ic)}</span><span class="stat-label">${esc(label)}</span></div>
        <div class="stat-value">0</div>
        <div class="stat-foot"><div class="bar"><div class="bar-fill"></div></div><span class="stat-pct"></span><span class="stat-note"></span></div></article>`;
    }).join('');
    $('#statsCategoryGrid').innerHTML = MED_CATS.map((c, i) => {
      const [t, ts] = TONES[i % TONES.length];
      return `<button type="button" class="card cat-card" data-cat="${esc(c)}" style="--i:${i};--tone:${t};--tone-soft:${ts}" aria-pressed="false">
        <span class="cat-top"><span class="cat-rank"></span><span class="cat-name" dir="auto">${esc(c)}</span><span class="cat-check" aria-hidden="true">${icon('check')}</span></span>
        <span class="cat-value">0</span>
        <span class="stat-foot"><span class="bar"><span class="bar-fill" style="display:block"></span></span><span class="stat-pct"></span></span>
      </button>`;
    }).join('');
    if (this.sparkChart) { this.sparkChart.destroy(); this.sparkChart = null; }
    this.built = true;
  },

  spark(values, keys) {
    if (!window.Chart) return;
    const cv = $('#heroSpark');
    if (!cv) return;
    this.sparkKeys = keys;
    const sage = cssVar('--sage');
    const surface = cssVar('--surface');
    const labels = keys.map(k => periodAxis(k, !Data.multiYear()));
    const ch = this.sparkChart;
    if (ch && ch.canvas === cv) {
      const d = ch.data.datasets[0];
      ch.data.labels = labels;
      d.data = values;
      d.borderColor = sage; d.pointBorderColor = sage; d.pointBackgroundColor = surface;
      ch.update();
      return;
    }
    if (ch) ch.destroy();
    this.sparkChart = new Chart(cv, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Total value', data: values, borderColor: sage, borderWidth: 2.25, tension: .4, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: surface, pointBorderColor: sage, pointBorderWidth: 2, fill: true,
        backgroundColor: (ctx) => { const { chart } = ctx; if (!chart.chartArea) return 'transparent'; const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom); g.addColorStop(0, cssVar('--sage-soft-2')); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; } }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 520, easing: 'easeOutQuart' }, layout: { padding: { top: 6, bottom: 2, left: 4, right: 4 } }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: Charts.tooltip({ title: (pts) => periodTitle(this.sparkKeys[pts[0].dataIndex]), row: (p) => ({ label: S.filters.MedClass.length ? 'Focused value' : 'Total value', value: fmt(p.raw), color: cssVar('--sage') }) }) },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } } }
    });
  },

  pickCat(c, ev) {
    const add = ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey);
    const sel = S.filters.MedClass;
    if (add) { Filters.toggle('MedClass', c); return; }
    if (sel.length === 1 && sel[0] === c) S.filters.MedClass = [];
    else { S.filters.MedClass = [c]; Filters.addRecent('MedClass', c); }
    App.changed();
  },

  clearCats() {
    if (!S.filters.MedClass.length) return false;
    S.filters.MedClass = [];
    App.changed();
    return true;
  },

  init() {
    const grid = $('#statsCategoryGrid');
    let pressT = null, longFired = false;
    grid.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.cat-card');
      if (!card || e.pointerType === 'mouse') return;
      longFired = false;
      clearTimeout(pressT);
      pressT = setTimeout(() => { longFired = true; card.classList.add('pressed'); if (navigator.vibrate) navigator.vibrate(8); Filters.toggle('MedClass', card.dataset.cat); setTimeout(() => card.classList.remove('pressed'), 180); }, 420);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => grid.addEventListener(t, () => clearTimeout(pressT)));
    grid.addEventListener('contextmenu', (e) => { if (e.target.closest('.cat-card') && this.touch()) e.preventDefault(); });
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.cat-card');
      if (longFired) { longFired = false; return; }
      if (card) this.pickCat(card.dataset.cat, e);
      else if (e.target === grid) this.clearCats();
    });
    $('#clearCatsBtn').addEventListener('click', () => this.clearCats());
    $('#noMatchClear').addEventListener('click', () => Filters.clearAll());
    $('#statsTotalRow').addEventListener('click', (e) => { if (e.target.closest('[data-clear-cats]')) this.clearCats(); });
    $('#view-overview').addEventListener('click', (e) => {
      if (!S.filters.MedClass.length || e.target.closest('.card, button, a, input')) return;
      if (e.target.closest('.stats-grid, .section-head')) this.clearCats();
    });
  }
};

const Explore = {
  render(agg) {
    const thead = $('#exploreTable thead tr');
    const tbody = $('#exploreTable tbody');
    const { months, labels, rows } = Data.exploreRows(agg);
    const unit = Data.grain() === 'year' ? 'years' : 'months';
    $('#exploreNote').textContent = `${rows.length} metrics across ${months.length} ${unit} · ${Data.periodLabel()} · click a header to sort, a row to focus`;
    const yb = (k, i) => i > 0 && Data.grain() === 'month' && Data.multiYear() && splitPeriod(k).Year !== splitPeriod(months[i - 1]).Year ? ' year-break' : '';
    thead.innerHTML = `<th class="sortable" data-col="Metric">Metric ${sortMark}</th>` + months.map((m, i) => `<th class="sortable num${yb(m, i)}" data-col="${esc(m)}" dir="auto">${esc(labels[i])} ${sortMark}</th>`).join('') + `<th class="sortable num total-col" data-col="_sum">Total ${sortMark}</th>`;
    const s = S.exploreSort;
    if (s.col) {
      rows.sort((a, b) => {
        const x = a[s.col] ?? 0, y = b[s.col] ?? 0;
        return typeof x === 'string' ? s.dir * x.localeCompare(y) : s.dir * (x - y);
      });
      const th = $$('th', thead).find(t => t.dataset.col === s.col);
      if (th) th.classList.add(s.dir === 1 ? 'asc' : 'desc');
    }
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="${months.length + 2}">${emptyHTML('Nothing to explore', 'No data for this selection yet — widen the filters.', 'table')}</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => {
      let prev = null;
      const vals = months.map(m => r[m] || 0);
      const max = Math.max(...vals);
      const cells = months.map((m, i) => {
        const v = r[m] || 0;
        let tr = '<span class="trend"></span>';
        if (prev !== null) tr = v === prev ? '<span class="trend flat">–</span>' : v > prev ? '<span class="trend up">↑</span>' : '<span class="trend down">↓</span>';
        prev = v;
        const a = max > 0 ? (v / max) * 0.2 : 0;
        return `<td class="num${yb(m, i)}"><span class="heat" style="background:color-mix(in srgb, var(--sage) ${(a * 100).toFixed(0)}%, transparent)">${fmt(v)}</span>${tr}</td>`;
      }).join('');
      return `<tr data-row><td class="metric" dir="auto">${esc(r.Metric)}</td>${cells}<td class="num total-col"><strong>${fmt(r._sum)}</strong></td></tr>`;
    }).join('');
  },

  init() {
    $('#exploreTable thead').addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      const col = th.dataset.col;
      if (S.exploreSort.col === col) S.exploreSort.dir *= -1;
      else S.exploreSort = { col, dir: col === 'Metric' ? 1 : -1 };
      App.renderTab();
    });
    rowFocus('#exploreTable');
  }
};

const Missing = {
  render() {
    const thead = $('#missingTable thead tr');
    const tbody = $('#missingTable tbody');
    const multi = Data.multiYear();
    const cols = multi ? ['Year', 'Region', 'Pharmacy', 'Month', 'Status'] : ['Region', 'Pharmacy', 'Month', 'Status'];
    thead.innerHTML = cols.map(c => `<th class="sortable" data-col="${c}">${c} ${sortMark}</th>`).join('');
    const q = normalizeArabic(S.missingQuery);
    let rows = S.missing.filter(r => !q || normalizeArabic(r.Pharmacy).includes(q) || normalizeArabic(r.Region).includes(q) || normalizeArabic(r.Month).includes(q));
    const s = S.missingSort;
    if (s.col) {
      rows.sort((a, b) => s.col === 'Month' ? s.dir * ((a.Year - b.Year) || (monthRank(a.Month) - monthRank(b.Month))) : s.col === 'Year' ? s.dir * (a.Year - b.Year) : s.dir * String(a[s.col]).localeCompare(String(b[s.col])));
      const th = $$('th', thead).find(t => t.dataset.col === s.col);
      if (th) th.classList.add(s.dir === 1 ? 'asc' : 'desc');
    }
    const ph = new Set(S.missing.map(r => r.Pharmacy)).size;
    $('#missingNote').textContent = S.missing.length ? `${fmt(S.missing.length)} gaps across ${ph} pharmacies${q ? ` · ${rows.length} shown` : ''}` : 'Every eligible pharmacy has submitted';
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}">${S.missing.length ? emptyHTML('No matches', 'Nothing matches that search.', 'search') : emptyHTML('All pharmacies reporting', 'No inactive records for the current filters.', 'checkCircle')}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr data-row>${multi ? `<td><span class="tag year">FY ${esc(fyShort(r.Year))}</span></td>` : ''}<td dir="auto">${esc(r.Region)}</td><td dir="auto"><strong>${esc(r.Pharmacy)}</strong></td><td dir="auto">${esc(r.Month)}</td><td><span class="tag inactive">Inactive</span></td></tr>`).join('');
  },

  init() {
    $('#missingTable thead').addEventListener('click', (e) => {
      const th = e.target.closest('th.sortable');
      if (!th) return;
      const col = th.dataset.col;
      if (S.missingSort.col === col) S.missingSort.dir *= -1;
      else S.missingSort = { col, dir: 1 };
      this.render();
    });
    $('#missingSearch').addEventListener('input', debounce((e) => { S.missingQuery = e.target.value.trim(); this.render(); }, 120));
    rowFocus('#missingTable');
  }
};

function rowFocus(sel) {
  $(sel).addEventListener('click', (e) => {
    const tr = e.target.closest('tbody tr[data-row]');
    if (!tr) return;
    const rows = $$('tbody tr', $(sel));
    const was = tr.classList.contains('focus');
    rows.forEach(r => r.classList.remove('focus', 'dim'));
    if (!was) { tr.classList.add('focus'); rows.forEach(r => { if (r !== tr) r.classList.add('dim'); }); }
  });
}

const SCOPE_LABEL = { Year: 'Fiscal year', Region: 'Region', Pharmacy: 'Pharmacy', Month: 'Month', Class: 'Classification' };
const SCOPE_ALL = { Year: 'All years', Region: 'All regions', Pharmacy: 'All pharmacies', Month: 'All months', Class: 'All classes' };
const scopeText = (k, v) => k === 'Year' ? fyLabel(v) : String(v);

const scopedSelects = (filters, side, keys) => keys.map(k => {
  const opts = Data.scopedOptions(filters, k);
  const cur = filters[k];
  if (cur !== 'all' && !opts.map(String).includes(String(cur))) filters[k] = 'all';
  const set = filters[k] !== 'all';
  return `<div class="sel${set ? ' set' : ''}"><span class="sel-label">${SCOPE_LABEL[k]}</span>
    <div class="sel-wrap">${selBtn(`data-side="${side}" data-key="${k}"`, set ? scopeText(k, filters[k]) : '', SCOPE_ALL[k], set)}
    <button type="button" class="sel-reset" data-side="${side}" data-key="${k}" aria-label="Reset ${SCOPE_LABEL[k]}">${icon('x')}</button></div></div>`;
}).join('');

const openScoped = (btn, filters, onDone) => {
  const k = btn.dataset.key;
  const opts = Data.scopedOptions(filters, k);
  Select.open(btn, {
    title: SCOPE_LABEL[k],
    value: filters[k],
    minWidth: 240,
    options: [{ value: 'all', label: SCOPE_ALL[k], muted: true }, ...opts.map(o => ({ value: String(o), label: scopeText(k, o) }))],
    onPick: (v) => { onScopedChange(filters, k, v); onDone(); }
  });
};

const onScopedChange = (filters, key, value) => {
  filters[key] = value;
  if (key === 'Region') { filters.Pharmacy = 'all'; filters.Month = 'all'; }
  if (key === 'Pharmacy') filters.Month = 'all';
};

const Years = {
  render() {
    if (!S.yearsScope.length && S.years.length) S.yearsScope = S.years.slice().sort((a, b) => b - a).slice(0, 3).map(String);
    $('#selectedYearsContainer').innerHTML = S.yearsScope.length
      ? S.yearsScope.slice().sort((a, b) => b - a).map(y => `<span class="year-chip">${esc(fyLabel(y))}<button type="button" data-y="${esc(y)}" aria-label="Remove ${esc(y)}">${icon('x')}</button></span>`).join('')
      : '<span class="section-note">No years selected</span>';
    $('#yearsFilters').innerHTML = scopedSelects(S.yearsFilters, 'Y', ['Region', 'Pharmacy', 'Month', 'Class']);
    this.table();
  },

  table() {
    const host = $('#yearsResults');
    if (!S.yearsScope.length) { host.innerHTML = emptyHTML('Pick at least one year', 'Use “Choose years” to build the comparison table.', 'calendar'); return; }
    const years = S.yearsScope.slice().sort((a, b) => b - a);
    const map = {};
    years.forEach(y => { map[y] = Data.scopedMetrics({ ...S.yearsFilters, Year: y }); });
    let html = `<div class="table-head"><div><h2 class="section-title">Metrics by year</h2><p class="section-note">Dot marks the highest year · faded is the lowest · click a row to focus</p></div></div><div class="table-scroll"><table class="data-table" id="yearsTable"><thead><tr><th>Metric</th>${years.map(y => `<th class="num">${esc(fyLabel(y))}</th>`).join('')}${years.length > 1 ? '<th class="num">Change</th>' : ''}</tr></thead><tbody>`;
    SCOPED_METRICS.forEach((m, idx) => {
      const vals = years.map(y => map[y][m]);
      const max = Math.max(...vals), min = Math.min(...vals);
      const varied = max !== min && max > 0;
      let change = '';
      if (years.length > 1) {
        const a = vals[0], b = vals[1];
        const pct = b ? (a - b) / b * 100 : 0;
        change = `<td class="num">${Math.abs(pct) > 0.1 ? `<span class="delta ${pct > 0 ? 'pos' : 'neg'}">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</span>` : '<span class="trend flat">–</span>'}</td>`;
      }
      html += `<tr data-row${idx === 3 ? ' class="group-end"' : ''}><td class="metric" dir="auto">${esc(m)}</td>${vals.map(v => `<td class="num ${varied ? (v === max ? 'cell-max' : v === min ? 'cell-min' : '') : ''}">${fmt(v)}</td>`).join('')}${change}</tr>`;
    });
    host.innerHTML = html + '</tbody></table></div>';
  },

  picker() {
    const draft = new Set(S.yearsScope);
    const body = `<div class="year-toolbar"><label class="mini-search">${icon('search')}<input type="search" id="yearPickSearch" placeholder="Filter years" spellcheck="false" /></label><button class="btn soft sm" id="yearSort" type="button">${icon('swap')}<span>Sort</span></button><button class="btn ghost sm" id="yearAll" type="button">All</button><button class="btn ghost sm" id="yearNone" type="button">None</button></div><div class="year-list" id="yearPickList"></div>`;
    Modal.open('Choose fiscal years', body, `<button class="btn ghost" type="button" id="yearCancel">Cancel</button><button class="btn primary" type="button" id="yearApply">${icon('check')}<span>Apply</span></button>`);
    const list = () => {
      const q = $('#yearPickSearch').value.trim();
      let ys = S.years.map(String).sort((a, b) => S.yearSortDesc ? b - a : a - b);
      if (q) ys = ys.filter(y => y.includes(q) || fyLabel(y).includes(q));
      $('#yearPickList').innerHTML = ys.map(y => `<label class="year-opt"><input type="checkbox" value="${esc(y)}"${draft.has(y) ? ' checked' : ''} /><span>${esc(fyLabel(y))}</span></label>`).join('') || '<p class="section-note">No years</p>';
    };
    list();
    $('#yearPickSearch').addEventListener('input', debounce(list, 150));
    $('#yearPickList').addEventListener('change', (e) => { if (e.target.checked) draft.add(e.target.value); else draft.delete(e.target.value); });
    $('#yearSort').addEventListener('click', () => { S.yearSortDesc = !S.yearSortDesc; list(); });
    $('#yearAll').addEventListener('click', () => { $$('#yearPickList input').forEach(i => { i.checked = true; draft.add(i.value); }); });
    $('#yearNone').addEventListener('click', () => { $$('#yearPickList input').forEach(i => { i.checked = false; draft.delete(i.value); }); });
    $('#yearCancel').addEventListener('click', () => Modal.close());
    $('#yearApply').addEventListener('click', () => { S.yearsScope = [...draft]; Modal.close(); this.render(); });
  },

  init() {
    $('#selectYearsBtn').addEventListener('click', () => this.picker());
    $('#selectedYearsContainer').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-y]');
      if (b) { S.yearsScope = S.yearsScope.filter(y => y !== b.dataset.y); this.render(); }
    });
    $('#yearsFilters').addEventListener('click', (e) => {
      const r = e.target.closest('.sel-reset');
      if (r) { onScopedChange(S.yearsFilters, r.dataset.key, 'all'); this.render(); return; }
      const b = e.target.closest('.sel-btn');
      if (b) openScoped(b, S.yearsFilters, () => this.render());
    });
    $('#yearsResults').addEventListener('click', (e) => {
      const tr = e.target.closest('tbody tr[data-row]');
      if (!tr) return;
      const rows = $$('#yearsTable tbody tr');
      const was = tr.classList.contains('focus');
      rows.forEach(r => r.classList.remove('focus', 'dim'));
      if (!was) { tr.classList.add('focus'); rows.forEach(r => { if (r !== tr) r.classList.add('dim'); }); }
    });
    $('#exportYearsCsvBtn').addEventListener('click', () => Exporter.yearsCsv());
  }
};

const HEADLINE = [
  { k: 'Total Value', label: 'Total value', ic: 'layers' },
  { k: 'Total Prescriptions', label: 'Prescriptions', ic: 'pill' },
  { k: 'Insurance Covered', label: 'Insured', ic: 'shield' },
  { k: 'Active Pharmacies', label: 'Active pharmacies', ic: 'building' }
];

const Compare = {
  opt: Object.assign({ sort: 'default', mode: 'pct', hideZero: true }, store.get('alembic-compare-opts', {})),
  focusKey: null,

  title(f) { return f.Year !== 'all' ? `FY ${fyLabel(f.Year)}` : 'All years'; },
  sum(f) { const p = ['Region', 'Pharmacy', 'Month', 'Class'].filter(k => f[k] !== 'all').map(k => f[k]); return p.length ? p.join(' · ') : 'Every region, pharmacy and month'; },

  init() {
    if (S.years.length) {
      const d = S.years.slice().sort((a, b) => b - a).map(String);
      if (S.cmpA.Year === 'all' && d[0]) S.cmpA.Year = d[0];
      if (S.cmpB.Year === 'all' && d[1]) S.cmpB.Year = d[1];
    }
  },

  change(a, b) {
    const d = a - b;
    const pct = b ? d / b * 100 : (a ? Infinity : 0);
    return { d, pct };
  },

  deltaPill({ d, pct }, mode = this.opt.mode) {
    if (!d) return '<span class="delta flat">No change</span>';
    const dir = d > 0 ? 'pos' : 'neg';
    const sign = d > 0 ? '+' : '−';
    const txt = mode === 'abs' || !isFinite(pct) ? `${sign}${compact(Math.abs(d))}` : `${sign}${Math.abs(pct).toFixed(1)}%`;
    return `<span class="delta ${dir}">${icon(d > 0 ? 'trendUp' : 'trendDown')}${txt}</span>`;
  },

  sideHTML(side, f) {
    const s = side === 'A' ? 'a' : 'b';
    return `<header class="side-head">
        <span class="side-badge ${s}">${side}</span>
        <div class="side-heading"><h3 class="side-title">${esc(this.title(f))}</h3><p class="side-sum" dir="auto">${esc(this.sum(f))}</p></div>
      </header>
      <div class="select-grid">${scopedSelects(f, side, ['Year', 'Region', 'Pharmacy', 'Month', 'Class'])}</div>`;
  },

  render() {
    $('#compareSideA').innerHTML = this.sideHTML('A', S.cmpA);
    $('#compareSideB').innerHTML = this.sideHTML('B', S.cmpB);
    const a = Data.scopedMetrics(S.cmpA), b = Data.scopedMetrics(S.cmpB);
    this.paintTools();
    this.headline(a, b);
    this.ledger(a, b);
  },

  paintTools() {
    $$('#compareTools .seg').forEach(seg => { const k = seg.dataset.cmp; $$('button', seg).forEach(x => x.classList.toggle('on', x.dataset.v === this.opt[k])); });
    $('#cmpHideZero').setAttribute('aria-pressed', String(this.opt.hideZero));
  },

  headline(a, b) {
    $('#compareHeadline').innerHTML = HEADLINE.map(({ k, label, ic }, i) => {
      const va = a[k], vb = b[k];
      const tot = va + vb;
      const share = tot ? va / tot * 100 : 50;
      const ch = this.change(va, vb);
      return `<article class="card duel" style="--i:${i}">
        <header class="duel-head"><span class="duel-icon">${icon(ic)}</span><span class="duel-label">${esc(label)}</span>${this.deltaPill(ch)}</header>
        <div class="duel-vals">
          <div class="duel-val a"><span class="side-badge sm a">A</span><strong data-tip="${fmt(va)}">${compact(va)}</strong></div>
          <div class="duel-val b"><strong data-tip="${fmt(vb)}">${compact(vb)}</strong><span class="side-badge sm b">B</span></div>
        </div>
        <div class="duel-split" role="img" aria-label="A ${share.toFixed(0)}% versus B ${(100 - share).toFixed(0)}%"><span class="ds-a" style="width:${tot ? share : 50}%"></span><span class="ds-b"></span></div>
        <div class="duel-share"><span>${tot ? share.toFixed(0) : '–'}%</span><span>${tot ? (100 - share).toFixed(0) : '–'}%</span></div>
      </article>`;
    }).join('');
  },

  ledger(a, b) {
    $('#ledgerLabelA').textContent = this.title(S.cmpA);
    $('#ledgerLabelB').textContent = this.title(S.cmpB);
    let rows = SCOPED_METRICS.map((k, i) => ({ k, i, a: a[k], b: b[k], head: i < 4, ...this.change(a[k], b[k]) }));
    const hidden = this.opt.hideZero ? rows.filter(r => !r.head && !r.a && !r.b).length : 0;
    if (this.opt.hideZero) rows = rows.filter(r => r.head || r.a || r.b);
    const byScore = (r) => this.opt.sort === 'change' ? (isFinite(r.pct) ? Math.abs(r.pct) : 1e12) : Math.max(r.a, r.b);
    const head = rows.filter(r => r.head), meds = rows.filter(r => !r.head);
    if (this.opt.sort !== 'default') meds.sort((x, y) => byScore(y) - byScore(x));
    const up = meds.filter(r => r.d > 0).length, down = meds.filter(r => r.d < 0).length;
    $('#compareNote').textContent = `Change is A measured against B · ${up} classes up, ${down} down${hidden ? ` · ${hidden} empty hidden` : ''}`;

    const row = (r) => {
      const mx = Math.max(r.a, r.b) || 1;
      const lead = r.d > 0 ? 'lead-a' : r.d < 0 ? 'lead-b' : '';
      const focus = this.focusKey ? (this.focusKey === r.k ? ' focus' : ' dim') : '';
      return `<div class="lrow ${lead}${focus}" role="row" data-k="${esc(r.k)}" tabindex="0">
        <span class="lr-metric" role="cell" dir="auto">${esc(r.k)}</span>
        <span class="lr-a" role="cell" data-tip="${fmt(r.a)}">${fmt(r.a)}</span>
        <span class="lr-bars" role="cell" aria-hidden="true"><span class="lb lb-a"><i style="width:${(r.a / mx * 100).toFixed(1)}%"></i></span><span class="lb lb-b"><i style="width:${(r.b / mx * 100).toFixed(1)}%"></i></span></span>
        <span class="lr-b" role="cell" data-tip="${fmt(r.b)}">${fmt(r.b)}</span>
        <span class="lr-delta" role="cell">${this.deltaPill(r)}</span>
      </div>`;
    };
    const group = (t, list) => list.length ? `<div class="lgroup" role="rowgroup"><div class="lgroup-title">${esc(t)}<span>${list.length}</span></div>${list.map(row).join('')}</div>` : '';
    $('#compareResults').innerHTML = group('Headline', head) + group('Medication classes', meds) || emptyHTML('Nothing to compare', 'Both scopes are empty.', 'compare');
  },

  focusRow(k) {
    this.focusKey = this.focusKey === k ? null : k;
    $$('#compareResults .lrow').forEach(r => { r.classList.remove('focus', 'dim'); if (this.focusKey) r.classList.add(r.dataset.k === this.focusKey ? 'focus' : 'dim'); });
  },

  bind() {
    const deck = $('.compare-deck');
    deck.addEventListener('click', (e) => {
      const r = e.target.closest('.sel-reset');
      if (r) { onScopedChange(r.dataset.side === 'A' ? S.cmpA : S.cmpB, r.dataset.key, 'all'); this.render(); return; }
      const b = e.target.closest('.sel-btn');
      if (b) openScoped(b, b.dataset.side === 'A' ? S.cmpA : S.cmpB, () => this.render());
    });
    $('#swapSidesBtn').addEventListener('click', () => {
      [S.cmpA, S.cmpB] = [S.cmpB, S.cmpA];
      const btn = $('#swapSidesBtn');
      btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin');
      this.render();
    });
    $('#compareTools').addEventListener('click', (e) => {
      const sb = e.target.closest('.seg button');
      if (sb) { this.opt[sb.parentElement.dataset.cmp] = sb.dataset.v; }
      else if (e.target.closest('#cmpHideZero')) this.opt.hideZero = !this.opt.hideZero;
      else return;
      store.set('alembic-compare-opts', this.opt);
      this.render();
    });
    $('#compareResults').addEventListener('click', (e) => { const r = e.target.closest('.lrow'); if (r) this.focusRow(r.dataset.k); });
    $('#compareResults').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.lrow')) { e.preventDefault(); this.focusRow(e.target.dataset.k); } });
    $('#exportCompareCsvBtn').addEventListener('click', () => Exporter.compareCsv());
  }
};
