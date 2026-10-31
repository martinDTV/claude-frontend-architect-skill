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
// 1.5 increment 5: the enterprise domain the reference applications share (data, table state, forms, fake api) is
// framework-agnostic TypeScript compiled by the Nuxt and Next apps and unit-tested by the Vue project
for (const [project, target] of [['nuxt', join('app', 'lib', 'ui')], ['next', join('src', 'lib', 'ui')], ['vue', join('src', 'lib', 'ui')]]) {
  // the unit tests run in the Vue project only (the apps have no Vitest)
  cpSync(join(here, 'shared-ui'), join(here, project, target), { recursive: true, filter: (src) => project === 'vue' || !/\.test\.[cm]?[jt]sx?$/.test(src) })
}
// 1.5 increment 5: the design contracts become the apps' tokens. The Tailwind v4 theme of the enterprise contract is
// written where each app's stylesheet imports it; the Nuxt UI mapping next to it. Generated, never edited.
{
  const { emitTailwind, emitNuxtUi, loadContract } = await import(join(pluginRoot, 'frontend-architect', 'scripts', 'design-contract.mjs'))
  const atlas = loadContract(join(here, 'design', 'contracts', 'atlas-logistics.json'))
  const nuxtCss = join(here, 'nuxt', 'app', 'assets', 'css')
  mkdirSync(nuxtCss, { recursive: true })
  writeFileSync(join(nuxtCss, 'tokens.css'), emitTailwind(atlas))
  writeFileSync(join(nuxtCss, 'nuxt-ui-map.css'), emitNuxtUi(atlas))
  const nextCss = join(here, 'next', 'src', 'app')
  mkdirSync(nextCss, { recursive: true })
  // shadcn owns --accent, --border and friends in the Next app: the contract's roles take the dc- prefix there
  writeFileSync(join(nextCss, 'tokens.css'), emitTailwind(atlas, { rolePrefix: 'dc-' }))
  // the contract itself, for the design pages that render the roles and scales
  mkdirSync(join(here, 'nuxt', 'app', 'design'), { recursive: true })
  mkdirSync(join(here, 'next', 'src', 'design'), { recursive: true })
  writeFileSync(join(here, 'nuxt', 'app', 'design', 'contract.json'), JSON.stringify(atlas, null, 2))
  writeFileSync(join(here, 'next', 'src', 'design', 'contract.json'), JSON.stringify(atlas, null, 2))
  // block D: a second contract per app, scoped to its own area (the launch page in Next, the shop in Nuxt); the host
  // theme stays the enterprise contract's, the scoped variables take over under [data-contract]
  const lumen = loadContract(join(here, 'design', 'contracts', 'lumen-notebook.json'))
  const ember = loadContract(join(here, 'design', 'contracts', 'ember-store.json'))
  writeFileSync(join(nextCss, 'tokens-lumen.css'), emitTailwind(lumen, { rolePrefix: 'dc-', scope: '[data-contract="lumen"]' }))
  writeFileSync(join(nuxtCss, 'tokens-ember.css'), emitTailwind(ember, { scope: '[data-contract="ember"]' }))
  writeFileSync(join(here, 'next', 'src', 'design', 'lumen.json'), JSON.stringify(lumen, null, 2))
  writeFileSync(join(here, 'nuxt', 'app', 'design', 'ember.json'), JSON.stringify(ember, null, 2))
  count += 9
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
// 1.5 increment 4: the procedural GLTF fixtures (verification/assets/fixtures, generated by make-fixtures.mjs) and
// the decoders Three.js ships (Draco, Basis/KTX2) are served by both apps from public/models, public/draco and
// public/basis; the meshopt decoder is imported as a module. Generated: gitignored.
const fixtures = join(here, 'assets', 'fixtures')
const threeLibs = join(here, 'creative', 'node_modules', 'three', 'examples', 'jsm', 'libs')
if (existsSync(fixtures)) {
  for (const project of ['nuxt', 'next']) {
    const pub = join(here, project, 'public')
    for (const dir of ['models', 'draco', 'basis']) rmSync(join(pub, dir), { recursive: true, force: true })
    cpSync(fixtures, join(pub, 'models'), { recursive: true })
    if (existsSync(join(threeLibs, 'draco', 'gltf'))) cpSync(join(threeLibs, 'draco', 'gltf'), join(pub, 'draco'), { recursive: true, filter: (src) => !/meshopt/.test(src) })
    if (existsSync(join(threeLibs, 'basis'))) cpSync(join(threeLibs, 'basis'), join(pub, 'basis'), { recursive: true })
  }
}
console.log(`extracted ${count} files`)
