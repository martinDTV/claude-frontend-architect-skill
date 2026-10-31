import gsap from 'gsap'

// created at import time: shared by every component instance and evaluated on the server during SSR
export const introTimeline = gsap.timeline({ paused: true })
introTimeline.to('.intro', { opacity: 1 })
