// Unit tests of the shop domain (run in the Vue project's Vitest): the catalogue is deterministic and every state is
// represented; filters, search and sort are pure and round-trip through the URL; the bag respects stock, caps and
// malformed storage.
import { describe, expect, it } from 'vitest'
import { applyCatalogState, availability, CATALOG, catalogStateToQuery, DEFAULT_CATALOG_STATE, generateCatalog, GLAZES, MAKERS, pieceAvailability, priceRange, queryToCatalogState } from './catalog'
import { cartReducer, cartTotals, EMPTY_CART, maxQuantity, readCart, writeCart } from './cart'

const AT = '2026-10-31T09:00:00.000Z'

describe('catalogue', () => {
  it('is deterministic and covers every availability', () => {
    expect(generateCatalog()).toEqual(CATALOG)
    expect(CATALOG).toHaveLength(240)
    const states = new Set(CATALOG.flatMap((p) => p.variants.map(availability)))
    expect([...states].sort()).toEqual(['in-stock', 'last-few', 'made-to-order', 'sold-out'])
    expect(CATALOG.every((p) => p.variants.length >= 1 && MAKERS.some((m) => m.id === p.makerId))).toBe(true)
  })
  it('filters by maker, form, glaze and availability together, searches names, makers and glazes, sorts by price', () => {
    const okada = applyCatalogState(CATALOG, { ...DEFAULT_CATALOG_STATE, makers: ['okada'] })
    expect(okada.total).toBeGreaterThan(0)
    expect(okada.rows.every((p) => p.makerId === 'okada')).toBe(true)
    const bowls = applyCatalogState(CATALOG, { ...DEFAULT_CATALOG_STATE, forms: ['bowl'], glazes: ['tenmoku'], availability: ['in-stock'] })
    expect(bowls.rows.every((p) => p.form === 'bowl' && p.variants.some((v) => v.glazeId === 'tenmoku') && pieceAvailability(p) === 'in-stock')).toBe(true)
    const search = applyCatalogState(CATALOG, { ...DEFAULT_CATALOG_STATE, search: 'celadon' })
    expect(search.rows.every((p) => p.variants.some((v) => GLAZES.find((g) => g.id === v.glazeId)!.name === 'Celadon'))).toBe(true)
    const asc = applyCatalogState(CATALOG, { ...DEFAULT_CATALOG_STATE, sort: 'price-asc', pageSize: 240 }).rows.map((p) => priceRange(p)[0])
    expect([...asc].sort((a, b) => a - b)).toEqual(asc)
  })
  it('pages and clamps the page', () => {
    const r = applyCatalogState(CATALOG, { ...DEFAULT_CATALOG_STATE, page: 99 })
    expect(r.page).toBe(r.pages)
    expect(r.rows.length).toBeGreaterThan(0)
  })
  it('round-trips through the query string and drops unknown values', () => {
    const s = { ...DEFAULT_CATALOG_STATE, makers: ['okada', 'nwosu'], forms: ['mug' as const], glazes: ['ash'], availability: ['last-few' as const], search: 'tall', sort: 'name' as const, page: 2 }
    expect(queryToCatalogState(catalogStateToQuery(s))).toEqual(s)
    expect(catalogStateToQuery(DEFAULT_CATALOG_STATE)).toEqual({})
    expect(queryToCatalogState({ maker: 'nobody,okada', form: 'spoon', sort: 'bogus', page: '-3' })).toEqual({ ...DEFAULT_CATALOG_STATE, makers: ['okada'] })
  })
})

describe('bag', () => {
  const inStock = CATALOG.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.stock >= 6)!
  const lastOne = CATALOG.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.stock === 1)!
  const soldOut = CATALOG.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.stock === 0 && !x.v.madeToOrder)!
  const toOrder = CATALOG.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.stock === 0 && x.v.madeToOrder)!
  it('adds, merges, caps by stock, refuses sold-out, allows made-to-order up to the per-line cap', () => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', pieceId: inStock.p.id, variantId: inStock.v.id, at: AT })
    cart = cartReducer(cart, { type: 'add', pieceId: inStock.p.id, variantId: inStock.v.id, quantity: 2, at: AT })
    expect(cart.lines).toEqual([{ pieceId: inStock.p.id, variantId: inStock.v.id, quantity: 3 }])
    cart = cartReducer(cart, { type: 'add', pieceId: lastOne.p.id, variantId: lastOne.v.id, quantity: 5, at: AT })
    expect(cart.lines.find((l) => l.variantId === lastOne.v.id && l.pieceId === lastOne.p.id)?.quantity).toBe(1)
    expect(cartReducer(cart, { type: 'add', pieceId: soldOut.p.id, variantId: soldOut.v.id, at: AT })).toBe(cart)
    const mto = cartReducer(cart, { type: 'add', pieceId: toOrder.p.id, variantId: toOrder.v.id, quantity: 40, at: AT })
    expect(mto.lines.find((l) => l.pieceId === toOrder.p.id && l.variantId === toOrder.v.id)?.quantity).toBe(maxQuantity(toOrder.v))
    expect(cartTotals(mto).madeToOrder).toBe(maxQuantity(toOrder.v))
  })
  it('sets to zero removes, totals add shipping under the threshold, clear empties', () => {
    let cart = cartReducer(EMPTY_CART, { type: 'add', pieceId: inStock.p.id, variantId: inStock.v.id, quantity: 2, at: AT })
    const t = cartTotals(cart)
    expect(t.count).toBe(2)
    expect(t.subtotalCents).toBe(2 * inStock.v.priceCents)
    expect(t.shippingCents).toBe(t.subtotalCents >= 12000 ? 0 : 900)
    cart = cartReducer(cart, { type: 'set', pieceId: inStock.p.id, variantId: inStock.v.id, quantity: 0, at: AT })
    expect(cart.lines).toEqual([])
    expect(cartTotals(cartReducer(cart, { type: 'clear', at: AT })).totalCents).toBe(0)
  })
  it('reads only a valid stored record and re-caps quantities against the stock', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    writeCart(storage, { version: 1, lines: [{ pieceId: lastOne.p.id, variantId: lastOne.v.id, quantity: 7 }, { pieceId: 'ghost', variantId: 'x', quantity: 1 }], updatedAt: AT })
    expect(readCart(storage).lines).toEqual([{ pieceId: lastOne.p.id, variantId: lastOne.v.id, quantity: 1 }])
    storage.setItem('ember.cart.v1', '{"version":2,"lines":[]}')
    expect(readCart(storage)).toEqual(EMPTY_CART)
    storage.setItem('ember.cart.v1', 'not json')
    expect(readCart(storage)).toEqual(EMPTY_CART)
  })
})
