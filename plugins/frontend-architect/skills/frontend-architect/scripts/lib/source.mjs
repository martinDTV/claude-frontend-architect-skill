// Lexical analysis of Vue SFCs, TypeScript and JSX without a parser. Everything here is
// a heuristic by construction: good enough to build dependency graphs and find patterns,
// never a substitute for the compiler. Line numbers are preserved by all transformations.

/**
 * Blanks out comments and string contents (keeping delimiters and newlines) so that
 * identifier searches do not match words inside strings or comments. Template literal
 * `${...}` expressions are kept as code. Regex literals are not detected.
 */
export function stripCode(code) {
  let out = ''
  let state = 'code'
  const tplDepth = [] // brace depth inside each open `${` of a template literal
  const n = code.length
  for (let i = 0; i < n; i++) {
    const c = code[i]
    const d = code[i + 1]
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line'
        out += '  '
        i++
      } else if (c === '/' && d === '*') {
        state = 'block'
        out += '  '
        i++
      } else if (c === "'" || c === '"') {
        state = c
        out += c
      } else if (c === '`') {
        state = 'tpl'
        out += c
      } else if (tplDepth.length && c === '{') {
        tplDepth[tplDepth.length - 1]++
        out += c
      } else if (tplDepth.length && c === '}') {
        if (tplDepth[tplDepth.length - 1] === 0) {
          tplDepth.pop()
          state = 'tpl'
        } else tplDepth[tplDepth.length - 1]--
        out += c
      } else out += c
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      } else out += ' '
    } else if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code'
        out += '  '
        i++
      } else out += c === '\n' ? c : ' '
    } else if (state === "'" || state === '"') {
      if (c === '\\') {
        out += '  '
        i++
      } else if (c === state) {
        state = 'code'
        out += c
      } else if (c === '\n') {
        // unterminated (JSX text with an apostrophe, for example): recover at end of line
        state = 'code'
        out += c
      } else out += ' '
    } else if (state === 'tpl') {
      if (c === '\\') {
        out += '  '
        i++
      } else if (c === '`') {
        state = 'code'
        out += c
      } else if (c === '$' && d === '{') {
        state = 'code'
        tplDepth.push(0)
        out += '${'
        i++
      } else out += c === '\n' ? c : ' '
    }
  }
  return out
}

/** 1-based line of a character offset. */
export function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

export function countLines(text) {
  return text.length === 0 ? 0 : text.split('\n').length
}

/**
 * Splits a Vue single-file component into its blocks. The template is the outermost
 * top-level `<template>` (opening tag at column 0) up to the last `</template>`.
 */
export function splitSfc(text) {
  const scriptBlocks = [...text.matchAll(/^<script\b([^>]*)>([\s\S]*?)^<\/script>/gm)]
  const script = scriptBlocks.map((m) => m[2]).join('\n')
  const setup = scriptBlocks.some((m) => /\bsetup\b/.test(m[1]))
  const lang = scriptBlocks.map((m) => /lang\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1]).find(Boolean) ?? 'js'
  const scriptLine = scriptBlocks.length ? lineOf(text, scriptBlocks[0].index) : 0

  let template = ''
  let templateLine = 0
  const start = text.search(/^<template\b/m)
  if (start >= 0) {
    const end = text.lastIndexOf('</template>')
    const open = text.indexOf('>', start)
    if (end > open) {
      template = text.slice(open + 1, end)
      templateLine = lineOf(text, open + 1)
    }
  }
  const styles = [...text.matchAll(/^<style\b[^>]*>([\s\S]*?)^<\/style>/gm)].map((m) => m[1])
  return { script, scriptLine, setup, lang, template, templateLine, styles }
}

/**
 * Static, side-effect, dynamic and re-export imports with their local names.
 * Works on raw code (module specifiers are strings). Returns [{ source, names, typeOnly, kind, line }].
 */
function keywordLine(code, m) {
  return lineOf(code, m.index + m[0].search(/\S/))
}

export function extractImports(code) {
  const out = []
  const seen = new Set()
  const push = (entry) => {
    const key = `${entry.kind}:${entry.source}:${entry.line}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(entry)
  }
  for (const m of code.matchAll(/(?:^|[;\s])import\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"\n]+)['"]/g)) {
    push({ kind: 'static', source: m[3], typeOnly: Boolean(m[1]), names: parseImportClause(m[2]), line: keywordLine(code, m) })
  }
  for (const m of code.matchAll(/(?:^|[;\s])import\s+['"]([^'"\n]+)['"]/g)) {
    push({ kind: 'side-effect', source: m[1], typeOnly: false, names: [], line: keywordLine(code, m) })
  }
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g)) {
    push({ kind: 'dynamic', source: m[1], typeOnly: false, names: [], line: lineOf(code, m.index) })
  }
  for (const m of code.matchAll(/(?:^|[;\s])export\s+(type\s+)?(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s+['"]([^'"\n]+)['"]/g)) {
    push({ kind: 're-export', source: m[3], typeOnly: Boolean(m[1]), names: m[2].startsWith('*') ? ['*'] : parseImportClause(m[2]), line: keywordLine(code, m) })
  }
  return out.sort((a, b) => a.line - b.line)
}

function parseImportClause(clause) {
  const names = []
  const text = clause.trim()
  if (!text) return names
  const braces = /\{([^}]*)\}/.exec(text)
  const outside = text.replace(/\{[^}]*\}/, '').split(',').map((s) => s.trim()).filter(Boolean)
  for (const part of outside) {
    const ns = /^\*\s+as\s+([\w$]+)$/.exec(part)
    if (ns) names.push(ns[1])
    else if (/^[\w$]+$/.test(part)) names.push(part)
  }
  if (braces) {
    for (const raw of braces[1].split(',')) {
      const part = raw.replace(/^\s*type\s+/, '').trim()
      if (!part) continue
      const alias = /^[\w$]+\s+as\s+([\w$]+)$/.exec(part)
      names.push(alias ? alias[1] : part.split(/\s+/)[0])
    }
  }
  return names.filter((n) => n !== 'default')
}

/** Names exported by a module (on stripped code). `default` and `*` are reported literally. */
export function extractExports(stripped) {
  const names = new Set()
  for (const m of stripped.matchAll(
    /(?:^|[;\s])export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\s*\*?|class|abstract\s+class|type|interface|enum|const\s+enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    names.add(m[1])
  }
  for (const m of stripped.matchAll(/(?:^|[;\s])export\s*(?:type\s*)?\{([^}]*)\}(?!\s*from)/g)) {
    for (const raw of m[1].split(',')) {
      const part = raw.replace(/^\s*type\s+/, '').trim()
      if (!part) continue
      const alias = /^[\w$]+\s+as\s+([\w$]+)$/.exec(part)
      names.add(alias ? alias[1] : part)
    }
  }
  for (const m of stripped.matchAll(/(?:^|[;\s])export\s*(?:type\s*)?\{([^}]*)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const part = raw.replace(/^\s*type\s+/, '').trim()
      if (!part) continue
      const alias = /^[\w$]+\s+as\s+([\w$]+)$/.exec(part)
      names.add(alias ? alias[1] : part)
    }
  }
  if (/(?:^|[;\s])export\s+default\b/.test(stripped)) names.add('default')
  if (/(?:^|[;\s])export\s+\*\s+from/.test(stripped)) names.add('*')
  return [...names]
}

const IDENT = /[A-Za-z_$][\w$]*/g

/** All identifiers in stripped code, as a Set. */
export function identifiers(stripped) {
  return new Set(stripped.match(IDENT) ?? [])
}

/** Identifiers the module declares itself (so a matching name is not an auto-import). */
export function declaredNames(stripped) {
  const names = new Set()
  for (const m of stripped.matchAll(/\b(?:const|let|var|function\s*\*?|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of stripped.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop()?.split('=')[0]?.trim()
      if (name && /^[\w$]+$/.test(name)) names.add(name)
    }
  }
  return names
}

/** Occurrences of an identifier used as a call or a value (word boundary), with line numbers. */
export function findIdentifier(stripped, name) {
  const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')
  const lines = []
  for (const m of stripped.matchAll(re)) lines.push(lineOf(stripped, m.index))
  return lines
}

const HTML_TAGS = new Set(['a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr', 'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'defs', 'use', 'symbol', 'text', 'tspan', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'filter', 'component', 'transition', 'keep-alive', 'teleport', 'suspense'])

export function toPascalCase(name) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
}

/** Component tags used in a template (PascalCase, `Lazy` prefix kept), excluding HTML elements. */
export function templateTags(template) {
  const tags = new Map()
  for (const m of template.matchAll(/<([A-Za-z][\w.-]*)(?=[\s/>])/g)) {
    const raw = m[1]
    if (HTML_TAGS.has(raw) || HTML_TAGS.has(raw.toLowerCase())) continue
    if (raw.includes('.')) continue
    const name = raw.includes('-') ? toPascalCase(raw) : raw
    if (!/^[A-Z]/.test(name)) continue
    const line = lineOf(template, m.index)
    if (!tags.has(name)) tags.set(name, [])
    tags.get(name).push(line)
  }
  return tags
}

/** JavaScript expressions embedded in a template: mustaches and bound attributes. */
export function templateExpressions(template) {
  const parts = []
  for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) parts.push(m[1])
  for (const m of template.matchAll(/\s(?::|v-|@|#)[\w.:-]*(?:\[[^\]]*\])?\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) parts.push(m[1] ?? m[2] ?? '')
  return parts.join('\n')
}

/** Blanks comments only (strings and template literals keep their contents), preserving line structure. */
export function stripComments(code) {
  let out = ''
  let state = 'code'
  for (let i = 0; i < code.length; i++) {
    const c = code[i]
    const d = code[i + 1]
    if (state === 'code') {
      if (c === '/' && d === '/') {
        state = 'line'
        out += '  '
        i++
      } else if (c === '/' && d === '*') {
        state = 'block'
        out += '  '
        i++
      } else {
        if (c === "'" || c === '"' || c === '`') state = c
        out += c
      }
    } else if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      } else out += ' '
    } else if (state === 'block') {
      if (c === '*' && d === '/') {
        state = 'code'
        out += '  '
        i++
      } else out += c === '\n' ? c : ' '
    } else {
      // inside a string: copy, honour escapes, leave on the matching quote
      out += c
      if (c === '\\' && d !== undefined) {
        out += d
        i++
      } else if (c === state) state = 'code'
    }
  }
  return out
}

/** Count regex matches in text. */
export function countMatches(text, re) {
  return (text.match(re) ?? []).length
}

/**
 * Statements at module scope (brace depth 0) in stripped code. Returns [{ line, text }] for
 * lines that begin a top-level declaration, useful to find module-level mutable state.
 */
export function topLevelStatements(stripped) {
  const out = []
  let depth = 0
  let paren = 0
  const lines = stripped.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]
    const trimmed = text.trim()
    if (depth === 0 && paren === 0 && trimmed) out.push({ line: i + 1, text: trimmed })
    for (const ch of text) {
      if (ch === '{') depth++
      else if (ch === '}') depth = Math.max(0, depth - 1)
      else if (ch === '(') paren++
      else if (ch === ')') paren = Math.max(0, paren - 1)
    }
  }
  return out
}
