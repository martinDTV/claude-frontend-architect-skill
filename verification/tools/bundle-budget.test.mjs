import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, fixtures, runTool } from './helpers.mjs'

function fakeNuxtBuild() {
  const root = mkdtempSync(join(tmpdir(), 'fa-bundle-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'built', dependencies: { nuxt: '^4.6.0' } }))
  const pub = join(root, '.output', 'public', '_nuxt')
  mkdirSync(pub, { recursive: true })
  mkdirSync(join(root, '.output', 'server', 'chunks', 'build'), { recursive: true })
  const big = (n, seed) => Array.from({ length: n }, (_, i) => `function f${seed}${i}(){return ${i}*${seed}}`).join('\n')
  writeFileSync(join(pub, 'AbCdEf12.js'), big(3000, 7)) // entry (hash-only name, as Nuxt 4 emits)
  writeFileSync(join(pub, 'GhIjKl34.js'), big(2000, 3)) // static import of the entry
  writeFileSync(join(pub, 'MnOpQr56.js'), big(9000, 5)) // lazy route chunk
  writeFileSync(join(pub, 'entry.XyZ.css'), 'body{margin:0}'.repeat(500))
  // production manifest as Nuxt emits it: minified JS object, unquoted props, !0 for true
  const manifest = '{"node_modules/nuxt/dist/app/entry.js":{resourceType:"script",module:!0,prefetch:!0,preload:!0,isEntry:!0,file:"AbCdEf12.js",imports:["_GhIjKl34.js"],dynamicImports:["pages/big.vue"],css:["entry.XyZ.css"]},"_GhIjKl34.js":{resourceType:"script",module:!0,file:"GhIjKl34.js"},"pages/big.vue":{resourceType:"script",module:!0,isDynamicEntry:!0,file:"MnOpQr56.js"}}'
  writeFileSync(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'), `const client_manifest = ${manifest};\n\nexport { client_manifest as default };\n`)
  return root
}

function fakeStaticBuild() {
  const root = mkdtempSync(join(tmpdir(), 'fa-static-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'static', dependencies: { nuxt: '^4.6.0' } }))
  const pub = join(root, '.output', 'public')
  mkdirSync(join(pub, '_nuxt'), { recursive: true })
  writeFileSync(join(pub, '_nuxt', 'Qq1.js'), 'console.log(1)'.repeat(400))
  writeFileSync(join(pub, '_nuxt', 'Qq2.js'), 'console.log(2)'.repeat(400))
  writeFileSync(join(pub, '_nuxt', 'Lazy9.js'), 'console.log(9)'.repeat(4000))
  writeFileSync(join(pub, '_nuxt', 'entry.A.css'), 'a{b:c}'.repeat(100))
  writeFileSync(join(pub, '200.html'), '<html><head><link rel="modulepreload" href="/_nuxt/Qq2.js"><link rel="stylesheet" href="/_nuxt/entry.A.css"></head><body><script type="module" src="/_nuxt/Qq1.js" crossorigin></script></body></html>')
  return root
}

test('refuses to run without a build', () => {
  const { code, stderr } = runTool('bundle-budget.mjs', [join(fixtures, 'nuxt-app')], { parse: false })
  assert.equal(code, 2)
  assert.match(stderr, /no production build found/)
})

test('nuxt static build: startup assets come from the rendered HTML', () => {
  const root = fakeStaticBuild()
  const { code, report } = runTool('bundle-budget.mjs', [root, '--fail-on', 'none'])
  assert.equal(code, 0)
  assert.deepEqual(report.data.assets.filter((a) => a.entry).map((a) => a.file).sort(), ['Qq1.js', 'Qq2.js', 'entry.A.css'])
  assert.ok(report.notes.some((n) => n.includes('200.html')))
})

test('nuxt: startup assets come from client.manifest.mjs, budgets are compared in gzip KB', () => {
  const root = fakeNuxtBuild()
  const { code, report } = runTool('bundle-budget.mjs', [root, '--fail-on', 'none'])
  assert.equal(code, 0)
  const entry = report.data.assets.filter((a) => a.entry).map((a) => a.file).sort()
  assert.deepEqual(entry, ['AbCdEf12.js', 'GhIjKl34.js', 'entry.XyZ.css'], 'entry + its static import + css; the lazy chunk is excluded')
  assert.ok(report.summary.entryJsGzipKb > 0)
  assert.ok(report.data.metrics.maxChunkKb >= report.data.metrics.entryJsKb)
  assert.ok(report.notes.some((n) => n.includes('client.manifest.mjs')))
  // tight budgets produce confirmed findings
  writeFileSync(join(root, 'budgets.json'), JSON.stringify({ entryJsKb: 1, maxChunkKb: 1 }))
  const strict = runTool('bundle-budget.mjs', [root, '--budgets', 'budgets.json'])
  assert.equal(strict.code, 1)
  const over = byId(strict.report, 'budget-exceeded')
  assert.deepEqual(over.map((f) => f.severity).sort(), ['high', 'medium'])
  assert.ok(over.every((f) => f.level === 'confirmed'))
  // hash-only names never trigger the vendor heuristic
  assert.equal(byId(strict.report, 'possible-duplicate-vendor').length, 0)
})
