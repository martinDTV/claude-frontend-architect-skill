#!/usr/bin/env node
/**
 * A human-review contact sheet for the review captures (1.5.0 RC, increment 6). It does not take screenshots and does
 * not touch the designs; it reads the capture set's index.json and writes a single self-contained gallery.html next to
 * the PNGs, so a reviewer can open it in a browser, filter by product, viewport, theme, text scale and state, and jump
 * to the representative captures instead of inspecting all 121. The page links the two review documents and the two
 * route-audit JSON files. Regenerable:
 *
 *   node verification/browser/gallery.mjs            # reads evidence/review-rc, writes evidence/review-rc/gallery.html
 *   node verification/browser/gallery.mjs --dir <capture-dir>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback }
const dir = opt('dir', join(here, 'evidence', 'review-rc'))
const indexPath = join(dir, 'index.json')
if (!existsSync(indexPath)) { console.error(`gallery: no index.json at ${indexPath}; run review-captures.mjs first`); process.exit(2) }

const index = JSON.parse(readFileSync(indexPath, 'utf8'))
const captures = (index.captures ?? []).filter((c) => c.file && c.viewport && c.theme)

const PRODUCT = (f) =>
  f.startsWith('nuxt-app') || f.startsWith('nuxt-design') ? 'atlas-nuxt'
  : f.startsWith('next-app') || f.startsWith('next-design') ? 'atlas-next'
  : f.startsWith('lumen') ? 'lumen'
  : f.startsWith('ember') ? 'ember'
  : 'other'
const PRODUCT_LABEL = { 'atlas-nuxt': 'Atlas Logistics — Nuxt UI', 'atlas-next': 'Atlas Logistics — shadcn/ui (Next)', lumen: 'Lumen — launch page', ember: 'Ember & Ash — shop' }

// the representative captures: enough to judge each product without opening all 121, each with why it is worth a look
const REPRESENTATIVE = {
  'nuxt-app-dashboard-desktop-light.png': 'Identity, hierarchy, composition at rest',
  'nuxt-app-dashboard-desktop-light-200.png': '200% text: the sidebar collapses to its rail, nothing truncates',
  'nuxt-app-shipments-desktop-light.png': 'The table, the status pills, density',
  'nuxt-app-shipments-new-errors-desktop-light.png': 'Form errors: now in the danger colour, one line per field',
  'nuxt-app-dashboard-error-desktop-light.png': 'Error state and its visible "Try again"',
  'nuxt-app-dashboard-tablet-dark.png': 'Dark theme on a tablet',
  'nuxt-app-shipments-mobile-light.png': 'Phone: the table becomes cards',
  'nuxt-design-desktop-light.png': 'The design contract, as applied',
  'next-app-dashboard-desktop-light.png': 'Identity, hierarchy, composition at rest',
  'next-app-dashboard-desktop-light-200.png': '200% text: the KPI grid reflows, the chart axis scales',
  'next-app-shipments-desktop-dark.png': 'The table and the red "Late" pills, dark',
  'next-app-shipments-new-desktop-light.png': 'The form, the date row, the aligned checkbox',
  'next-app-sidebar-collapsed-desktop-light.png': 'Collapsed rail: the theme control is a square icon',
  'next-app-shipments-mobile-light.png': 'Phone: cards and the exceptions list',
  'next-design-desktop-light.png': 'The design contract, as applied',
  'lumen-landing-desktop-light.png': 'Identity, typography, the hero',
  'lumen-landing-desktop-dark.png': 'Dark theme keeps the paper palette of the art',
  'lumen-landing-desktop-light-200.png': '200% text: the battery row stacks, no overflow',
  'lumen-landing-mobile-light.png': 'Phone pacing and the pre-order bar',
  'lumen-landing-hero-before-intro-desktop-light.png': 'The notebook cover opens to a plain inside face (not mirrored type)',
  'lumen-landing-form-success-desktop-dark.png': 'The reservation success state',
  'ember-shop-desktop-light.png': 'The shelf, the maker names, the palette',
  'ember-shop-desktop-dark.png': 'Dark theme: the image tiles (a human call)',
  'ember-detail-desktop-light.png': 'Detail composition: gallery and the buy column',
  'ember-detail-mobile-light.png': 'Phone: the buy panel and its add button come before the prose',
  'ember-shop-desktop-light-200.png': '200% text: the shelf drops columns, the rail gives way',
  'ember-bag-drawer-desktop-light.png': 'The bag drawer with its totals (the toast is cleared)',
  'ember-detail-sold-out-desktop-light.png': 'Sold-out state and the procedural artwork (a human call)',
  'ember-shop-tablet-light.png': 'Tablet header laid out by grid areas',
}

// a short human aspect label derived from the file name's state tokens
const aspect = (c) => {
  const f = c.file.replace(/\.png$/, '')
  const bits = []
  if (/-error/.test(f)) bits.push('error')
  if (/-empty/.test(f)) bits.push('empty')
  if (/-loading/.test(f)) bits.push('loading')
  if (/-no-match/.test(f)) bits.push('no match')
  if (/-sold-out/.test(f)) bits.push('sold out')
  if (/-conflict/.test(f)) bits.push('server conflict')
  if (/-errors/.test(f)) bits.push('validation errors')
  if (/-filtered|filter-menu|filter-sheet/.test(f)) bits.push('filters')
  if (/-row-menu/.test(f)) bits.push('row menu')
  if (/-assign-dialog/.test(f)) bits.push('assign dialog')
  if (/-details/.test(f)) bits.push('details panel')
  if (/-cancel-confirm/.test(f)) bits.push('cancel confirm')
  if (/-search-palette/.test(f)) bits.push('search palette')
  if (/-mobile-drawer/.test(f)) bits.push('mobile drawer')
  if (/-sidebar-collapsed/.test(f)) bits.push('collapsed rail')
  if (/-drawer/.test(f)) bits.push('bag drawer')
  if (/-bag-page|-bag-empty/.test(f)) bits.push('bag')
  if (/-other-glaze/.test(f)) bits.push('variant change')
  if (/-archive-scrolled/.test(f)) bits.push('archive scrolled')
  if (/-hero-before-intro/.test(f)) bits.push('hero before intro')
  if (/-faq-open/.test(f)) bits.push('faq open')
  if (/-form-success/.test(f)) bits.push('form success')
  if (/-form-error/.test(f)) bits.push('form error')
  if (/-new\b|-new-/.test(f) && !/-errors|-conflict/.test(f)) bits.push('new shipment')
  if (/-settings/.test(f)) bits.push('settings')
  if (/-design/.test(f)) bits.push('design contract')
  return bits.length ? bits.join(' · ') : 'default'
}

const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))

const GUIDE = [
  ['Identity', 'Could you tell this apart from any other app in the same library? Does it feel like a product or a template?'],
  ['Hierarchy', 'Does the most urgent thing read first? Is status (late / at risk / sold out) as loud as it should be?'],
  ['Legibility', 'Read the small text aloud: deltas, lane codes, captions, muted labels, dark theme. At 200% text, does anything become unreadable?'],
  ['Spacing & density', 'Right for the audience (dispatchers vs shoppers)? Anything cramped or orphaned, on tablet especially?'],
  ['Composition & layout', 'Does the page hold together? Empty columns, floating art, orphaned cards, chrome that should recede?'],
  ['Responsive', 'Walk desktop → tablet → mobile → 320px. Does anything overflow, truncate badly, or lose a column silently?'],
  ['Coherence', 'Atlas Nuxt vs Atlas Next side by side: how far do the two implementations of one contract drift (status, chrome, breakpoints, errors)?'],
  ['States & motion', 'Loading, empty, error, success, conflict: are they intentional? Turn reduced motion on in the OS and reload Lumen.'],
]
const PRODUCT_NOTES = {
  'atlas-nuxt': 'Enterprise back office. The brief asked for calm and dense, not character. Fixed this increment: the sidebar collapses at 200% instead of truncating, the error "Try again" is a solid button, field errors are in the danger colour, the settings columns lock reference and status.',
  'atlas-next': 'The same contract in shadcn/ui. Compare it with the Nuxt build for drift. Fixed: the 200% KPI reflow, the collapsed-rail theme icon, the aligned priority checkbox, the design-page control on its own line.',
  lumen: 'Premium launch page. The strongest in identity. Fixed: the cover opens to a plain inside face, the battery row stacks instead of overflowing, the phone bar steps aside while the form is in view. Human call: the drawn illustration vs a product photograph.',
  ember: 'Studio-ceramics shop. Fixed: the phone buy panel precedes the prose, the grid reflows at 200%, the fixed bar steps aside so it never covers a variant, the toast is cleared when the drawer opens. Human calls: the faceted artwork as a stand-in for photography, and the dark-theme image tiles.',
}

const order = { desktop: 0, tablet: 1, mobile: 2, reflow: 3 }
const byProduct = {}
for (const c of captures) { const p = PRODUCT(c.file); (byProduct[p] ??= []).push(c) }
for (const p of Object.keys(byProduct)) byProduct[p].sort((a, b) => (order[a.viewport] - order[b.viewport]) || a.theme.localeCompare(b.theme) || a.scale - b.scale || a.file.localeCompare(b.file))

const card = (c) => {
  const rep = REPRESENTATIVE[c.file]
  const flags = []
  if (c.overflow) flags.push('<span class="flag bad">overflow</span>')
  if (c.consoleErrors && c.consoleErrors.length) flags.push(`<span class="flag bad">console: ${c.consoleErrors.length}</span>`)
  if (c.scale === 2) flags.push('<span class="flag">200% text</span>')
  return `<figure class="card" data-product="${PRODUCT(c.file)}" data-viewport="${c.viewport}" data-theme="${c.theme}" data-scale="${c.scale}" data-rep="${rep ? 1 : 0}">
  <a href="${esc(c.file)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(c.file)}" alt="${esc(c.file)}"></a>
  <figcaption>
    <div class="meta">${rep ? '<span class="flag rep">representative</span>' : ''}<span class="flag">${c.viewport}</span><span class="flag">${c.theme}</span>${flags.join('')}</div>
    <div class="aspect">${esc(aspect(c))}</div>
    ${rep ? `<div class="why">${esc(rep)}</div>` : ''}
    ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
    <div class="fname">${esc(c.file)}</div>
  </figcaption>
</figure>`
}

const section = (p) => `<section class="product" id="${p}">
  <h2>${esc(PRODUCT_LABEL[p] ?? p)} <span class="count">${byProduct[p].length}</span></h2>
  <p class="pnote">${esc(PRODUCT_NOTES[p] ?? '')}</p>
  <div class="grid">${byProduct[p].map(card).join('\n')}</div>
</section>`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frontend Architect 1.5.0 RC — visual review</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, system-ui, sans-serif; color: #1a1a1a; background: #f4f4f5; }
  header, .controls, .guide, .product { max-width: 1280px; margin-inline: auto; padding-inline: 20px; }
  header { padding-top: 28px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; margin: 0 0 12px; }
  .links a { margin-right: 14px; }
  details.guide { background: #fff; border: 1px solid #e3e3e6; border-radius: 10px; padding: 14px 18px; margin: 16px auto; }
  details.guide summary { font-weight: 600; cursor: pointer; }
  .guide dl { display: grid; grid-template-columns: 150px 1fr; gap: 6px 18px; margin: 12px 0 0; }
  .guide dt { font-weight: 600; } .guide dd { margin: 0; color: #333; }
  .controls { position: sticky; top: 0; z-index: 5; background: #f4f4f5ee; backdrop-filter: blur(6px); padding-block: 12px; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; border-bottom: 1px solid #e3e3e6; }
  .controls fieldset { border: 0; margin: 0; padding: 0; display: flex; gap: 8px; align-items: center; }
  .controls legend { float: left; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #777; margin-right: 8px; }
  .controls label { font-size: 13px; display: inline-flex; gap: 4px; align-items: center; }
  .product { padding-top: 24px; }
  .product h2 { font-size: 18px; border-bottom: 2px solid #ddd; padding-bottom: 6px; }
  .count { font-weight: 400; color: #888; font-size: 14px; }
  .pnote { color: #444; max-width: 90ch; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .card { margin: 0; background: #fff; border: 1px solid #e3e3e6; border-radius: 10px; overflow: hidden; }
  .card[data-rep="1"] { border-color: #2f6fb0; box-shadow: 0 0 0 1px #2f6fb0; }
  .card[data-theme="dark"] a { background: #22232a; display: block; }
  .card img { width: 100%; height: auto; display: block; }
  figcaption { padding: 8px 10px 10px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .flag { font-size: 11px; background: #eef0f2; color: #333; border-radius: 999px; padding: 1px 8px; }
  .flag.rep { background: #2f6fb0; color: #fff; }
  .flag.bad { background: #fde2e1; color: #a02c2d; }
  .aspect { font-weight: 600; font-size: 13px; }
  .why { color: #2f6fb0; font-size: 13px; margin-top: 2px; }
  .note { color: #555; font-size: 12px; margin-top: 2px; }
  .fname { color: #999; font-size: 11px; font-family: ui-monospace, monospace; margin-top: 4px; word-break: break-all; }
  .hidden { display: none !important; }
</style></head>
<body>
<header>
  <h1>Frontend Architect 1.5.0 — release-candidate visual review</h1>
  <p class="sub">${captures.length} captures, generated ${esc(index.generatedAt ?? '')}. This page reads the captures; it changes no design. Blue-bordered cards are the representative set — start there.</p>
  <p class="links"><a href="../../../docs/review/v1.5.0-rc-visual-review.md">Visual review (author + fresh context)</a><a href="../../../docs/review/v1.5.0-rc-heuristics.md">Heuristics triage</a><a href="audit-nuxt.json">audit-nuxt.json</a><a href="audit-next.json">audit-next.json</a></p>
</header>
<details class="guide" open>
  <summary>What to review</summary>
  <dl>${GUIDE.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  <p style="margin:12px 0 0;color:#555">The fresh-context reviewer and the route audits agree there are no confirmed defects left; this pass is for taste and for the human calls (the drawn artwork, the dark-theme tiles, the touch-target sizes on moving-vehicle use) that pixels cannot settle.</p>
</details>
<div class="controls">
  <fieldset><legend>Show</legend><label><input type="checkbox" id="rep-only"> representative only</label></fieldset>
  <fieldset data-group="product"><legend>Product</legend></fieldset>
  <fieldset data-group="viewport"><legend>Viewport</legend></fieldset>
  <fieldset data-group="theme"><legend>Theme</legend></fieldset>
  <fieldset data-group="scale"><legend>Text</legend></fieldset>
</div>
${['atlas-nuxt', 'atlas-next', 'lumen', 'ember'].filter((p) => byProduct[p]).map(section).join('\n')}
<script>
  const cards = [...document.querySelectorAll('.card')]
  const values = (attr) => [...new Set(cards.map((c) => c.dataset[attr]))].sort()
  const labels = { product: { 'atlas-nuxt': 'Atlas Nuxt', 'atlas-next': 'Atlas Next', lumen: 'Lumen', ember: 'Ember' }, scale: { '1': '100%', '2': '200%' } }
  const state = { product: new Set(values('product')), viewport: new Set(values('viewport')), theme: new Set(values('theme')), scale: new Set(values('scale')), repOnly: false }
  for (const fs of document.querySelectorAll('.controls fieldset[data-group]')) {
    const g = fs.dataset.group
    for (const v of values(g)) {
      const id = g + '-' + v
      const lab = document.createElement('label')
      lab.innerHTML = '<input type="checkbox" checked value="' + v + '" data-group="' + g + '"> ' + ((labels[g] && labels[g][v]) || v)
      fs.appendChild(lab)
    }
  }
  const apply = () => {
    for (const c of cards) {
      const show = state.product.has(c.dataset.product) && state.viewport.has(c.dataset.viewport) && state.theme.has(c.dataset.theme) && state.scale.has(c.dataset.scale) && (!state.repOnly || c.dataset.rep === '1')
      c.classList.toggle('hidden', !show)
    }
    for (const sec of document.querySelectorAll('.product')) {
      const any = [...sec.querySelectorAll('.card')].some((c) => !c.classList.contains('hidden'))
      sec.classList.toggle('hidden', !any)
    }
  }
  document.querySelector('#rep-only').addEventListener('change', (e) => { state.repOnly = e.target.checked; apply() })
  for (const cb of document.querySelectorAll('.controls input[data-group]')) cb.addEventListener('change', (e) => { const g = e.target.dataset.group; e.target.checked ? state[g].add(e.target.value) : state[g].delete(e.target.value); apply() })
  apply()
</script>
</body></html>`

const out = join(dir, 'gallery.html')
writeFileSync(out, html)
console.log(`gallery: ${captures.length} captures → ${out}`)
console.log(`  representative: ${captures.filter((c) => REPRESENTATIVE[c.file]).length}; open with: open "${out}"`)
