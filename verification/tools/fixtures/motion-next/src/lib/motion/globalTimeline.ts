import gsap from 'gsap'

// one timeline for the whole module: shared by every consumer and created when the module is first imported
export const pageTimeline = gsap.timeline({ paused: true })
