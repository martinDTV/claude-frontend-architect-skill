// Behavioural regression guard (1.4): the findings every tool produced on the fixtures at a released version are
// frozen under baselines/<version>/ (one fingerprint per finding: id|file|line|level|severity). A later version may
// add findings; it may drop or re-grade one only through an explicit entry in baselines/migrations.json.
// Summary keys are frozen the same way (additive only).
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fixtures, here, runTool } from './helpers.mjs'

const vueProject = join(fixtures, '..', '..', 'vue')
const semantic = ['--engine', 'semantic', '--typescript', vueProject, '--vue-compiler', vueProject]
const baselinesDir = join(here, 'baselines')
const migrations = JSON.parse(readFileSync(join(baselinesDir, 'migrations.json'), 'utf8'))

function fakeNuxtBuild() {
  const root = mkdtempSync(join(tmpdir(), 'fa-baseline-build-'))
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

const fingerprint = (f) => `${f.id}|${f.file ?? ''}|${f.line ?? ''}|${f.level}|${f.severity}`

for (const version of readdirSync(baselinesDir).filter((v) => !v.endsWith('.json')).sort()) {
  const files = readdirSync(join(baselinesDir, version)).filter((f) => f.endsWith('.json'))
  const allowed = (migrations[version] ?? []).map((m) => ({ re: new RegExp(m.match), reason: m.reason }))
  test(`no finding of ${version} disappears or changes grade without a migration entry (${files.length} baselines)`, () => {
    const built = fakeNuxtBuild()
    const problems = []
    for (const file of files) {
      const base = JSON.parse(readFileSync(join(baselinesDir, version, file), 'utf8'))
      const root = base.fixture === 'fake-nuxt-build' ? built : join(fixtures, base.fixture)
      const extra = base.engine === 'lexical' ? ['--engine', 'lexical'] : base.engine === 'semantic' ? semantic : []
      const { code, report } = runTool(`${base.tool}.mjs`, [root, ...extra, '--fail-on', 'none'])
      assert.equal(code, 0, `${base.tool} on ${base.fixture} (${base.engine})`)
      const now = new Set(report.findings.map(fingerprint))
      for (const key of base.findings) {
        if (now.has(key)) continue
        if (allowed.some((a) => a.re.test(key))) continue
        problems.push(`${file}: missing ${key}`)
      }
      const summaryNow = new Set(Object.keys(report.summary))
      for (const k of base.summaryKeys) if (!summaryNow.has(k)) problems.push(`${file}: summary key ${k} removed`)
    }
    assert.deepEqual(problems, [])
  })
}
