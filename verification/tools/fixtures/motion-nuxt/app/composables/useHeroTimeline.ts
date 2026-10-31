import gsap from 'gsap'

// a factory: the timeline is created when the caller asks, inside a function, not at import time
export function useHeroTimeline(root: HTMLElement) {
  const tl = gsap.timeline({ paused: true })
  tl.from(root.querySelectorAll('.line'), { y: 24, opacity: 0, stagger: 0.1 })
  return tl
}
