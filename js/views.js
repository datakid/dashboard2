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

  render(agg) {
    const cats = Data.cats();
    const total = Data.sumCats(agg.byCat, cats);
    const presc = agg.totals.presc;
    const insured = agg.totals.insured;
    const active = agg.totals.pharmacies.size;
    const yearPh = new Set(Data.yearRows().map(r => r.Pharmacy).filter(Boolean)).size;
    const months = Data.sortedMonths(agg);

    $('#statsTotalRow').innerHTML = `
      <article class="card hero-card">
        <div>
          <div class="hero-eyebrow">Total value · FY ${esc(fyLabel(S.filters.Year))}</div>
          <div class="hero-value" id="heroValue" title="${fmt(total)}">0</div>
          <div class="hero-meta">
            <span class="pill accent">${months.length} months</span>
            <span class="pill copper">${cats.length} classes</span>
            <span class="pill plum">${fmt(S.filtered.length)} records</span>
          </div>
        </div>
        <div class="hero-spark"><canvas id="heroSpark" aria-label="Monthly total trend"></canvas></div>
      </article>`;
    animateNumber($('#heroValue'), total, 900);

    const core = [
      { label: 'Prescriptions', value: presc, ic: 'pill', tone: 0, pct: null },
      { label: 'Insurance covered', value: insured, ic: 'shield', tone: 1, pct: presc > 0 ? insured / presc * 100 : null, pctLabel: 'of prescriptions' },
      { label: 'Active pharmacies', value: active, ic: 'building', tone: 2, pct: yearPh > 0 ? active / yearPh * 100 : 0, pctLabel: 'of year total' }
    ];
    $('#statsCoreRow').innerHTML = core.map((c, i) => {
      const [t, ts] = TONES[c.tone];
      const foot = c.pct === null ? '' : `<div class="stat-foot"><div class="bar"><div class="bar-fill" data-w="${Math.min(100, c.pct)}"></div></div><span class="stat-pct" title="${esc(c.pctLabel || '')}">${c.pct.toFixed(1)}%</span></div>`;
      return `<article class="card stat-card" style="--i:${i};--tone:${t};--tone-soft:${ts}">
        <div class="stat-top"><span class="stat-label">${esc(c.label)}</span><span class="stat-icon">${icon(c.ic)}</span></div>
        <div class="stat-value" data-v="${c.value}">0</div>${foot}</article>`;
    }).join('');

    const ranked = cats.map(c => ({ c, v: agg.byCat[c] || 0 })).sort((a, b) => b.v - a.v);
    const rank = new Map(ranked.map((r, i) => [r.c, i + 1]));
    $('#statsCategoryGrid').innerHTML = cats.map((c, i) => {
      const v = agg.byCat[c] || 0;
      const pct = total > 0 ? v / total * 100 : 0;
      const [t, ts] = TONES[i % TONES.length];
      const on = S.filters.MedClass.includes(c);
      return `<button type="button" class="card cat-card${on ? ' active' : ''}" data-cat="${esc(c)}" style="--i:${i};--tone:${t};--tone-soft:${ts}" aria-pressed="${on}" title="${on ? 'Remove' : 'Filter by'} ${esc(c)}">
        <span class="cat-top"><span class="cat-name" dir="auto">${esc(c)}</span><span class="cat-rank">#${rank.get(c)}</span></span>
        <span class="cat-value">${fmt(v)}</span>
        <span class="stat-foot"><span class="bar"><span class="bar-fill" style="display:block" data-w="${pct}"></span></span><span class="stat-pct">${pct.toFixed(1)}%</span></span>
      </button>`;
    }).join('');

    requestAnimationFrame(() => {
      $$('#statsCoreRow .stat-value').forEach(el => animateNumber(el, Number(el.dataset.v)));
      $$('#view-overview .bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
    });

    this.spark(months.map(m => Data.sumCats(agg.byMonth[m].byCat, cats)), months);
  },

  spark(values, labels) {
    if (!window.Chart) return;
    const cv = $('#heroSpark');
    if (!cv) return;
    if (this.sparkChart) this.sparkChart.destroy();
    const sage = cssVar('--sage');
    this.sparkChart = new Chart(cv, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: sage, borderWidth: 2.5, tension: .42, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: sage, fill: true,
        backgroundColor: (ctx) => { const { chart } = ctx; if (!chart.chartArea) return 'transparent'; const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom); g.addColorStop(0, cssVar('--sage-soft-2')); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; } }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: Charts.tooltip({ label: (c) => ' ' + fmt(c.parsed.y) }) },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } } }
    });
  },

  init() {
    $('#statsCategoryGrid').addEventListener('click', (e) => {
      const card = e.target.closest('.cat-card');
      if (card) Filters.toggle('MedClass', card.dataset.cat);
    });
  }
};

const Explore = {
  render(agg) {
    const thead = $('#exploreTable thead tr');
    const tbody = $('#exploreTable tbody');
    const { months, rows } = Data.exploreRows(agg);
    $('#exploreNote').textContent = `${rows.length} metrics across ${months.length} months · click a header to sort, a row to focus`;
    thead.innerHTML = `<th class="sortable" data-col="Metric">Metric ${sortMark}</th>` + months.map(m => `<th class="sortable num" data-col="${esc(m)}" dir="auto">${esc(m)} ${sortMark}</th>`).join('') + `<th class="sortable num" data-col="_sum">Total ${sortMark}</th>`;
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
      const cells = months.map(m => {
        const v = r[m] || 0;
        let tr = '';
        if (prev !== null) tr = v === prev ? '<span class="trend flat">–</span>' : v > prev ? '<span class="trend up">↑</span>' : '<span class="trend down">↓</span>';
        prev = v;
        const a = max > 0 ? (v / max) * 0.22 : 0;
        return `<td class="num"><span class="heat" style="background:color-mix(in srgb, var(--sage) ${(a * 100).toFixed(0)}%, transparent)">${fmt(v)}</span>${tr}</td>`;
      }).join('');
      return `<tr data-row><td class="metric" dir="auto">${esc(r.Metric)}</td>${cells}<td class="num"><strong>${fmt(r._sum)}</strong></td></tr>`;
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
    const cols = ['Region', 'Pharmacy', 'Month', 'Status'];
    thead.innerHTML = cols.map(c => `<th class="sortable" data-col="${c}">${c} ${sortMark}</th>`).join('');
    const q = normalizeArabic(S.missingQuery);
    let rows = S.missing.filter(r => !q || normalizeArabic(r.Pharmacy).includes(q) || normalizeArabic(r.Region).includes(q) || normalizeArabic(r.Month).includes(q));
    const s = S.missingSort;
    if (s.col) {
      rows.sort((a, b) => s.col === 'Month' ? s.dir * (monthRank(a.Month) - monthRank(b.Month)) : s.dir * String(a[s.col]).localeCompare(String(b[s.col])));
      const th = $$('th', thead).find(t => t.dataset.col === s.col);
      if (th) th.classList.add(s.dir === 1 ? 'asc' : 'desc');
    }
    const ph = new Set(S.missing.map(r => r.Pharmacy)).size;
    $('#missingNote').textContent = S.missing.length ? `${fmt(S.missing.length)} gaps across ${ph} pharmacies${q ? ` · ${rows.length} shown` : ''}` : 'Every eligible pharmacy has submitted';
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4">${S.missing.length ? emptyHTML('No matches', 'Nothing matches that search.', 'search') : emptyHTML('All pharmacies reporting', 'No inactive records for the current filters.', 'checkCircle')}</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr data-row><td dir="auto">${esc(r.Region)}</td><td dir="auto"><strong>${esc(r.Pharmacy)}</strong></td><td dir="auto">${esc(r.Month)}</td><td><span class="tag inactive">Inactive</span></td></tr>`).join('');
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

const scopedSelects = (filters, side, keys) => keys.map(k => {
  const opts = Data.scopedOptions(filters, k);
  const cur = filters[k];
  if (cur !== 'all' && !opts.map(String).includes(String(cur))) filters[k] = 'all';
  const set = filters[k] !== 'all';
  return `<label class="sel${set ? ' set' : ''}"><span>${k === 'Class' ? 'Classification' : k}</span>
    <select data-side="${side}" data-key="${k}" dir="auto"><option value="all">All ${k === 'Class' ? 'classes' : k === 'Pharmacy' ? 'pharmacies' : k.toLowerCase() + 's'}</option>${opts.map(o => `<option value="${esc(o)}"${String(o) === String(filters[k]) ? ' selected' : ''}>${k === 'Year' ? esc(fyLabel(o)) : esc(o)}</option>`).join('')}</select>
    <button type="button" class="sel-reset" data-side="${side}" data-key="${k}" aria-label="Reset ${k}">${icon('x')}</button></label>`;
}).join('');

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
    SCOPED_METRICS.forEach(m => {
      const vals = years.map(y => map[y][m]);
      const max = Math.max(...vals), min = Math.min(...vals);
      const varied = max !== min && max > 0;
      let change = '';
      if (years.length > 1) {
        const a = vals[0], b = vals[1];
        const pct = b ? (a - b) / b * 100 : 0;
        change = `<td class="num">${Math.abs(pct) > 0.1 ? `<span class="delta ${pct > 0 ? 'pos' : 'neg'}">${pct > 0 ? '+' : ''}${pct.toFixed(1)}%</span>` : '<span class="trend flat">–</span>'}</td>`;
      }
      html += `<tr data-row><td class="metric" dir="auto">${esc(m)}</td>${vals.map(v => `<td class="num ${varied ? (v === max ? 'cell-max' : v === min ? 'cell-min' : '') : ''}">${fmt(v)}</td>`).join('')}${change}</tr>`;
    });
    host.innerHTML = html + '</tbody></table></div>';
  },

  picker() {
    const draft = new Set(S.yearsScope);
    const body = `<div class="year-toolbar"><label class="mini-search">${icon('search')}<input type="search" id="yearPickSearch" placeholder="Filter years" /></label><button class="btn soft sm" id="yearSort" type="button">${icon('swap')}<span>Sort</span></button><button class="btn ghost sm" id="yearAll" type="button">All</button><button class="btn ghost sm" id="yearNone" type="button">None</button></div><div class="year-list" id="yearPickList"></div>`;
    Modal.open('Choose fiscal years', body, `<button class="btn ghost" type="button" id="yearCancel">Cancel</button><button class="btn primary" type="button" id="yearApply">${icon('check')}<span>Apply</span></button>`);
    const list = () => {
      const q = $('#yearPickSearch').value.trim();
      let ys = S.years.map(String).sort((a, b) => S.yearSortDesc ? b - a : a - b);
      if (q) ys = ys.filter(y => y.includes(q) || fyLabel(y).includes(q));
      $('#yearPickList').innerHTML = ys.map(y => `<label class="year-opt"><input type="checkbox" value="${esc(y)}"${draft.has(y) ? ' checked' : ''} />${esc(fyLabel(y))}</label>`).join('') || '<p class="section-note">No years</p>';
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
    $('#yearsFilters').addEventListener('change', (e) => { if (e.target.matches('select')) { onScopedChange(S.yearsFilters, e.target.dataset.key, e.target.value); this.render(); } });
    $('#yearsFilters').addEventListener('click', (e) => { const b = e.target.closest('.sel-reset'); if (b) { e.preventDefault(); onScopedChange(S.yearsFilters, b.dataset.key, 'all'); this.render(); } });
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

const Compare = {
  title(f) { return f.Year !== 'all' ? fyLabel(f.Year) : 'All years'; },
  sum(f) { const p = ['Region', 'Pharmacy', 'Month', 'Class'].filter(k => f[k] !== 'all').map(k => f[k]); return p.length ? p.join(' · ') : 'No extra filters'; },

  init() {
    if (S.years.length) {
      const d = S.years.slice().sort((a, b) => b - a).map(String);
      if (S.cmpA.Year === 'all' && d[0]) S.cmpA.Year = d[0];
      if (S.cmpB.Year === 'all' && d[1]) S.cmpB.Year = d[1];
    }
  },

  render() {
    ['A', 'B'].forEach(side => {
      const f = side === 'A' ? S.cmpA : S.cmpB;
      $(`#compareSide${side}`).innerHTML = `<div class="side-title"><span class="side-dot"></span>${side === 'A' ? 'Left scope' : 'Right scope'}</div><div class="select-grid">${scopedSelects(f, side, ['Year', 'Region', 'Pharmacy', 'Month', 'Class'])}</div>`;
    });
    const a = Data.scopedMetrics(S.cmpA), b = Data.scopedMetrics(S.cmpB);
    const side = (m, o, f, cls) => `<article class="card compare-table ${cls}"><header class="compare-head"><h3><span class="side-dot"></span>${esc(this.title(f))}</h3><span class="side-sum" dir="auto">${esc(this.sum(f))}</span></header><div class="table-scroll"><table class="data-table"><thead><tr><th>Metric</th><th class="num">Value</th></tr></thead><tbody>${SCOPED_METRICS.map(k => {
      const d = m[k] - o[k];
      const pct = o[k] ? d / o[k] * 100 : 0;
      const pill = Math.abs(pct) > 0.1 ? `<span class="delta ${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${pct.toFixed(1)}%</span>` : '';
      return `<tr data-row data-k="${esc(k)}"><td class="metric" dir="auto">${esc(k)}</td><td class="num">${pill}${fmt(m[k])}</td></tr>`;
    }).join('')}</tbody></table></div></article>`;
    $('#compareResults').innerHTML = side(a, b, S.cmpA, 'side-a') + side(b, a, S.cmpB, 'side-b');
    const panes = $$('#compareResults .table-scroll');
    let lock = false;
    panes.forEach((p, i) => p.addEventListener('scroll', () => { if (lock) return; lock = true; panes[1 - i].scrollTop = p.scrollTop; requestAnimationFrame(() => { lock = false; }); }));
  },

  bind() {
    const deck = $('.compare-deck');
    deck.addEventListener('change', (e) => { if (e.target.matches('select')) { onScopedChange(e.target.dataset.side === 'A' ? S.cmpA : S.cmpB, e.target.dataset.key, e.target.value); this.render(); } });
    deck.addEventListener('click', (e) => { const b = e.target.closest('.sel-reset'); if (b) { e.preventDefault(); onScopedChange(b.dataset.side === 'A' ? S.cmpA : S.cmpB, b.dataset.key, 'all'); this.render(); } });
    $('#swapSidesBtn').addEventListener('click', () => { [S.cmpA, S.cmpB] = [S.cmpB, S.cmpA]; this.render(); });
    $('#compareResults').addEventListener('click', (e) => {
      const tr = e.target.closest('tbody tr[data-row]');
      if (!tr) return;
      const k = tr.dataset.k;
      const was = tr.classList.contains('focus');
      $$('#compareResults tbody tr').forEach(r => { r.classList.remove('focus', 'dim'); if (!was) r.classList.add(r.dataset.k === k ? 'focus' : 'dim'); });
    });
    $('#exportCompareCsvBtn').addEventListener('click', () => Exporter.compareCsv());
  }
};
