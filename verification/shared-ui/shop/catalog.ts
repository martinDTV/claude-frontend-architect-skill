/**
 * Ember & Ash, the specialist ceramics shop of the ember-store contract: a deterministic catalogue of a few hundred
 * pieces by named makers, each in small runs with glaze and size variants and real stock limits. Pure data and pure
 * functions, shared by the Nuxt shop (and any other host) and unit-tested in Node; no framework imports.
 */
import { seeded } from '../saas/data'

export type Availability = 'in-stock' | 'last-few' | 'sold-out' | 'made-to-order'
export interface Maker { id: string; name: string; studio: string; bio: string }
export interface Glaze { id: string; name: string; hex: string; dark: boolean }
export interface Variant { id: string; glazeId: string; size: 'S' | 'M' | 'L'; priceCents: number; stock: number; madeToOrder: boolean }
export interface Piece { id: string; slug: string; name: string; makerId: string; form: Form; description: string; variants: Variant[]; care: string; dimensions: Record<'S' | 'M' | 'L', string> }
export type Form = 'bowl' | 'mug' | 'plate' | 'vase' | 'jug' | 'cup'
export const FORMS: Form[] = ['bowl', 'mug', 'plate', 'vase', 'jug', 'cup']
export const FORM_LABEL: Record<Form, string> = { bowl: 'Bowls', mug: 'Mugs', plate: 'Plates', vase: 'Vases', jug: 'Jugs', cup: 'Cups' }
export const SIZES = ['S', 'M', 'L'] as const

export const MAKERS: Maker[] = [
  { id: 'okada', name: 'Hana Okada', studio: 'Okada Studio, Kyoto', bio: 'Wood-fired stoneware, ash glazes gathered from the kiln itself.' },
  { id: 'alcaraz', name: 'Teo Alcaraz', studio: 'Taller Alcaraz, Granada', bio: 'Red clay from the Vega, tin glazes in the Andalusian tradition.' },
  { id: 'bergstrom', name: 'Maja Bergström', studio: 'Bergström Keramik, Gotland', bio: 'Thin porcelain, matte glazes the colour of the Baltic in winter.' },
  { id: 'nwosu', name: 'Ada Nwosu', studio: 'Nwosu Pottery, Bristol', bio: 'Thrown tableware for restaurants, built to be stacked and dropped.' },
  { id: 'ferreira', name: 'Rui Ferreira', studio: 'Olaria Ferreira, Porto', bio: 'Slipware with trailed decoration, one brush, one pass.' },
  { id: 'lindqvist', name: 'Elin Lindqvist', studio: 'Lindqvist, Malmö', bio: 'Salt-glazed jugs and vases, each run of twelve.' },
]
export const GLAZES: Glaze[] = [
  { id: 'ash', name: 'Ash', hex: '#a9a393', dark: false },
  { id: 'tenmoku', name: 'Tenmoku', hex: '#3b2a22', dark: true },
  { id: 'celadon', name: 'Celadon', hex: '#9db8a8', dark: false },
  { id: 'shino', name: 'Shino', hex: '#e2c9a8', dark: false },
  { id: 'oxblood', name: 'Oxblood', hex: '#7a2a28', dark: true },
  { id: 'salt', name: 'Salt', hex: '#c9b8a2', dark: false },
  { id: 'indigo', name: 'Indigo', hex: '#2f3f5e', dark: true },
  { id: 'chalk', name: 'Chalk', hex: '#efe9df', dark: false },
]
const NAMES: Record<Form, string[]> = {
  bowl: ['Morning bowl', 'Serving bowl', 'Rice bowl', 'Noodle bowl', 'Mixing bowl'],
  mug: ['Studio mug', 'Tall mug', 'Camp mug', 'Espresso mug'],
  plate: ['Dinner plate', 'Side plate', 'Platter', 'Bread plate'],
  vase: ['Bud vase', 'Bottle vase', 'Moon jar', 'Tall vase'],
  jug: ['Milk jug', 'Water jug', 'Cream jug'],
  cup: ['Tea cup', 'Yunomi', 'Tumbler'],
}
const DIMENSIONS: Record<Form, Record<'S' | 'M' | 'L', string>> = {
  bowl: { S: '12 cm · 350 ml', M: '16 cm · 700 ml', L: '22 cm · 1.6 l' },
  mug: { S: '250 ml', M: '330 ml', L: '420 ml' },
  plate: { S: '18 cm', M: '24 cm', L: '30 cm' },
  vase: { S: '14 cm tall', M: '22 cm tall', L: '32 cm tall' },
  jug: { S: '200 ml', M: '600 ml', L: '1.2 l' },
  cup: { S: '120 ml', M: '180 ml', L: '260 ml' },
}
const BASE_PRICE: Record<Form, number> = { bowl: 3800, mug: 3200, plate: 3400, vase: 6800, jug: 5200, cup: 2600 }

export function generateCatalog(seed = 23, count = 240): Piece[] {
  const rnd = seeded(seed)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!
  // a Fisher-Yates shuffle driven by the seeded generator: a random comparator in sort() is implementation-defined and
  // made the server and the browser disagree (the hydration check caught it)
  const shuffle = <T,>(arr: readonly T[]): T[] => { const out = [...arr]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!] } return out }
  const pieces: Piece[] = []
  for (let i = 0; i < count; i++) {
    const form = pick(FORMS)
    const maker = pick(MAKERS)
    const name = pick(NAMES[form])
    const glazeCount = 1 + Math.floor(rnd() * 3)
    const glazes = shuffle(GLAZES).slice(0, glazeCount)
    const sizes = SIZES.filter(() => rnd() > 0.35)
    const variants: Variant[] = []
    for (const g of glazes) for (const size of sizes.length ? sizes : ['M' as const]) {
      const r = rnd()
      const stock = r < 0.12 ? 0 : r < 0.3 ? 1 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 20)
      const madeToOrder = stock === 0 && rnd() < 0.5
      const sizeFactor = size === 'S' ? 0.8 : size === 'L' ? 1.4 : 1
      const makerFactor = maker.id === 'bergstrom' ? 1.5 : maker.id === 'okada' ? 1.3 : 1
      variants.push({ id: `${g.id}-${size}`, glazeId: g.id, size, priceCents: Math.round((BASE_PRICE[form] * sizeFactor * makerFactor) / 100) * 100, stock, madeToOrder })
    }
    const id = `p-${String(i + 1).padStart(3, '0')}`
    pieces.push({ id, slug: `${id}-${name.toLowerCase().replace(/\s+/g, '-')}`, name, makerId: maker.id, form, description: `${name} by ${maker.name}. ${maker.bio} Each piece is thrown by hand, so sizes vary by a few millimetres.`, variants, care: 'Dishwasher safe on a gentle cycle; avoid thermal shock.', dimensions: DIMENSIONS[form] })
  }
  return pieces
}
export const CATALOG: Piece[] = generateCatalog()

export const makerOf = (p: Piece): Maker => MAKERS.find((m) => m.id === p.makerId)!
export const glazeOf = (v: Variant): Glaze => GLAZES.find((g) => g.id === v.glazeId)!

export function availability(v: Variant): Availability {
  if (v.stock >= 4) return 'in-stock'
  if (v.stock > 0) return 'last-few'
  return v.madeToOrder ? 'made-to-order' : 'sold-out'
}
export const AVAILABILITY_LABEL: Record<Availability, string> = { 'in-stock': 'In stock', 'last-few': 'Last few', 'sold-out': 'Sold out', 'made-to-order': 'Made to order' }
export const AVAILABILITY_GLYPH: Record<Availability, string> = { 'in-stock': '●', 'last-few': '◐', 'sold-out': '○', 'made-to-order': '◇' }
export const canBuy = (v: Variant): boolean => v.stock > 0 || v.madeToOrder

/** The piece's availability is its best variant's. */
export function pieceAvailability(p: Piece): Availability {
  const order: Availability[] = ['in-stock', 'last-few', 'made-to-order', 'sold-out']
  return p.variants.map(availability).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? 'sold-out'
}
export const priceRange = (p: Piece): [number, number] => { const prices = p.variants.map((v) => v.priceCents); return [Math.min(...prices), Math.max(...prices)] }
export const fmtPrice = (cents: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100)

// ---- catalogue state: filters, search, sort; the URL round trip ----

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'name'
export interface CatalogState { makers: string[]; forms: Form[]; glazes: string[]; availability: Availability[]; search: string; sort: SortKey; page: number; pageSize: number }
export const DEFAULT_CATALOG_STATE: CatalogState = { makers: [], forms: [], glazes: [], availability: [], search: '', sort: 'featured', page: 1, pageSize: 24 }

export function applyCatalogState(all: Piece[], s: CatalogState): { rows: Piece[]; total: number; pages: number; page: number } {
  const q = s.search.trim().toLowerCase()
  let rows = all.filter((p) =>
    (s.makers.length === 0 || s.makers.includes(p.makerId)) &&
    (s.forms.length === 0 || s.forms.includes(p.form)) &&
    (s.glazes.length === 0 || p.variants.some((v) => s.glazes.includes(v.glazeId))) &&
    (s.availability.length === 0 || s.availability.includes(pieceAvailability(p))) &&
    (!q || p.name.toLowerCase().includes(q) || makerOf(p).name.toLowerCase().includes(q) || p.form.includes(q) || p.variants.some((v) => glazeOf(v).name.toLowerCase().includes(q))),
  )
  if (s.sort === 'price-asc') rows = [...rows].sort((a, b) => priceRange(a)[0] - priceRange(b)[0] || a.id.localeCompare(b.id))
  else if (s.sort === 'price-desc') rows = [...rows].sort((a, b) => priceRange(b)[1] - priceRange(a)[1] || a.id.localeCompare(b.id))
  else if (s.sort === 'name') rows = [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / s.pageSize))
  const page = Math.min(Math.max(1, s.page), pages)
  return { rows: rows.slice((page - 1) * s.pageSize, page * s.pageSize), total, pages, page }
}
export function catalogStateToQuery(s: CatalogState): Record<string, string> {
  const q: Record<string, string> = {}
  if (s.makers.length) q.maker = s.makers.join(',')
  if (s.forms.length) q.form = s.forms.join(',')
  if (s.glazes.length) q.glaze = s.glazes.join(',')
  if (s.availability.length) q.availability = s.availability.join(',')
  if (s.search) q.q = s.search
  if (s.sort !== 'featured') q.sort = s.sort
  if (s.page > 1) q.page = String(s.page)
  return q
}
export function queryToCatalogState(query: Record<string, string | string[] | undefined | null>): CatalogState {
  const one = (k: string) => { const v = query[k]; return Array.isArray(v) ? v[0] ?? '' : v ?? '' }
  const list = (k: string) => one(k).split(',').map((x) => x.trim()).filter(Boolean)
  const sort = one('sort')
  const page = Number.parseInt(one('page'), 10)
  return {
    makers: list('maker').filter((m) => MAKERS.some((x) => x.id === m)),
    forms: list('form').filter((f): f is Form => (FORMS as string[]).includes(f)),
    glazes: list('glaze').filter((g) => GLAZES.some((x) => x.id === g)),
    availability: list('availability').filter((a): a is Availability => ['in-stock', 'last-few', 'sold-out', 'made-to-order'].includes(a)),
    search: one('q'),
    sort: sort === 'price-asc' || sort === 'price-desc' || sort === 'name' ? sort : 'featured',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: DEFAULT_CATALOG_STATE.pageSize,
  }
}
export const activeFilterCount = (s: CatalogState) => s.makers.length + s.forms.length + s.glazes.length + s.availability.length + (s.search ? 1 : 0)

/** The placeholder art of a variant: the glaze colour on the studio surface, a fixed 4:5 box, so the grid never shifts. */
export function artFor(piece: Piece, variant: Variant): { background: string; glaze: string; highlight: string; label: string } {
  const g = glazeOf(variant)
  return { background: '#f3efe8', glaze: g.hex, highlight: g.dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.55)', label: `${piece.name}, ${makerOf(piece).name}, ${g.name} glaze` }
}
