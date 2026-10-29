// Runs the audit scripts on the Next.js reference project (the examples extracted from the references and
// built by `next build` in run-all.sh) with the project's own TypeScript, and checks what the engine must see
// there. This makes the Next adapter verifiable on a real, compiling project rather than only on fixtures.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
if (!existsSync(join(here, 'src', 'app'))) {
  console.error('verification/next/src not extracted: run `node verification/extract.mjs` first')
  process.exit(1)
}
const run = (tool, extra = []) => {
  const r = spawnSync(process.execPath, [join(scripts, tool), here, '--engine', 'semantic', '--json', '--fail-on', 'none', ...extra], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${tool} exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const failures = []
const expect = (cond, msg) => (cond ? null : failures.push(msg))

const deps = run('domain-deps.mjs')
expect(deps.analysis.engine === 'semantic', 'semantic engine must run with the project typescript')
expect(deps.analysis.typescript.source === 'project', `typescript must come from the project (got ${deps.analysis.typescript.source})`)
expect(deps.summary.edgesByConfidence.verified === deps.summary.edges, 'every edge in the reference project is verified')
expect(!deps.findings.some((f) => f.id === 'server-only-in-client'), 'the reference project has no server-only module reachable from a client component')
expect(!deps.findings.some((f) => f.id === 'client-only-in-server'), 'the reference project has no client-only module reachable from a server segment')
expect(deps.data.unknownImports.length === 0, `no unresolved imports (got ${JSON.stringify(deps.data.unknownImports)})`)

const routes = run('routes-audit.mjs')
expect(routes.summary.serverActions >= 1, 'the reference Server Function is inventoried')
expect(routes.summary.actionsWithoutAuth === 0, 'the reference Server Function checks authorization')
expect(routes.summary.handlers >= 1, 'the webhook Route Handler is inventoried')
expect(Boolean(routes.summary.proxy), 'proxy.ts is detected')

const bundle = spawnSync(process.execPath, [join(scripts, 'bundle-budget.mjs'), here, '--json', '--fail-on', 'none'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (bundle.status === 0) {
  const b = JSON.parse(bundle.stdout)
  expect(b.summary.assetScope === 'manifest', `next build output measured through its manifests (got ${b.summary.assetScope})`)
  expect(b.summary.staleFiles === 0, `a fresh next build has no stale assets (got ${b.summary.staleFiles})`)
  expect(typeof b.summary.buildId === 'string' && b.summary.buildId.length > 0, 'BUILD_ID read')
  console.log(`bundle-budget on .next: ${b.summary.measuredFiles} assets measured, entry ${b.summary.entryJsGzipKb} KB gzip, build ${b.summary.buildId}`)
} else console.log('bundle-budget: no .next build present, skipped')

console.log(`domain-deps on verification/next: ${deps.summary.files} files, ${deps.summary.edges} edges, typescript ${deps.analysis.typescript.version} (${deps.analysis.typescript.source}); routes-audit: ${routes.summary.serverActions} server action(s), ${routes.summary.handlers} handler(s)`)
if (failures.length) {
  console.error('next reference audit checks failed:\n- ' + failures.join('\n- '))
  process.exit(1)
}
console.log('next reference audit checks passed')
