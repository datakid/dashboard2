const FONT_UI = "Geist, 'IBM Plex Sans Arabic', system-ui, sans-serif";
const FONT_AR = "'IBM Plex Sans Arabic', Geist, system-ui, sans-serif";
const FONT_DISPLAY = "'Bricolage Grotesque', Geist, 'IBM Plex Sans Arabic', sans-serif";
const LABEL_FONT = `500 13px ${FONT_AR}`;

const ChartTip = {
  el: null,
  owner: null,
  key: '',
  shown: false,

  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'ctip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this.el = el;
    addEventListener('scroll', () => this.hide(), { passive: true, capture: true });
    document.addEventListener('pointerdown', (e) => { if (!(e.target instanceof HTMLCanvasElement)) this.hide(); }, true);
    return el;
  },

  hide() {
    if (!this.el) return;
    this.el.classList.remove('on');
    this.shown = false;
    this.owner = null;
    this.key = '';
  },

  colorOf(p) {
    const d = p.dataset;
    const pick = (v) => Array.isArray(v) ? v[p.dataIndex] : v;
    const line = (d.type || p.chart.config.type) === 'line';
    const cands = line ? [pick(d.borderColor), pick(d.backgroundColor)] : [pick(d.backgroundColor), pick(d.borderColor)];
    return cands.find(v => typeof v === 'string' && v && v !== 'transparent') || cssVar('--sage');
  },

  render(ctx, spec) {
    const { chart, tooltip } = ctx;
    const el = this.ensure();
    if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) { if (this.owner === chart) this.hide(); return; }
    const pts = tooltip.dataPoints;
    const rows = pts.map(p => {
      const r = spec.row ? spec.row(p) : { label: p.dataset.label, value: fmt(p.raw) };
      return r ? { color: this.colorOf(p), ...r } : null;
    }).filter(Boolean);
    if (!rows.length) { if (this.owner === chart) this.hide(); return; }
    const key = chart.id + '|' + pts.map(p => p.datasetIndex + ':' + p.dataIndex).join(',');
    if (key !== this.key || this.owner !== chart) {
      let t = spec.title ? spec.title(pts) : pts[0].label;
      if (!t || typeof t !== 'object') t = { main: t };
      const foot = spec.foot ? spec.foot(pts) : '';
      el.innerHTML = `<div class="ctip-head"><span class="ctip-title" dir="auto">${esc(t.main ?? '')}</span>${t.sub ? `<span class="ctip-sub" dir="auto">${esc(t.sub)}</span>` : ''}</div>
        <div class="ctip-rows">${rows.map(r => `<div class="ctip-row"><i style="background:${esc(r.color)}"></i><span class="ctip-lbl" dir="auto">${esc(r.label ?? '')}</span><span class="ctip-val">${esc(r.value)}</span>${r.meta ? `<span class="ctip-meta">${esc(r.meta)}</span>` : ''}</div>`).join('')}</div>
        ${foot ? `<div class="ctip-foot" dir="auto">${esc(foot)}</div>` : ''}`;
      this.key = key;
    }
    const rect = chart.canvas.getBoundingClientRect();
    const ax = rect.left + tooltip.caretX;
    const ay = rect.top + tooltip.caretY;
    const w = el.offsetWidth, h = el.offsetHeight;
    const gap = 16;
    let x = ax + gap;
    if (x + w > innerWidth - 8) x = ax - w - gap;
    x = Math.max(8, Math.min(innerWidth - w - 8, x));
    const y = Math.max(8, Math.min(innerHeight - h - 8, ay - h / 2));
    const tf = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    if (!this.shown || this.owner !== chart) {
      el.classList.add('snap');
      el.style.transform = tf;
      void el.offsetWidth;
      el.classList.remove('snap');
    } else el.style.transform = tf;
    el.classList.add('on');
    this.shown = true;
    this.owner = chart;
  }
};

const Charts = {
  inst: {},
  legends: {},
  meta: {},
  opt: { med: 'horizontal', medOrder: 'ranked', trend: 'total', region: 'ring', top: 10, cov: 'bars', classes: 'ring' },
  built: false,
  mctx: null,

  defs: [
    { id: 'med', title: 'Medication distribution', sub: 'Value by medication class · click a bar to focus', span: 'wide', tools: [['med', [['horizontal', 'Bars'], ['vertical', 'Columns']]], ['medOrder', [['ranked', 'Ranked'], ['default', 'Default']]]] },
    { id: 'trend', title: 'Trend', sub: 'How value moves across the selected period', span: 'two-third', tools: [['trend', [['total', 'Total'], ['overlay', 'Year over year'], ['stacked', 'By class'], ['presc', 'Rx']]]] },
    { id: 'region', title: 'Regional share', sub: 'Value split by region', span: 'third', tools: [['region', [['ring', 'Ring'], ['bars', 'Bars']]]] },
    { id: 'cov', title: 'Insurance coverage', sub: 'Prescriptions vs insured, with coverage rate', span: 'two-third', tools: [['cov', [['bars', 'Volumes'], ['rate', 'Rate only']]]] },
    { id: 'classes', title: 'Classification mix', sub: 'Value by pharmacy classification', span: 'third', tools: [['classes', [['ring', 'Ring'], ['polar', 'Polar']]]] },
    { id: 'top', title: 'Leading pharmacies', sub: 'Highest value contributors, coloured by region', span: 'wide', tools: [['top', [[10, 'Top 10'], [20, 'Top 20'], [30, 'Top 30']]]] }
  ],

  palette() {
    return ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9'].map(cssVar);
  },

  alpha(hex, a) {
    const h = String(hex).replace('#', '');
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
  },

  tooltip(spec = {}) {
    return { enabled: false, external: (ctx) => ChartTip.render(ctx, spec) };
  },

  pct(v, total) { return total ? (v / total * 100).toFixed(1) + '%' : '0%'; },

  axis(extra = {}) {
    return Object.assign({ grid: { color: cssVar('--grid'), drawTicks: false }, border: { display: false }, ticks: { color: cssVar('--ink-3'), padding: 10, font: { family: FONT_UI, size: 12, weight: '500' } } }, extra);
  },

  catAxis(extra = {}) {
    const a = this.axis(extra);
    a.grid = { display: false };
    a.ticks.color = cssVar('--ink-2');
    a.ticks.font = { family: FONT_AR, size: 12.5, weight: '500' };
    return a;
  },

  textW(s, font) {
    const c = this.mctx || (this.mctx = document.createElement('canvas').getContext('2d'));
    c.font = font;
    return c.measureText(String(s ?? '')).width;
  },

  fit(c, s, max) {
    if (c.measureText(s).width <= max) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c.measureText(s.slice(0, mid).trimEnd() + '…').width <= max) lo = mid; else hi = mid - 1;
    }
    return lo ? s.slice(0, lo).trimEnd() + '…' : '…';
  },

  labelAxis() {
    return { display: false, grid: { display: false }, border: { display: false }, ticks: { display: false } };
  },

  labelHost(id) {
    const body = $(`#chartGrid [data-chart="${id}"] .chart-body`);
    if (!body) return null;
    let host = $('.bar-labels', body);
    if (!host) { host = document.createElement('div'); host.className = 'bar-labels'; host.setAttribute('aria-hidden', 'true'); body.appendChild(host); }
    return host;
  },

  fillLabels(host, labels) {
    const sig = labels.join('\u0001');
    if (host._sig === sig) return;
    host.innerHTML = labels.map((l, i) => `<span class="bl" dir="auto" data-i="${i}">${esc(l)}</span>`).join('');
    host._sig = sig;
    host._y = [];
  },

  measureLabels(id, labels) {
    const host = this.labelHost(id);
    if (!host) return 0;
    this.fillLabels(host, labels);
    host.hidden = false;
    host.classList.add('measuring');
    const w = Math.max(0, ...Array.from(host.children, el => el.getBoundingClientRect().width));
    host.classList.remove('measuring');
    const cap = Math.max(96, Math.min(280, host.parentElement.clientWidth * 0.36));
    return Math.ceil(Math.min(cap, w + 2));
  },

  placeLabels(chart) {
    const host = chart.canvas.parentElement && $('.bar-labels', chart.canvas.parentElement);
    if (!host) return;
    const m = this.meta[chart.canvas.id];
    if (!m || !m.labels || chart.options.indexAxis !== 'y' || !chart.chartArea) { host.hidden = true; return; }
    this.fillLabels(host, m.labels);
    host.hidden = false;
    const w = Math.max(0, Math.round(chart.chartArea.left - 12));
    if (host._w !== w) { host.style.width = w + 'px'; host._w = w; }
    const sc = chart.scales.y;
    const act = new Set(chart.getActiveElements().map(e => e.index));
    Array.from(host.children).forEach((el, i) => {
      const y = Math.round(sc.getPixelForValue(i) * 2) / 2;
      if (host._y[i] !== y) { el.style.transform = `translate3d(0, ${y}px, 0) translateY(-50%)`; host._y[i] = y; }
      el.classList.toggle('on', act.has(i));
      el.classList.toggle('dim', !!(m.dim && m.dim(i)));
    });
  },

  sideLabels: {
    id: 'sideLabels',
    afterDraw(chart) { Charts.placeLabels(chart); },
    afterEvent(chart) { Charts.placeLabels(chart); }
  },

  barValues: {
    id: 'barValues',
    afterDatasetsDraw(chart) {
      const m = Charts.meta[chart.canvas.id];
      if (!m || !m.values || chart.options.indexAxis !== 'y') return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || meta.hidden) return;
      const c = chart.ctx;
      const area = chart.chartArea;
      const ink3 = cssVar('--ink-3'), ink4 = cssVar('--ink-4');
      c.save();
      c.font = `600 11.5px ${FONT_UI}`;
      c.textBaseline = 'middle';
      if ('direction' in c) c.direction = 'ltr';
      meta.data.forEach((bar, i) => {
        const v = chart.data.datasets[0].data[i];
        if (!v || !chart.getDataVisibility(i)) return;
        const txt = compact(v);
        const w = c.measureText(txt).width;
        const inside = bar.x + w + 12 > area.right;
        c.fillStyle = inside ? '#fff' : (m.dim && m.dim(i) ? ink4 : ink3);
        c.textAlign = inside ? 'right' : 'left';
        c.fillText(txt, inside ? bar.x - 8 : bar.x + 8, bar.y);
      });
      c.restore();
    }
  },

  wrap(label, max = 12) {
    const words = String(label).split(/\s+/);
    const lines = [];
    let cur = '';
    words.forEach(w => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    return lines.length > 1 ? lines : lines[0] || '';
  },

  centerTotal: {
    id: 'centerTotal',
    afterDraw(chart) {
      if (chart.config.type !== 'doughnut') return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data.length) return;
      const { x, y } = meta.data[0];
      const inner = meta.data[0].innerRadius || 60;
      const total = chart.data.datasets[0].data.reduce((s, v, i) => s + (chart.getDataVisibility(i) ? v : 0), 0);
      const c = chart.ctx;
      const size = Math.max(18, Math.min(30, inner * 0.36));
      c.save();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = cssVar('--ink');
      c.font = `600 ${size}px ${FONT_DISPLAY}`;
      c.fillText(compact(total), x, y - size * 0.28);
      c.fillStyle = cssVar('--ink-3');
      c.font = `600 10.5px ${FONT_UI}`;
      if ('letterSpacing' in c) c.letterSpacing = '1.5px';
      c.fillText('TOTAL', x, y + size * 0.62);
      c.restore();
    }
  },

  vGrad(ctx, color, soft) {
    const { chart } = ctx;
    if (!chart.chartArea) return color;
    const horiz = chart.options.indexAxis === 'y';
    const a = chart.chartArea;
    const g = horiz ? chart.ctx.createLinearGradient(a.left, 0, a.right, 0) : chart.ctx.createLinearGradient(0, a.bottom, 0, a.top);
    g.addColorStop(0, soft); g.addColorStop(1, color);
    return g;
  },

  build() {
    if (this.built) return;
    Chart.defaults.font.family = FONT_UI;
    Chart.defaults.font.weight = '500';
    Chart.defaults.color = cssVar('--ink-3');
    $('#chartGrid').innerHTML = this.defs.map(d => `
      <article class="card chart-card ${d.span}" data-chart="${d.id}">
        <header class="chart-head">
          <div class="chart-heading"><h3 class="chart-title">${esc(d.title)}</h3><p class="chart-sub" data-sub="${d.id}">${esc(d.sub)}</p></div>
          <div class="chart-tools">
            ${d.tools.map(([key, opts]) => `<div class="seg" data-opt="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(this.opt[key]) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`).join('')}
            ${d.id === 'med' ? `<button class="btn soft sm focus-clear" type="button" data-clear-med hidden>${icon('x')}<span>Clear focus</span></button>` : ''}
            <button class="icon-btn sm" type="button" data-png="${d.id}" aria-label="Download ${esc(d.title)} as PNG" data-tip="Download PNG">${icon('image')}</button>
          </div>
        </header>
        <div class="chart-body"><canvas id="chart-${d.id}" role="img" aria-label="${esc(d.title)}"></canvas></div>
        <div class="chart-legend" id="legend-${d.id}" hidden></div>
      </article>`).join('');

    $('#chartGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) {
        const key = b.parentElement.dataset.opt;
        this.opt[key] = isNaN(b.dataset.v) ? b.dataset.v : Number(b.dataset.v);
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b));
        store.set('alembic-chart-opts', this.opt);
        const id = b.closest('.chart-card').dataset.chart;
        if (id === 'trend') this.render(Data.aggregate(S.filtered)); else this.draw(id, Data.aggregate(S.filtered));
        return;
      }
      if (e.target.closest('[data-clear-med]')) { Overview.clearCats(); return; }
      const li = e.target.closest('.legend-item');
      if (li) { this.toggleLegend(li.closest('.chart-card').dataset.chart, Number(li.dataset.i)); return; }
      const p = e.target.closest('[data-png]');
      if (p) this.exportOne(p.dataset.png);
    });
    $('#exportAllPngBtn').addEventListener('click', () => this.exportAll());
    if (document.fonts) document.fonts.ready.then(() => { if (S.tab === 'charts' && S.data.length) this.render(Data.aggregate(S.filtered)); });
    this.built = true;
  },

  restoreOpts() { Object.assign(this.opt, store.get('alembic-chart-opts', {})); },

  render(agg) {
    if (!window.Chart) return;
    this.build();
    $('#chartsNote').textContent = `${Data.periodLabel()} · ${Data.summary()}`;
    const g = Data.grain() === 'year' ? 'yearly' : 'monthly';
    const ts = $('[data-sub="trend"]'); if (ts) ts.textContent = this.opt.trend === 'overlay' ? 'Each fiscal year laid over July → June' : `${g[0].toUpperCase() + g.slice(1)} value across ${Data.periodLabel()}`;
    const cs = $('[data-sub="cov"]'); if (cs) cs.textContent = `Prescriptions vs insured, ${g}, with coverage rate`;
    this.defs.forEach(d => this.draw(d.id, agg));
  },

  make(id, config, meta) {
    this.meta[`chart-${id}`] = meta || null;
    const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 460, easing: 'easeOutQuart' }, layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } } };
    config.options = Object.assign(base, config.options);
    config.options.plugins = Object.assign({ legend: { display: false } }, config.options.plugins || {});
    const lw = meta && meta.labels ? this.measureLabels(id, meta.labels.map(String)) : 0;
    if (!lw) { const h = this.labelHost(id); if (h) h.hidden = true; }
    if (config.options.indexAxis === 'y') config.options.layout = { padding: { top: 8, right: 48, bottom: 4, left: lw ? lw + 16 : 4 } };
    const sig = [config.type, config.options.indexAxis || 'x', config.data.datasets.map(d => d.type || config.type).join(','), Object.keys(config.options.scales || {}).join(',')].join('|');
    const ch = this.inst[id];
    if (ch && ch.$sig === sig && ch.canvas && ch.canvas.isConnected) {
      if (ChartTip.owner === ch) ChartTip.hide();
      ch.data.labels = config.data.labels;
      ch.data.datasets = config.data.datasets;
      ch.data.datasets.forEach((_, i) => ch.setDatasetVisibility(i, true));
      (config.data.labels || []).forEach((_, i) => { if (!ch.getDataVisibility(i)) ch.toggleDataVisibility(i); });
      ch.options = config.options;
      ch.update();
      return;
    }
    if (ch) { if (ChartTip.owner === ch) ChartTip.hide(); ch.destroy(); }
    config.plugins = [...(config.plugins || []), this.centerTotal, this.barValues, this.sideLabels];
    const n = new Chart($(`#chart-${id}`), config);
    n.$sig = sig;
    this.inst[id] = n;
  },

  setLegend(id, items, perPoint) {
    const host = $(`#legend-${id}`);
    this.legends[id] = items ? { items, perPoint } : null;
    if (!items || !items.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = items.map((it, i) => `<button type="button" class="legend-item" data-i="${i}" aria-pressed="true"><span class="legend-dot" style="background:${it.color}"></span><span class="t" dir="auto">${esc(it.label)}</span>${it.meta ? `<span class="m">${esc(it.meta)}</span>` : ''}</button>`).join('');
  },

  toggleLegend(id, i) {
    const ch = this.inst[id];
    const lg = this.legends[id];
    if (!ch || !lg) return;
    if (lg.perPoint) ch.toggleDataVisibility(i);
    else ch.setDatasetVisibility(i, !ch.isDatasetVisible(i));
    ch.update();
    const on = lg.perPoint ? ch.getDataVisibility(i) : ch.isDatasetVisible(i);
    const el = $(`#legend-${id} .legend-item[data-i="${i}"]`);
    if (el) { el.classList.toggle('off', !on); el.setAttribute('aria-pressed', String(on)); }
  },

  bodyW(id) { const el = $(`#chartGrid [data-chart="${id}"] .chart-body`); return el ? el.clientWidth : 800; },

  xTicks(slot) {
    return this.catAxis({ ticks: { ...this.catAxis().ticks, font: { family: FONT_UI, size: 12, weight: '500' }, autoSkip: true, autoSkipPadding: 18, maxRotation: slot < 40 ? 40 : 0, minRotation: 0 } });
  },

  valueAxis(extra = {}) {
    return this.axis(Object.assign({ beginAtZero: true, ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } }, extra));
  },

  draw(id, agg) {
    const P = this.palette();
    const cats = Data.cats();
    const series = Data.series(agg);
    const keys = series.map(b => b.key);
    const bare = !Data.multiYear();
    const months = keys.map(k => periodAxis(k, bare));
    const dense = series.length > 18;
    const sage = cssVar('--sage'), sageDeep = cssVar('--sage-deep'), soft = cssVar('--sage-soft-2'), copper = cssVar('--copper'), copperSoft = cssVar('--copper-soft');
    const surface = cssVar('--surface');
    const body = $(`#chartGrid [data-chart="${id}"] .chart-body`);
    if (body) body.style.height = '';
    const periodT = (pts) => periodTitle(keys[pts[0].dataIndex]);

    if (id === 'med') {
      const sel = new Set(S.filters.MedClass);
      const any = sel.size > 0;
      const base = any ? Data.catTotals(true) : agg.byCat;
      let rows = MED_CATS.map(c => ({ c, v: base[c] || 0 })).filter(r => r.v > 0 || sel.has(r.c));
      if (this.opt.medOrder === 'ranked') rows.sort((a, b) => b.v - a.v);
      const on = (i) => !any || (rows[i] && sel.has(rows[i].c));
      const horiz = this.opt.med === 'horizontal';
      const total = rows.reduce((s, r) => s + r.v, 0);
      const slot = this.bodyW(id) / Math.max(1, rows.length);
      const slate = cssVar('--slate');
      const faded = this.alpha(slate, .2), fadedHover = this.alpha(slate, .36);
      const ink2 = cssVar('--ink-2'), ink4 = cssVar('--ink-4');
      if (horiz) body.style.height = Math.max(320, rows.length * 32 + 44) + 'px';
      const labels = rows.map(r => horiz ? r.c : (slot >= 58 ? this.wrap(r.c, slot >= 80 ? 12 : 8) : r.c));
      const sub = $('[data-sub="med"]');
      if (sub) sub.textContent = any ? `${sel.size} of ${rows.length} classes in focus · click another bar to switch, ⌘/Ctrl-click to add` : 'Value by medication class · click a bar to focus';
      const clr = $('[data-clear-med]'); if (clr) clr.hidden = !any;
      this.setLegend(id, null);
      const hit = (e, els, chart) => {
        if (els.length) return els[0].index;
        const a = chart.chartArea;
        if (horiz && e.x < a.left && e.y >= a.top && e.y <= a.bottom) return Math.round(chart.scales.y.getValueForPixel(e.y));
        return -1;
      };
      this.make(id, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: (c) => on(c.dataIndex) ? this.vGrad(c, sage, soft) : faded, hoverBackgroundColor: (c) => on(c.dataIndex) ? sageDeep : fadedHover, borderRadius: 7, borderSkipped: false, barPercentage: horiz ? .72 : .66, categoryPercentage: .86, maxBarThickness: 34 }] },
        options: {
          indexAxis: horiz ? 'y' : 'x',
          interaction: { mode: 'index', axis: horiz ? 'y' : 'x', intersect: false },
          onClick: (e, els, chart) => { const i = hit(e, els, chart); if (i >= 0 && rows[i]) Overview.pickCat(rows[i].c, e.native); },
          onHover: (e, els, chart) => { chart.canvas.style.cursor = hit(e, els, chart) >= 0 ? 'pointer' : ''; },
          plugins: {
            tooltip: this.tooltip({
              title: (pts) => rows[pts[0].dataIndex].c,
              row: (p) => ({ label: 'Value', value: fmt(p.raw), meta: this.pct(p.raw, total), color: on(p.dataIndex) ? sage : faded }),
              foot: (pts) => { const i = pts[0].dataIndex; return any && on(i) ? (sel.size === 1 ? 'Click to clear focus' : 'Click to focus on this only') : 'Click to focus · ⌘/Ctrl-click to add'; }
            })
          },
          scales: horiz
            ? { x: this.valueAxis({ position: 'top', grace: '6%' }), y: this.labelAxis(labels) }
            : { x: this.catAxis({ ticks: { ...this.catAxis().ticks, color: (c) => on(c.index) ? ink2 : ink4, autoSkip: false, maxRotation: slot >= 58 ? 0 : 60, minRotation: slot >= 58 ? 0 : 45, padding: 8, font: { family: FONT_AR, size: slot >= 58 ? 12 : 11, weight: '500' } } }), y: this.valueAxis() }
        }
      }, horiz ? { labels, values: true, dim: (i) => !on(i) } : null);
    }

    if (id === 'trend') {
      const mode = this.opt.trend;
      let datasets;
      let labels = months;
      let spec;
      if (mode === 'overlay') {
        const ys = Data.scopeYears().slice().sort((a, b) => a - b);
        const monthNames = [...new Set(Data.series(agg, 'month').map(b => splitPeriod(b.key).Month))].sort((a, b) => monthRank(a) - monthRank(b));
        labels = monthNames.map(m => { const i = monthIdx(m); return i < 0 ? m : MONTHS_EN[i].slice(0, 3); });
        datasets = ys.map((y, i) => {
          const c = P[(ys.length - 1 - i) % P.length];
          const latest = i === ys.length - 1;
          return { label: `FY ${fyShort(y)}`, data: monthNames.map(m => { const b = agg.byMonth[periodKey(y, m)]; return b ? Data.sumCats(b.byCat, cats) : null; }), borderColor: c, backgroundColor: c, borderWidth: latest ? 2.75 : 1.75, tension: .38, pointRadius: latest ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: surface, pointBorderColor: c, pointBorderWidth: 2, spanGaps: true, fill: false, order: latest ? 0 : 1 };
        });
        this.setLegend(id, datasets.map(d => ({ label: d.label, color: d.borderColor })), false);
        spec = {
          title: (pts) => { const m = monthNames[pts[0].dataIndex]; const i = monthIdx(m); return { main: i < 0 ? m : MONTHS_EN[i], sub: 'Year over year' }; },
          row: (p) => p.raw === null || p.raw === undefined ? null : { label: p.dataset.label, value: fmt(p.raw) }
        };
      } else if (mode === 'stacked') {
        const top = cats.map(c => ({ c, v: agg.byCat[c] || 0 })).sort((a, b) => b.v - a.v);
        const lead = top.slice(0, 5).map(t => t.c);
        const rest = top.slice(5).map(t => t.c);
        datasets = lead.map((c, i) => ({ label: c, data: series.map(b => b.byCat[c] || 0), borderColor: P[i], backgroundColor: this.alpha(P[i], .28), fill: true, tension: .36, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.75, stack: 's' }));
        if (rest.length) datasets.push({ label: 'Other', data: series.map(b => Data.sumCats(b.byCat, rest)), borderColor: P[7], backgroundColor: this.alpha(P[7], .22), fill: true, tension: .36, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.75, stack: 's' });
        this.setLegend(id, datasets.map(d => ({ label: d.label, color: d.borderColor })), false);
        spec = {
          title: periodT,
          row: (p) => ({ label: p.dataset.label, value: fmt(p.raw), color: p.dataset.borderColor }),
          foot: (pts) => `Total ${fmt(pts.reduce((s, p) => s + (p.raw || 0), 0))}`
        };
      } else {
        const presc = mode === 'presc';
        const color = presc ? copper : sage;
        const vals = series.map(b => presc ? b.presc : Data.sumCats(b.byCat, cats));
        datasets = [{ label: presc ? 'Prescriptions' : 'Total value', data: vals, borderColor: color, borderWidth: 2.5, tension: .4, pointRadius: dense ? 0 : 3.5, pointHoverRadius: 6, pointBackgroundColor: surface, pointBorderColor: color, pointBorderWidth: 2, fill: true,
          backgroundColor: (c) => { const ch = c.chart; if (!ch.chartArea) return 'transparent'; const g = ch.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom); g.addColorStop(0, presc ? copperSoft : soft); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; } }];
        this.setLegend(id, null);
        spec = {
          title: periodT,
          row: (p) => ({ label: p.dataset.label, value: fmt(p.raw), color }),
          foot: (pts) => { const i = pts[0].dataIndex; if (!i || !vals[i - 1]) return ''; const d = (vals[i] - vals[i - 1]) / vals[i - 1] * 100; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}% vs previous`; }
        };
      }
      const slot = this.bodyW(id) / Math.max(1, labels.length);
      this.make(id, {
        type: 'line',
        data: { labels, datasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: { tooltip: this.tooltip(spec) },
          scales: { x: this.xTicks(slot), y: this.valueAxis({ stacked: mode === 'stacked' }) }
        }
      });
    }

    if (id === 'region') {
      const rows = Object.entries(agg.byRegion).map(([r, o]) => [r, Data.sumCats(o.byCat, cats)]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[i % P.length]);
      const spec = { title: (pts) => rows[pts[0].dataIndex][0], row: (p) => ({ label: 'Value', value: fmt(p.raw), meta: this.pct(p.raw, total), color: colors[p.dataIndex] }) };
      if (this.opt.region === 'ring') {
        this.setLegend(id, rows.map((r, i) => ({ label: r[0], color: colors[i], meta: this.pct(r[1], total) })), true);
        this.make(id, {
          type: 'doughnut',
          data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: colors, borderColor: surface, borderWidth: 3, borderRadius: 6, hoverOffset: 6, spacing: 1 }] },
          options: { cutout: '74%', layout: { padding: 10 }, plugins: { tooltip: this.tooltip(spec) } }
        });
      } else {
        this.setLegend(id, null);
        const labels = rows.map(r => r[0]);
        this.make(id, {
          type: 'bar',
          data: { labels, datasets: [{ label: 'Value', data: rows.map(r => r[1]), backgroundColor: colors, borderRadius: 7, borderSkipped: false, barPercentage: .66, maxBarThickness: 38 }] },
          options: { indexAxis: 'y', interaction: { mode: 'index', axis: 'y', intersect: false }, plugins: { tooltip: this.tooltip(spec) },
            scales: { x: this.valueAxis({ grace: '8%', ticks: { ...this.axis().ticks, maxTicksLimit: 4, callback: (v) => compact(v) } }), y: this.labelAxis(labels) } }
        }, { labels, values: true });
      }
    }

    if (id === 'cov') {
      const presc = series.map(b => b.presc);
      const ins = series.map(b => b.insured);
      const rate = months.map((m, i) => presc[i] ? +(ins[i] / presc[i] * 100).toFixed(1) : 0);
      const plum = cssVar('--plum');
      const rateDs = { type: 'line', label: 'Coverage', data: rate, yAxisID: 'y1', borderColor: plum, backgroundColor: plum, borderWidth: 2.25, tension: .4, pointRadius: dense ? 0 : 3, pointBackgroundColor: surface, pointBorderColor: plum, pointBorderWidth: 2, order: 0 };
      const onlyRate = this.opt.cov === 'rate';
      const ds = onlyRate ? [Object.assign(rateDs, { fill: true, backgroundColor: cssVar('--plum-soft') })] : [
        { label: 'Prescriptions', data: presc, backgroundColor: this.alpha(copper, .38), hoverBackgroundColor: copper, borderRadius: 6, borderSkipped: false, barPercentage: .82, categoryPercentage: .66, maxBarThickness: 26, order: 1 },
        { label: 'Insured', data: ins, backgroundColor: sage, borderRadius: 6, borderSkipped: false, barPercentage: .82, categoryPercentage: .66, maxBarThickness: 26, order: 1 },
        rateDs
      ];
      const colorOf = (d) => d.type === 'line' ? plum : (d.label === 'Insured' ? sage : copper);
      this.setLegend(id, ds.map(d => ({ label: d.label === 'Coverage' ? 'Coverage %' : d.label, color: colorOf(d) })), false);
      const slot = this.bodyW(id) / Math.max(1, months.length);
      const scales = { x: this.xTicks(slot), y1: this.axis({ position: onlyRate ? 'left' : 'right', beginAtZero: true, suggestedMax: 100, grid: { display: onlyRate, color: cssVar('--grid'), drawTicks: false }, ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => v + '%' } }) };
      if (!onlyRate) scales.y = this.valueAxis();
      this.make(id, {
        type: 'bar',
        data: { labels: months, datasets: ds },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: this.tooltip({ title: periodT, row: (p) => ({ label: p.dataset.label, value: p.dataset.yAxisID === 'y1' ? p.raw + '%' : fmt(p.raw), color: colorOf(p.dataset) }) }) }, scales }
      });
    }

    if (id === 'classes') {
      const rows = Object.entries(agg.byClass).map(([k, o]) => [k, Data.sumCats(o.byCat, cats)]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[(i + 2) % P.length]);
      const polar = this.opt.classes === 'polar';
      this.setLegend(id, rows.map((r, i) => ({ label: r[0], color: colors[i], meta: this.pct(r[1], total) })), true);
      this.make(id, {
        type: polar ? 'polarArea' : 'doughnut',
        data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: polar ? colors.map(c => this.alpha(c, .78)) : colors, borderColor: surface, borderWidth: polar ? 2 : 3, borderRadius: polar ? 0 : 6, spacing: polar ? 0 : 1, hoverOffset: 6 }] },
        options: Object.assign({ layout: { padding: 10 }, plugins: { tooltip: this.tooltip({ title: (pts) => rows[pts[0].dataIndex][0], row: (p) => ({ label: 'Value', value: fmt(p.raw), meta: this.pct(p.raw, total), color: colors[p.dataIndex] }) }) } },
          polar ? { scales: { r: { grid: { color: cssVar('--grid') }, angleLines: { color: cssVar('--grid') }, ticks: { display: false, backdropColor: 'transparent' } } } } : { cutout: '74%' })
      });
    }

    if (id === 'top') {
      const rows = Object.entries(agg.byPharmacy).map(([p, o]) => ({ p, r: o.region, v: Data.sumCats(o.byCat, cats) })).filter(r => r.v > 0).sort((a, b) => b.v - a.v).slice(0, this.opt.top);
      const regions = [...new Set(rows.map(r => r.r))];
      const total = Data.sumCats(agg.byCat, cats);
      body.style.height = Math.max(320, rows.length * 32 + 50) + 'px';
      this.setLegend(id, regions.map((r, i) => ({ label: r, color: P[i % P.length] })), null);
      $$(`#legend-top .legend-item`).forEach(b => { b.classList.add('static'); b.disabled = true; });
      const labels = rows.map(r => r.p);
      this.make(id, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: rows.map(r => P[regions.indexOf(r.r) % P.length]), borderRadius: 7, borderSkipped: false, barPercentage: .7, categoryPercentage: .86, maxBarThickness: 26 }] },
        options: {
          indexAxis: 'y',
          interaction: { mode: 'index', axis: 'y', intersect: false },
          plugins: { tooltip: this.tooltip({ title: (pts) => { const r = rows[pts[0].dataIndex]; return { main: r.p, sub: r.r }; }, row: (p) => ({ label: `Rank #${p.dataIndex + 1}`, value: fmt(p.raw), meta: this.pct(p.raw, total) }) }) },
          scales: { x: this.valueAxis({ position: 'top', grace: '6%' }), y: this.labelAxis(labels) }
        }
      }, { labels, values: true });
    }
  },

  refreshTheme() {
    if (S.tab === 'charts' && S.data.length) this.render(Data.aggregate(S.filtered));
    if (S.tab === 'overview' && S.data.length) Overview.render(Data.aggregate(S.filtered));
  },

  legendRows(c, items, maxW, scale) {
    const rows = [[]];
    let x = 0;
    const gap = 18 * scale;
    items.forEach(it => {
      c.font = `500 ${12.5 * scale}px ${FONT_AR}`;
      const txt = it.meta ? `${it.label}  ${it.meta}` : it.label;
      const w = 16 * scale + c.measureText(txt).width;
      if (x + w > maxW && rows[rows.length - 1].length) { rows.push([]); x = 0; }
      rows[rows.length - 1].push({ txt, w, color: it.color });
      x += w + gap;
    });
    return rows;
  },

  compose(ids, cols) {
    const scale = 2;
    const W = 720 * scale;
    const gap = 28 * scale, pad = 48 * scale, headH = 96 * scale, footH = 56 * scale, cardHead = 72 * scale, cardPad = 26 * scale, lineH = 24 * scale;
    const items = ids.map(id => ({ id, def: this.defs.find(d => d.id === id), ch: this.inst[id], lg: this.legends[id] })).filter(i => i.ch);
    if (!items.length) return null;
    const cellW = cols === 1 ? W : (W * 2 + gap);
    const measure = document.createElement('canvas').getContext('2d');
    const layout = [];
    let y = pad + headH, col = 0, rowH = 0;
    items.forEach(it => {
      const wide = cols === 1 || it.def.span === 'wide';
      const w = wide ? cellW : W;
      const src = it.ch.canvas;
      const ih = Math.round(src.height * ((w - cardPad * 2) / src.width));
      const lrows = it.lg && it.lg.items ? this.legendRows(measure, it.lg.items, w - cardPad * 2, scale) : [];
      const lh = lrows.length ? lrows.length * lineH + 12 * scale : 0;
      const h = ih + cardHead + cardPad + lh;
      if (wide || col === 2) { if (col > 0) { y += rowH + gap; } col = 0; rowH = 0; }
      const x = pad + (col === 1 ? W + gap : 0);
      layout.push({ it, x, y, w, h, ih, lrows });
      rowH = Math.max(rowH, h);
      if (wide) { y += h + gap; col = 0; rowH = 0; } else { col++; if (col === 2) { y += rowH + gap; col = 0; rowH = 0; } }
    });
    if (col > 0) y += rowH + gap;
    const out = document.createElement('canvas');
    out.width = cellW + pad * 2;
    out.height = y - gap + footH + pad / 2;
    const c = out.getContext('2d');
    c.fillStyle = cssVar('--paper'); c.fillRect(0, 0, out.width, out.height);
    const rr = (x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    const logo = $('.brand-mark');
    if (logo && logo.complete && logo.naturalWidth) {
      c.save(); rr(pad, pad, 44 * scale, 44 * scale, 12 * scale); c.clip(); c.drawImage(logo, pad, pad, 44 * scale, 44 * scale); c.restore();
    } else { c.fillStyle = cssVar('--sage'); rr(pad, pad, 44 * scale, 44 * scale, 12 * scale); c.fill(); }
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillStyle = cssVar('--ink'); c.font = `600 ${26 * scale}px ${FONT_DISPLAY}`;
    c.fillText(ids.length === 1 ? items[0].def.title : 'Alembic chart board', pad + 60 * scale, pad + 13 * scale);
    c.fillStyle = cssVar('--ink-3'); c.font = `500 ${13 * scale}px ${FONT_UI}`;
    c.fillText(`${Data.periodLabel()}  ·  ${Data.summary()}`.slice(0, 140), pad + 60 * scale, pad + 36 * scale);
    layout.forEach(({ it, x, y, w, h, ih, lrows }) => {
      c.save();
      c.shadowColor = 'rgba(30,36,34,0.07)'; c.shadowBlur = 24 * scale; c.shadowOffsetY = 6 * scale;
      c.fillStyle = cssVar('--surface'); rr(x, y, w, h, 22 * scale); c.fill();
      c.restore();
      c.strokeStyle = cssVar('--line'); c.lineWidth = scale; rr(x, y, w, h, 22 * scale); c.stroke();
      c.textBaseline = 'alphabetic';
      c.fillStyle = cssVar('--ink'); c.font = `600 ${18 * scale}px ${FONT_DISPLAY}`;
      c.fillText(it.def.title, x + cardPad, y + 38 * scale);
      c.fillStyle = cssVar('--ink-3'); c.font = `500 ${12 * scale}px ${FONT_UI}`;
      const sub = $(`[data-sub="${it.id}"]`);
      c.fillText(sub ? sub.textContent : it.def.sub, x + cardPad, y + 57 * scale);
      c.drawImage(it.ch.canvas, x + cardPad, y + cardHead, w - cardPad * 2, ih);
      const lm = this.meta[it.ch.canvas.id];
      if (lm && lm.labels && it.ch.options.indexAxis === 'y') {
        const r = (w - cardPad * 2) / it.ch.width;
        const right = x + cardPad + (it.ch.chartArea.left - 12) * r;
        const maxW = (it.ch.chartArea.left - 16) * r;
        c.save();
        c.textBaseline = 'middle';
        c.font = `500 ${13 * r}px ${FONT_AR}`;
        lm.labels.forEach((l, i) => {
          const s = String(l ?? '');
          c.fillStyle = lm.dim && lm.dim(i) ? cssVar('--ink-4') : cssVar('--ink-2');
          if ('direction' in c) c.direction = isArabic(s) ? 'rtl' : 'ltr';
          c.textAlign = isArabic(s) ? 'left' : 'right';
          const t = this.fit(c, s, maxW);
          const tw = c.measureText(t).width;
          c.fillText(t, isArabic(s) ? right - tw : right, y + cardHead + it.ch.scales.y.getPixelForValue(i) * r);
        });
        c.restore();
      }
      let ly = y + cardHead + ih + 12 * scale + lineH / 2;
      c.textBaseline = 'middle';
      lrows.forEach(row => {
        let lx = x + cardPad;
        row.forEach(li => {
          c.fillStyle = li.color; c.beginPath(); c.arc(lx + 4 * scale, ly, 4 * scale, 0, Math.PI * 2); c.fill();
          c.fillStyle = cssVar('--ink-2'); c.font = `500 ${12.5 * scale}px ${FONT_AR}`;
          c.fillText(li.txt, lx + 14 * scale, ly);
          lx += li.w + 18 * scale;
        });
        ly += lineH;
      });
    });
    c.fillStyle = cssVar('--ink-4'); c.font = `500 ${11 * scale}px ${FONT_UI}`; c.textBaseline = 'middle';
    c.fillText(`Alembic · Pharmacy intelligence · exported ${new Date().toLocaleString()}`, pad, out.height - footH / 2 - pad / 4);
    return out;
  },

  async save(ids, cols, name) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const out = this.compose(ids, cols);
    if (!out) { toast('Open the Charts tab first so charts can render', 'info'); return; }
    out.toBlob((blob) => { if (!blob) { toast('Could not create the image', 'error'); return; } downloadBlob(blob, name); toast('PNG saved — check your downloads', 'success'); }, 'image/png');
  },

  exportOne(id) {
    const ch = this.inst[id];
    if (!ch) return;
    ch.stop();
    ChartTip.hide();
    this.save([id], 1, `alembic-${id}-${Data.periodSlug()}-${stamp()}.png`);
  },

  exportAll() {
    if (!Object.keys(this.inst).length) { toast('Open the Charts tab first so charts can render', 'info'); return; }
    Object.values(this.inst).forEach(ch => ch.stop());
    ChartTip.hide();
    this.save(this.defs.map(d => d.id), 2, `alembic-charts-${Data.periodSlug()}-${stamp()}.png`);
  }
};
