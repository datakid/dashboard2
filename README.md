# Alembic — Pharmacy Intelligence

Alembic brings two older apps, **Lx Dashboard** and **Dashboard Arena**, into one tabbed static app. The 2026 overhaul adds a milky-white, low-chroma palette, a heavier and more readable type system, custom controls everywhere (no native selects, confirms or tooltips), and a redesigned Compare tab.

## Tabs (entry URIs)
| Hash | Purpose |
|---|---|
| `#overview` | Hero total with a sparkline and facts (monthly average, peak month, last vs previous), 3 core stats, and ranked medication class cards (tap a card to filter by it) |
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

## Data
Data comes from a public Google Sheet read as CSV, and nothing is stored on a server. Preferences are saved in localStorage: theme, tab, chart options and compare options.

## Next steps
- Offline cache of the last sync
- Print stylesheet for the Years and Compare tables
- Optional per-chart fullscreen view
