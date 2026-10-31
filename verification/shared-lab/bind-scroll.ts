/**
 * Binds an experience's `seek(progress)` to the document scroll through ScrollTrigger (scrub), to the keyboard through
 * `key()`, and offers `seekTo(progress)` for buttons. Under reduced motion there is no scrub: seeks are cuts and the
 * document is scrolled to the matching position without animation.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export interface ScrollBound {
  seek(progress: number): unknown
  key?(key: string): number | null
}
export interface ScrollBinding {
  /** scrolls the container so the experience lands on `progress` (animated by the scrub, or a cut under reduced motion) */
  seekTo(progress: number): void
  readonly progress: number
  dispose(): void
}

export function bindScrollExperience(container: HTMLElement, experience: ScrollBound, options: { reducedMotion: boolean }): ScrollBinding {
  gsap.registerPlugin(ScrollTrigger)
  let progress = 0
  const trigger = options.reducedMotion
    ? null
    : ScrollTrigger.create({
        trigger: container,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
        onUpdate: (self) => {
          progress = self.progress
          experience.seek(progress)
        },
      })
  const scrollFor = (p: number) => {
    const rect = container.getBoundingClientRect()
    const top = rect.top + window.scrollY
    const span = Math.max(0, container.offsetHeight - window.innerHeight)
    return top + p * span
  }
  const seekTo = (p: number) => {
    const clamped = Math.min(1, Math.max(0, p))
    if (options.reducedMotion) {
      progress = clamped
      experience.seek(clamped)
      window.scrollTo({ top: scrollFor(clamped), behavior: 'auto' })
    } else {
      window.scrollTo({ top: scrollFor(clamped), behavior: 'smooth' })
    }
  }
  const onKey = (event: KeyboardEvent) => {
    const target = experience.key?.(event.key)
    if (target === null || target === undefined) return
    event.preventDefault()
    seekTo(target)
  }
  container.addEventListener('keydown', onKey)
  return {
    seekTo,
    get progress() {
      return progress
    },
    dispose() {
      container.removeEventListener('keydown', onKey)
      trigger?.kill()
    },
  }
}
