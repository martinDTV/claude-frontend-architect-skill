// Colour arithmetic for the design-contract tool: sRGB parsing, WCAG 2.x contrast, OKLab/OKLCH conversions
// (Björn Ottosson's matrices) and perceptual ramps kept inside the sRGB gamut. Pure functions, no dependencies.

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` → { r, g, b, a } in 0–255 / 0–1; null when unparsable. */
export function parseColor(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  let m = s.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: clamp01(a) }
  }
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  return null
}

export function toHex({ r, g, b }) {
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

const srgbToLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const linearToSrgb = (v) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return c * 255 }

/** WCAG relative luminance of an sRGB colour. */
export function luminance({ r, g, b }) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** WCAG contrast ratio of two colours (alpha ignored: composite first). */
export function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Source-over of a translucent colour on an opaque one, in sRGB space (what CSS does). */
export function over(fg, bg) {
  const a = fg.a ?? 1
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

/** sRGB (0–255) → OKLab { L, a, b }. */
export function toOklab({ r, g, b }) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

/** OKLab → sRGB (0–255, unclamped: check `inGamut` first). */
export function fromOklab({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: 1,
  }
}

export function toOklch(rgb) {
  const { L, a, b } = toOklab(rgb)
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }
}

export function fromOklch({ L, C, h }) {
  const rad = (h * Math.PI) / 180
  return fromOklab({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) })
}

export const inGamut = ({ r, g, b }) => [r, g, b].every((v) => v >= -0.5 && v <= 255.5)

/** The largest chroma at this lightness and hue that stays inside sRGB (binary search). */
export function maxChroma(L, h, upper = 0.4) {
  let lo = 0
  let hi = upper
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(fromOklch({ L, C: mid, h }))) lo = mid
    else hi = mid
  }
  return lo
}

/** Lightness targets of an eleven-step ramp (OKLab L), 50 lightest to 950 darkest. */
export const RAMP_STEPS = { 50: 0.975, 100: 0.945, 200: 0.89, 300: 0.815, 400: 0.73, 500: 0.645, 600: 0.56, 700: 0.475, 800: 0.395, 900: 0.31, 950: 0.235 }

/**
 * A perceptual ramp from one seed: the seed's hue throughout, chroma shaped by a bell that peaks near the middle and
 * is clamped to the gamut at every step, lightness from RAMP_STEPS. `chromaScale` 1 keeps the seed's chroma at the
 * peak; neutrals pass 0.08–0.15 for a tinted grey. Returns { step: hex }.
 */
export function ramp(seedHex, { chromaScale = 1, hueShift = 0 } = {}) {
  const seed = parseColor(seedHex)
  if (!seed) throw new Error(`ramp: unparsable seed ${seedHex}`)
  const { C, h } = toOklch(seed)
  const peak = Math.min(C * chromaScale, 0.37)
  const out = {}
  for (const [step, L] of Object.entries(RAMP_STEPS)) {
    // a bell on lightness: full chroma around L 0.6, less at both ends (very light and very dark colours cannot
    // hold chroma inside sRGB, and a tinted neutral should not turn saturated at the ends)
    const bell = Math.exp(-((L - 0.6) ** 2) / (2 * 0.2 ** 2))
    const wanted = peak * (0.35 + 0.65 * bell)
    const c = Math.min(wanted, maxChroma(L, h + hueShift))
    out[step] = toHex(fromOklch({ L, C: c, h: h + hueShift }))
  }
  return out
}

/** The ramp step of a colour (by nearest OKLab lightness), for reports. */
export function nearestStep(hex) {
  const { L } = toOklab(parseColor(hex))
  let best = null
  for (const [step, target] of Object.entries(RAMP_STEPS)) if (best === null || Math.abs(target - L) < Math.abs(RAMP_STEPS[best] - L)) best = step
  return Number(best)
}

/** WCAG 2.x threshold for a text role: 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold) and non-text. */
export function requiredRatio(kind = 'text', { fontSizePx = 16, fontWeight = 400 } = {}) {
  if (kind === 'non-text') return 3
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5
}
