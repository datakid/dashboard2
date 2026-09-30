# Alembic — Pharmacy Intelligence

Alembic replaces two separate apps, **Lx Dashboard** and **Dashboard Arena**, with one tabbed static app. It keeps every feature from both and adds a new brand, a new palette (sage / copper / plum on warm paper), a rebuilt Charts tab with PNG export, and several quality-of-life improvements.

## Tabs (entry URIs)
| Hash | Purpose |
|---|---|
| `#overview` | Hero total with a sparkline, 3 core stats, and medication class cards (tap a card to filter by it) |
| `#charts` | 6 charts, each with view toggles and a per-chart PNG button, plus "Export all as PNG" (one composed board) |
| `#explore` | Monthly metrics table: sortable, heat shading, ↑/↓ trends, a Total column, and click-to-focus rows |
| `#missing` | Inactive pharmacy/month gaps: sortable and searchable. The tab shows a badge with the count |
| `#years` | Multi-year table (formerly Arena single view): year picker, scoped filters, highest/lowest markers, Change column, CSV export |
| `#compare` | Side A vs side B (formerly Arena compare): scoped filters, swap button, delta pills, synced scrolling, row focus, CSV export |

Share links: `#tab?Year=2026&Region=A|B&MedClass=...` restores the tab and filters.

## Features kept from both apps
- Live Google Sheet CSV sync, manual refresh, 5-minute auto-sync toggle, relative "synced" label with a stale/error state
- Duplicate rows merged into one, with a duplicates modal that lists the sheet row numbers
- Multi-select filters that show option counts and grey out options that can't match
- Fuzzy search that handles Arabic spelling variants, scope prefixes (`region:` `ph:` `month:` `class:` `med:`), recent selections, actions, and keyboard navigation
- Removable filter chips; Backspace removes the last filter, ⌘/Ctrl+Backspace clears all
- Filters saved for the session (invalid ones are dropped with a notice)
- Excel export (multi-sheet), plus CSV exports with a copy-to-clipboard fallback
- Light / system / dark theme; iframe `postMessage` bridge (`lx:ready`, `lx:title`); Import link

## Quality-of-life additions
Keyboard shortcuts (1–6 switch tabs, R refresh, F filters, E export, T theme, S share, ? help), a search box inside every dropdown with "select visible" and "clear", a collapsible filter panel, the last-used tab remembered, a floating bottom tab bar on mobile, auto-sync paused while the page is hidden, a dynamic document title, and a back-to-top button.

## Structure
`index.html` · `css/app.css` · `js/core.js` (utils, icons, state, theme, modal) · `js/data.js` (processing and aggregation) · `js/filters.js` (dropdowns and search) · `js/views.js` (Overview, Explore, Missing, Years, Compare) · `js/charts.js` (charts and PNG) · `js/app.js` (sync, export, tabs, boot) · `favicon.svg`

Libraries loaded from a CDN: PapaParse, Fuse.js, Chart.js 4, and SheetJS (loaded only when you export).

## Data
Source: a public Google Sheet exported as CSV. Nothing is stored on a server. Preferences are kept in localStorage and sessionStorage.

## Next steps
- Offline cache of the last sync
- Print stylesheet for the Years and Compare tables
