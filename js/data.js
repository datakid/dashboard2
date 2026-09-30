const Data = {
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

  yearRows(year = S.filters.Year) { return S.data.filter(r => String(r.Year) === String(year)); },

  options(field, year = S.filters.Year) {
    if (field === 'MedClass') return MED_CATS.slice();
    const set = new Set();
    this.yearRows(year).forEach(r => { if (r[field]) set.add(String(r[field]).trim()); });
    return [...set].sort((a, b) => field === 'Month' ? monthRank(a) - monthRank(b) : a.localeCompare(b));
  },

  optionStats() {
    const f = S.filters;
    const sig = JSON.stringify(f);
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

  applyFilters() {
    const f = S.filters;
    S.filtered = S.data.filter(row => {
      if (String(row.Year) !== String(f.Year)) return false;
      for (const d of ['Region', 'Pharmacy', 'Month', 'Class']) {
        if (f[d].length && !f[d].includes(String(row[d]).trim())) return false;
      }
      if (f.MedClass.length && !f.MedClass.some(c => num(row[c]) > 0)) return false;
      return true;
    });
  },

  cats() { return S.filters.MedClass.length ? S.filters.MedClass : MED_CATS; },

  aggregate(rows) {
    const totals = { presc: 0, insured: 0, pharmacies: new Set() };
    const byCat = {}; const byMonth = {}; const byRegion = {}; const byPharmacy = {}; const byClass = {};
    MED_CATS.forEach(c => { byCat[c] = 0; });
    rows.forEach(row => {
      const m = row.Month || 'Unknown';
      const rg = row.Region || 'Unknown';
      const ph = row.Pharmacy || 'Unknown';
      const cl = row.Class || 'Unknown';
      byMonth[m] = byMonth[m] || { byCat: {}, presc: 0, insured: 0, pharmacies: new Set() };
      byRegion[rg] = byRegion[rg] || { byCat: {}, presc: 0, insured: 0 };
      byPharmacy[ph] = byPharmacy[ph] || { byCat: {}, region: rg };
      byClass[cl] = byClass[cl] || { byCat: {} };
      const p = num(row['Total Prescription']);
      const ins = num(row['Insurance Covered Prescription']);
      totals.presc += p; totals.insured += ins;
      if (row.Pharmacy) { totals.pharmacies.add(row.Pharmacy); byMonth[m].pharmacies.add(row.Pharmacy); }
      byMonth[m].presc += p; byMonth[m].insured += ins;
      byRegion[rg].presc += p; byRegion[rg].insured += ins;
      MED_CATS.forEach(c => {
        const v = num(row[c]);
        if (!v) return;
        byCat[c] += v;
        byMonth[m].byCat[c] = (byMonth[m].byCat[c] || 0) + v;
        byRegion[rg].byCat[c] = (byRegion[rg].byCat[c] || 0) + v;
        byPharmacy[ph].byCat[c] = (byPharmacy[ph].byCat[c] || 0) + v;
        byClass[cl].byCat[c] = (byClass[cl].byCat[c] || 0) + v;
      });
    });
    return { byCat, byMonth, byRegion, byPharmacy, byClass, totals };
  },

  sumCats(obj, cats = this.cats()) { return cats.reduce((s, c) => s + (obj[c] || 0), 0); },

  sortedMonths(agg) { return Object.keys(agg.byMonth).sort((a, b) => monthRank(a) - monthRank(b)); },

  exploreRows(agg) {
    const months = this.sortedMonths(agg);
    const cats = this.cats();
    const metrics = ['Total', 'Total Prescriptions', 'Insurance Covered', 'Active Pharmacies', ...cats];
    const rows = metrics.map(metric => {
      const r = { Metric: metric, _has: false, _sum: 0 };
      months.forEach(m => {
        const a = agg.byMonth[m];
        let v = 0;
        if (metric === 'Total') v = this.sumCats(a.byCat, cats);
        else if (metric === 'Total Prescriptions') v = a.presc;
        else if (metric === 'Insurance Covered') v = a.insured;
        else if (metric === 'Active Pharmacies') v = a.pharmacies.size;
        else v = a.byCat[metric] || 0;
        r[m] = v; r._sum += v;
        if (v > 0) r._has = true;
      });
      return r;
    }).filter(r => r._has);
    return { months, rows };
  },

  findMissing() {
    const f = S.filters;
    const yr = this.yearRows();
    const base = yr.filter(d => (!f.Region.length || f.Region.includes(d.Region)) && (!f.Class.length || f.Class.includes(d.Class)));
    const allMonths = [...new Set(yr.map(r => r.Month))].filter(Boolean).sort((a, b) => monthRank(a) - monthRank(b));
    const months = f.Month.length ? f.Month : allMonths;
    let pharmacies = [...new Set(base.map(r => r.Pharmacy))].filter(Boolean);
    if (f.Pharmacy.length) pharmacies = pharmacies.filter(p => f.Pharmacy.includes(p));
    const regionOf = {};
    yr.forEach(r => { if (r.Pharmacy) regionOf[r.Pharmacy] = r.Region; });
    const out = [];
    months.forEach(month => {
      const active = new Set(base.filter(r => r.Month === month).map(r => r.Pharmacy));
      pharmacies.forEach(p => { if (!active.has(p)) out.push({ Region: regionOf[p] || 'Unknown', Pharmacy: p, Month: month, Status: 'Inactive' }); });
    });
    out.sort((a, b) => a.Region.localeCompare(b.Region) || a.Pharmacy.localeCompare(b.Pharmacy) || monthRank(a.Month) - monthRank(b.Month));
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
