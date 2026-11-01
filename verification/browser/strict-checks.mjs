#!/usr/bin/env node
/**
 * React Strict Mode in a real browser (1.5 increment 4B). The Next dev server runs React in development, where Strict
 * Mode mounts, unmounts and mounts every effect again. This runner opens the lab pages there and counts what a double
 * mount must not double: live WebGL contexts (created minus lost), GSAP tweens and timelines, part-state listeners,
 * requests for the model, lifecycle mounts and disposes; then leaves, re-enters, and leaves again. No happy-dom here:
 * the numbers come from the page.
 *
 *   node strict-checks.mjs --url http://127.0.0.1:3000 --label next [--pages atelier-r3f,atelier,product]
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))

const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

/** Installed before any page script: counts canvases that obtained a WebGL context and the contexts lost since. */
const instrumentation = () => {
  window.__strict = { contexts: 0, lost: 0 }
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = original.call(this, type, ...rest)
    if (ctx && /webgl/i.test(String(type)) && !this.__faCounted) {
      this.__faCounted = true
      window.__strict.contexts++
      this.addEventListener('webglcontextlost', () => { window.__strict.lost++ })
    }
    return ctx
  }
}

/** The loop has rendered enough frames for GSAP's loop-driven clock to have moved past the startup timers. */
const loopWarm = (page) => page.waitForFunction(() => {
  const lab = window.__lab
  if (!lab || typeof lab.diagnostics !== 'function') return false
  const d = lab.diagnostics()
  return (d.frames ?? d.stats?.frames ?? 0) >= 45
}, null, { timeout: 180000 })

const readCounts = (page) => page.evaluate(() => {
  const lab = window.__lab
  const diag = lab && !lab.disposed && typeof lab.diagnostics === 'function' ? lab.diagnostics() : null
  return {
    lifecycle: window.__labLifecycle ? { ...window.__labLifecycle } : null,
    effects: window.__labEffects ? { ...window.__labEffects } : null,
    contexts: window.__strict?.contexts ?? null,
    lost: window.__strict?.lost ?? null,
    live: window.__strict ? window.__strict.contexts - window.__strict.lost : null,
    gsap: diag?.gsapChildren ?? null,
    gsapDetails: diag?.gsapDetails ?? null,
    listeners: diag?.listeners ?? null,
    geometries: diag?.info?.geometries ?? diag?.stats?.info?.geometries ?? null,
    textures: diag?.info?.textures ?? diag?.stats?.info?.textures ?? null,
    modelRequests: performance.getEntriesByType('resource').filter((e) => /\/models\/atelier[^/]*\.glb$/.test(e.name)).length,
    ready: Boolean(lab && lab.ready === true && !lab.disposed),
  }
})

const PAGES = {
  'atelier-r3f': { path: '/lab/atelier-r3f', loads: true },
  atelier: { path: '/lab/atelier', loads: true },
  product: { path: '/lab/product', loads: false },
}

export async function runStrictChecks(chromium, { url, label, pages, evidence }) {
  mkdirSync(evidence, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const results = []
  const report = {}
  const ok = (line) => results.push(line)
  try {
    for (const name of pages) {
      const spec = PAGES[name]
      if (!spec) throw new Error(`unknown strict page "${name}" (have ${Object.keys(PAGES).join(', ')})`)
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
      await context.addInitScript(instrumentation)
      const page = await context.newPage()
      const problems = []
      const warnings = []
      page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 200)}`))
      page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`); if (m.type() === 'warning') warnings.push(m.text().slice(0, 160)) })
      try {
        // a baseline on a page without a lab: what GSAP holds before any experience
        await page.goto(`${url}/motion/other`, { waitUntil: 'load' })
        // first visit: Strict Mode runs the effects twice in development
        const started = Date.now()
        await page.goto(`${url}${spec.path}`, { waitUntil: 'load' })
        await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true, null, { timeout: 300000 })
        await loopWarm(page)
        await page.waitForTimeout(500)
        const first = await readCounts(page)
        const firstMs = Date.now() - started
        report[name] = { firstVisitMs: firstMs, first }
        const isDev = await page.evaluate(() => Boolean(document.querySelector('nextjs-portal')) || /development/.test(String(window.__NEXT_DATA__?.buildId ?? '')) || Boolean(window.__nextDevClientId) || typeof window.__NEXT_HMR_LATENCY_CB !== 'undefined' || Boolean(document.querySelector('script[src*="/_next/static/chunks/"][src*="turbopack"]')))
        expect(first.lifecycle && first.lifecycle.mounts === first.lifecycle.disposes + 1, `${name}: after the first visit the lifecycle shows the Strict Mode double mount settled on one live mount (mounts ${first.lifecycle?.mounts}, disposes ${first.lifecycle?.disposes})`)
        // the double run shows in the page-level effect counters (imperative pages cancel the first run before it
        // mounts) or in the lifecycle itself (the R3F page mounts twice and disposes once)
        const doubled = first.effects ? first.effects.runs >= 2 && first.effects.cleanups >= 1 : first.lifecycle.mounts >= 2
        expect(doubled, `${name}: Strict Mode ran the effects twice in development (effects ${JSON.stringify(first.effects)}, mounts ${first.lifecycle.mounts}); is this the dev server?`)
        expect(first.live === 1, `${name}: exactly one live WebGL context after the double mount (created ${first.contexts}, lost ${first.lost})`)
        if (spec.loads) expect(first.modelRequests === 1, `${name}: the model was requested once despite the double mount (${first.modelRequests} requests)`)
        // leave: everything the page created is gone
        await page.click('nav[aria-label="Primary"] >> text=Second')
        await page.waitForFunction(() => !window.__lab || window.__lab.disposed === true, null, { timeout: 30000 })
        await page.waitForTimeout(600)
        const left = await readCounts(page)
        report[name].left = left
        expect(left.lifecycle.mounts === left.lifecycle.disposes, `${name}: leaving disposes every mount (${left.lifecycle.mounts}/${left.lifecycle.disposes})`)
        expect(left.live === 0, `${name}: no live WebGL context after leaving (created ${left.contexts}, lost ${left.lost})`)
        // re-entry: the same counts as the first settled visit
        await page.goBack({ waitUntil: 'load' })
        await page.waitForFunction(() => Boolean(window.__lab) && window.__lab.ready === true && window.__lab.disposed === false, null, { timeout: 300000 })
        await loopWarm(page)
        await page.waitForTimeout(500)
        const second = await readCounts(page)
        report[name].second = second
        expect(second.lifecycle.mounts === second.lifecycle.disposes + 1, `${name}: re-entry settles on one live mount (${second.lifecycle.mounts}/${second.lifecycle.disposes})`)
        expect(second.live === 1, `${name}: one live context after re-entry (created ${second.contexts}, lost ${second.lost})`)
        if (first.gsap !== null) expect(second.gsap === first.gsap, `${name}: GSAP holds the same tweens and timelines after re-entry as after the first double mount (${first.gsap} vs ${second.gsap})`)
        if (first.listeners !== null) expect(second.listeners === first.listeners, `${name}: the same number of part-state listeners after re-entry (${first.listeners} vs ${second.listeners})`)
        // a page that loads a model must have its geometries on the GPU on both visits: equal counts alone is not
        // enough, because a disposed instance reused across the Strict Mode remount renders an empty root and reads
        // 0g/0g on both — an equality that passes vacuously. Requiring >0 for a loading page rejects that degenerate
        // state instead of accepting it; a page with no GPU info (first.geometries === null) is exempt as before.
        if (first.geometries !== null) {
          if (spec.loads) expect(first.geometries > 0 && second.geometries > 0, `${name}: the loaded model's geometries are on the GPU on both visits, not an empty-root 0g read (${first.geometries}g first, ${second.geometries}g re-entry)`)
          expect(second.geometries === first.geometries && Math.abs(second.textures - first.textures) <= 2, `${name}: equal GPU resource counts after re-entry (${second.geometries}g/${second.textures}t vs ${first.geometries}g/${first.textures}t)`)
        }
        if (spec.loads) expect(second.modelRequests === 2, `${name}: one more model request for the new cache (${second.modelRequests} in total)`)
        // leave again
        await page.click('nav[aria-label="Primary"] >> text=Second')
        await page.waitForFunction(() => !window.__lab || window.__lab.disposed === true, null, { timeout: 30000 })
        await page.waitForTimeout(600)
        const final = await readCounts(page)
        expect(final.lifecycle.mounts === final.lifecycle.disposes && final.live === 0, `${name}: second leave disposes everything (${final.lifecycle.mounts}/${final.lifecycle.disposes}, live contexts ${final.live})`)
        expect(problems.length === 0, `${name}: no uncaught error or console.error under Strict Mode: ${problems.slice(0, 3).join(' | ')}`)
        report[name] = { devServer: isDev, firstVisitMs: firstMs, first, left, second, final, warnings: warnings.slice(0, 10) }
        ok(`${name}: Strict Mode double run settles on one experience (effects ${first.effects ? `${first.effects.runs}/${first.effects.cleanups}` : 'n/a'}, mounts ${first.lifecycle.mounts}, disposes ${first.lifecycle.disposes}, live contexts ${first.live}${spec.loads ? `, model requests ${first.modelRequests}` : ''}${first.gsap !== null ? `, gsap ${first.gsap}` : ''}${first.listeners !== null ? `, listeners ${first.listeners}` : ''}); leave frees it (contexts ${left.contexts}/${left.lost}); re-entry repeats the counts; ${warnings.length} dev warning(s)`)
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
    writeFileSync(join(evidence, `${label}-strict.json`), JSON.stringify(report, null, 2))
  }
  console.log(`check-strict (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
  return report
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const url = opt('url')
  const label = opt('label') ?? 'app'
  const pages = (opt('pages') ?? Object.keys(PAGES).join(',')).split(',').filter(Boolean)
  const evidence = opt('evidence') ?? join(here, 'evidence')
  if (!url) {
    console.error('strict-checks: missing --url')
    process.exit(2)
  }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runStrictChecks(chromium, { url, label, pages, evidence })
  } catch (error) {
    console.error(`check-strict (${label}): ${error.message}`)
    process.exit(1)
  }
}
