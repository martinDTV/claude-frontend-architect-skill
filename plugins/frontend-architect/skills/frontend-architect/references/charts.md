# Charts and dashboards

One reference for both the engineering and the visual encoding of charts, so the architecture skill and the creative skill never disagree. A chart answers one question; everything else (library, color, animation) serves that.

## Contents
- Start from the question
- Chart type by question
- Choosing the library
- Encoding rules
- Accessibility
- Performance
- Real-time data
- Dashboards
- SSR, hydration and layout shift
- Vue / Nuxt specifics
- React / Next.js specifics
- Project and operations visualizations
- Testing
- Checklist

## Start from the question

Write the question the chart answers ("Is this month's revenue above plan?") and the decision it supports before choosing a type. If a number or a sentence answers it, use a stat tile, not a chart. If the reader needs exact values, a table with sparklines beats a chart.

## Chart type by question

| Question | Use | Avoid |
|---|---|---|
| Compare categories | Horizontal bars (sorted), grouped bars for two series | Pie with more than 5 slices, 3D bars, radial bars |
| Trend over time | Line (one to four series), area for a single cumulative series | Smoothed lines that invent data, dual y-axes |
| Part of a whole | Stacked bar (one bar), or a 100% bar; pie/donut only for 2 to 4 parts | Multiple pies to compare |
| Distribution | Histogram, box plot, strip plot | Averages hiding spread |
| Relationship | Scatter, optionally sized; heatmap for two categoricals | Bubble charts with four encodings |
| Progress to a target | Bullet chart, progress bar, S-curve with planned vs actual (construction, projects) | Gauges |
| Flow / schedule | Gantt (timeline bars with dependencies), Sankey only when flows matter | Gantt for a to-do list |

## Choosing the library

Verified versions on npm (2026-10-28): `echarts` 6.1 + `vue-echarts` 8.3, `apexcharts` 8.5 + `vue3-apexcharts` 1.11, `chart.js` 4.6 + `vue-chartjs` 5.3, `recharts` 3.10, `@unovis/vue` 1.7 (also `@unovis/react`), `d3` 7.9. Check the installed one; APIs differ between majors.

| Need | Vue / Nuxt | React / Next.js | Notes |
|---|---|---|---|
| Many chart types, large data, canvas rendering, good defaults | ECharts (`vue-echarts`) | ECharts (`echarts-for-react` or direct) | Heaviest bundle: import only the components used (`echarts/core` tree-shaking) |
| Business dashboards, quick setup, SVG with animations | ApexCharts (`vue3-apexcharts`) | `react-apexcharts` | Watch bundle size and duplicate chunks; disable animations for data-dense views |
| Simple canvas charts, small bundle | Chart.js (`vue-chartjs`) | `react-chartjs-2` | Register only needed controllers/scales |
| Composable SVG charts in JSX | — | Recharts 3 | SVG: fine to a few thousand points |
| Framework components over D3 scales, both frameworks | Unovis | Unovis | Consistent API across Vue and React |
| Bespoke visualization (custom Gantt, S-curves, maps) | D3 scales + Vue templates/SVG | D3 scales + JSX | Use D3 for math and scales, let the framework render; avoid D3 DOM manipulation inside components |

Selection criteria: data volume (SVG degrades above ~5k points; canvas scales further), interactivity needed (brush, zoom, tooltips), SSR (all render client-side; what matters is the placeholder), bundle impact (measure with `bundle-budget.mjs`), licensing (all above are MIT or Apache; AG Charts and Highcharts have commercial tiers), accessibility hooks, and whether the design system can theme it from tokens. One charting library per app unless a bespoke D3 piece is justified.

## Encoding rules

- Colors come from design tokens (`design-systems.md`): a categorical palette of at most 6 to 8 distinct hues, a sequential scale for magnitudes, a diverging scale for deviations around a meaningful center. Semantic colors (danger, success) only when the data means that.
- Direct labels at line ends and on bars beat legends; legends when more than 4 series or space forbids labels.
- Bars start at zero; lines may not, but the axis then says so. Time on the x-axis runs left to right; categories sorted by value unless they have a natural order.
- Units once (axis title or a subtitle), consistent decimals, thousands separators from the locale (`i18n.md`), currency codes when several currencies appear.
- Gridlines light, axis lines minimal, no 3D, no gradients in data marks, no decorative animation (`motion-design.md`).
- Dark mode: tokens flip; check contrast of every series against the chart background, not only text.
- Typography: tabular numerals, labels at least 12 px, titles that state the insight ("Revenue 8% below plan") when the dashboard is for decisions.

## Accessibility

- A text alternative: a short summary (`aria-label`/`aria-describedby` on the chart container) plus a "view as table" toggle for the data behind the chart. Screen readers do not read canvas.
- Color is never the only encoding: add patterns, line styles, markers or direct labels; check palettes for color-vision deficiency.
- Keyboard: tooltips and brushing must have keyboard or table equivalents; interactive legends are buttons.
- `prefers-reduced-motion`: disable chart animations and live-updating transitions.
- Contrast: 3:1 minimum for marks against the background (`accessibility.md`).

## Performance

- Canvas (ECharts, Chart.js) for tens of thousands of points; SVG for small, interactive, stylable charts.
- Aggregate and downsample on the server (per hour, LTTB for time series); the browser should receive what it can show, not raw events.
- Lazy-load the chart library and the chart components on the routes that use them (`defineAsyncComponent`/`Lazy` prefix in Nuxt, `next/dynamic` with `ssr: false`); never in the entry chunk. If the library appears in two chunks, configure manual chunks or check how it is imported (`bundle-budget.mjs` flags possible duplicates; confirm with the framework analyzer).
- Dispose chart instances on unmount (`chart.dispose()`, `destroy()`), remove resize observers (`leak-patterns.mjs` reports missing cleanup), and avoid recreating instances on every data change: update options/data instead.
- Resize with `ResizeObserver` on the container, debounced; do not listen to `window.resize` per chart.
- Tooltips formatted lazily; precompute formatters.

## Real-time data

- Append for streams (keep a bounded window), replace for periodic snapshots; throttle updates to what the eye can follow (1 to 2 per second at most).
- Pause rendering when the tab is hidden; resume with a resync (`realtime-and-sync.md`).
- Show data freshness ("updated 12 s ago") and a stale state when the stream drops.

## Dashboards

- Shared filters (time range, tenant, project) live in the URL and feed every query key; one change refetches only affected charts.
- Consistent units, time zones and number formats across tiles; one legend convention.
- Load tiles independently with skeletons sized like the final chart (same height, aspect ratio); never let a slow chart block the page.
- Limit to what fits one question per tile; drill-down navigates to a detail page rather than stacking modals.
- Density: dashboards for daily operators can be dense; executive views need fewer, larger charts. Visual guidance in `enterprise-ui-patterns.md`.

## SSR, hydration and layout shift

Charts render on the client. During SSR render a placeholder with the final dimensions (fixed height or `aspect-ratio`) so hydration does not shift layout (CLS). Wrap in `<ClientOnly>` (Nuxt) or `dynamic(..., { ssr: false })` (Next). Prefetch the data on the server when the page is SSR; only the drawing waits for the client.

## Vue / Nuxt specifics

- ECharts: import from `echarts/core` and register only the renderers, charts and components used (`use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])`); `vue-echarts` 8 exposes `<VChart :option :theme :autoresize>`; keep `option` in a `shallowRef`/`computed` (deep reactivity on big option trees is slow) and pass `update-options="{ notMerge: false }"` deliberately when appending data.
- Theme from tokens: read CSS custom properties once (`getComputedStyle(document.documentElement).getPropertyValue('--color-primary')`) after mount and on theme change, build the chart theme object, provide it (`provide(THEME_KEY, theme)` in vue-echarts) or pass it per chart; do not hard-code hex values in chart configs.
- Wrap charts in `<ClientOnly>` with a placeholder of the same height; lazy-load the chart component (`LazyRevenueChart`) so the library stays out of the entry chunk; `defineAsyncComponent` for Vue without Nuxt.
- ApexCharts (`vue3-apexcharts`): `:series` and `:options` as computed values; two charts sharing one `options` object mutate each other, build options per chart; disable `chart.animations` in dense dashboards; confirm with `nuxi analyze` that ApexCharts is not split into two large chunks (seen in real audits).
- Dispose: `vue-echarts` disposes on unmount; imperative instances (`echarts.init`) need `dispose()` in `onBeforeUnmount`, and `ResizeObserver`s need `disconnect()`.
- Data transforms (grouping, S-curve cumulative sums, downsampling) live in plain TypeScript modules under the feature (`features/reports/charts/*.ts`), unit-tested, with no Vue imports.

## React / Next.js specifics

- Chart components are Client Components loaded with `next/dynamic` and `ssr: false`, with a `loading` placeholder of the final size; the data comes from the Server Component (serializable props) or from TanStack Query for live views.
- Recharts 3: `ResponsiveContainer` needs a parent with a definite height; memoize `data` and formatter functions; large datasets (> 5k points) need canvas (ECharts) instead.
- ECharts in React: `echarts-for-react` or a small `useEffect` wrapper (`init` on mount, `setOption` on data change, `dispose` in cleanup, resize via `ResizeObserver`); never recreate the instance on each render.
- Keep chart options outside the component when static (`as const` modules) and derive only the data series in render.

## Project and operations visualizations

ERP, construction and logistics products need a few bespoke views that no generic chart type covers well:
- **S-curve (planned vs actual vs forecast)**: cumulative lines, same axis and units, shaded gap, today marker; the transform (cumulate, align periods, fill forecast) is the tested unit.
- **Gantt / schedule**: timeline rows with bars, dependencies, baselines; virtualize rows, render bars as SVG or positioned divs; zoom levels per week/month; a table of dates as the accessible alternative.
- **Progress maps** (floors, units, zones): SVG or HTML grids colored by status with a legend and a status table; avoid raster images with hotspots.
- **Burndown / earned value**: lines with clear baselines and target markers.
Build these on D3 scales (time, linear, band) and framework templates; keep one module per visualization with its transform, component and tests.

## Testing

- Unit-test the data transforms (grouping, downsampling, formatters, color scale assignment); that is where bugs live.
- Component tests assert the text alternative, the table toggle and the empty/error states; do not assert pixels.
- Visual regression (Playwright screenshots) for a handful of key charts with animations disabled and fixed data.
- Measure bundle impact in CI when adding a chart library (`bundle-budget.mjs` budgets).

## Checklist

- [ ] The question and decision each chart supports is written down; stat tiles or tables where a chart adds nothing
- [ ] Chart type matches the question; no pies above 4 parts, no dual axes, no 3D
- [ ] Colors from tokens; categorical, sequential and diverging scales as appropriate; contrast checked in both themes
- [ ] Direct labels, units once, locale formatting, zero baselines for bars
- [ ] Text alternative and table toggle; patterns or markers beyond color; reduced motion honored
- [ ] Library imported per chart type, lazy-loaded per route, one library per app
- [ ] Data aggregated on the server; canvas above a few thousand points
- [ ] Instances disposed, observers disconnected on unmount
- [ ] Placeholders sized like the final chart; no CLS on hydration
- [ ] Transforms unit-tested; a few visual regression snapshots with animations off
