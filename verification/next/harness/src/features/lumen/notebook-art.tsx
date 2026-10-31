// The product, drawn: an e-paper field notebook as inline SVG inside a fixed 4:3 box (no image request, no layout
// shift; R6). The cover is an HTML layer so the opening is a real 3D rotation; the pages carry a faint rule and the
// ink strokes that draw along the scroll in the archive section. The finish changes the cover through one variable.
export const FINISHES = [
  { id: 'graphite', label: 'Graphite', hex: '#2b2b2e', ink: '#f2efe6' },
  { id: 'bone', label: 'Bone', hex: '#e8e1d2', ink: '#2b2b2e' },
  { id: 'moss', label: 'Moss', hex: '#4b5a46', ink: '#f2efe6' },
] as const
export type FinishId = (typeof FINISHES)[number]['id']

export function NotebookArt({ finish, caption }: { finish: FinishId; caption: string }) {
  const f = FINISHES.find((x) => x.id === finish) ?? FINISHES[0]
  return (
    <figure className="lumen-art relative aspect-[4/3] w-full select-none" style={{ perspective: '1600px' }} data-art data-finish={finish}>
      <svg viewBox="0 0 800 600" className="absolute inset-0 h-full w-full" role="img" aria-label={caption}>
        <defs>
          <linearGradient id="lumen-paper" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#fbf8f1" /><stop offset="1" stopColor="#efe9dc" /></linearGradient>
          <linearGradient id="lumen-shade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="rgba(0,0,0,0.18)" /><stop offset="0.18" stopColor="rgba(0,0,0,0)" /></linearGradient>
        </defs>
        {/* the desk, lit from the left */}
        <rect width="800" height="600" fill="transparent" />
        <ellipse cx="420" cy="470" rx="330" ry="40" fill="rgba(40,30,20,0.12)" />
        {/* left page */}
        <g transform="skewY(-3)">
          <rect x="90" y="140" width="310" height="380" rx="6" fill="url(#lumen-paper)" stroke="#d9d1c0" />
          {Array.from({ length: 11 }, (_, i) => <line key={i} x1="120" x2="370" y1={190 + i * 30} y2={190 + i * 30} stroke="#d3cab7" strokeWidth="1" />)}
          <text x="120" y="176" fontFamily="var(--font-serif)" fontSize="15" fill="#6b6354">Field notes · 31 Oct</text>
        </g>
        {/* right page with the strokes that draw themselves */}
        <g transform="skewY(-3)">
          <rect x="400" y="140" width="310" height="380" rx="6" fill="url(#lumen-paper)" stroke="#d9d1c0" />
          <rect x="400" y="140" width="310" height="380" rx="6" fill="url(#lumen-shade)" />
          {Array.from({ length: 11 }, (_, i) => <line key={i} x1="430" x2="680" y1={190 + i * 30} y2={190 + i * 30} stroke="#d3cab7" strokeWidth="1" />)}
          <g className="lumen-ink" fill="none" stroke="#1c4aa8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path pathLength={1} data-stroke d="M435 200 C 470 180, 500 230, 540 205 S 600 180, 660 215" />
            <path pathLength={1} data-stroke d="M435 262 C 480 240, 520 290, 560 262 S 640 240, 675 272" />
            <path pathLength={1} data-stroke d="M440 330 L 520 330 M 440 360 L 600 360 M 440 390 L 560 390" />
            <path pathLength={1} data-stroke d="M450 450 c 20 -40, 60 -40, 80 0 s 60 40, 80 0 s 40 -30, 60 0" />
          </g>
        </g>
        {/* the spine */}
        <rect x="396" y="128" width="8" height="396" rx="3" fill="#8a7f6a" transform="skewY(-3)" />
      </svg>
      {/* the cover: closed over the right page, it opens to the left on load (480 ms, once); reduced motion shows it open */}
      <div className="lumen-cover absolute" style={{ left: '50%', top: '18%', width: '39%', height: '66%', transformOrigin: 'left center', transformStyle: 'preserve-3d', borderRadius: 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-sm)', boxShadow: 'var(--shadow-dialog)' }} data-cover aria-hidden="true">
        {/* two faces: the printed front disappears past 90° (backface hidden) and the plain inside of the cover shows instead of mirrored type */}
        <div className="absolute inset-0 flex flex-col justify-between p-[6%] font-serif" style={{ background: f.hex, color: f.ink, borderRadius: 'inherit', backfaceVisibility: 'hidden' }}>
          <span className="text-[clamp(0.8rem,1.6vw,1.1rem)] tracking-[0.18em] uppercase opacity-80">Lumen</span>
          <span className="text-[clamp(0.6rem,1.2vw,0.85rem)] opacity-70">e-paper · 6.8″ · {f.label}</span>
        </div>
        <div className="absolute inset-0" style={{ background: f.hex, borderRadius: 'inherit', transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', filter: 'brightness(0.92)' }} />
      </div>
    </figure>
  )
}
