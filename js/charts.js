const Charts = {
  inst: {},
  opt: { med: 'vertical', medOrder: 'default', trend: 'total', region: 'ring', top: 10, cov: 'bars', classes: 'ring' },
  built: false,

  defs: [
    { id: 'med', title: 'Medication distribution', sub: 'Value by medication class', span: 'wide', tools: [['med', [['vertical', 'Columns'], ['horizontal', 'Bars']]], ['medOrder', [['default', 'Default'], ['ranked', 'Ranked']]]] },
    { id: 'trend', title: 'Monthly trend', sub: 'How value moves through the fiscal year', span: 'two-third', tools: [['trend', [['total', 'Total'], ['stacked', 'By class'], ['presc', 'Prescriptions']]]] },
    { id: 'region', title: 'Regional share', sub: 'Value split by region', span: 'third', tools: [['region', [['ring', 'Ring'], ['bars', 'Bars']]]] },
    { id: 'cov', title: 'Insurance coverage', sub: 'Prescriptions vs insured, with coverage rate', span: 'two-third', tools: [['cov', [['bars', 'Volumes'], ['rate', 'Rate only']]]] },
    { id: 'classes', title: 'Classification mix', sub: 'Value by pharmacy classification', span: 'third', tools: [['classes', [['ring', 'Ring'], ['polar', 'Polar']]]] },
    { id: 'top', title: 'Leading pharmacies', sub: 'Highest value contributors', span: 'wide', tools: [['top', [[10, 'Top 10'], [20, 'Top 20'], [30, 'Top 30']]]] }
  ],

  palette() {
    return ['--sage', '--copper', '--plum', '--moss', '--rose', '--blue', '--ochre', '--slate', '--sage-deep'].map(cssVar);
  },

  tooltip(callbacks = {}) {
    return {
      backgroundColor: cssVar('--surface'),
      titleColor: cssVar('--ink'),
      bodyColor: cssVar('--ink-2'),
      borderColor: cssVar('--line-2'),
      borderWidth: 1,
      padding: { top: 10, right: 14, bottom: 10, left: 14 },
      cornerRadius: 14,
      titleFont: { family: 'Manrope', size: 12, weight: '700' },
      bodyFont: { family: 'Manrope', size: 12, weight: '500' },
      boxWidth: 8, boxHeight: 8, boxPadding: 6, usePointStyle: true,
      caretSize: 0,
      callbacks
    };
  },

  legend(show = true) {
    return { display: show, position: 'bottom', align: 'start', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, padding: 16, color: cssVar('--ink-2'), font: { family: 'Manrope', size: 12, weight: '600' } } };
  },

  axis(extra = {}) {
    return Object.assign({ grid: { color: cssVar('--line'), drawTicks: false }, border: { display: false }, ticks: { color: cssVar('--ink-3'), padding: 10, font: { family: 'Manrope', size: 11.5, weight: '600' } } }, extra);
  },

  catAxis(extra = {}) {
    const a = this.axis(extra);
    a.grid = { display: false };
    a.ticks.font = { family: "'IBM Plex Sans Arabic', Manrope", size: 12, weight: '500' };
    return a;
  },

  centerTotal: {
    id: 'centerTotal',
    afterDraw(chart) {
      if (chart.config.type !== 'doughnut') return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data.length) return;
      const { x, y } = meta.data[0];
      const total = chart.data.datasets[0].data.reduce((s, v, i) => s + (chart.getDataVisibility(i) ? v : 0), 0);
      const c = chart.ctx;
      c.save();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = cssVar('--ink');
      c.font = `400 26px Fraunces, Georgia, serif`;
      c.fillText(compact(total), x, y - 8);
      c.fillStyle = cssVar('--ink-3');
      c.font = `700 10px Manrope, sans-serif`;
      c.fillText('TOTAL', x, y + 16);
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
    $('#chartGrid').innerHTML = this.defs.map(d => `
      <article class="card chart-card ${d.span}" data-chart="${d.id}">
        <header class="chart-head">
          <div><h3 class="chart-title">${esc(d.title)}</h3><p class="chart-sub" data-sub="${d.id}">${esc(d.sub)}</p></div>
          <div class="chart-tools">
            ${d.tools.map(([key, opts]) => `<div class="seg" data-opt="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(this.opt[key]) === String(v) ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`).join('')}
            <button class="icon-btn sm" type="button" data-png="${d.id}" aria-label="Download ${esc(d.title)} as PNG" title="Download PNG">${icon('image')}</button>
          </div>
        </header>
        <div class="chart-body"><canvas id="chart-${d.id}" role="img" aria-label="${esc(d.title)}"></canvas></div>
      </article>`).join('');

    $('#chartGrid').addEventListener('click', (e) => {
      const b = e.target.closest('.seg button');
      if (b) {
        const key = b.parentElement.dataset.opt;
        this.opt[key] = isNaN(b.dataset.v) ? b.dataset.v : Number(b.dataset.v);
        $$('button', b.parentElement).forEach(x => x.classList.toggle('on', x === b));
        store.set('alembic-chart-opts', this.opt);
        const id = b.closest('.chart-card').dataset.chart;
        this.draw(id, Data.aggregate(S.filtered));
        return;
      }
      const p = e.target.closest('[data-png]');
      if (p) this.exportOne(p.dataset.png);
    });
    $('#exportAllPngBtn').addEventListener('click', () => this.exportAll());
    this.built = true;
  },

  restoreOpts() { Object.assign(this.opt, store.get('alembic-chart-opts', {})); },

  render(agg) {
    if (!window.Chart) return;
    this.build();
    $('#chartsNote').textContent = `FY ${fyLabel(S.filters.Year)} · ${Data.summary()}`;
    this.defs.forEach(d => this.draw(d.id, agg));
  },

  make(id, config) {
    if (this.inst[id]) this.inst[id].destroy();
    config.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 600, easing: 'easeOutQuart' }, layout: { padding: { top: 6, right: 8, bottom: 0, left: 0 } } }, config.options);
    config.plugins = [...(config.plugins || []), this.centerTotal];
    this.inst[id] = new Chart($(`#chart-${id}`), config);
  },

  draw(id, agg) {
    const P = this.palette();
    const cats = Data.cats();
    const months = Data.sortedMonths(agg);
    const sage = cssVar('--sage'), soft = cssVar('--sage-soft-2'), copper = cssVar('--copper'), copperSoft = cssVar('--copper-soft');
    const valueTip = this.tooltip({ label: (c) => ` ${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt(c.parsed.y ?? c.parsed.x ?? c.parsed ?? c.raw)}` });

    if (id === 'med') {
      let rows = cats.map(c => ({ c, v: agg.byCat[c] || 0 }));
      if (this.opt.medOrder === 'ranked') rows.sort((a, b) => b.v - a.v);
      const horiz = this.opt.med === 'horizontal';
      const total = rows.reduce((s, r) => s + r.v, 0);
      this.make(id, {
        type: 'bar',
        data: { labels: rows.map(r => r.c), datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: (c) => this.vGrad(c, sage, soft), hoverBackgroundColor: cssVar('--sage-deep'), borderRadius: 10, borderSkipped: false, barPercentage: .7, categoryPercentage: .8 }] },
        options: {
          indexAxis: horiz ? 'y' : 'x',
          plugins: { legend: { display: false }, tooltip: this.tooltip({ label: (c) => { const v = horiz ? c.parsed.x : c.parsed.y; return ` ${fmt(v)} · ${total ? (v / total * 100).toFixed(1) : 0}%`; } }) },
          scales: horiz
            ? { x: this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, callback: (v) => compact(v) } }), y: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: false } }) }
            : { x: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: false, maxRotation: 50 } }), y: this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, callback: (v) => compact(v) } }) }
        }
      });
    }

    if (id === 'trend') {
      const mode = this.opt.trend;
      let datasets;
      if (mode === 'stacked') {
        const top = cats.map(c => ({ c, v: agg.byCat[c] || 0 })).sort((a, b) => b.v - a.v);
        const lead = top.slice(0, 5).map(t => t.c);
        const rest = top.slice(5).map(t => t.c);
        datasets = lead.map((c, i) => ({ label: c, data: months.map(m => agg.byMonth[m].byCat[c] || 0), borderColor: P[i], backgroundColor: P[i] + '55', fill: true, tension: .38, pointRadius: 0, borderWidth: 2, stack: 's' }));
        if (rest.length) datasets.push({ label: 'Other', data: months.map(m => Data.sumCats(agg.byMonth[m].byCat, rest)), borderColor: P[7], backgroundColor: P[7] + '44', fill: true, tension: .38, pointRadius: 0, borderWidth: 2, stack: 's' });
      } else {
        const presc = mode === 'presc';
        const color = presc ? copper : sage;
        datasets = [{ label: presc ? 'Prescriptions' : 'Total value', data: months.map(m => presc ? agg.byMonth[m].presc : Data.sumCats(agg.byMonth[m].byCat, cats)), borderColor: color, borderWidth: 3, tension: .42, pointRadius: 3, pointHoverRadius: 7, pointBackgroundColor: cssVar('--surface'), pointBorderColor: color, pointBorderWidth: 2, fill: true,
          backgroundColor: (c) => { const ch = c.chart; if (!ch.chartArea) return 'transparent'; const g = ch.ctx.createLinearGradient(0, ch.chartArea.top, 0, ch.chartArea.bottom); g.addColorStop(0, presc ? copperSoft : soft); g.addColorStop(1, 'rgba(0,0,0,0)'); return g; } }];
      }
      this.make(id, {
        type: 'line',
        data: { labels: months, datasets },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: this.legend(mode === 'stacked'), tooltip: this.tooltip({ label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y)}` }) },
          scales: { x: this.catAxis(), y: this.axis({ beginAtZero: true, stacked: mode === 'stacked', ticks: { ...this.axis().ticks, callback: (v) => compact(v) } }) }
        }
      });
    }

    if (id === 'region') {
      const rows = Object.entries(agg.byRegion).map(([r, o]) => [r, Data.sumCats(o.byCat, cats)]).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[i % P.length]);
      if (this.opt.region === 'ring') {
        this.make(id, {
          type: 'doughnut',
          data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 3, borderRadius: 8, hoverOffset: 8, spacing: 2 }] },
          options: { cutout: '72%', plugins: { legend: this.legend(true), tooltip: this.tooltip({ label: (c) => ` ${c.label}: ${fmt(c.raw)} · ${total ? (c.raw / total * 100).toFixed(1) : 0}%` }) } }
        });
      } else {
        this.make(id, {
          type: 'bar',
          data: { labels: rows.map(r => r[0]), datasets: [{ label: 'Value', data: rows.map(r => r[1]), backgroundColor: colors, borderRadius: 10, borderSkipped: false, barPercentage: .7 }] },
          options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: this.tooltip({ label: (c) => ` ${fmt(c.parsed.x)} · ${total ? (c.parsed.x / total * 100).toFixed(1) : 0}%` }) },
            scales: { x: this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, callback: (v) => compact(v) } }), y: this.catAxis() } }
        });
      }
    }

    if (id === 'cov') {
      const presc = months.map(m => agg.byMonth[m].presc);
      const ins = months.map(m => agg.byMonth[m].insured);
      const rate = months.map((m, i) => presc[i] ? +(ins[i] / presc[i] * 100).toFixed(1) : 0);
      const rateDs = { type: 'line', label: 'Coverage %', data: rate, yAxisID: 'y1', borderColor: cssVar('--plum'), backgroundColor: cssVar('--plum'), borderWidth: 2.5, tension: .4, pointRadius: 3, pointBackgroundColor: cssVar('--surface'), pointBorderWidth: 2, order: 0 };
      const onlyRate = this.opt.cov === 'rate';
      const ds = onlyRate ? [Object.assign(rateDs, { fill: true, backgroundColor: cssVar('--plum-soft') })] : [
        { label: 'Prescriptions', data: presc, backgroundColor: cssVar('--copper-soft'), hoverBackgroundColor: copper, borderColor: copper, borderWidth: 0, borderRadius: 8, borderSkipped: false, barPercentage: .8, categoryPercentage: .7, order: 1 },
        { label: 'Insured', data: ins, backgroundColor: sage, borderRadius: 8, borderSkipped: false, barPercentage: .8, categoryPercentage: .7, order: 1 },
        rateDs
      ];
      const scales = { x: this.catAxis(), y1: this.axis({ position: onlyRate ? 'left' : 'right', beginAtZero: true, suggestedMax: 100, grid: { display: onlyRate, color: cssVar('--line') }, ticks: { ...this.axis().ticks, callback: (v) => v + '%' } }) };
      if (!onlyRate) scales.y = this.axis({ beginAtZero: true, ticks: { ...this.axis().ticks, callback: (v) => compact(v) } });
      this.make(id, {
        type: 'bar',
        data: { labels: months, datasets: ds },
        options: { interaction: { mode: 'index', intersect: false }, plugins: { legend: this.legend(true), tooltip: this.tooltip({ label: (c) => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y1' ? c.parsed.y + '%' : fmt(c.parsed.y)}` }) }, scales }
      });
    }

    if (id === 'classes') {
      const rows = Object.entries(agg.byClass).map(([k, o]) => [k, Data.sumCats(o.byCat, cats)]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, r) => s + r[1], 0);
      const colors = rows.map((_, i) => P[(i + 2) % P.length]);
      const polar = this.opt.classes === 'polar';
      this.make(id, {
        type: polar ? 'polarArea' : 'doughnut',
        data: { labels: rows.map(r => r[0]), datasets: [{ data: rows.map(r => r[1]), backgroundColor: polar ? colors.map(c => c + 'CC') : colors, borderColor: cssVar('--surface'), borderWidth: 3, borderRadius: polar ? 0 : 8, spacing: polar ? 0 : 2, hoverOffset: 8 }] },
        options: Object.assign({ plugins: { legend: this.legend(true), tooltip: this.tooltip({ label: (c) => ` ${c.label}: ${fmt(c.raw)} · ${total ? (c.raw / total * 100).toFixed(1) : 0}%` }) } },
          polar ? { scales: { r: { grid: { color: cssVar('--line') }, angleLines: { color: cssVar('--line') }, ticks: { display: false, backdropColor: 'transparent' } } } } : { cutout: '72%' })
      });
    }

    if (id === 'top') {
      const rows = Object.entries(agg.byPharmacy).map(([p, o]) => ({ p, r: o.region, v: Data.sumCats(o.byCat, cats) })).filter(r => r.v > 0).sort((a, b) => b.v - a.v).slice(0, this.opt.top);
      const regions = [...new Set(rows.map(r => r.r))];
      $(`#chartGrid [data-chart="top"] .chart-body`).style.height = Math.max(320, rows.length * 30 + 60) + 'px';
      this.make(id, {
        type: 'bar',
        data: { labels: rows.map(r => r.p), datasets: [{ label: 'Value', data: rows.map(r => r.v), backgroundColor: rows.map(r => P[regions.indexOf(r.r) % P.length]), borderRadius: 10, borderSkipped: false, barPercentage: .72, categoryPercentage: .85 }] },
        options: {
          indexAxis: 'y',
          plugins: { legend: { display: false }, tooltip: this.tooltip({ title: (i) => i[0].label, label: (c) => ` ${fmt(c.parsed.x)}`, afterLabel: (c) => ` Region: ${rows[c.dataIndex].r}` }) },
          scales: { x: this.axis({ beginAtZero: true, position: 'top', ticks: { ...this.axis().ticks, callback: (v) => compact(v) } }), y: this.catAxis({ ticks: { ...this.catAxis().ticks, autoSkip: false } }) }
        }
      });
    }
  },

  refreshTheme() {
    if (S.tab === 'charts' && S.data.length) this.render(Data.aggregate(S.filtered));
    if (S.tab === 'overview' && S.data.length) Overview.render(Data.aggregate(S.filtered));
  },

  compose(ids, cols) {
    const scale = 2;
    const W = 720 * scale;
    const gap = 28 * scale, pad = 48 * scale, headH = 96 * scale, footH = 56 * scale, cardHead = 64 * scale, cardPad = 24 * scale;
    const items = ids.map(id => ({ id, def: this.defs.find(d => d.id === id), ch: this.inst[id] })).filter(i => i.ch);
    if (!items.length) return null;
    const cellW = cols === 1 ? W : (W * 2 + gap);
    const layout = [];
    let y = pad + headH, col = 0, rowH = 0;
    items.forEach(it => {
      const wide = cols === 1 || it.def.span === 'wide';
      const w = wide ? cellW : W;
      const src = it.ch.canvas;
      const ih = Math.round(src.height * ((w - cardPad * 2) / src.width));
      const h = ih + cardHead + cardPad;
      if (wide || col === 2) { if (col > 0) { y += rowH + gap; } col = 0; rowH = 0; }
      const x = pad + (col === 1 ? W + gap : 0);
      layout.push({ it, x, y, w, h, ih });
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
    c.fillStyle = cssVar('--sage-deep');
    rr(pad, pad, 44 * scale, 44 * scale, 14 * scale); c.fill();
    c.fillStyle = '#FBF8F2'; c.font = `500 ${24 * scale}px Fraunces, Georgia, serif`; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillText('A', pad + 22 * scale, pad + 23 * scale);
    c.textAlign = 'left';
    c.fillStyle = cssVar('--ink'); c.font = `400 ${28 * scale}px Fraunces, Georgia, serif`;
    c.fillText(ids.length === 1 ? items[0].def.title : 'Alembic chart board', pad + 60 * scale, pad + 14 * scale);
    c.fillStyle = cssVar('--ink-3'); c.font = `600 ${13 * scale}px Manrope, sans-serif`;
    c.fillText(`FY ${fyLabel(S.filters.Year)}  ·  ${Data.summary()}`.slice(0, 140), pad + 60 * scale, pad + 38 * scale);
    layout.forEach(({ it, x, y, w, h, ih }) => {
      c.save();
      c.shadowColor = 'rgba(35,42,40,0.08)'; c.shadowBlur = 24 * scale; c.shadowOffsetY = 8 * scale;
      c.fillStyle = cssVar('--surface'); rr(x, y, w, h, 24 * scale); c.fill();
      c.restore();
      c.fillStyle = cssVar('--ink'); c.font = `400 ${19 * scale}px Fraunces, Georgia, serif`; c.textBaseline = 'alphabetic';
      c.fillText(it.def.title, x + cardPad, y + 36 * scale);
      c.fillStyle = cssVar('--ink-3'); c.font = `600 ${11.5 * scale}px Manrope, sans-serif`;
      c.fillText(it.def.sub, x + cardPad, y + 54 * scale);
      c.drawImage(it.ch.canvas, x + cardPad, y + cardHead, w - cardPad * 2, ih);
    });
    c.fillStyle = cssVar('--ink-4'); c.font = `600 ${11 * scale}px Manrope, sans-serif`; c.textBaseline = 'middle';
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
    this.save([id], 1, `alembic-${id}-FY${S.filters.Year}-${stamp()}.png`);
  },

  exportAll() {
    if (!Object.keys(this.inst).length) { toast('Open the Charts tab first so charts can render', 'info'); return; }
    Object.values(this.inst).forEach(ch => ch.stop());
    this.save(this.defs.map(d => d.id), 2, `alembic-charts-FY${S.filters.Year}-${stamp()}.png`);
  }
};
