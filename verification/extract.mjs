// Extracts every fenced code block whose first line is a `@verify` marker from the
// skill references into the verification projects, so the documented code is what gets
// type-checked and tested. Marker formats (first line of the block):
//   // @verify vue,react:lib/http/errors.ts      -> <project>/<srcRoot>/lib/http/errors.ts
//   // @verify nuxt:/nuxt.config.ts               -> <project>/nuxt.config.ts (leading slash = project root)
//   <!-- @verify nuxt:features/x/X.vue -->       (HTML-style marker for .vue files)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..', 'plugins', 'frontend-architect', 'skills')
const srcRoots = { vue: 'src', react: 'src', next: 'src', nuxt: 'app', creative: 'src' }
const generatedDirs = { vue: ['src'], react: ['src'], next: ['src'], nuxt: ['app', 'server', 'shared'], creative: ['src'] }

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* markdownFiles(full)
    else if (entry.name.endsWith('.md')) yield full
  }
}

for (const [project, dirs] of Object.entries(generatedDirs)) {
  for (const d of dirs) rmSync(join(here, project, d), { recursive: true, force: true })
}

const marker = /^(?:\/\/|<!--)\s*@verify\s+([a-z,]+):(\S+?)\s*(?:-->)?$/
const fence = /```[a-z]*\n([\s\S]*?)```/g
let count = 0
for (const file of markdownFiles(pluginRoot)) {
  const text = readFileSync(file, 'utf8')
  for (const [, body] of text.matchAll(fence)) {
    const [first, ...rest] = body.split('\n')
    const m = marker.exec(first.trim())
    if (!m) continue
    const [, projects, path] = m
    for (const project of projects.split(',')) {
      const target = path.startsWith('/')
        ? join(here, project, path.slice(1))
        : join(here, project, srcRoots[project], path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, rest.join('\n'))
      count++
    }
  }
}
// Harness-only files (layouts, pages, entry points) that are not documentation live in
// <project>/harness and are copied on top, so builds can run end to end.
for (const project of Object.keys(srcRoots)) {
  const harness = join(here, project, 'harness')
  if (existsSync(harness)) cpSync(harness, join(here, project), { recursive: true })
}
console.log(`extracted ${count} files`)
