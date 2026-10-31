/**
 * The bag (cart) as a pure reducer with a versioned storage record (persistence.md): lines keyed by piece and variant,
 * quantities capped by stock, totals in cents, nothing that needs a server. The host binds it to its state primitive and
 * to localStorage; the checkout summary reads it; no payment is taken anywhere.
 */
import { canBuy, CATALOG, type Piece, type Variant } from './catalog'

export interface CartLine { pieceId: string; variantId: string; quantity: number }
export interface Cart { version: 1; lines: CartLine[]; updatedAt: string }
export const EMPTY_CART: Cart = { version: 1, lines: [], updatedAt: '1970-01-01T00:00:00.000Z' }
export const CART_KEY = 'ember.cart.v1'

export type CartAction =
  | { type: 'add'; pieceId: string; variantId: string; quantity?: number; at: string }
  | { type: 'set'; pieceId: string; variantId: string; quantity: number; at: string }
  | { type: 'remove'; pieceId: string; variantId: string; at: string }
  | { type: 'clear'; at: string }

export const MAX_PER_LINE = 12
/** An action without its timestamp (what a component asks for; the host stamps it). Distributive over the union. */
export type CartIntent = CartAction extends infer A ? (A extends CartAction ? Omit<A, 'at'> : never) : never

export function resolveLine(line: CartLine, catalog: Piece[] = CATALOG): { piece: Piece; variant: Variant } | null {
  const piece = catalog.find((p) => p.id === line.pieceId)
  const variant = piece?.variants.find((v) => v.id === line.variantId)
  return piece && variant ? { piece, variant } : null
}

/** The most a line may hold: the stock, or the per-line cap for made-to-order pieces. */
export function maxQuantity(variant: Variant): number {
  if (variant.stock > 0) return Math.min(variant.stock, MAX_PER_LINE)
  return variant.madeToOrder ? MAX_PER_LINE : 0
}

export function cartReducer(cart: Cart, action: CartAction, catalog: Piece[] = CATALOG): Cart {
  const key = (l: CartLine) => `${l.pieceId}/${l.variantId}`
  switch (action.type) {
    case 'add': {
      const resolved = resolveLine({ pieceId: action.pieceId, variantId: action.variantId, quantity: 0 }, catalog)
      if (!resolved || !canBuy(resolved.variant)) return cart
      const cap = maxQuantity(resolved.variant)
      const existing = cart.lines.find((l) => key(l) === `${action.pieceId}/${action.variantId}`)
      const quantity = Math.min(cap, (existing?.quantity ?? 0) + (action.quantity ?? 1))
      const lines = existing ? cart.lines.map((l) => (l === existing ? { ...l, quantity } : l)) : [...cart.lines, { pieceId: action.pieceId, variantId: action.variantId, quantity }]
      return { version: 1, lines, updatedAt: action.at }
    }
    case 'set': {
      const resolved = resolveLine({ pieceId: action.pieceId, variantId: action.variantId, quantity: 0 }, catalog)
      if (!resolved) return cart
      const quantity = Math.max(0, Math.min(maxQuantity(resolved.variant), Math.floor(action.quantity)))
      const lines = quantity === 0 ? cart.lines.filter((l) => key(l) !== `${action.pieceId}/${action.variantId}`) : cart.lines.map((l) => (key(l) === `${action.pieceId}/${action.variantId}` ? { ...l, quantity } : l))
      return { version: 1, lines, updatedAt: action.at }
    }
    case 'remove':
      return { version: 1, lines: cart.lines.filter((l) => key(l) !== `${action.pieceId}/${action.variantId}`), updatedAt: action.at }
    case 'clear':
      return { version: 1, lines: [], updatedAt: action.at }
  }
}

export interface CartTotals { count: number; subtotalCents: number; shippingCents: number; totalCents: number; madeToOrder: number }
export function cartTotals(cart: Cart, catalog: Piece[] = CATALOG): CartTotals {
  let count = 0, subtotalCents = 0, madeToOrder = 0
  for (const line of cart.lines) {
    const r = resolveLine(line, catalog)
    if (!r) continue
    count += line.quantity
    subtotalCents += line.quantity * r.variant.priceCents
    if (r.variant.stock === 0 && r.variant.madeToOrder) madeToOrder += line.quantity
  }
  const shippingCents = count === 0 ? 0 : subtotalCents >= 12000 ? 0 : 900
  return { count, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents, madeToOrder }
}

/** Reads a stored cart; anything malformed, from another version, or naming pieces that no longer exist is dropped. */
export function readCart(storage: Pick<Storage, 'getItem'> | null, catalog: Piece[] = CATALOG): Cart {
  try {
    const raw = storage?.getItem(CART_KEY)
    if (!raw) return EMPTY_CART
    const parsed = JSON.parse(raw) as Partial<Cart>
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return EMPTY_CART
    const lines = parsed.lines.filter((l): l is CartLine => typeof l?.pieceId === 'string' && typeof l?.variantId === 'string' && Number.isInteger(l?.quantity) && l.quantity > 0).filter((l) => resolveLine(l, catalog)).map((l) => ({ ...l, quantity: Math.min(l.quantity, maxQuantity(resolveLine(l, catalog)!.variant)) })).filter((l) => l.quantity > 0)
    return { version: 1, lines, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : EMPTY_CART.updatedAt }
  } catch {
    return EMPTY_CART
  }
}
export function writeCart(storage: Pick<Storage, 'setItem'> | null, cart: Cart): void {
  storage?.setItem(CART_KEY, JSON.stringify(cart))
}
