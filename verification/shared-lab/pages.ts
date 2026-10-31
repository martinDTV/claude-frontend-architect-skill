/**
 * Page controllers for the three reference experiences: create the experience, bind scroll and keys, wire the DOM
 * controls found inside the container, publish `window.__lab` for the browser checks, and dispose everything. The Vue
 * and React wrappers in the apps only render the DOM and call these.
 */
import gsap from 'gsap'
import { createProductExperience, PRODUCT_COLORS, type ProductExperience } from '../experiences/product-experience'
import { createParticleExperience, type ParticleExperience } from '../experiences/particle-experience'
import { createStoryExperience, STORY_CHAPTERS, type StoryExperience } from '../experiences/story-experience'
import { meanDistance } from '../particles/formations'
import { detectInitialTier, readDeviceSignals, QUALITY_TIERS } from '../rendering/quality'
import { bindScrollExperience, type ScrollBinding } from './bind-scroll'

declare global {
  interface Window {
    __lab?: unknown
    __labLifecycle?: { mounts: number; disposes: number }
  }
}

export interface PageOptions {
  container: HTMLElement
  canvas: HTMLCanvasElement
  controls: HTMLElement
  reducedMotion: boolean
  onCaption?: (id: string, active: boolean) => void
}

const lifecycle = () => (window.__labLifecycle ??= { mounts: 0, disposes: 0 })
const captureErrors = () => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 300))
    original.apply(console, args)
  }
  return { errors, restore: () => { console.error = original } }
}
const tierFor = (canvas: HTMLCanvasElement) => {
  // the lab runs on a software renderer: the heuristic would pick "minimal"; the pages pin a mid tier so the checks
  // exercise shadows and post-processing, and record what the heuristic would have chosen
  const gl = canvas.getContext('webgl2') ?? undefined
  const debug = gl?.getExtension('WEBGL_debug_renderer_info')
  const renderer = gl && debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : undefined
  return { pinned: QUALITY_TIERS[2]!, detected: detectInitialTier(readDeviceSignals(navigator, (q) => window.matchMedia(q).matches, renderer, Boolean(gl))) }
}

export async function mountProductPage(options: PageOptions): Promise<() => void> {
  const { errors, restore } = captureErrors()
  const tiers = tierFor(options.canvas)
  const experience: ProductExperience = createProductExperience({ canvas: options.canvas, controlsElement: options.controls, reducedMotion: options.reducedMotion, tier: tiers.pinned, gsap, onCaption: options.onCaption })
  const binding: ScrollBinding = bindScrollExperience(options.container, experience, { reducedMotion: options.reducedMotion })
  // DOM controls: <select data-option="finish|color"> and <button data-explore>
  const selects = [...options.container.querySelectorAll<HTMLSelectElement>('select[data-option]')]
  for (const select of selects) {
    const option = select.dataset.option as 'finish' | 'color'
    select.innerHTML = experience.configurator.available(option).map((v) => `<option value="${v}">${v}</option>`).join('')
    select.value = experience.configurator.selection[option]
    select.addEventListener('change', () => experience.configurator.set(option, select.value))
  }
  const exploreButton = options.container.querySelector<HTMLButtonElement>('button[data-explore]')
  const onExplore = () => {
    if (experience.diagnostics().exploring) experience.resume()
    else experience.explore()
    if (exploreButton) exploreButton.setAttribute('aria-pressed', String(experience.diagnostics().exploring))
  }
  exploreButton?.addEventListener('click', onExplore)
  for (const button of options.container.querySelectorAll<HTMLButtonElement>('button[data-seek]')) button.addEventListener('click', () => binding.seekTo(Number(button.dataset.seek)))
  lifecycle().mounts++
  const lab = {
    kind: 'product',
    ready: true,
    errors,
    shots: experience.shots.map((s) => ({ name: s.name, position: s.position, fov: s.fov })),
    segments: experience.sequence.segments.map((s, i) => ({ name: s.name, start: experience.sequence.startOf(i) })),
    colors: PRODUCT_COLORS,
    tier: { pinned: tiers.pinned.name, detected: tiers.detected.name },
    api: {
      seek: (p: number) => experience.seek(p),
      set: (option: 'finish' | 'color', value: string) => Boolean(experience.configurator.set(option, value)),
      explore: () => { experience.explore(); return experience.diagnostics() },
      resume: () => { experience.resume(); return experience.diagnostics() },
      scrollProgress: () => binding.progress,
    },
    diagnostics: () => experience.diagnostics(),
    lifecycle: lifecycle(),
    disposed: false,
    afterDispose: null as null | { geometries: number; textures: number },
    disposal: null as unknown,
  }
  window.__lab = lab
  return () => {
    const renderer = experience.post.composer.renderer
    binding.dispose()
    exploreButton?.removeEventListener('click', onExplore)
    lab.disposal = experience.dispose()
    lifecycle().disposes++
    lab.disposed = true
    lab.afterDispose = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }
    restore()
  }
}

export async function mountFieldPage(options: PageOptions): Promise<() => void> {
  const { errors, restore } = captureErrors()
  const tiers = tierFor(options.canvas)
  const experience: ParticleExperience = createParticleExperience({ canvas: options.canvas, pointerElement: options.controls, reducedMotion: options.reducedMotion, tier: tiers.pinned, adaptive: false })
  const binding = bindScrollExperience(options.container, experience, { reducedMotion: options.reducedMotion })
  const range = options.container.querySelector<HTMLInputElement>('input[data-density]')
  const onDensity = () => experience.setDensity(Number(range!.value) / 100)
  range?.addEventListener('input', onDensity)
  lifecycle().mounts++
  const stats = () => experience.diagnostics().stats
  const lab = {
    kind: 'field',
    ready: true,
    errors,
    tier: { pinned: tiers.pinned.name, detected: tiers.detected.name },
    api: {
      seek: (p: number) => experience.seek(p),
      setDensity: (f: number) => { experience.setDensity(f); return experience.diagnostics() },
      setPointer: (x: number, y: number, z: number, active = true) => { experience.setPointer(x, y, z, active); return experience.diagnostics() },
      advance: (seconds: number) => { experience.advance(seconds); return experience.diagnostics() },
      /** mean distance of the read-back positions to formation a or b, and how many sit within `radius` of a point */
      measure: (formation: 'a' | 'b', near?: { x: number; y: number; z: number; radius: number }) => {
        const positions = experience.readPositions()
        if (!positions) return null
        const d = experience.diagnostics()
        const target = experience.formations[formation]
        let count = 0
        if (near) for (let i = 0; i < d.drawn; i++) if (Math.hypot((positions[i * 4] ?? 0) - near.x, (positions[i * 4 + 1] ?? 0) - near.y, (positions[i * 4 + 2] ?? 0) - near.z) < near.radius) count++
        return { mean: meanDistance(positions, target, d.drawn, 4, 3), near: count, drawn: d.drawn }
      },
      scrollProgress: () => binding.progress,
    },
    diagnostics: () => experience.diagnostics(),
    lifecycle: lifecycle(),
    disposed: false,
    afterDispose: null as null | { geometries: number; textures: number },
    disposal: null as unknown,
  }
  window.__lab = lab
  return () => {
    binding.dispose()
    range?.removeEventListener('input', onDensity)
    lab.disposal = experience.dispose()
    lifecycle().disposes++
    lab.disposed = true
    const info = stats().info // runtime.stats() reads renderer.info live, after disposal
    lab.afterDispose = { geometries: info.geometries, textures: info.textures }
    restore()
  }
}

export async function mountStoryPage(options: PageOptions): Promise<() => void> {
  const { errors, restore } = captureErrors()
  const tiers = tierFor(options.canvas)
  const experience: StoryExperience = createStoryExperience({ canvas: options.canvas, reducedMotion: options.reducedMotion, tier: tiers.pinned, onCaption: options.onCaption })
  const binding = bindScrollExperience(options.container, experience, { reducedMotion: options.reducedMotion })
  const buttons = [...options.container.querySelectorAll<HTMLButtonElement>('button[data-chapter]')]
  const syncButtons = () => {
    const index = experience.navigator.index
    buttons.forEach((b, i) => {
      if (i === index) b.setAttribute('aria-current', 'step')
      else b.removeAttribute('aria-current')
    })
    const live = options.container.querySelector('[data-live]')
    if (live) live.textContent = `Chapter ${index + 1} of ${STORY_CHAPTERS.length}: ${STORY_CHAPTERS[index]?.title ?? ''}`
  }
  const handlers = buttons.map((b, i) => {
    const handler = () => binding.seekTo(experience.goTo(i))
    b.addEventListener('click', handler)
    return handler
  })
  const unsubscribe = experience.navigator.subscribe(() => {
    syncButtons()
    if (typeof history !== 'undefined') history.replaceState(null, '', experience.navigator.hashFor(experience.navigator.index))
  })
  syncButtons()
  const fromHash = experience.navigator.fromHash(location.hash)
  if (fromHash !== null && fromHash > 0) binding.seekTo(experience.goTo(fromHash))
  lifecycle().mounts++
  const lab = {
    kind: 'story',
    ready: true,
    errors,
    chapters: STORY_CHAPTERS,
    transitions: experience.transitions,
    tier: { pinned: tiers.pinned.name, detected: tiers.detected.name },
    api: {
      seek: (p: number) => experience.seek(p),
      key: (k: string) => experience.key(k),
      goTo: (i: number) => experience.goTo(i),
      checkpoint: (space: number, local: number) => experience.checkpoint(space, local),
      scrollProgress: () => binding.progress,
    },
    diagnostics: () => experience.diagnostics(),
    lifecycle: lifecycle(),
    disposed: false,
    afterDispose: null as null | { geometries: number; textures: number },
    disposal: null as unknown,
  }
  window.__lab = lab
  return () => {
    binding.dispose()
    unsubscribe()
    buttons.forEach((b, i) => b.removeEventListener('click', handlers[i]!))
    lab.disposal = experience.dispose()
    lifecycle().disposes++
    lab.disposed = true
    const info = experience.diagnostics().stats.info // live renderer.info, after disposal
    lab.afterDispose = { geometries: info.geometries, textures: info.textures }
    restore()
  }
}
