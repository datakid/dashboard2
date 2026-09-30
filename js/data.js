const MONTH_SHORT = { july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec', january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', may: 'May', june: 'Jun' };
const fyShort = (y) => `${String(Number(y) - 1).slice(2)}–${String(y).slice(2)}`;
const periodKey = (y, m) => `${y}|${m}`;
const splitPeriod = (k) => { const i = String(k).indexOf('|'); return i < 0 ? { Year: '', Month: k } : { Year: k.slice(0, i), Month: k.slice(i + 1) }; };
const periodCmp = (a, b) => { const x = splitPeriod(a), y = splitPeriod(b); return (Number(x.Year) - Number(y.Year)) || (monthRank(x.Month) - monthRank(y.Month)); };
const calYear = (fy, m) => monthRank(m) <= 6 ? Number(fy) - 1 : Number(fy);
const monthLabel = (k, bare) => {
  const { Year, Month } = splitPeriod(k);
  if (bare || !Year) return Month;
  const s = MONTH_SHORT[String(Month).trim().toLowerCase()] || Month;
  return `${s} ${String(calYear(Year, Month)).slice(2)}`;
};

const MONTHS_EN = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];
const monthIdx = (m) => { const r = monthRank(m); return r >= 1 && r <= 12 ? r - 1 : -1; };
const isArabic = (s) => /[\u0590-\u08FF]/.test(String(s ?? ''));
const isYearKey = (k) => /^\d{4}$/.test(String(k));
const periodAxis = (key, bare) => {
  const { Year, Month } = splitPeriod(key);
  if (!Year) return isYearKey(key) ? `FY ${fyShort(key)}` : String(key);
  const i = monthIdx(Month);
  if (i < 0) return monthLabel(key, bare);
  const s = MONTHS_EN[i].slice(0, 3);
  return bare ? s : `${s} ’${String(calYear(Year, Month)).slice(2)}`;
};
const periodTitle = (key) => {
  const { Year, Month } = splitPeriod(key);
  if (!Year) return { main: isYearKey(key) ? `FY ${fyLabel(key)}` : String(key) };
  const i = monthIdx(Month);
  if (i < 0) return { main: `${Month} ${calYear(Year, Month)}`, sub: `FY ${fyShort(Year)}` };
  return { main: `${MONTHS_EN[i]} ${calYear(Year, Month)}`, sub: isArabic(Month) ? `${Month} · FY ${fyShort(Year)}` : `FY ${fyShort(Year)}` };
};

const Data = {
  _yr: { sig: null, rows: [] },

  process(raw) {
    const groups = {};
    const sumCols = ['Total Prescription', 'Insurance Covered Prescription', ...MED_CATS];
    raw.forEach(row => {
      const Year = row.Year ? String(row.Year).trim() : '';
      const Region = row.Region ? String(row.Region).trim() : '';
      const Pharmacy = row.Pharmacy ? String(row.Pharmacy).trim() : '';
      const Month = row.Month ? String(row.Month).trim() : '';
      const Class = row.Class ? String(row.Class).trim() : 'Unknown';
      if (!Year && !Pharmacy) return;
      const key = `${Year}_${Region}_${Pharmacy}_${Month}_${Class}`.toLowerCase();
      const rn = row._rowNum || 'Unknown';
      if (groups[key]) {
        groups[key]._n += 1;
        groups[key]._rows.push(rn);
        sumCols.forEach(c => { groups[key][c] = num(groups[key][c]) + num(row[c]); });
      } else {
        groups[key] = { ...row, _n: 1, _rows: [rn], Year, Region, Pharmacy, Month, Class };
        sumCols.forEach(c => { groups[key][c] = num(row[c]); });
      }
    });
    const clean = Object.values(groups);
    const duplicates = [];
    clean.forEach(r => {
      if (r._n > 1) duplicates.push({ Year: r.Year, Pharmacy: r.Pharmacy, Region: r.Region, Month: r.Month, Class: r.Class, count: r._n, rows: r._rows.join(', ') });
      delete r._n; delete r._rows; delete r._rowNum;
    });
    return { clean: clean.filter(r => r.Year), duplicates };
  },

  scopeYears() { const y = S.filters.Years; return (y.length ? y : S.years).map(String); },
  isAllTime() { return !S.filters.Years.length; },
  multiYear() { return this.scopeYears().length > 1; },
  grain() { return this.multiYear() ? S.grain : 'month'; },

  yearRows() {
    const sig = `${S.filters.Years.join(',')}#${S.dataVersion}`;
    if (this._yr.sig === sig) return this._yr.rows;
    const set = new Set(this.scopeYears());
    const rows = S.data.filter(r => set.has(String(r.Year)));
    this._yr = { sig, rows };
    return rows;
  },

  periodLabel() {
    const ys = this.scopeYears().map(Number).sort((a, b) => a - b);
    if (!ys.length) return '—';
    if (ys.length === 1) return `FY ${fyLabel(ys[0])}`;
    const run = ys.every((y, i) => !i || y === ys[i - 1] + 1);
    const span = run ? `FY ${fyShort(ys[0])} → ${fyShort(ys[ys.length - 1])}` : ys.map(y => `FY ${fyShort(y)}`).join(', ');
    return this.isAllTime() ? `All time · ${span}` : span;
  },

  periodSlug() { return this.isAllTime() ? 'all-time' : 'FY' + this.scopeYears().slice().sort().join('-'); },

  options(field) {
    if (field === 'MedClass') return MED_CATS.slice();
    const set = new Set();
    this.yearRows().forEach(r => { if (r[field]) set.add(String(r[field]).trim()); });
    return [...set].sort((a, b) => field === 'Month' ? monthRank(a) - monthRank(b) : a.localeCompare(b));
  },

  optionStats() {
    const f = S.filters;
    const sig = JSON.stringify(f) + S.dataVersion;
    if (S.statsCache.sig === sig) return S.statsCache.stats;
    const stats = { Region: new Map(), Pharmacy: new Map(), Month: new Map(), Class: new Map(), MedClass: new Map() };
    const dims = ['Region', 'Pharmacy', 'Month', 'Class'];
    this.yearRows().forEach(row => {
      const passes = (skip) => {
        for (const d of dims) {
          if (d === skip || !f[d].length) continue;
          if (!f[d].includes(String(row[d] || '').trim())) return false;
        }
        return true;
      };
      const medOk = !f.MedClass.length || f.MedClass.some(c => num(row[c]) > 0);
      dims.forEach(target => {
        if (medOk && passes(target)) {
          const v = String(row[target] || '').trim();
          if (v) stats[target].set(v, (stats[target].get(v) || 0) + 1);
        }
      });
      if (passes(null)) MED_CATS.forEach(c => { if (num(row[c]) > 0) stats.MedClass.set(c, (stats.MedClass.get(c) || 0) + 1); });
    });
    S.statsCache = { sig, stats };
    return stats;
  },

  passesDims(row, skipMed) {
    const f = S.filters;
    for (const d of ['Region', 'Pharmacy', 'Month', 'Class']) {
      if (f[d].length && !f[d].includes(String(row[d]).trim())) return false;
    }
    if (!skipMed && f.MedClass.length && !f.MedClass.some(c => num(row[c]) > 0)) return false;
    return true;
  },

  catTotals(skipMed) {
    const out = {};
    MED_CATS.forEach(c => { out[c] = 0; });
    this.yearRows().forEach(r => { if (this.passesDims(r, skipMed)) MED_CATS.forEach(c => { out[c] += num(r[c]); }); });
    return out;
  },

  applyFilters() { S.filtered = this.yearRows().filter(row => this.passesDims(row)); },

  yearTotals() {
    const cats = this.cats();
    const out = {};
    S.years.forEach(y => { out[String(y)] = { v: 0, n: 0 }; });
    S.data.forEach(r => {
      const t = out[String(r.Year)];
      if (!t || !this.passesDims(r)) return;
      t.n += 1;
      cats.forEach(c => { t.v += num(r[c]); });
    });
    return out;
  },

  cats() { return S.filters.MedClass.length ? S.filters.MedClass : MED_CATS; },

  aggregate(rows) {
    const totals = { presc: 0, insured: 0, pharmacies: new Set() };
    const byCat = {}; const byMonth = {}; const byYear = {}; const byRegion = {}; const byPharmacy = {}; const byClass = {};
    const bucket = () => ({ byCat: {}, presc: 0, insured: 0, pharmacies: new Set() });
    MED_CATS.forEach(c => { byCat[c] = 0; });
    rows.forEach(row => {
      const y = String(row.Year);
      const m = periodKey(y, row.Month || 'Unknown');
      const rg = row.Region || 'Unknown';
      const ph = row.Pharmacy || 'Unknown';
      const cl = row.Class || 'Unknown';
      const bm = byMonth[m] = byMonth[m] || bucket();
      const by = byYear[y] = byYear[y] || bucket();
      byRegion[rg] = byRegion[rg] || { byCat: {}, presc: 0, insured: 0 };
      byPharmacy[ph] = byPharmacy[ph] || { byCat: {}, region: rg };
      byClass[cl] = byClass[cl] || { byCat: {} };
      const p = num(row['Total Prescription']);
      const ins = num(row['Insurance Covered Prescription']);
      totals.presc += p; totals.insured += ins;
      if (row.Pharmacy) { totals.pharmacies.add(row.Pharmacy); bm.pharmacies.add(row.Pharmacy); by.pharmacies.add(row.Pharmacy); }
      bm.presc += p; bm.insured += ins;
      by.presc += p; by.insured += ins;
      byRegion[rg].presc += p; byRegion[rg].insured += ins;
      MED_CATS.forEach(c => {
        const v = num(row[c]);
        if (!v) return;
        byCat[c] += v;
        bm.byCat[c] = (bm.byCat[c] || 0) + v;
        by.byCat[c] = (by.byCat[c] || 0) + v;
        byRegion[rg].byCat[c] = (byRegion[rg].byCat[c] || 0) + v;
        byPharmacy[ph].byCat[c] = (byPharmacy[ph].byCat[c] || 0) + v;
        byClass[cl].byCat[c] = (byClass[cl].byCat[c] || 0) + v;
      });
    });
    return { byCat, byMonth, byYear, byRegion, byPharmacy, byClass, totals };
  },

  series(agg, grain = this.grain()) {
    if (grain === 'year') return Object.keys(agg.byYear).sort((a, b) => a - b).map(y => ({ key: y, label: `FY ${fyShort(y)}`, ...agg.byYear[y] }));
    const bare = !this.multiYear();
    return Object.keys(agg.byMonth).sort(periodCmp).map(k => ({ key: k, label: monthLabel(k, bare), ...agg.byMonth[k] }));
  },

  sumCats(obj, cats = this.cats()) { return cats.reduce((s, c) => s + (obj[c] || 0), 0); },

  exploreRows(agg) {
    const series = this.series(agg);
    const cats = this.cats();
    const metrics = ['Total', 'Total Prescriptions', 'Insurance Covered', 'Active Pharmacies', ...cats];
    const rows = metrics.map(metric => {
      const r = { Metric: metric, _has: false, _sum: 0 };
      series.forEach(b => {
        let v = 0;
        if (metric === 'Total') v = this.sumCats(b.byCat, cats);
        else if (metric === 'Total Prescriptions') v = b.presc;
        else if (metric === 'Insurance Covered') v = b.insured;
        else if (metric === 'Active Pharmacies') v = b.pharmacies.size;
        else v = b.byCat[metric] || 0;
        r[b.key] = v;
        r._sum += v;
        if (v > 0) r._has = true;
      });
      if (metric === 'Active Pharmacies') r._sum = agg.totals.pharmacies.size;
      return r;
    }).filter(r => r._has);
    return { months: series.map(b => b.key), labels: series.map(b => b.label), rows };
  },

  findMissing() {
    const f = S.filters;
    const yr = this.yearRows();
    const base = yr.filter(d => (!f.Region.length || f.Region.includes(d.Region)) && (!f.Class.length || f.Class.includes(d.Class)));
    const periods = new Map();
    yr.forEach(r => { if (r.Month) periods.set(periodKey(r.Year, r.Month), { Year: String(r.Year), Month: r.Month }); });
    let list = [...periods.values()];
    if (f.Month.length) list = list.filter(p => f.Month.includes(p.Month));
    const phByYear = {};
    base.forEach(r => { if (r.Pharmacy) (phByYear[r.Year] = phByYear[r.Year] || new Set()).add(r.Pharmacy); });
    const active = new Set(base.map(r => `${r.Year}|${r.Month}|${r.Pharmacy}`));
    const regionOf = {};
    yr.forEach(r => { if (r.Pharmacy) regionOf[r.Pharmacy] = r.Region; });
    const out = [];
    list.forEach(p => {
      let phs = [...(phByYear[p.Year] || [])];
      if (f.Pharmacy.length) phs = phs.filter(x => f.Pharmacy.includes(x));
      phs.forEach(ph => { if (!active.has(`${p.Year}|${p.Month}|${ph}`)) out.push({ Year: p.Year, Region: regionOf[ph] || 'Unknown', Pharmacy: ph, Month: p.Month, Status: 'Inactive' }); });
    });
    out.sort((a, b) => (b.Year - a.Year) || a.Region.localeCompare(b.Region) || a.Pharmacy.localeCompare(b.Pharmacy) || monthRank(a.Month) - monthRank(b.Month));
    S.missing = out;
  },

  summary() {
    const parts = [];
    ['Region', 'Pharmacy', 'Month', 'Class', 'MedClass'].forEach(k => {
      const v = S.filters[k];
      if (v.length) parts.push(`${k === 'MedClass' ? 'Med' : k}: ${v.length > 2 ? v.length + ' selected' : v.join(', ')}`);
    });
    return parts.length ? parts.join(' · ') : 'All data';
  },

  activeCount() { return FIELDS.reduce((s, f) => s + S.filters[f].length, 0); },

  scopedRows(filters) {
    return S.data.filter(r =>
      (filters.Year === 'all' || !filters.Year || String(r.Year) === String(filters.Year)) &&
      (filters.Region === 'all' || r.Region === filters.Region) &&
      (filters.Pharmacy === 'all' || r.Pharmacy === filters.Pharmacy) &&
      (filters.Month === 'all' || r.Month === filters.Month) &&
      (filters.Class === 'all' || r.Class === filters.Class)
    );
  },

  scopedMetrics(filters) {
    const rows = this.scopedRows(filters);
    const m = { 'Total Value': 0, 'Total Prescriptions': 0, 'Insurance Covered': 0 };
    MED_CATS.forEach(c => { m[c] = 0; });
    rows.forEach(r => {
      m['Total Prescriptions'] += num(r['Total Prescription']);
      m['Insurance Covered'] += num(r['Insurance Covered Prescription']);
      MED_CATS.forEach(c => { const v = num(r[c]); m[c] += v; m['Total Value'] += v; });
    });
    m['Active Pharmacies'] = new Set(rows.map(r => r.Pharmacy)).size;
    return m;
  },

  scopedOptions(filters, key) {
    const ctx = this.scopedRows({ ...filters, [key]: 'all' });
    const opts = [...new Set(ctx.map(r => r[key]))].filter(Boolean);
    if (key === 'Year') opts.sort((a, b) => b - a);
    else if (key === 'Month') opts.sort((a, b) => monthRank(a) - monthRank(b));
    else opts.sort((a, b) => String(a).localeCompare(String(b)));
    return opts;
  }
};

const SCOPED_METRICS = ['Total Value', 'Total Prescriptions', 'Insurance Covered', 'Active Pharmacies', ...MED_CATS];
