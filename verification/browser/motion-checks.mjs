// Shared browser assertions for the documented ScrollStory (references/motion-engineering.md), run by
// verification/nuxt/check-motion.mjs and verification/next/check-motion.mjs as a child process (each project keeps its
// own import graph inside its folder, which the reference audits check). Every check reads DOM or GSAP state through
// the `window.__motion` diagnostics the component exposes: mount and unmount counts, live ScrollTriggers, live tweens
// that animate DOM elements, the reduced-motion branch taken. Nothing here is a screenshot.
//
//   node motion-checks.mjs --url http://127.0.0.1:3000 --story /motion --other /motion/other \
//     --other-link "Go to the second page" --back-link "Back to the story" --server-marker "Scroll story" --label next
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function motionState(page) {
  return page.evaluate(() => {
    const m = window.__motion
    return {
      present: Boolean(m),
      triggers: m ? m.triggers() : null,
      tweens: m ? m.tweens() : null,
      reduced: m ? m.reduced : null,
      mounts: m ? m.mounts : null,
      reverts: m ? m.reverts : null,
      pinSpacers: document.querySelectorAll('.pin-spacer').length,
      stepsVisible: [...document.querySelectorAll('.story-step')].filter((el) => getComputedStyle(el).opacity === '1').length,
      steps: document.querySelectorAll('.story-step').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })
}

async function settled(page) {
  await page.waitForFunction(() => Boolean(window.__motion) && window.__motion.mounts > 0, null, { timeout: 10000 })
  await page.waitForTimeout(300)
}

export async function runMotionChecks(chromium, { url, storyPath, otherPath, otherLinkName, backLinkName, serverMarker, label }) {
  const browser = await chromium.launch({ headless: true })
  const results = []
  const ok = (name) => results.push(name)
  try {
    // 1. server HTML and hydration
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' })
    const page = await context.newPage()
    const consoleProblems = []
    page.on('console', (m) => { if (m.type() === 'error' || /hydrat|mismatch/i.test(m.text())) consoleProblems.push(`${m.type()}: ${m.text().slice(0, 160)}`) })
    page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${String(e.message).slice(0, 160)}`))
    const serverHtml = await (await fetch(`${url}${storyPath}`)).text()
    expect(serverHtml.includes(serverMarker), `server HTML of ${storyPath} lacks "${serverMarker}"`)
    expect(serverHtml.includes('Skip the story') || serverHtml.includes('story-fallback'), 'server HTML has the story markup or its fallback')
    ok('server HTML rendered')
    await page.goto(`${url}${storyPath}`, { waitUntil: 'load' })
    await settled(page)
    expect(consoleProblems.length === 0, `console problems after hydration: ${consoleProblems.join(' | ')}`)
    ok('no console error or hydration warning after load')

    // 2. mounted: triggers and tweens alive, mounts counted once
    let s = await motionState(page)
    expect(s.present, '__motion diagnostics present after mount')
    expect(s.mounts === 1 && s.reverts === 0, `mounted once (mounts ${s.mounts}, reverts ${s.reverts})`)
    expect(s.reduced === false, `motion branch taken (reduced ${s.reduced})`)
    expect(s.triggers >= 1, `at least one ScrollTrigger after mount (got ${s.triggers})`)
    expect(s.tweens >= 1, `live DOM tweens after mount (got ${s.tweens})`)
    const firstTriggers = s.triggers
    const firstTweens = s.tweens
    // scrolling drives the scrubbed timeline; the steps end visible
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(800)
    s = await motionState(page)
    expect(s.stepsVisible === s.steps, `every step visible at the end of the scroll (${s.stepsVisible}/${s.steps})`)
    ok(`mounted: ${firstTriggers} trigger(s), ${firstTweens} tween(s), steps visible after scroll`)

    // 3. client-side navigation away: everything torn down
    await page.getByRole('link', { name: otherLinkName }).click()
    await page.waitForURL(`**${otherPath}`)
    await page.waitForTimeout(300)
    s = await motionState(page)
    expect(s.reverts === 1, `revert ran once on route change (reverts ${s.reverts})`)
    expect(s.triggers === 0, `no ScrollTrigger survives navigation (got ${s.triggers})`)
    expect(s.pinSpacers === 0, `no pin spacer survives navigation (got ${s.pinSpacers})`)
    expect(s.tweens === 0, `no DOM tween survives navigation (got ${s.tweens})`)
    ok('route change: 0 triggers, 0 pin spacers, 0 tweens')

    // 4. re-entry: mounted again, no duplicates
    await page.getByRole('link', { name: backLinkName }).click()
    await page.waitForURL(`**${storyPath}`)
    await settled(page)
    s = await motionState(page)
    expect(s.mounts === 2 && s.reverts === 1, `second mount counted (mounts ${s.mounts}, reverts ${s.reverts})`)
    expect(s.triggers === firstTriggers, `same number of triggers on re-entry (${s.triggers} vs ${firstTriggers})`)
    expect(s.tweens <= firstTweens, `no accumulated tweens on re-entry (${s.tweens} vs ${firstTweens})`)
    ok('re-entry: counts equal the first visit')

    // 5. keyboard: Tab reaches the primary navigation and the skip link before the story steps
    await page.goto(`${url}${storyPath}`, { waitUntil: 'load' })
    await settled(page)
    // the primary navigation grew with the 1.5 lab pages: tab until the skip link is reached (bounded)
    const focusOrder = []
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab')
      focusOrder.push(await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}:${(a.textContent || '').trim().slice(0, 24)}` : 'none' }))
      if (/^a:Skip the story/.test(focusOrder[focusOrder.length - 1])) break
    }
    expect(focusOrder.some((f) => /^a:(Home|Motion)/.test(f)), `Tab reaches the primary navigation (${focusOrder.join(' → ')})`)
    expect(focusOrder.some((f) => /^a:Skip the story/.test(f)), `Tab reaches the skip link (${focusOrder.join(' → ')})`)
    ok('keyboard: navigation and skip link reachable')

    // 6. responsive: a narrow viewport keeps the triggers and adds no horizontal overflow
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)
    s = await motionState(page)
    expect(!s.overflowX, 'no horizontal overflow at 375 px')
    expect(s.triggers >= 1, `triggers survive the resize (got ${s.triggers})`)
    ok('responsive: no overflow at 375 px, triggers kept')
    expect(consoleProblems.length === 0, `console problems during the run: ${consoleProblems.join(' | ')}`)
    await context.close()

    // 7. prefers-reduced-motion: the reduce branch, final state at once, no scrubbed trigger
    const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
    const rp = await reduced.newPage()
    await rp.goto(`${url}${storyPath}`, { waitUntil: 'load' })
    await settled(rp)
    s = await motionState(rp)
    expect(s.reduced === true, `reduce branch taken under prefers-reduced-motion (reduced ${s.reduced})`)
    expect(s.stepsVisible === s.steps, `steps visible immediately under reduced motion (${s.stepsVisible}/${s.steps})`)
    expect(s.triggers === 0, `no ScrollTrigger under reduced motion (got ${s.triggers})`)
    ok('reduced motion: final state at once, no trigger')
    await reduced.close()
  } finally {
    await browser.close()
  }
  console.log(`check-motion (${label}): ${results.length} checks passed\n  - ${results.join('\n  - ')}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2)
  const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
  const options = { url: opt('url'), storyPath: opt('story'), otherPath: opt('other'), otherLinkName: opt('other-link'), backLinkName: opt('back-link'), serverMarker: opt('server-marker'), label: opt('label') ?? 'app' }
  const missing = Object.entries(options).filter(([, v]) => v === undefined).map(([k]) => k)
  if (missing.length) {
    console.error(`motion-checks: missing --${missing.join(', --')}`)
    process.exit(2)
  }
  const { chromium } = createRequire(import.meta.url)('playwright')
  try {
    await runMotionChecks(chromium, options)
  } catch (error) {
    console.error(`check-motion (${options.label}): ${error.message}`)
    process.exit(1)
  }
}
