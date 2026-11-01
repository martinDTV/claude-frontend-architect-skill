'use client'
// Lumen, the launch page of the lumen-notebook contract (landing-pages.md): a long-form page that reads in two minutes,
// three ideas (paper, archive, battery), one action visible in every section, editorial typography on cream and ink.
// Motion explains the product and nothing else: the notebook opens once on load, the strokes draw along the scroll in
// the archive section, the battery bar fills once; reduced motion shows the final frames and creates no ScrollTrigger.
// The whole page renders on the server; GSAP runs after hydration inside useGSAP with a matchMedia for the preference.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { Button } from '@/components/ui/button'
import { NotebookArt, FINISHES, type FinishId } from './notebook-art'
import { PreorderForm } from './preorder-form'

gsap.registerPlugin(ScrollTrigger, useGSAP)

type LumenDebug = { triggers: () => number; tweens: () => number; reduced: boolean | null; mounts: number; reverts: number; intro: 'pending' | 'done' }
function debug(): LumenDebug {
  const w = window as unknown as { __lumen?: LumenDebug }
  const domTweens = () => gsap.globalTimeline.getChildren(true, true, false).filter((t) => (t as gsap.core.Tween).targets().some((x: unknown) => x instanceof Element))
  w.__lumen ??= { triggers: () => ScrollTrigger.getAll().length, tweens: () => domTweens().length, reduced: null, mounts: 0, reverts: 0, intro: 'pending' }
  return w.__lumen
}

const NAV = [
  { href: '#paper', label: 'Paper' },
  { href: '#archive', label: 'Archive' },
  { href: '#battery', label: 'Battery' },
  { href: '#specs', label: 'Specs' },
  { href: '#faq', label: 'Questions' },
]
const SPECS = [
  ['Display', '6.8″ e-paper, 300 ppi, front light with warm steps'],
  ['Pen', 'Passive stylus, 4,096 pressure levels, no battery, no pairing'],
  ['Archive', 'Pages sync as PDF and text to your own folder; no account needed'],
  ['Battery', 'Six weeks of daily notes; charges in ninety minutes over USB-C'],
  ['Body', '178 × 126 × 6.1 mm, 240 g, recycled magnesium, three finishes'],
  ['Storage', '32 GB, about 60,000 pages'],
]
const FAQ = [
  ['When does it ship?', 'Pre-orders open in spring; the first batch ships twelve weeks after. Reserving costs nothing and holds a place in the queue, not a payment.'],
  ['Does it need an account?', 'No. Pages sync to a folder you choose over your own cloud or a USB-C cable. Lumen never sees what you write.'],
  ['Can I read on it?', 'Yes: PDFs and plain text, with the pen for margin notes. It is a notebook first, so there is no store and no feed.'],
  ['What about repairs?', 'The battery and the glass are user-replaceable with the included driver; guides and parts for ten years.'],
]

export function LumenLanding() {
  const root = useRef<HTMLDivElement>(null)
  const [finish, setFinish] = useState<FinishId>('graphite')
  const [intro, setIntro] = useState<'pending' | 'done'>('pending')
  // the phone bar repeats the one action; while the reservation form itself is in view it steps aside
  const [formInView, setFormInView] = useState(false)
  useEffect(() => {
    const form = document.getElementById('preorder')
    if (!form || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setFormInView(Boolean(entry?.isIntersecting)), { threshold: 0.2 })
    io.observe(form)
    return () => io.disconnect()
  }, [])
  // the sticky bar on phones must never cover a focused control: scrolling leaves room at the bottom while this page is mounted
  useEffect(() => {
    const html = document.documentElement
    const previous = html.style.scrollPaddingBottom
    html.style.scrollPaddingBottom = '6rem'
    return () => { html.style.scrollPaddingBottom = previous }
  }, [])
  useGSAP(
    () => {
      const d = debug()
      d.mounts++
      const mm = gsap.matchMedia(root)
      mm.add({ reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
        const reduce = Boolean(context.conditions?.reduce)
        d.reduced = reduce
        if (reduce) {
          // final frames, at once: the notebook open, the strokes drawn, the battery full
          gsap.set('[data-cover]', { rotateY: -168 })
          gsap.set('[data-stroke]', { strokeDasharray: 1, strokeDashoffset: 0 })
          gsap.set('[data-battery-fill]', { scaleX: 1 })
          gsap.set('[data-reveal]', { opacity: 1, y: 0 })
          d.intro = 'done'
          setIntro('done')
          return
        }
        // the page opens like a notebook (480 ms, once), then the headline and the action settle
        gsap.set('[data-stroke]', { strokeDasharray: 1, strokeDashoffset: 1 })
        gsap.set('[data-battery-fill]', { scaleX: 0, transformOrigin: 'left center' })
        gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { d.intro = 'done'; setIntro('done') } })
          .fromTo('[data-cover]', { rotateY: 0 }, { rotateY: -168, duration: 0.48, ease: 'power2.inOut' })
          .from('[data-reveal]', { opacity: 0, y: 16, duration: 0.32, stagger: 0.08 }, '-=0.2')
        // a stroke draws itself along the scroll of the archive section
        gsap.to('[data-stroke]', { strokeDashoffset: 0, stagger: 0.15, ease: 'none', scrollTrigger: { trigger: '#archive', start: 'top 70%', end: 'bottom 60%', scrub: 0.4 } })
        // the battery fills once when its section arrives
        gsap.to('[data-battery-fill]', { scaleX: 1, duration: 0.8, ease: 'power2.out', scrollTrigger: { trigger: '#battery', start: 'top 75%', once: true } })
      })
      return () => { mm.revert(); debug().reverts++ }
    },
    { scope: root },
  )
  const finishLabel = FINISHES.find((f) => f.id === finish)?.label ?? 'Graphite'
  return (
    <div ref={root} data-contract="lumen" data-finish={finish} data-intro={intro} className="min-h-screen bg-dc-canvas pb-28 font-sans text-base leading-(--leading-body) text-dc-fg antialiased md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-dc-surface-raised focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-dc-border bg-dc-canvas/92 backdrop-blur">
        <div className="mx-auto flex max-w-(--container-page) items-center justify-between gap-4 px-5 md:px-(--gutter) py-3">
          <Link href="/landing" className="font-serif text-xl tracking-tight" aria-label="Lumen, top of page">Lumen</Link>
          <nav aria-label="Sections" className="hidden gap-5 text-sm md:flex">{NAV.map((n) => <a key={n.href} href={n.href} className="hover:underline underline-offset-4">{n.label}</a>)}</nav>
          <a href="#preorder" className="hidden text-sm font-medium text-dc-accent underline-offset-4 hover:underline md:inline" data-preorder-link>Pre-order · 249 €</a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {/* 1. what it is, in one sentence, shown */}
        <section aria-labelledby="hero-title" className="mx-auto grid grid-cols-1 max-w-(--container-page) gap-10 px-5 md:px-(--gutter) pt-12 pb-24 lg:grid-cols-12 lg:items-center lg:pt-28">
          <div className="min-w-0 lg:col-span-5 lg:col-start-2">
            <p className="text-sm uppercase tracking-[0.18em] text-dc-fg-muted" data-reveal>Field notebook · e-paper</p>
            <h1 id="hero-title" className="mt-4 font-serif text-(length:--text-display) leading-(--leading-tight) tracking-tight text-balance wrap-anywhere" data-reveal>A notebook that files itself.</h1>
            <p className="mt-5 max-w-[62ch] text-dc-fg-muted" data-reveal>Lumen writes like paper, lasts six weeks on a charge and puts every page in your own folder as text. No account, no feed, no subscription.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4" data-reveal>
              <Button asChild size="lg" className="h-auto min-h-11 w-full text-center sm:w-auto" style={{ borderRadius: 'var(--radius-sm)', whiteSpace: 'normal' }}><a href="#preorder">Pre-order · 249 €</a></Button>
              <a href="#paper" className="text-sm underline underline-offset-4">Read how it works</a>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-6 lg:col-start-7 lg:-mr-(--gutter)">
            <NotebookArt finish={finish} caption={`The Lumen notebook open on a desk, lit from the left, in the ${finishLabel} finish: two cream pages, a few lines of handwriting in ink.`} />
          </div>
        </section>
        {/* 2. idea one: paper */}
        <section id="paper" aria-labelledby="paper-title" className="border-t border-dc-border">
          <div className="mx-auto grid grid-cols-1 max-w-(--container-page) gap-10 px-5 md:px-(--gutter) py-24 lg:grid-cols-12 lg:items-center lg:py-40">
            <figure className="order-first min-w-0 lg:col-span-6 lg:col-start-1 lg:-ml-(--gutter)">
              <svg viewBox="0 0 600 400" className="aspect-[3/2] h-auto w-full" role="img" aria-label="A close view of the pen on the page: the stroke sits in the surface, with a faint shadow under the nib.">
                <rect width="600" height="400" fill="#efe9dc" />
                <rect x="40" y="40" width="520" height="320" fill="#fbf8f1" stroke="#d9d1c0" />
                {Array.from({ length: 9 }, (_, i) => <line key={i} x1="70" x2="530" y1={80 + i * 32} y2={80 + i * 32} stroke="#d3cab7" />)}
                <path d="M80 150 C 140 110, 180 190, 240 150 S 340 110, 400 160 S 480 190, 520 150" fill="none" stroke="#1c4aa8" strokeWidth="4" strokeLinecap="round" />
                <path d="M80 215 C 120 190, 160 240, 220 215 S 300 190, 360 225" fill="none" stroke="#1c4aa8" strokeWidth="4" strokeLinecap="round" />
                <g transform="rotate(-38 420 240)"><rect x="405" y="60" width="30" height="300" rx="6" fill="#2b2b2e" /><polygon points="405,360 435,360 420,392" fill="#8a7f6a" /></g>
                <ellipse cx="418" cy="394" rx="12" ry="3" fill="rgba(0,0,0,0.2)" />
              </svg>
            </figure>
            <div className="min-w-0 lg:col-span-5 lg:col-start-8">
              <h2 id="paper-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">Paper that remembers.</h2>
              <p className="mt-4 max-w-[62ch] text-dc-fg-muted">The surface has the tooth of a good sketchbook and the pen needs no battery. Latency sits under the line you draw, so the hand forgets the screen. Front light in warm steps for the train at night; none at all in daylight.</p>
              <a href="#preorder" className="mt-6 inline-block text-sm font-medium text-dc-accent underline-offset-4 hover:underline">Pre-order</a>
            </div>
          </div>
        </section>
        {/* 3. idea two: archive, the strokes draw as you scroll */}
        <section id="archive" aria-labelledby="archive-title" className="border-t border-dc-border bg-dc-surface">
          <div className="mx-auto grid grid-cols-1 max-w-(--container-page) gap-10 px-5 md:px-(--gutter) py-24 lg:grid-cols-12 lg:items-center lg:py-40">
            <div className="min-w-0 lg:col-span-5 lg:col-start-2">
              <h2 id="archive-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">Every page, filed as text.</h2>
              <p className="mt-4 max-w-[62ch] text-dc-fg-muted">Close the cover and the page is already in your folder: a PDF of the ink and a text file of what it says, dated and searchable. Over your own cloud or a cable. Lumen keeps nothing.</p>
              <p className="mt-4 max-w-[62ch] text-dc-fg-muted">Scroll, and watch a page write itself in the margin.</p>
              <a href="#preorder" className="mt-6 inline-block text-sm font-medium text-dc-accent underline-offset-4 hover:underline">Pre-order</a>
            </div>
            <figure className="min-w-0 lg:col-span-6 lg:col-start-7 lg:-mr-(--gutter)">
              <svg viewBox="0 0 600 400" className="aspect-[3/2] h-auto w-full" role="img" aria-label="A page beside its text file: the handwriting on the left, the same words typed on the right.">
                <rect width="600" height="400" fill="#efe9dc" />
                <rect x="30" y="30" width="260" height="340" fill="#fbf8f1" stroke="#d9d1c0" />
                <g fill="none" stroke="#1c4aa8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path pathLength={1} data-stroke d="M55 90 C 90 70, 120 110, 160 90 S 220 70, 265 95" />
                  <path pathLength={1} data-stroke d="M55 150 C 95 130, 130 170, 175 150 S 240 130, 265 155" />
                  <path pathLength={1} data-stroke d="M55 210 L 140 210 M 55 240 L 230 240 M 55 270 L 180 270" />
                  <path pathLength={1} data-stroke d="M60 330 c 20 -40, 60 -40, 80 0 s 60 40, 80 0 s 30 -30, 45 0" />
                </g>
                <rect x="310" y="30" width="260" height="340" fill="#fbf8f1" stroke="#d9d1c0" />
                <g fontFamily="var(--font-mono, ui-monospace)" fontSize="13" fill="#6b6354">
                  <text x="330" y="70">2026-10-31 · field notes</text>
                  <text x="330" y="100" fill="#1e1d1b">site b, north wall:</text>
                  <text x="330" y="124" fill="#1e1d1b">rising damp to 40 cm</text>
                  <text x="330" y="160" fill="#1e1d1b">— ask about the drain</text>
                  <text x="330" y="196" fill="#1e1d1b">— photos 12 to 19</text>
                  <text x="330" y="240">synced 17:42 · folder/2026/10</text>
                </g>
              </svg>
            </figure>
          </div>
        </section>
        {/* 4. idea three: battery */}
        <section id="battery" aria-labelledby="battery-title" className="border-t border-dc-border">
          <div className="mx-auto grid grid-cols-1 max-w-(--container-page) gap-10 px-5 md:px-(--gutter) py-24 lg:grid-cols-12 lg:items-center lg:py-40">
            <div className="min-w-0 lg:col-span-5 lg:col-start-2">
              <h2 id="battery-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">Weeks, not days.</h2>
              <p className="mt-4 max-w-[62ch] text-dc-fg-muted">E-paper only spends power when the page changes. Write every day and the battery outlasts the month; charge it over USB-C in ninety minutes while you make coffee.</p>
              <a href="#preorder" className="mt-6 inline-block text-sm font-medium text-dc-accent underline-offset-4 hover:underline">Pre-order</a>
            </div>
            <figure className="@container min-w-0 lg:col-span-5 lg:col-start-8">
              <figcaption className="flex items-baseline justify-between text-sm text-dc-fg-muted"><span>Daily notes, one charge</span><span className="tabular-nums">42 days</span></figcaption>
              <div className="mt-2 h-3 w-full bg-dc-border" style={{ borderRadius: 'var(--radius-sm)' }} aria-hidden="true"><div className="h-3 bg-dc-accent" style={{ width: '100%', borderRadius: 'var(--radius-sm)' }} data-battery-fill /></div>
              {/* three figures side by side only when the box is wide enough for the serif figures (24rem, so a phone column and 200% text both stack them); container units follow the text size */}
              <dl className="mt-6 grid grid-cols-1 gap-x-4 gap-y-3 text-sm @sm:grid-cols-3" data-battery-figures>
                <div><dt className="text-dc-fg-muted">A tablet</dt><dd className="font-serif text-(length:--text-xl) tabular-nums">2 days</dd></div>
                <div><dt className="text-dc-fg-muted">An e-reader</dt><dd className="font-serif text-(length:--text-xl) tabular-nums">3 weeks</dd></div>
                <div><dt className="text-dc-fg-muted">Lumen</dt><dd className="font-serif text-(length:--text-xl) tabular-nums">6 weeks</dd></div>
              </dl>
            </figure>
          </div>
        </section>
        {/* 5. specs */}
        <section id="specs" aria-labelledby="specs-title" className="border-t border-dc-border bg-dc-surface">
          <div className="mx-auto max-w-(--container-page) px-5 md:px-(--gutter) py-24 lg:py-40">
            <div className="lg:grid lg:grid-cols-12">
              <div className="lg:col-span-10 lg:col-start-2">
                <h2 id="specs-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">The whole sheet.</h2>
                <table className="mt-8 w-full border-t border-dc-border text-left">
                  <caption className="sr-only">Technical specifications of the Lumen notebook</caption>
                  {/* key and value stack on a phone and sit side by side from sm */}
                  <tbody className="block sm:table-row-group">{SPECS.map(([k, v]) => <tr key={k} className="block border-b border-dc-border align-top sm:table-row"><th scope="row" className="block pt-3 pr-4 text-left font-medium sm:table-cell sm:w-40 sm:py-3">{k}</th><td className="block pb-3 text-dc-fg-muted sm:table-cell sm:py-3">{v}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
        {/* 6. the action */}
        <section id="preorder" aria-labelledby="preorder-title" className="border-t border-dc-border" tabIndex={-1}>
          <div className="mx-auto grid grid-cols-1 max-w-(--container-page) gap-10 px-5 md:px-(--gutter) py-24 lg:grid-cols-12 lg:py-40">
            <div className="min-w-0 lg:col-span-5 lg:col-start-2">
              <h2 id="preorder-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">Reserve one.</h2>
              <p className="mt-4 max-w-[62ch] text-dc-fg-muted">249 €, three finishes, a place in the first batch. Pick a finish and the notebook above changes with it.</p>
              <p className="mt-2 text-sm text-dc-fg-muted">Lumen is a fictional product built as a reference page; the form stores nothing.</p>
            </div>
            <div className="min-w-0 lg:col-span-5 lg:col-start-7"><PreorderForm finish={finish} onFinish={setFinish} /></div>
          </div>
        </section>
        {/* 7. questions */}
        <section id="faq" aria-labelledby="faq-title" className="border-t border-dc-border bg-dc-surface">
          <div className="mx-auto max-w-(--container-page) px-5 md:px-(--gutter) py-24 lg:py-40">
            <div className="lg:grid lg:grid-cols-12">
              <div className="lg:col-span-7 lg:col-start-2">
                <h2 id="faq-title" className="font-serif text-(length:--text-3xl) leading-(--leading-tight) tracking-tight wrap-anywhere">Questions, answered.</h2>
                <div className="mt-6 divide-y divide-dc-border border-y border-dc-border">
                  {FAQ.map(([q, a]) => <details key={q} className="group py-4" data-faq><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden"><span>{q}</span><span aria-hidden="true" className="text-dc-fg-muted transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-[62ch] text-dc-fg-muted">{a}</p></details>)}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-dc-border">
        <div className="mx-auto flex max-w-(--container-page) flex-wrap items-baseline justify-between gap-4 px-5 md:px-(--gutter) py-8 text-sm text-dc-fg-muted">
          <p><span className="font-serif text-dc-fg">Lumen</span> · a reference launch page from the lumen-notebook design contract.</p>
          <nav aria-label="More" className="flex flex-wrap gap-x-4 gap-y-1"><Link href="/design" className="underline-offset-4 hover:underline">Design contract</Link><Link href="/" className="underline-offset-4 hover:underline">Verification home</Link></nav>
        </div>
      </footer>
      {/* the pre-order bar on phones: the action in every section without shouting; the action drops under the price when
          the bar is narrower than the two of them (container units follow the text size), so the price is never the part cut */}
      <div className={`@container fixed inset-x-0 bottom-0 z-30 border-t border-dc-border bg-dc-canvas/95 px-5 md:px-(--gutter) py-3 backdrop-blur md:hidden${formInView ? ' hidden' : ''}`} role="region" aria-label="Pre-order" data-preorder-bar data-bar-hidden={formInView || undefined}>
        <div className="grid grid-cols-1 items-center gap-3 @[17rem]:grid-cols-[minmax(0,1fr)_auto] @[17rem]:gap-4">
          <span className="min-w-0 truncate text-sm"><span className="tabular-nums">249 €</span><span className="font-serif"> · Lumen</span></span>
          <Button asChild size="lg" className="h-auto min-h-11 whitespace-normal" style={{ borderRadius: 'var(--radius-sm)' }}><a href="#preorder">Pre-order</a></Button>
        </div>
      </div>
    </div>
  )
}
