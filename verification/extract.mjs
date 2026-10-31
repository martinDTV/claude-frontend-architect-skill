// Extracts every fenced code block whose first line is a `@verify` marker from the
// skill references into the verification projects, so the documented code is what gets
// type-checked and tested. Marker formats (first line of the block):
//   // @verify vue,react:lib/http/errors.ts      -> <project>/<srcRoot>/lib/http/errors.ts
//   // @verify nuxt:/nuxt.config.ts               -> <project>/nuxt.config.ts (leading slash = project root)
//   <!-- @verify nuxt:features/x/X.vue -->       (HTML-style marker for .vue files)
//   // @verify creative:engine/loop.ts nuxt:lib/lab/loop.ts next:lib/lab/loop.ts
//                                                 -> the same block written to several projects at different paths
//                                                    (1.5: framework-agnostic 3D code compiled by every app that mounts it)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..', 'plugins', 'frontend-architect', 'skills')
const srcRoots = { vue: 'src', react: 'src', next: 'src', nuxt: 'app', creative: 'src' }
const generatedDirs = { vue: ['src'], react: ['src'], next: ['src'], nuxt: ['app', 'server', 'shared', 'layers'], creative: ['src'] }

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

const marker = /^(?:\/\/|<!--)\s*@verify\s+((?:[a-z,]+:\S+\s*)+?)\s*(?:-->)?$/
const targetRe = /([a-z,]+):(\S+)/g
const fence = /```[a-z]*\n([\s\S]*?)```/g
let count = 0
for (const file of markdownFiles(pluginRoot)) {
  const text = readFileSync(file, 'utf8')
  for (const [, body] of text.matchAll(fence)) {
    const [first, ...rest] = body.split('\n')
    const m = marker.exec(first.trim())
    if (!m) continue
    for (const [, projects, path] of m[1].matchAll(targetRe)) {
      for (const project of projects.split(',')) {
        if (!(project in srcRoots)) throw new Error(`${file}: unknown project "${project}" in marker "${first.trim()}"`)
        const target = path.startsWith('/')
          ? join(here, project, path.slice(1))
          : join(here, project, srcRoots[project], path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, rest.join('\n'))
        count++
      }
    }
  }
}
// Harness-only files (layouts, pages, entry points) that are not documentation live in
// <project>/harness and are copied on top, so builds can run end to end.
for (const project of Object.keys(srcRoots)) {
  const harness = join(here, project, 'harness')
  if (existsSync(harness)) cpSync(harness, join(here, project), { recursive: true })
}
// 1.5: lab modules shared by the apps that mount the 3D experiences for the browser checks (not documentation,
// not duplicated): verification/shared-lab is copied into every project that has a page for it.
const sharedLab = join(here, 'shared-lab')
if (existsSync(sharedLab)) {
  for (const [project, dir] of Object.entries({ creative: 'labs', nuxt: 'lib/lab/labs', next: 'lib/lab/labs' })) {
    cpSync(sharedLab, join(here, project, srcRoots[project], dir), { recursive: true })
  }
}
console.log(`extracted ${count} files`)
