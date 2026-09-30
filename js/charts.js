const FONT_UI = "Geist, 'IBM Plex Sans Arabic', system-ui, sans-serif";
const FONT_AR = "'IBM Plex Sans Arabic', Geist, system-ui, sans-serif";
const FONT_DISPLAY = "'Bricolage Grotesque', Geist, 'IBM Plex Sans Arabic', sans-serif";

const Charts = {
  inst: {},
  legends: {},
  opt: { med: 'horizontal', medOrder: 'ranked', trend: 'total', region: 'ring', top: 10, cov: 'bars', classes: 'ring' },
  built: false,

  defs: [
    { id: 'med', title: 'Medication distribution', sub: 'Value by medication class', span: 'wide', tools: [['med', [['horizontal', 'Bars'], ['vertical', 'Columns']]], ['medOrder', [['ranked', 'Ranked'], ['default', 'Default']]]] },
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
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
  },

  tooltip(callbacks = {}) {
    return {
      backgroundColor: cssVar('--tip-bg'),
      titleColor: cssVar('--tip-ink'),
      bodyColor: cssVar('--tip-ink-2'),
      borderColor: 'transparent',
      borderWidth: 0,
      padding: { top: 10, right: 14, bottom: 10, left: 12 },
      cornerRadius: 12,
      titleFont: { family: FONT_UI, size: 12.5, weight: '600' },
      bodyFont: { family: FONT_UI, size: 12.5, weight: '500' },
      titleMarginBottom: 6,
      boxWidth: 8, boxHeight: 8, boxPadding: 6, usePointStyle: true,
      caretSize: 0,
      displayColors: true,
      callbacks
    };
  },

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

  labelAxis(labels, extra = {}) {
    const font = { family: FONT_AR, size: 13, weight: '500' };
    const fontStr = `500 13px ${FONT_AR}`;
    const a = this.catAxis(extra);
    a.ticks = { ...a.ticks, autoSkip: false, padding: 14, font, color: cssVar('--ink-2') };
    a.afterFit = (scale) => {
      const c = scale.ctx;
      c.save();
      c.font = fontStr;
      const w = Math.max(0, ...labels.map(l => c.measureText(String(l)).width));
      c.restore();
      const cap = Math.max(110, Math.min(260, scale.chart.width * 0.34));
      scale.width = Math.min(cap, Math.ceil(w) + 28);
    };
    a.ticks.callback = function (v, i) {
      const l = String(labels[i] ?? '');
      const c = this.ctx;
      const cap = Math.max(110, Math.min(260, this.chart.width * 0.34)) - 28;
      c.save(); c.font = fontStr;
      let out = l;
      if (c.measureText(out).width > cap) { while (out.length > 1 && c.measureText(out + '…').width > cap) out = out.slice(0, -1); out += '…'; }
      c.restore();
      return out;
    };
    return a;
  },

  barValues: {
    id: 'barValues',
    afterDatasetsDraw(chart, _args, opts) {
      if (!opts || !opts.on || chart.options.indexAxis !== 'y') return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || meta.hidden) return;
      const c = chart.ctx;
      const area = chart.chartArea;
      c.save();
      c.font = `600 11.5px ${FONT_UI}`;
      c.textBaseline = 'middle';
      meta.data.forEach((bar, i) => {
        const v = chart.data.datasets[0].data[i];
        if (!v || !chart.getDataVisibility(i)) return;
        const txt = compact(v);
        const w = c.measureText(txt).width;
        const inside = bar.x + w + 12 > area.right;
        c.fillStyle = inside ? '#fff' : cssVar('--ink-3');
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

  make(id, config) {
    if (this.inst[id]) this.inst[id].destroy();
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 520, easing: 'easeOutQuart' }, layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } } }, config.options);
    config.options.plugins = Object.assign({ legend: { display: false } }, config.options.plugins || {});
    config.plugins = [...(config.plugins || []), this.centerTotal, this.barValues];
    if (config.options.indexAxis === 'y') {
      config.options.plugins.barValues = { on: true };
      config.options.layout = { padding: { top: 8, right: 44, bottom: 4, left: 4 } };
    }
    this.inst[id] = new Chart($(`#chart-${id}`), config);
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

  draw(id, agg) {
    const P = this.palette();
    const cats = Data.cats();
    const series = Data.series(agg);
    const months = series.map(b => b.label);
    const dense = series.length > 18;
    const sage = cssVar('--sage'), soft = cssVar('--sage-soft-2'), copper = cssVar('--copper'), copperSoft = cssVar('--copper-soft');
    const body = $(`#chartGrid [data-chart="${id}"] .chart-body`);
    if (body) body.style.height = '';

    if (id === 'med') {
      let rows = cats.map(c => ({ c, v: agg.byCat[c] || 0 }));
      if (this.opt.medOrder === 'ranked') rows.sort((a, b) => b.v - a.v);
      const horiz = this.opt.med === 'horizontal';
      const total = rows.reduce((s, r) => s + r.v, 0);
      const slot = this.bodyW(id) / Math.max(1, rows.length);
      if (horiz) body.style.height = Math.max(320, rows.length * 32 + 44) + 'px';
      const labels = rows.map(r => horiz ? r.c : (slot >= 58 ? this.wrap(r.c, slot >= 80 ? 12 : 8) : r.c));
      this.setLegend(id, null);
      this.make(id, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: (c) => this.vGrad(c, sage, soft), hoverBackgroundColor: cssVar('--sage-deep'), borderRadius: 7, borderSkipped: false, barPercentage: horiz ? .72 : .66, categoryPercentage: .86, maxBarThickness: 34 }] },
        options: {
          indexAxis: horiz ? 'y' : 'x',
          plugins: { tooltip: this.tooltip({ title: (i) => rows[i[0].dataIndex].c, label: (c) => { const v = horiz ? c.parsed.x : c.parsed.y; return ` ${fmt(v)} · ${total ? (v / total * 100).toFixed(1) : 0}%`; } }) },
          scales: horiz
            ? { x: this.axis({ beginAtZero: true, position: 'top', grace: '6%', ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } }), y: this.labelAxis(labels) }
            : { x: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: false, maxRotation: slot >= 58 ? 0 : 60, minRotation: slot >= 58 ? 0 : 45, padding: 8, font: { family: FONT_AR, size: slot >= 58 ? 12 : 11, weight: '500' } } }), y: this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } }) }
        }
      });
    }

    if (id === 'trend') {
      const mode = this.opt.trend;
      let datasets;
      let labels = months;
      if (mode === 'overlay') {
        const ys = Data.scopeYears().slice().sort((a, b) => a - b);
        const monthNames = [...new Set(Data.series(agg, 'month').map(b => splitPeriod(b.key).Month))].sort((a, b) => monthRank(a) - monthRank(b));
        labels = monthNames.map(m => MONTH_SHORT[String(m).toLowerCase()] || m);
        datasets = ys.map((y, i) => {
          const c = P[(ys.length - 1 - i) % P.length];
          const latest = i === ys.length - 1;
          return { label: `FY ${fyShort(y)}`, data: monthNames.map(m => { const b = agg.byMonth[periodKey(y, m)]; return b ? Data.sumCats(b.byCat, cats) : null; }), borderColor: c, backgroundColor: c, borderWidth: latest ? 2.75 : 1.75, tension: .38, pointRadius: latest ? 3 : 0, pointHoverRadius: 5, pointBackgroundColor: cssVar('--surface'), pointBorderColor: c, pointBorderWidth: 2, spanGaps: true, fill: false, order: latest ? 0 : 1 };
        });
        this.setLegend(id, datasets.map(d => ({ label: d.label, color: d.borderColor })), false);
      } else if (mode === 'stacked') {
        const top = cats.map(c => ({ c, v: agg.byCat[c] || 0 })).sort((a, b) => b.v - a.v);
        const lead = top.slice(0, 5).map(t => t.c);
        const rest = top.slice(5).map(t => t.c);
        datasets = lead.map((c, i) => ({ label: c, data: series.map(b => b.byCat[c] || 0), borderColor: P[i], backgroundColor: this.alpha(P[i], .28), fill: true, tension: .36, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.75, stack: 's' }));
        if (rest.length) datasets.push({ label: 'Other', data: series.map(b => Data.sumCats(b.byCat, rest)), borderColor: P[7], backgroundColor: this.alpha(P[7], .22), fill: true, tension: .36, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.75, stack: 's' });
        this.setLegend(id, datasets.map(d => ({ label: d.label, color: d.borderColor })), false);
      } else {
        const presc = mode === 'presc';
        const color = presc ? copper : sage;
        datasets = [{ label: presc ? 'Prescriptions' : 'Total value', data: series.map(b => presc ? b.presc : Data.sumCats(b.byCat, cats)), borderColor: color, borderWidth: 2.5, tension: .4, pointRadius: dense ? 0 : 3.5, pointHoverRadius: 6, pointBackgroundColor: cssVar('--surface'), pointBorderColor: color, pointBorderWidth: 2, fill: true,
          backgroundColor: (c) => { const ch = c.chart; if (!ch.chartArea) return 'transparent'; const g = ch.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom); g.addColorStop(0, presc ? copperSoft : soft); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; } }];
        this.setLegend(id, null);
      }
      const slot = this.bodyW(id) / Math.max(1, labels.length);
      this.make(id, {
        type: 'line',
        data: { labels, datasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: { tooltip: this.tooltip({ label: (c) => c.parsed.y === null ? null : ` ${c.dataset.label}: ${fmt(c.parsed.y)}` }) },
          scales: { x: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: true, autoSkipPadding: 16, maxRotation: slot < 44 ? 45 : 0, minRotation: 0 } }), y: this.axis({ beginAtZero: true, stacked: mode === 'stacked', ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } }) }
        }
      });
    }

    if (id === 'region') {
      const rows = Object.entries(agg.byRegion).map(([r, o]) => [r, Data.sumCats(o.byCat, cats)]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[i % P.length]);
      const pct = (v) => total ? (v / total * 100).toFixed(1) + '%' : '0%';
      if (this.opt.region === 'ring') {
        this.setLegend(id, rows.map((r, i) => ({ label: r[0], color: colors[i], meta: pct(r[1]) })), true);
        this.make(id, {
          type: 'doughnut',
          data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3, borderRadius: 6, hoverOffset: 6, spacing: 1 }] },
          options: { cutout: '74%', layout: { padding: 10 }, plugins: { tooltip: this.tooltip({ label: (c) => ` ${c.label}: ${fmt(c.raw)} · ${pct(c.raw)}` }) } }
        });
      } else {
        this.setLegend(id, null);
        this.make(id, {
          type: 'bar',
          data: { labels: rows.map(r => r[0]), datasets: [{ label: 'Value', data: rows.map(r => r[1]), backgroundColor: colors, borderRadius: 7, borderSkipped: false, barPercentage: .66, maxBarThickness: 38 }] },
          options: { indexAxis: 'y', plugins: { tooltip: this.tooltip({ label: (c) => ` ${fmt(c.parsed.x)} · ${pct(c.parsed.x)}` }) },
            scales: { x: this.axis({ beginAtZero: true, grace: '8%', ticks: { ...this.axis().ticks, maxTicksLimit: 4, callback: (v) => compact(v) } }), y: this.labelAxis(rows.map(r => r[0])) } }
        });
      }
    }

    if (id === 'cov') {
      const presc = series.map(b => b.presc);
      const ins = series.map(b => b.insured);
      const rate = months.map((m, i) => presc[i] ? +(ins[i] / presc[i] * 100).toFixed(1) : 0);
      const plum = cssVar('--plum');
      const rateDs = { type: 'line', label: 'Coverage %', data: rate, yAxisID: 'y1', borderColor: plum, backgroundColor: plum, borderWidth: 2.25, tension: .4, pointRadius: dense ? 0 : 3, pointBackgroundColor: cssVar('--surface'), pointBorderColor: plum, pointBorderWidth: 2, order: 0 };
      const onlyRate = this.opt.cov === 'rate';
      const ds = onlyRate ? [Object.assign(rateDs, { fill: true, backgroundColor: cssVar('--plum-soft') })] : [
        { label: 'Prescriptions', data: presc, backgroundColor: this.alpha(copper, .38), hoverBackgroundColor: copper, borderRadius: 6, borderSkipped: false, barPercentage: .82, categoryPercentage: .66, maxBarThickness: 26, order: 1 },
        { label: 'Insured', data: ins, backgroundColor: sage, borderRadius: 6, borderSkipped: false, barPercentage: .82, categoryPercentage: .66, maxBarThickness: 26, order: 1 },
        rateDs
      ];
      this.setLegend(id, ds.map(d => ({ label: d.label, color: d.type === 'line' ? plum : (d.label === 'Insured' ? sage : copper) })), false);
      const slot = this.bodyW(id) / Math.max(1, months.length);
      const scales = { x: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: true, autoSkipPadding: 16, maxRotation: slot < 44 ? 45 : 0, minRotation: 0 } }), y1: this.axis({ position: onlyRate ? 'left' : 'right', beginAtZero: true, suggestedMax: 100, grid: { display: onlyRate, color: cssVar('--grid'), drawTicks: false }, ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => v + '%' } }) };
      if (!onlyRate) scales.y = this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } });
      this.make(id, {
        type: 'bar',
        data: { labels: months, datasets: ds },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { tooltip: this.tooltip({ label: (c) => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y1' ? c.parsed.y + '%' : fmt(c.parsed.y)}` }) }, scales }
      });
    }

    if (id === 'classes') {
      const rows = Object.entries(agg.byClass).map(([k, o]) => [k, Data.sumCats(o.byCat, cats)]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[(i + 2) % P.length]);
      const polar = this.opt.classes === 'polar';
      const pct = (v) => total ? (v / total * 100).toFixed(1) + '%' : '0%';
      this.setLegend(id, rows.map((r, i) => ({ label: r[0], color: colors[i], meta: pct(r[1]) })), true);
      this.make(id, {
        type: polar ? 'polarArea' : 'doughnut',
        data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: polar ? colors.map(c => this.alpha(c, .78)) : colors, borderColor: cssVar('--surface'), borderWidth: polar ? 2 : 3, borderRadius: polar ? 0 : 6, spacing: polar ? 0 : 1, hoverOffset: 6 }] },
        options: Object.assign({ layout: { padding: 10 }, plugins: { tooltip: this.tooltip({ label: (c) => ` ${c.label}: ${fmt(c.raw)} · ${pct(c.raw)}` }) } },
          polar ? { scales: { r: { grid: { color: cssVar('--grid') }, angleLines: { color: cssVar('--grid') }, ticks: { display: false, backdropColor: 'transparent' } } } } : { cutout: '74%' })
      });
    }

    if (id === 'top') {
      const rows = Object.entries(agg.byPharmacy).map(([p, o]) => ({ p, r: o.region, v: Data.sumCats(o.byCat, cats) })).filter(r => r.v > 0).sort((a, b) => b.v - a.v).slice(0, this.opt.top);
      const regions = [...new Set(rows.map(r => r.r))];
      body.style.height = Math.max(320, rows.length * 32 + 50) + 'px';
      this.setLegend(id, regions.map((r, i) => ({ label: r, color: P[i % P.length] })), null);
      $$(`#legend-top .legend-item`).forEach(b => { b.classList.add('static'); b.disabled = true; });
      this.make(id, {
        type: 'bar',
        data: { labels: rows.map(r => r.p), datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: rows.map(r => P[regions.indexOf(r.r) % P.length]), borderRadius: 7, borderSkipped: false, barPercentage: .7, categoryPercentage: .86, maxBarThickness: 26 }] },
        options: {
          indexAxis: 'y',
          plugins: { tooltip: this.tooltip({ title: (i) => i[0].label, label: (c) => ` ${fmt(c.parsed.x)}`, afterLabel: (c) => ` Region: ${rows[c.dataIndex].r}` }) },
          scales: { x: this.axis({ beginAtZero: true, position: 'top', grace: '6%', ticks: { ...this.axis().ticks, maxTicksLimit: 6, callback: (v) => compact(v) } }), y: this.labelAxis(rows.map(r => r.p)) }
        }
      });
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
      c.fillText(it.def.sub, x + cardPad, y + 57 * scale);
      c.drawImage(it.ch.canvas, x + cardPad, y + cardHead, w - cardPad * 2, ih);
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
    this.save([id], 1, `alembic-${id}-${Data.periodSlug()}-${stamp()}.png`);
  },

  exportAll() {
    if (!Object.keys(this.inst).length) { toast('Open the Charts tab first so charts can render', 'info'); return; }
    Object.values(this.inst).forEach(ch => ch.stop());
    this.save(this.defs.map(d => d.id), 2, `alembic-charts-${Data.periodSlug()}-${stamp()}.png`);
  }
};
