const Snapshot = {
  db: null,

  open() {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open('alembic-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('snapshots');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Cache unavailable'));
    });
    return this.db;
  },

  async read() {
    try {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const req = db.transaction('snapshots').objectStore('snapshots').get(SHEET_ID);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) { return null; }
  },

  async save(clean, duplicates, at) {
    try {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put({ version: 1, clean, duplicates, at: at.getTime() }, SHEET_ID);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  },

  valid(v) {
    return v && v.version === 1 && Number.isFinite(v.at) && v.at > 0 && Array.isArray(v.clean) && v.clean.length > 0 && v.clean.every(r => r && typeof r === 'object' && /^\d{4}$/.test(String(r.Year))) && Array.isArray(v.duplicates);
  }
};

const Report = {
  prepare() {
    if (!S.data.length || !['years', 'compare'].includes(S.tab)) {
      $('#printReport').replaceChildren();
      return false;
    }
    const years = S.tab === 'years';
    const scope = f => Object.keys(SCOPE_LABEL).filter(k => f[k] && f[k] !== 'all').map(k => `${SCOPE_LABEL[k]}: ${scopeText(k, f[k])}`).join(' · ') || 'All data';
    let body;
    let meta;
    if (years) {
      const ys = S.yearsScope.slice().sort((a, b) => b - a);
      if (!ys.length) return false;
      const metrics = ys.map(y => Data.scopedMetrics({ ...S.yearsFilters, Year: y }));
      meta = scope(S.yearsFilters);
      body = `<table class="report-table"><thead><tr><th>Metric</th>${ys.map(y => `<th>${esc(fyLabel(y))}</th>`).join('')}${ys.length > 1 ? '<th>Change</th>' : ''}</tr></thead><tbody>${SCOPED_METRICS.map((m, i) => {
        const a = metrics[0][m], b = metrics[1] && metrics[1][m];
        const change = ys.length > 1 ? `<td>${b ? `${a >= b ? '+' : '−'}${Math.abs((a - b) / b * 100).toFixed(1)}%` : '—'}</td>` : '';
        return `<tr${i === 3 ? ' class="report-divider"' : ''}><th dir="auto">${esc(m)}</th>${metrics.map(v => `<td>${fmt(v[m])}</td>`).join('')}${change}</tr>`;
      }).join('')}</tbody></table>`;
    } else {
      const a = Data.scopedMetrics(S.cmpA), b = Data.scopedMetrics(S.cmpB);
      let rows = SCOPED_METRICS.map((m, i) => ({ m, i, a: a[m], b: b[m], ...Compare.change(a[m], b[m]) }));
      if (Compare.opt.hideZero) rows = rows.filter(r => r.i < 4 || r.a || r.b);
      if (Compare.opt.sort !== 'default') {
        const score = r => Compare.opt.sort === 'change' ? (isFinite(r.pct) ? Math.abs(r.pct) : 1e12) : Math.max(r.a, r.b);
        rows = [...rows.filter(r => r.i < 4), ...rows.filter(r => r.i >= 4).sort((x, y) => score(y) - score(x))];
      }
      meta = `<span class="report-scope"><b>A</b> ${esc(scope(S.cmpA))}</span><span class="report-scope"><b>B</b> ${esc(scope(S.cmpB))}</span>`;
      body = `<table class="report-table"><thead><tr><th>Metric</th><th>A · ${esc(Compare.title(S.cmpA))}</th><th>B · ${esc(Compare.title(S.cmpB))}</th><th>Change</th></tr></thead><tbody>${rows.map(r => {
        const sign = r.d > 0 ? '+' : '−';
        const text = !r.d ? 'No change' : Compare.opt.mode === 'abs' || !isFinite(r.pct) ? `${sign}${fmt(Math.abs(r.d))}` : `${sign}${Math.abs(r.pct).toFixed(1)}%`;
        return `<tr${r.i === 3 ? ' class="report-divider"' : ''}><th dir="auto">${esc(r.m)}</th><td>${fmt(r.a)}</td><td>${fmt(r.b)}</td><td class="${r.d > 0 ? 'report-positive' : r.d < 0 ? 'report-negative' : ''}">${text}</td></tr>`;
      }).join('')}</tbody></table>`;
    }
    $('#printReport').innerHTML = `<header class="report-header"><img src="images/app-icon.jpg" width="40" height="40" alt="" /><div><p>Alembic</p><h1>${years ? 'Year over year' : 'Side by side'}</h1></div></header><div class="report-meta">${years ? esc(meta) : meta}</div>${body}<footer class="report-footer">${!years ? 'Change is A measured against B. ' : 'Change compares the latest two selected years. '}${Sync.cached || Sync.failed ? 'Cached data · ' : ''}Last sync: ${S.lastSync ? esc(S.lastSync.toLocaleString()) : '—'} · Printed: ${esc(new Date().toLocaleString())}</footer>`;
    return true;
  },

  async print() {
    if (!this.prepare()) { toast(S.data.length ? 'Choose years first' : 'No data to print', 'info'); return; }
    if (document.fonts) await document.fonts.ready;
    Tip.hide();
    ChartTip.hide();
    window.print();
  },

  init() {
    $('#printYearsBtn').addEventListener('click', () => this.print());
    $('#printCompareBtn').addEventListener('click', () => this.print());
    addEventListener('beforeprint', () => this.prepare());
    addEventListener('afterprint', () => $('#printReport').replaceChildren());
  }
};