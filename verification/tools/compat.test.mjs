// JSON contract compatibility: every key path (with its type) that a 1.2.0 report exposed on the fixtures must
// still be present in the current report. Snapshots live under contracts/<version>/ and were generated from the
// released scripts with contract-shape.mjs; new keys are allowed (additive evolution), removals and type changes are not.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { missingFrom, parseShape, shapeOf } from './contract-shape.mjs'
import { fixtures, here, runTool } from './helpers.mjs'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]

function fakeNuxtBuild() {
  const root = mkdtempSync(join(tmpdir(), 'fa-compat-build-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'built', dependencies: { nuxt: '^4.6.0' } }))
  mkdirSync(join(root, '.output', 'public', '_nuxt'), { recursive: true })
  mkdirSync(join(root, '.output', 'server', 'chunks', 'build'), { recursive: true })
  const big = (n, s) => Array.from({ length: n }, (_, i) => `function f${s}${i}(){return ${i}}`).join('\n')
  writeFileSync(join(root, '.output', 'public', '_nuxt', 'AbCdEf12.js'), big(3000, 7))
  writeFileSync(join(root, '.output', 'public', '_nuxt', 'GhIjKl34.js'), big(2000, 3))
  writeFileSync(join(root, '.output', 'public', '_nuxt', 'entry.XyZ.css'), 'body{margin:0}'.repeat(500))
  writeFileSync(join(root, '.output', 'server', 'chunks', 'build', 'client.manifest.mjs'), 'const client_manifest = {"node_modules/nuxt/dist/app/entry.js":{isEntry:!0,file:"AbCdEf12.js",imports:["_GhIjKl34.js"],css:["entry.XyZ.css"]},"_GhIjKl34.js":{file:"GhIjKl34.js"}};\nexport { client_manifest as default };\n')
  return root
}

const contractsDir = join(here, 'contracts')
for (const version of readdirSync(contractsDir).sort()) {
  const files = readdirSync(join(contractsDir, version)).filter((f) => f.endsWith('.shape.txt'))
  test(`JSON reports keep every key path of ${version} (${files.length} snapshots)`, () => {
    const built = fakeNuxtBuild()
    const problems = []
    for (const file of files) {
      const [tool, fixture, engine] = file.replace('.shape.txt', '').split('.')
      const root = fixture === 'fake-nuxt-build' ? built : join(fixtures, fixture)
      const extra = engine === 'lexical' ? ['--engine', 'lexical'] : engine === 'semantic' ? semantic : []
      const { code, report } = runTool(`${tool}.mjs`, [root, ...extra, '--fail-on', 'none'])
      assert.equal(code, 0, `${tool} on ${fixture} (${engine})`)
      const old = parseShape(readFileSync(join(contractsDir, version, file), 'utf8'))
      for (const p of missingFrom(old, shapeOf(report))) problems.push(`${file}: ${p}`)
    }
    assert.deepEqual(problems, [])
  })
}
