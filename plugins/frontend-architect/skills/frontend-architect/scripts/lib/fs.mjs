// Read-only filesystem helpers shared by the audit scripts. No dependencies.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Directories never scanned: build output, caches, dependencies, tool artifacts. */
export const DEFAULT_IGNORE = new Set([
  'node_modules', '.git', '.nuxt', '.output', '.next', 'dist', 'build', 'coverage', '.turbo', '.cache',
  '.data', 'test-results', 'playwright-report', '.vercel', '.netlify', 'storybook-static', '.pytest_cache',
  '.ruff_cache', '__pycache__', '.idea', '.vscode', 'tmp', '.tmp',
])

export const SOURCE_EXTENSIONS = ['.vue', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']

/** Lists files under `root` (sorted, absolute), skipping ignored directories. Symlinks are not followed. */
export function walk(root, { ignore = DEFAULT_IGNORE, extensions = SOURCE_EXTENSIONS } = {}) {
  const out = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && (!extensions || extensions.some((ext) => entry.name.endsWith(ext)))) out.push(full)
    }
  }
  return out.sort()
}

export function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/')
}

/** Path of `file` relative to `root`, always with forward slashes. */
export function rel(root, file) {
  return toPosix(relative(root, file))
}

export function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function exists(path) {
  return existsSync(path)
}

/** First existing path among `candidates` (absolute), or null. */
export function firstExisting(...candidates) {
  return candidates.find((c) => existsSync(c)) ?? null
}

/** Converts a glob (`**`, `*`, `?`) into a RegExp anchored to the whole posix path. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; trailing `**` matches the rest.
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if ('\\^$+.()|{}[]'.includes(c)) re += `\\${c}`
    else re += c
  }
  return new RegExp(`^${re}$`)
}

export function matchesAny(path, globs) {
  return globs.some((g) => (g instanceof RegExp ? g : globToRegExp(g)).test(path))
}
