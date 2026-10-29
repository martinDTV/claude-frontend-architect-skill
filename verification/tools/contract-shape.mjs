// Describes the shape of a tool's JSON report (key paths with JavaScript types; arrays by their first
// element) so later versions can prove that every earlier key is still present with the same type.
//   node contract-shape.mjs <report.json>      prints the shape as sorted "path: type" lines
// Used by compat.test.mjs against the snapshots under contracts/<version>/.
import { readFileSync } from 'node:fs'

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)

/** Returns a Map path -> type for every key path of `value`. Arrays contribute `path[]` with the first element's shape. */
export function shapeOf(value, path = '', out = new Map()) {
  const t = typeOf(value)
  out.set(path || '<root>', t)
  if (t === 'object') for (const k of Object.keys(value)) shapeOf(value[k], path ? `${path}.${k}` : k, out)
  if (t === 'array' && value.length) shapeOf(value[0], `${path}[]`, out)
  return out
}

/** Paths present in `older` that are missing in `newer` or changed type (null in the old value is compatible with anything). */
export function missingFrom(older, newer) {
  const problems = []
  for (const [path, type] of older) {
    if (!newer.has(path)) problems.push(`${path}: missing (was ${type})`)
    else if (type !== 'null' && newer.get(path) !== 'null' && newer.get(path) !== type) problems.push(`${path}: ${type} -> ${newer.get(path)}`)
  }
  return problems
}

export function serialize(shape) {
  return [...shape.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, t]) => `${p}: ${t}`).join('\n') + '\n'
}

export function parseShape(text) {
  const m = new Map()
  for (const line of text.split('\n')) {
    const i = line.lastIndexOf(': ')
    if (i > 0) m.set(line.slice(0, i), line.slice(i + 2))
  }
  return m
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const file = process.argv[2]
  if (file) process.stdout.write(serialize(shapeOf(JSON.parse(readFileSync(file, 'utf8')))))
}
