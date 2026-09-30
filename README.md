# Alembic — Pharmacy Intelligence

Alembic brings two older apps, **Lx Dashboard** and **Dashboard Arena**, into one tabbed static app. The 2026 overhaul adds a milky-white, low-chroma palette, a heavier and more readable type system, custom controls everywhere (no native selects, confirms or tooltips), and a redesigned Compare tab.

## Tabs (entry URIs)
| Hash | Purpose |
|---|---|
| `#overview` | Hero total with a sparkline and facts (monthly average, peak month, last vs previous), 3 core stats, and ranked medication class cards that work like Power BI cross-filtering (see below) |
| `#charts` | 6 charts with view toggles, clickable HTML legends, a PNG button on each chart, and "Export board as PNG" (legends included) |
| `#explore` | Monthly metrics table: sortable, heat shading, ↑/↓ trends, a highlighted Total column, and click-to-focus rows |
| `#missing` | Inactive pharmacy/month gaps, sortable and searchable, with a count badge on the tab |
| `#years` | Multi-year table with a year picker, scoped custom selects, high/low markers, a Change column, and CSV export |
| `#compare` | A vs B scopes, a swap button, 4 headline "duel" cards (values, share split, delta), and a side-by-side ledger with twin bars. The ledger can be sorted (default / biggest shift / largest), shown as % or absolute Δ, and hide empty rows. Rows can be focused. CSV export |

Share links: `#tab?Years=all` or `#tab?Years=2025|2026&Region=A|B&MedClass=...` (the old `Year=` format still works).

## One timeline, any slice
Overview, Charts, Explore and Missing all read one period model: `S.filters.Years`. An empty list means all time.
- **Timeline strip in the filter deck:** an "All time" card plus one card per fiscal year. Each year card has a bar sized by that year's value under the current filters.
- **Selecting years:** tap a year to see only that year, and tap it again to go back to all time. Hold Shift or ⌘ while clicking, or turn on **Multi-year**, to build any set of years. Use `[` and `]` to step through years and `A` for all time.
- **Months / Years grain:** when more than one year is in scope, this toggle switches the trend, coverage and Explore columns between monthly and yearly. Month labels carry their calendar year (e.g. `نوفمبر 25`), and year boundaries are marked in Explore.
- **Year over year chart mode:** lays each fiscal year over July → June.
- **Missing tab:** gaps are checked per year, and a Year column appears when several years are shown.
- **Keeping the period:** the chosen period is saved between visits and is kept when you clear filters. Exports and PNG files are named after it (`all-time`, `FY2025-2026`).

## Class focus (Power BI-style)
- Clicking a class card focuses the whole dashboard on that class. Every other card stays visible but faded, and still shows its own value, so you can see the context.
- Clicking a different card switches the focus to it. Clicking the focused card again clears the focus.
- ⌘/Ctrl/Shift-click (long-press on touch) adds or removes a card, so you can focus on several classes.
- Clearing takes one action: the **Clear focus** button, the `N of 18 classes ×` pill in the hero, clicking empty space in the grid, or pressing `Esc`.
- The Medication distribution chart follows the same rules. It keeps every bar, fades the ones out of focus, and has its own Clear focus button. You can click a bar or its label.

## Chart tooltips & labels
- All chart tooltips are one shared DOM tooltip (`ChartTip`) instead of the canvas tooltip. Its size comes from the real text, so Arabic month and class names no longer spill out of the box.
- Tooltip titles give the full period (`October 2024`, plus the Arabic month and the FY). Rows show the value, share % and extra detail (change vs previous, stacked total, region, rank).
- The labels on horizontal bar charts (Medication, Leading pharmacies, Regional bars) are real page text (`.bar-labels`) placed over the chart, not canvas text. The browser shapes the Arabic, measures the column width and adds the "…" itself, so labels no longer depend on canvas text. The `sideLabels` plugin only moves each label to line up with its bar, and highlights or fades it. PNG exports draw the labels onto the image separately.
- Time axes use short English month labels (`Oct ’24`), so ticks stay compact and never mix bidi text.

## Smoothness
- Charts update in place (`chart.update()`) when only the data changes. They are only rebuilt when the chart type or axis layout changes.
- The Overview DOM is built once and then patched. Numbers count up or down from their previous value rather than from 0, and bars animate their width.
- Filter changes are grouped into one animation frame. The Missing check, Timeline and storage updates run right after the paint, so a click never waits on them.

## Layout
- The brand and tools (sync, theme, import, shortcuts) sit in their own row that never gets covered.
- The tab strip is a separate sticky bar with a period pill that jumps to the timeline.
- On phones the tab strip becomes a full-width bottom bar.

## Design system
- **Type:** Bricolage Grotesque (display and numbers, weights 600–700), Geist (UI, 450–650), and IBM Plex Sans Arabic for Arabic data. The base size is 15px.
- **Palette:** milk paper `#F6F5F1` with white surfaces, and sage / terracotta / mauve / dusty blue / moss accents (`--c1…--c9` for charts). There is a matching warm-charcoal dark theme.
- **Controls:**
  - `Select` popover for single choices (fiscal year and scoped filters). It is keyboard-navigable, searchable when there are more than 7 options, and becomes a bottom sheet on mobile.
  - Multi-select dropdowns also become bottom sheets on mobile, with a Done button.
  - `Modal.confirm()` replaces native confirm dialogs. It asks before clearing more than one filter and before switching year when filters are active.
  - `Tip` gives custom tooltips (`data-tip`) instead of native `title`.
- **Chart label fixes:**
  - Medication chart: horizontal bars with auto height by default. In column mode, labels wrap or rotate based on available width.
  - Month axes: auto-skip and rotation.
  - Legends are HTML rather than canvas.
  - The size of the doughnut centre text follows the ring size.

## Structure
`index.html` · `css/app.css` · `js/core.js` (utils, icons, state, theme, Modal/confirm, Select, Tip) · `js/data.js` · `js/filters.js` · `js/views.js` (Overview, Explore, Missing, Years, Compare) · `js/charts.js` · `js/app.js` · `images/app-icon.jpg`

Libraries loaded from a CDN: PapaParse, Fuse.js, Chart.js 4, and SheetJS (loaded only when you export).

## Data and last-sync cache
Data comes from a public Google Sheet read as CSV. Preferences are saved in localStorage; active filters are saved in sessionStorage. No application database or server writes are used.

- Successful syncs save one processed snapshot in IndexedDB (`alembic-cache` / `snapshots`, keyed by sheet ID): schema version, clean rows, merged duplicates, and sync timestamp.
- Startup restores that snapshot immediately while checking the live sheet. Failed refreshes keep the last successful data visible; invalid/empty responses never replace the cache.
- The sync indicator shows **Cached data** or **Offline · cached**. Its custom tooltip gives the original sync timestamp. Reconnecting retries the sheet automatically.
- Cache storage is best-effort: unavailable storage does not prevent live use. Clearing browser site data removes the snapshot.
- This caches data, not the application shell or CDN dependencies. A fresh page load fully offline still requires those resources to be browser-cached; no service worker or full offline-install guarantee is implemented.

## Print
- **Print** actions on `#years` and `#compare` match existing buttons and open the browser print dialog directly, with no extra application dialog.
- `js/reports.js` builds a dedicated, branded report with the active scope, full values, Arabic labels, original sync timestamp, and print timestamp. Years compares the latest two selected years; Compare follows its current sort, hide-empty and percentage/absolute settings.
- `css/print.css` uses landscape A4, repeated table headers, non-splitting rows, white paper and existing typography/accent colours, regardless of screen theme. Navigation and controls are excluded. The print report is never displayed in the normal UI.
- Browser Print / Save as PDF remain native browser functions; their dialogs cannot be themed by a static website.

## Verification
- Live-sheet startup: no browser console errors.
- IndexedDB save/read, simulated network-failure startup restore, and live recovery: passed with 881 rows.
- Both Print buttons invoke print and produce 22 report rows.
- Years and Compare mobile controls and desktop report styles visually checked. Physical printer output/pagination depends on browser and printer settings.

## URLs and storage
- Entry: `index.html` and the hashes listed above; no new route or parameters required.
- Public CSV source: `https://docs.google.com/spreadsheets/d/122uThrt83Vs8rUtOe4PCmsWjLSxv8A-OmUbT0Y3PZeg/export?format=csv`.
- External import app: `https://josn.vercel.app/`.
- Production URL: not recorded; these changes have not been Hosted-Deployed.
- Structure addition: `js/reports.js` (IndexedDB snapshot and print report), `css/print.css`.

## Pre-ship polish
- Overview shows a "No records match" bar with the current scope and a one-click Clear filters when filters match nothing.
- Dark theme: horizontal bar labels get more contrast.
- Checked every tab in light and dark: no console errors, no clipped text, no `NaN`/`undefined`.

## Remaining optional development
- Per-chart fullscreen view.
- Full offline application shell/dependency caching, if required.
