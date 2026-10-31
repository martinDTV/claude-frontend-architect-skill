/**
 * Legibility of text over a WebGL canvas, graded the way WCAG 2.2 grades it instead of with one threshold for everything.
 *
 * Three ways to arrive at a contrast ratio, kept apart in every result:
 *   - `css`: the element sits on an opaque background chain, so text and background colours come from computed styles
 *     and the ratio is exact (SC 1.4.3 as a tool like axe would compute it).
 *   - `bound`: the chain is translucent (a scrim over the canvas). The ratio is the minimum over every possible background
 *     colour under the scrim (the eight corners of the sRGB cube are the extremes of each channel, and the composite is
 *     monotonic per channel), so a passing bound holds whatever the canvas draws. Computed from CSS alone.
 *   - `estimate`: the bound fails or cannot be computed, so the text is hidden, the frame is captured, and the text colour
 *     is contrasted against the pixels where it would be drawn. A measurement of one frame, not a guarantee.
 *
 * Required ratios: 4.5:1 for text, 3:1 for large text (at least 24 px, or 18.66 px bold) and for the non-text parts the
 * check looks at (focus indicators, SC 1.4.11). Text shadows are not counted: WCAG allows a halo to serve as the
 * background only when it is wide enough to surround the glyphs, and a 1 px drop shadow is not.
 *
 * Transitional states (an ancestor with opacity below 1 during a cross-fade) are recorded, not graded; the check that
 * calls this decides what to do with them (here: no interactive control may be transitional).
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** Parses rgb()/rgba()/#hex/transparent/named basics into { r, g, b, a } (0–255, alpha 0–1). */
export function parseColor(css) {
  if (!css) return null
  const s = String(css).trim().toLowerCase()
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 }
  let m = s.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: clamp01(a) }
  }
  m = s.match(/^#([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    const n = (i) => parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  // computed styles come back in oklab()/oklch() when the stylesheet authored them that way (Tailwind v4 palettes,
  // Nuxt UI and shadcn variables): convert to sRGB so the ring and text maths stay in one space
  m = s.match(/^okl(ab|ch)\(\s*([\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/)
  if (m) {
    const L = m[2].endsWith('%') ? Number(m[2].slice(0, -1)) / 100 : Number(m[2])
    const alpha = m[5] === undefined ? 1 : m[5].endsWith('%') ? Number(m[5].slice(0, -1)) / 100 : Number(m[5])
    let a = Number(m[3]), b = Number(m[4])
    if (m[1] === 'ch') { const C = a, h = (b * Math.PI) / 180; a = C * Math.cos(h); b = C * Math.sin(h) }
    const rgb = oklabToSrgb(L, a, b)
    return { ...rgb, a: clamp01(alpha) }
  }
  m = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/)
  if (m) return { r: Number(m[1]) * 255, g: Number(m[2]) * 255, b: Number(m[3]) * 255, a: m[4] === undefined ? 1 : clamp01(Number(m[4])) }
  return null
}

/** OKLab → sRGB 0–255 (clamped), Björn Ottosson's matrices. */
function oklabToSrgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  const gamma = (v) => { const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; return Math.min(255, Math.max(0, c * 255)) }
  return { r: gamma(lin[0]), g: gamma(lin[1]), b: gamma(lin[2]) }
}

/** Colour stops of a CSS gradient image (`linear-gradient(90deg, rgba(...), rgba(...))`); [] when it is not a gradient. */
export function parseGradientStops(image) {
  if (!image || image === 'none') return []
  const s = String(image)
  if (!/gradient\(/.test(s)) return []
  const stops = []
  const re = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b|\b(?:white|black|transparent)\b/g
  let m
  while ((m = re.exec(s))) {
    const c = parseColor(m[0])
    if (c) stops.push(c)
  }
  return stops
}

/** Relative luminance of an sRGB colour (WCAG 2.x definition). */
export function luminance({ r, g, b }) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast ratio of two luminances, always >= 1. */
export function contrast(l1, l2) {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/** Source-over of a translucent colour on an opaque one, per channel in sRGB space (how CSS composites). */
export function over(fg, bg) {
  const a = fg.a ?? 1
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }
}

/**
 * Composites a background chain over a base colour. `layers` run from the element outward (its own background first);
 * a layer is { color: rgba, image?: stops[] }: a gradient contributes its least opaque stop (the worst case for text).
 */
export function compositeStack(layers, base) {
  let result = { ...base, a: 1 }
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = effectiveLayer(layers[i])
    if (layer && layer.a > 0) result = over(layer, result)
  }
  return result
}

/** The colour a layer contributes: its background colour, or the least opaque stop of its gradient when it has one. */
export function effectiveLayer(layer) {
  if (!layer) return null
  const stops = Array.isArray(layer.image) ? layer.image : parseGradientStops(layer.image)
  const color = typeof layer.color === 'string' ? parseColor(layer.color) : layer.color
  if (stops.length) {
    const weakest = stops.reduce((w, s) => (s.a < w.a ? s : w), stops[0])
    // a gradient paints over the background colour of the same box: source-over of two translucent colours
    return color && color.a > 0 ? overTranslucent(weakest, color) : weakest
  }
  return color
}

/** Source-over of two translucent colours (top over bottom), alpha included. */
export function overTranslucent(top, bottom) {
  const a1 = top.a ?? 1
  const a2 = bottom.a ?? 1
  const a = a1 + a2 * (1 - a1)
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
  const mix = (c1, c2) => (c1 * a1 + c2 * a2 * (1 - a1)) / a
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a }
}

/** True when some layer is opaque: the background under the text is known from CSS alone. */
export function hasOpaqueLayer(layers) {
  return layers.some((l) => { const e = effectiveLayer(l); return e && e.a >= 0.999 })
}

/** WCAG large text: 24 px (18 pt) or more, or 18.66 px (14 pt) or more and bold. */
export function isLargeText(fontSizePx, fontWeight) {
  const weight = typeof fontWeight === 'string' ? (fontWeight === 'bold' ? 700 : Number(fontWeight) || 400) : fontWeight
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && weight >= 700)
}

/** Required ratio: text 4.5:1, large text 3:1 (SC 1.4.3); non-text such as a focus indicator 3:1 (SC 1.4.11). */
export function requiredRatio({ kind = 'text', fontSizePx = 16, fontWeight = 400 }) {
  if (kind === 'non-text') return 3
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5
}

const CORNERS = [
  { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 }, { r: 255, g: 255, b: 0 }, { r: 0, g: 255, b: 255 }, { r: 255, g: 0, b: 255 },
]

/** Contrast of a text colour on a background chain over one base colour (text alpha composited over the result). */
export function contrastOn(text, layers, base) {
  const bg = compositeStack(layers, base)
  const fg = over(text, bg)
  return contrast(luminance(fg), luminance(bg))
}

/** The minimum contrast over every possible colour under the chain: what the CSS alone guarantees. */
export function guaranteedContrast(text, layers) {
  let worst = { ratio: Infinity, base: null }
  for (const base of CORNERS) {
    const ratio = contrastOn(text, layers, base)
    if (ratio < worst.ratio) worst = { ratio, base }
  }
  return { ratio: Number(worst.ratio.toFixed(2)), base: worst.base }
}

/**
 * Contrast of a text colour against captured background pixels (RGBA, the text hidden when the frame was taken):
 * the minimum and the 5th percentile over the pixels, so one stray highlight does not decide alone but the frame's
 * difficult area still counts.
 */
export function estimateFromPixels(text, pixels, { stride = 4 } = {}) {
  const ratios = []
  for (let i = 0; i + 3 < pixels.length; i += 4 * stride) {
    const bg = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
    const fg = over(text, bg)
    ratios.push(contrast(luminance(fg), luminance(bg)))
  }
  if (ratios.length < 4) return null
  ratios.sort((a, b) => a - b)
  const at = (q) => ratios[Math.min(ratios.length - 1, Math.floor(q * ratios.length))]
  return { min: Number(ratios[0].toFixed(2)), p05: Number(at(0.05).toFixed(2)), p50: Number(at(0.5).toFixed(2)), samples: ratios.length }
}

/** Colours of a computed box-shadow list, in paint order (the first is on top). */
export function parseShadowColors(boxShadow) {
  if (!boxShadow || boxShadow === 'none') return []
  const out = []
  const re = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g
  let m
  while ((m = re.exec(String(boxShadow)))) { const c = parseColor(m[0]); if (c) out.push(c) }
  return out
}

/** Crops the RGBA pixels of a decoded PNG to a rectangle (clipped to the image). */
export function cropPixels(image, rect) {
  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const x1 = Math.min(image.width, Math.round(rect.x + rect.width))
  const y1 = Math.min(image.height, Math.round(rect.y + rect.height))
  const out = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * image.width + x) * 4; out.push(image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], image.pixels[i + 3]) }
  return out
}

/**
 * Grades one text record (as collected in the page) with the strongest method available:
 *   css when the chain is opaque; bound when it passes from CSS alone; estimate from pixels otherwise.
 * `pixels` are the captured background under the text (text hidden) or null.
 */
export function evaluateText(record, pixels = null) {
  const text = typeof record.color === 'string' ? parseColor(record.color) : record.color
  const layers = (record.stack ?? []).map((l) => ({ color: typeof l.color === 'string' ? parseColor(l.color) : l.color, image: l.image }))
  const required = requiredRatio({ kind: record.kind ?? 'text', fontSizePx: record.fontSize, fontWeight: record.fontWeight })
  const large = isLargeText(record.fontSize ?? 16, record.fontWeight ?? 400)
  const transitional = (record.opacity ?? 1) < 0.99
  const base = { required, large, transitional, text: record.text, selector: record.selector, fontSize: record.fontSize, fontWeight: record.fontWeight, interactive: Boolean(record.interactive) }
  if (!text) return { ...base, method: 'css', ratio: null, passes: false, note: 'unparsed colour' }
  // what one captured frame showed under the text, reported next to the proof whichever method proves it
  const observed = pixels ? estimateFromPixels(text, pixels) : null
  if (hasOpaqueLayer(layers)) {
    const ratio = Number(contrastOn(text, layers, { r: 255, g: 255, b: 255 }).toFixed(2))
    return { ...base, method: 'css', ratio, passes: ratio >= required, observed }
  }
  const bound = guaranteedContrast(text, layers)
  if (bound.ratio >= required) return { ...base, method: 'bound', ratio: bound.ratio, passes: true, worstBackground: bound.base, observed }
  if (observed) return { ...base, method: 'estimate', ratio: observed.p05, min: observed.min, p50: observed.p50, samples: observed.samples, bound: bound.ratio, passes: observed.p05 >= required, observed }
  return { ...base, method: 'bound', ratio: bound.ratio, passes: false, worstBackground: bound.base, note: 'translucent chain, no capture' }
}

/**
 * Focus indicator against its neighbours (SC 1.4.11 for author-styled indicators; a user-agent `auto` ring is exempt
 * and reported as such). Inside: the control's own background; outside: the chain behind the control.
 */
export function evaluateFocusIndicator(record) {
  // a double inset ring (a light line next to a dark band) carries its own adjacent colour: the two are graded
  // against each other, so the ring reads over any canvas
  const shadows = parseShadowColors(record.ringShadow)
  if (shadows.length >= 2) {
    const [line, band] = shadows
    const ratio = Number(guaranteedContrast(line, [{ color: band, image: null }]).ratio.toFixed(2))
    return { method: band.a >= 0.999 ? 'css' : 'bound', indicator: 'author-double-ring', ratio, passes: ratio >= 3, line: record.ringShadow }
  }
  const o = record.outline ?? {}
  const width = parseFloat(o.width) || 0
  if (!o.style || o.style === 'none' || width < 1) {
    if (record.boxShadow && record.boxShadow !== 'none') return { method: 'css', indicator: 'box-shadow', ratio: null, passes: true, note: 'box-shadow indicator, not measured' }
    return { method: 'css', indicator: 'none', ratio: null, passes: false, note: 'no visible focus indicator' }
  }
  if (o.style === 'auto') return { method: 'css', indicator: 'user-agent', ratio: null, passes: true, note: 'user-agent focus ring, exempt from 1.4.11' }
  const color = parseColor(o.color)
  if (!color) return { method: 'css', indicator: 'author', ratio: null, passes: false, note: 'unparsed outline colour' }
  const layers = (record.stack ?? []).map((l) => ({ color: typeof l.color === 'string' ? parseColor(l.color) : l.color, image: l.image }))
  const own = layers.slice(0, 1)
  const outside = layers.slice(1)
  const inside = hasOpaqueLayer(own) ? contrastOn(color, own, { r: 255, g: 255, b: 255 }) : guaranteedContrast(color, own).ratio
  const out = hasOpaqueLayer(outside) ? contrastOn(color, outside, { r: 255, g: 255, b: 255 }) : guaranteedContrast(color, outside).ratio
  const ratio = Number(Math.max(inside, out).toFixed(2)) // the indicator needs 3:1 against the adjacent colour on at least one side to be perceivable; both sides reported
  return { method: hasOpaqueLayer(layers) ? 'css' : 'bound', indicator: 'author', width, color: o.color, inside: Number(inside.toFixed(2)), outside: Number(out.toFixed(2)), ratio, passes: ratio >= 3 }
}

/**
 * Runs in the browser (Playwright serialises the function): every visible element with its own text under `rootSelector`,
 * with the computed colours, size, weight, the background chain up to the root, the effective opacity and the focus
 * styles. Pure data out; the grading happens in Node. Self-contained on purpose: no closure over this module.
 */
export function collectTextRecords(rootSelector) {
  const root = document.querySelector(rootSelector) || document.body
  const records = []
  const path = (el) => {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 6) {
      let p = node.tagName.toLowerCase()
      const data = [...node.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-active')
      if (node.id) p += `#${node.id}`
      else if (data) p += `[${data.name}${data.value ? `="${data.value}"` : ''}]`
      parts.unshift(p)
      node = node.parentElement
    }
    return parts.join(' > ')
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  const active = document.activeElement
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (!(el instanceof HTMLElement)) continue
    const tag = el.tagName.toLowerCase()
    if (['script', 'style', 'noscript', 'canvas', 'svg'].includes(tag)) continue
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
    const control = tag === 'select' || tag === 'input'
    // the focused element is recorded even without text (a focusable stage named by aria-label): its ring is graded
    const focusedHere = el === active
    if (!ownText && !control && !focusedHere) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue
    let opacity = 1
    const stack = []
    let hiddenByAncestor = false
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = node === el ? cs : getComputedStyle(node)
      if (s.display === 'none' || s.visibility === 'hidden') hiddenByAncestor = true
      const o = parseFloat(s.opacity)
      opacity *= Number.isFinite(o) ? o : 1 // opacity 0 is 0, not "missing"
      stack.push({ color: s.backgroundColor, image: s.backgroundImage === 'none' ? null : s.backgroundImage, tag: node.tagName.toLowerCase() })
    }
    if (hiddenByAncestor) continue
    // fully transparent (an inactive caption waiting for its chapter) is not rendered: no text to grade
    if (opacity <= 0.01) continue
    // what is painted under the element: a canvas, image or video below it keeps the chain unknown; otherwise the
    // page's root is the last layer (html, else body, else the browser's white canvas), and it is opaque
    const below = document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const overMedia = below.some((e) => /^(canvas|img|video)$/i.test(e.tagName) && !el.contains(e))
    if (!overMedia) {
      const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return c === 'transparent' ? 0 : 1; const parts = m[1].split(/[\s,/]+/).filter(Boolean); return parts.length === 4 ? parseFloat(parts[3]) : 1 }
      const htmlBg = getComputedStyle(document.documentElement).backgroundColor
      const bodyBg = getComputedStyle(document.body).backgroundColor
      stack.push({ color: alpha(htmlBg) > 0 ? htmlBg : alpha(bodyBg) > 0 ? bodyBg : 'rgb(255, 255, 255)', image: null, tag: 'root', root: true })
    }
    const text = control ? (el.value || el.getAttribute('aria-label') || '') : (el.textContent || '').trim()
    const interactive = ['a', 'button', 'select', 'input', 'textarea', 'summary'].includes(tag) || el.tabIndex >= 0 || el.getAttribute('role') === 'button'
    records.push({
      tag,
      text: text.replace(/\s+/g, ' ').slice(0, 60),
      selector: path(el),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      color: cs.color,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight === 'bold' ? 700 : Number(cs.fontWeight) || 400,
      opacity: Number(opacity.toFixed(3)),
      stack,
      overMedia,
      interactive,
      focused: focusedHere,
      outline: { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor },
      boxShadow: cs.boxShadow,
      // a focusable larger than the viewport paints its ring inside the sticky stage: the host carries data-focus-ring
      ringShadow: (() => { const host = el.matches('[data-focus-ring]') ? el : el.querySelector('[data-focus-ring]'); if (!host) return null; const after = getComputedStyle(host, '::after'); return after.content !== 'none' && after.boxShadow !== 'none' ? after.boxShadow : null })(),
      textShadow: cs.textShadow,
    })
  }
  return records
}

/** Runs in the browser: hides the text of the given selectors (keeps the boxes) so a capture shows what sits under it. */
export function hideTextIn({ selectors = [], on = true } = {}) {
  const id = 'fa-legibility-hide'
  let style = document.getElementById(id)
  if (!on) { style?.remove(); document.querySelectorAll('[data-fa-hidden-text]').forEach((e) => e.removeAttribute('data-fa-hidden-text')); return 0 }
  if (!style) { style = document.createElement('style'); style.id = id; style.textContent = '[data-fa-hidden-text], [data-fa-hidden-text] * { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }'; document.head.appendChild(style) }
  let n = 0
  for (const sel of selectors) for (const el of document.querySelectorAll(sel)) { el.setAttribute('data-fa-hidden-text', ''); n++ }
  return n
}
