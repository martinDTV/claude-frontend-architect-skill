// Capability coordination (1.5, increment 1): the selector is tested against generated Claude Code environments
// (install records, caches, skills directories, settings files under temporary home and project directories).
// Nothing here runs a skill: these are tests of selection and detection, never of skill execution.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { byId, runTool, scriptsDir } from './helpers.mjs'

const { capabilitiesFor, loadRegistry } = await import(join(scriptsDir, 'capabilities.mjs'))
const registry = loadRegistry()

const PLUGINS = {
  'frontend-design': { id: 'frontend-design@claude-plugins-official', marketplace: 'claude-plugins-official', name: 'frontend-design', version: '1.1.1', skills: ['frontend-design'] },
  'ui-ux-pro-max': { id: 'ui-ux-pro-max@ui-ux-pro-max-skill', marketplace: 'ui-ux-pro-max-skill', name: 'ui-ux-pro-max', version: '2.6.2', skills: ['ui-ux-pro-max', 'design-system', 'ui-styling'] },
}

/** Builds a fake ~/.claude and a project directory; returns their paths. */
function makeEnv({ plugins = [], skills = [], userSettings = {}, projectSettings = null, localSettings = null, marketplaces = [], projectDeps = null } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'fa-cap-home-'))
  const project = mkdtempSync(join(tmpdir(), 'fa-cap-project-'))
  const configDir = join(home, '.claude')
  mkdirSync(join(configDir, 'plugins'), { recursive: true })
  const records = {}
  const enabled = {}
  for (const p of plugins) {
    const spec = { ...PLUGINS[p.key], ...p }
    const installPath = p.installPath ?? join(configDir, 'plugins', 'cache', spec.marketplace, spec.name, spec.version)
    if (p.cached !== false) {
      mkdirSync(join(installPath, '.claude-plugin'), { recursive: true })
      writeFileSync(join(installPath, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: spec.name, version: spec.version }))
      for (const s of spec.skills) {
        mkdirSync(join(installPath, 'skills', s), { recursive: true })
        writeFileSync(join(installPath, 'skills', s, 'SKILL.md'), `---\nname: ${s}\ndescription: synthetic\n---\n# ${s}\n`)
      }
    }
    records[spec.id] = [...(records[spec.id] ?? []), { scope: p.scope ?? 'user', version: spec.version, installPath, ...(p.projectPath ? { projectPath: p.projectPath } : {}) }]
    if (p.enabledInUser !== false) enabled[spec.id] = true
  }
  writeFileSync(join(configDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: records }, null, 2))
  for (const m of marketplaces) {
    mkdirSync(join(configDir, 'plugins', 'marketplaces', m.name, '.claude-plugin'), { recursive: true })
    writeFileSync(join(configDir, 'plugins', 'marketplaces', m.name, '.claude-plugin', 'marketplace.json'), JSON.stringify({ name: m.name, plugins: m.plugins.map((n) => ({ name: n, source: `./plugins/${n}` })) }))
  }
  for (const s of skills) {
    const base = s.source === 'project' ? join(project, '.claude', 'skills', s.dir ?? s.name) : join(configDir, 'skills', s.dir ?? s.name)
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'SKILL.md'), `---\nname: ${s.name}\n${s.version ? `version: ${s.version}\n` : ''}description: synthetic ${s.name}\n---\n# ${s.name}\n`)
    if (s.pluginDir) {
      mkdirSync(join(base, '.claude-plugin'), { recursive: true })
      writeFileSync(join(base, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: s.name, version: '0.0.1' }))
    }
  }
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: enabled, ...userSettings }, null, 2))
  if (projectDeps) writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'fixture', private: true, dependencies: Object.fromEntries(projectDeps.map((d) => [d, '*'])) }))
  if (projectSettings) {
    mkdirSync(join(project, '.claude'), { recursive: true })
    writeFileSync(join(project, '.claude', 'settings.json'), JSON.stringify(projectSettings, null, 2))
  }
  if (localSettings) {
    mkdirSync(join(project, '.claude'), { recursive: true })
    writeFileSync(join(project, '.claude', 'settings.local.json'), JSON.stringify(localSettings, null, 2))
  }
  return { home, configDir, project }
}

function plan(env, task, extra = []) {
  const { code, report } = runTool('capabilities.mjs', [env.project, '--task', task, '--config-dir', env.configDir, '--fail-on', 'none', ...extra])
  assert.equal(code, 0, `capabilities exit ${code}`)
  return report
}
const row = (report, cap) => report.data.plan.rows.find((r) => r.capability === cap)
const state = (report, id) => report.data.integrations.find((i) => i.id === id)?.state
const LANDING = 'Design a premium landing page'
const IMPROVE = 'Improve the existing interface without a full redesign'
const DASHBOARD = 'Build a SaaS dashboard with tables and charts'

function assertNoInventedExecution(report) {
  assert.match(report.summary.executed, /^none/)
  assert.ok(report.notes.some((n) => /Nothing here ran a skill/.test(n)))
  for (const r of report.data.plan.rows) if (r.collaborator) {
    assert.equal(r.collaborator.execution, 'not-run')
    assert.match(r.collaborator.evidenceRequired, /Skill tool invocation/)
  }
  for (const i of report.data.integrations) assert.equal(i.execution, 'not-run')
  assert.deepEqual(report.findings.filter((f) => f.level === 'confirmed'), [], 'a plan never confirms anything')
}

test('use cases A–H: capabilities are proportional to the task, in English and in Spanish', () => {
  const cases = [
    ['A', DASHBOARD, 'Crear un dashboard SaaS con tablas y gráficas', ['design-system', 'ui-implementation', 'responsive-design', 'accessibility-review']],
    ['B', LANDING, 'Diseñar una landing page premium', ['visual-direction', 'ui-implementation', 'responsive-design', 'accessibility-review']],
    ['C', IMPROVE, 'Mejorar una interfaz existente sin rediseñarla totalmente', ['visual-critique', 'ui-polish', 'accessibility-review']],
    ['D', 'Audit the accessibility of the app', 'Auditar la accesibilidad de la aplicación', ['accessibility-review', 'browser-verification']],
    ['E', 'Implement a GSAP scroll animation', 'Implementar una animación GSAP al hacer scroll', ['motion-design']],
    ['F', 'Design a Three.js experience for the hero', 'Diseñar una experiencia Three.js para la portada', ['visual-direction', 'responsive-design', 'accessibility-review', '3d-experience']],
    ['G', 'Refactor components keeping their contracts', 'Refactorizar componentes manteniendo contratos', ['frontend-architecture']],
    ['H', 'Fix a technical defect without changing the design', 'Corregir un defecto técnico sin modificar el diseño visual', ['frontend-architecture', 'browser-verification']],
  ]
  for (const [label, en, es, expected] of cases) {
    assert.deepEqual(capabilitiesFor(en, registry).needed, expected, `${label} (en): ${en}`)
    assert.deepEqual(capabilitiesFor(es, registry).needed, expected, `${label} (es): ${es}`)
  }
  // heavy capabilities only when named: a dashboard never gets motion or 3D, a landing never gets WebGL
  for (const t of [DASHBOARD, LANDING, IMPROVE]) for (const heavy of ['motion-design', '3d-experience']) assert.ok(!capabilitiesFor(t, registry).needed.includes(heavy), `${t} must not need ${heavy}`)
  assert.deepEqual(capabilitiesFor('', registry).needed, [])
})

test('no external integration available: internal owners, explicit fallback, nothing selected', () => {
  const env = makeEnv()
  const report = plan(env, LANDING)
  assert.equal(report.summary.selected, 'none')
  assert.equal(report.summary.available, 'none')
  assert.ok(report.data.integrations.every((i) => i.state === 'not-installed'))
  assert.deepEqual(byId(report, 'external-fallback').map((f) => f.message.split(':')[0]).sort(), ['ui-implementation', 'visual-direction'])
  assert.equal(row(report, 'visual-direction').owner, 'creative-frontend')
  assert.match(row(report, 'visual-direction').fallback, /internal, always applies/)
  assert.equal(byId(report, 'collaboration-selected').length, 0)
  assertNoInventedExecution(report)
})

test('only Frontend Design installed (official plugin): selected for visual direction, not for implementation', () => {
  const env = makeEnv({ plugins: [{ key: 'frontend-design' }] })
  const report = plan(env, LANDING)
  assert.equal(state(report, 'frontend-design'), 'available')
  assert.equal(report.summary.selected, 'frontend-design')
  assert.equal(row(report, 'visual-direction').collaborator.invoke, 'frontend-design:frontend-design')
  assert.equal(row(report, 'visual-direction').collaborator.version, '1.1.1')
  assert.equal(row(report, 'ui-implementation').collaborator, null, 'frontend-design does not cover implementation')
  assert.equal(byId(report, 'external-fallback').length, 1)
  assertNoInventedExecution(report)
})

test('only Impeccable installed (standalone user skill): selected for critique and polish; its preconditions travel with the recommendation', () => {
  const env = makeEnv({ skills: [{ name: 'impeccable', source: 'user' }] })
  const report = plan(env, IMPROVE)
  assert.equal(state(report, 'impeccable'), 'available')
  assert.equal(row(report, 'visual-critique').collaborator.id, 'impeccable')
  assert.equal(row(report, 'ui-polish').collaborator.id, 'impeccable')
  assert.equal(row(report, 'accessibility-review').externalAllowed, false)
  const selected = byId(report, 'collaboration-selected')
  assert.equal(selected.length, 2)
  assert.match(selected[0].message, /npx runs a package from the network/)
  assert.match(selected[0].message, /has not been run/)
  const noVersion = report.data.integrations.find((i) => i.id === 'impeccable')
  assert.ok(noVersion.reasons.some((r) => /no version in its frontmatter/.test(r)))
  assertNoInventedExecution(report)
})

test('only UI UX Pro Max installed: selected for design system and implementation of a dashboard, never for accessibility', () => {
  const env = makeEnv({ plugins: [{ key: 'ui-ux-pro-max' }] })
  const report = plan(env, DASHBOARD)
  assert.equal(report.summary.selected, 'ui-ux-pro-max')
  assert.equal(row(report, 'design-system').collaborator.id, 'ui-ux-pro-max')
  assert.equal(row(report, 'ui-implementation').collaborator.id, 'ui-ux-pro-max')
  assert.equal(row(report, 'accessibility-review').collaborator, null)
  assert.equal(row(report, 'responsive-design').collaborator, null)
  assert.match(byId(report, 'collaboration-selected')[0].message, /never set or share API keys/)
  assertNoInventedExecution(report)
})

test('several compatible integrations: one is chosen by coverage then registry order, the others are alternatives; --max-external raises the cap', () => {
  const env = makeEnv({ plugins: [{ key: 'frontend-design' }, { key: 'ui-ux-pro-max' }], skills: [{ name: 'impeccable', source: 'user' }] })
  const landing = plan(env, LANDING)
  assert.equal(landing.summary.available, 'frontend-design,impeccable,ui-ux-pro-max')
  assert.equal(landing.summary.selected, 'ui-ux-pro-max', 'covers visual direction and implementation: the widest coverage')
  assert.deepEqual(row(landing, 'visual-direction').alternatives, ['frontend-design', 'impeccable'])
  assert.equal(byId(landing, 'collaboration-overlap').length, 1)
  const improve = plan(env, IMPROVE)
  assert.equal(improve.summary.selected, 'impeccable', 'critique and polish: impeccable covers both')
  assert.deepEqual(row(improve, 'visual-critique').alternatives, ['frontend-design'])
  // a plan that would need two integrations defers the second one by default
  const both = plan(env, 'Design a premium landing page and polish the details')
  assert.equal(both.summary.selected, 'impeccable', 'tie on coverage: registry order (increasing risk) decides')
  assert.deepEqual(row(both, 'ui-implementation').deferred, ['ui-ux-pro-max'])
  assert.equal(byId(both, 'collaboration-deferred').length, 1)
  const raised = plan(env, 'Design a premium landing page and polish the details', ['--max-external', '2'])
  assert.equal(raised.summary.selected, 'impeccable,ui-ux-pro-max')
  assert.equal(row(raised, 'ui-implementation').collaborator.id, 'ui-ux-pro-max')
  assertNoInventedExecution(landing)
  assertNoInventedExecution(raised)
})

test('disabled integrations are never available: enabledPlugins false in project settings, skillOverrides off or name-only', () => {
  const env = makeEnv({ plugins: [{ key: 'ui-ux-pro-max' }], skills: [{ name: 'impeccable', source: 'user' }], projectSettings: { enabledPlugins: { 'ui-ux-pro-max@ui-ux-pro-max-skill': false } }, localSettings: { skillOverrides: { impeccable: 'off' } } })
  const report = plan(env, LANDING)
  assert.equal(state(report, 'ui-ux-pro-max'), 'disabled')
  assert.equal(state(report, 'impeccable'), 'disabled')
  assert.equal(report.summary.selected, 'none')
  assert.equal(report.summary.disabled, 2)
  assert.equal(byId(report, 'integration-disabled').length, 2)
  assert.match(byId(report, 'integration-disabled').find((f) => /ui-ux/.test(f.message)).message, /project settings/)
  assert.match(byId(report, 'integration-disabled').find((f) => /impeccable/.test(f.message)).message, /local settings/)
  // local overrides project overrides user: enable again locally and the plugin is back
  const back = makeEnv({ plugins: [{ key: 'ui-ux-pro-max' }], projectSettings: { enabledPlugins: { 'ui-ux-pro-max@ui-ux-pro-max-skill': false } }, localSettings: { enabledPlugins: { 'ui-ux-pro-max@ui-ux-pro-max-skill': true } } })
  assert.equal(state(plan(back, LANDING), 'ui-ux-pro-max'), 'available')
  // name-only: the user can run it, Claude cannot pick it on its own
  const hidden = makeEnv({ skills: [{ name: 'impeccable', source: 'user' }], userSettings: { skillOverrides: { impeccable: 'name-only' } } })
  const h = plan(hidden, IMPROVE)
  assert.equal(state(h, 'impeccable'), 'hidden-from-model')
  assert.equal(h.summary.selected, 'none')
  assert.equal(byId(h, 'integration-hidden').length, 1)
})

test('obsolete integrations are reported and not selected', () => {
  const env = makeEnv({ plugins: [{ key: 'ui-ux-pro-max', version: '1.0.0' }, { key: 'frontend-design', version: '0.9.0' }] })
  const report = plan(env, LANDING)
  assert.equal(state(report, 'ui-ux-pro-max'), 'obsolete')
  assert.equal(state(report, 'frontend-design'), 'obsolete')
  assert.equal(report.summary.selected, 'none')
  assert.equal(byId(report, 'integration-obsolete').length, 2)
  assert.match(byId(report, 'integration-obsolete')[0].message, /below the minimum/)
})

test('unknown and lookalike skills: a name is not availability', () => {
  const env = makeEnv({ skills: [{ name: 'frontend-design', source: 'project' }, { name: 'design-taste-frontend', source: 'user' }, { name: 'impeccable', source: 'user', pluginDir: true }], marketplaces: [{ name: 'claude-plugins-official', plugins: ['frontend-design'] }] })
  const report = plan(env, LANDING)
  assert.equal(state(report, 'frontend-design'), 'not-installed', 'a project skill named frontend-design is not the official plugin')
  assert.equal(state(report, 'impeccable'), 'not-installed', 'a plugin directory inside skills/ is not the standalone skill')
  assert.equal(report.summary.selected, 'none')
  const lookalikes = byId(report, 'integration-lookalike')
  assert.equal(lookalikes.length, 2)
  assert.ok(lookalikes.every((f) => f.level === 'heuristic'))
  assert.equal(report.summary.unlisted, 1, 'design-taste-frontend is counted, not reported')
  assert.deepEqual(report.data.unlisted, [{ name: 'design-taste-frontend', source: 'user' }])
  const notInstalled = byId(report, 'integration-not-installed').find((f) => /frontend-design/.test(f.message))
  assert.match(notInstalled.message, /listed in the claude-plugins-official marketplace/)
  // records that belong to another project, or whose cache is gone, do not make a plugin available here
  const foreign = makeEnv({ plugins: [{ key: 'ui-ux-pro-max', scope: 'project', projectPath: '/somewhere/else', enabledInUser: false }] })
  const f = plan(foreign, DASHBOARD)
  assert.equal(state(f, 'ui-ux-pro-max'), 'not-installed')
  assert.ok(f.data.integrations.find((i) => i.id === 'ui-ux-pro-max').reasons.some((r) => /another project/.test(r)))
  const gone = makeEnv({ plugins: [{ key: 'ui-ux-pro-max', cached: false }] })
  assert.equal(state(plan(gone, DASHBOARD), 'ui-ux-pro-max'), 'not-cached')
})

test('technical requests never get a design collaborator, even when every integration is available', () => {
  const env = makeEnv({ plugins: [{ key: 'frontend-design' }, { key: 'ui-ux-pro-max' }], skills: [{ name: 'impeccable', source: 'user' }] })
  for (const task of ['Fix a technical defect without changing the design', 'Refactor components keeping their contracts', 'Audit the accessibility of the app']) {
    const report = plan(env, task)
    assert.equal(report.summary.selected, 'none', task)
    assert.equal(byId(report, 'no-external-collaboration').length, 1, task)
    assert.equal(byId(report, 'collaboration-selected').length, 0, task)
  }
  // motion with GSAP named but no GSAP skill installed: the owner continues, nothing selected, no design skill
  const motion = plan(env, 'Implement a GSAP scroll animation')
  assert.equal(motion.summary.selected, 'none')
  assert.equal(byId(motion, 'collaboration-selected').length, 0)
  assert.equal(byId(motion, 'external-fallback').length, 1)
  // a 3D-led experience keeps design collaborators out: creative-frontend leads
  const three = plan(env, 'Design a Three.js experience for the hero')
  assert.equal(three.summary.selected, 'none')
  assert.match(row(three, 'visual-direction').fallback, /3D-led/)
})

test('explicit --needs, --no-detect and an unknown capability', () => {
  const env = makeEnv({ plugins: [{ key: 'frontend-design' }] })
  const explicit = runTool('capabilities.mjs', [env.project, '--needs', 'visual-direction', '--config-dir', env.configDir, '--fail-on', 'none']).report
  assert.deepEqual(explicit.data.plan.needed, ['visual-direction', 'responsive-design', 'accessibility-review'], 'implications apply to explicit capabilities too')
  assert.equal(explicit.summary.selected, 'frontend-design')
  const offline = runTool('capabilities.mjs', [env.project, '--task', LANDING, '--config-dir', env.configDir, '--no-detect', '--fail-on', 'none']).report
  assert.equal(offline.analysis.mode, 'plan-only')
  assert.deepEqual(offline.data.integrations, [])
  assert.equal(offline.summary.selected, 'none')
  assert.equal(byId(offline, 'external-fallback').length, 2, 'visual direction and implementation both fall back to their owners')
  const bad = runTool('capabilities.mjs', [env.project, '--needs', 'telepathy', '--config-dir', env.configDir], { parse: false })
  assert.equal(bad.code, 2)
  assert.match(bad.stderr, /unknown capabilities: telepathy/)
})

test('deterministic: equivalent tasks and repeated runs produce the same plan; the tool writes nothing', () => {
  const env = makeEnv({ plugins: [{ key: 'frontend-design' }, { key: 'ui-ux-pro-max' }], skills: [{ name: 'impeccable', source: 'user' }] })
  const listing = (dir) => { const out = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); out.push(p); if (e.isDirectory()) walk(p) } }; walk(dir); return out.sort() }
  const before = [...listing(env.home), ...listing(env.project)]
  const a = plan(env, DASHBOARD)
  const b = plan(env, 'Crear un dashboard SaaS con tablas y gráficas')
  const c = plan(env, DASHBOARD)
  assert.deepEqual(a.data.plan, b.data.plan)
  assert.deepEqual(a.data.plan, c.data.plan)
  assert.deepEqual(a.findings.map((f) => `${f.id}|${f.message}`), c.findings.map((f) => `${f.id}|${f.message}`))
  assert.deepEqual([...listing(env.home), ...listing(env.project)], before, 'no file created in the home or the project')
})

const GSAP_SKILLS = ['gsap-core', 'gsap-timeline', 'gsap-scrolltrigger', 'gsap-react', 'gsap-frameworks', 'gsap-performance', 'gsap-plugins', 'gsap-utils'].map((name) => ({ name, source: 'user' }))

test('GSAP skills: gated behind the task naming GSAP or the project depending on it; chosen by sub-capability, one group per plan', () => {
  const env = makeEnv({ skills: GSAP_SKILLS })
  // motion without GSAP named and without the dependency: internal owner, gate reported, nothing selected
  const plain = plan(env, 'Animate the hero on load')
  assert.equal(plain.summary.selected, 'none')
  assert.match(row(plain, 'motion-design').fallback, /skills are not consulted/)
  assert.equal(byId(plain, 'external-gated').length, 1)
  assert.equal(byId(plain, 'collaboration-selected').length, 0)
  // GSAP named: the scroll skill, alone, with the reason
  const scroll = plan(env, 'Implement a GSAP scroll animation')
  assert.equal(scroll.summary.selected, 'gsap-scrolltrigger')
  assert.deepEqual(scroll.data.plan.selectedGroups, ['gsap'])
  assert.match(row(scroll, 'motion-design').selectionReason, /sub-capability match/)
  assert.ok(row(scroll, 'motion-design').alternatives.includes('gsap-core'))
  assert.equal(byId(scroll, 'collaboration-selected').length, 1)
  // a timeline in React: two skills of the same group count as one external integration
  const react = plan(env, 'Build a GSAP timeline sequence for a React component')
  assert.equal(react.summary.selected, 'gsap-timeline,gsap-react')
  assert.equal(row(react, 'motion-design').coCollaborators.length, 1)
  assert.equal(byId(react, 'collaboration-selected').length, 2)
  // the project framework adds the framework skill even when the task does not name it
  const nuxt = makeEnv({ skills: GSAP_SKILLS, projectDeps: ['nuxt', 'vue', 'gsap'] })
  const dep = plan(nuxt, 'Animate the hero with a scroll-linked reveal')
  assert.equal(dep.summary.selected, 'gsap-scrolltrigger,gsap-frameworks', 'gsap is a dependency: the gate opens without naming it; scroll and the Vue/Nuxt skill')
  // nothing specific named with the dependency present: the core skill only
  const core = plan(makeEnv({ skills: GSAP_SKILLS, projectDeps: ['gsap'] }), 'Animate the hero on load')
  assert.equal(core.summary.selected, 'gsap-core')
  const coreReact = plan(makeEnv({ skills: GSAP_SKILLS, projectDeps: ['gsap', 'react', 'next'] }), 'Animate the hero on load')
  assert.equal(coreReact.summary.selected, 'gsap-core,gsap-react', 'nothing specific named, React project: core plus the React skill')
  assert.match(row(core, 'motion-design').selectionReason, /core skill/)
  // GSAP skills never cover design capabilities, and design skills never cover motion
  const mixed = makeEnv({ skills: [...GSAP_SKILLS, { name: 'impeccable', source: 'user' }], plugins: [{ key: 'ui-ux-pro-max' }] })
  const landing = plan(mixed, 'Design a premium landing page with GSAP scroll animations')
  assert.equal(landing.summary.selected, 'ui-ux-pro-max', 'one external group by default: the design plugin wins the slot, GSAP is deferred')
  assert.deepEqual(row(landing, 'motion-design').deferred, ['gsap-scrolltrigger'])
  const both = plan(mixed, 'Design a premium landing page with GSAP scroll animations', ['--max-external', '2'])
  assert.equal(both.summary.selected, 'ui-ux-pro-max,gsap-scrolltrigger')
  assert.equal(row(both, 'visual-direction').collaborator.id, 'ui-ux-pro-max')
  assert.equal(row(both, 'motion-design').collaborator.id, 'gsap-scrolltrigger')
  // a GSAP skill that is disabled or missing is not selected; the owner continues
  const off = makeEnv({ skills: GSAP_SKILLS, userSettings: { skillOverrides: { 'gsap-scrolltrigger': 'off' } } })
  const noScroll = plan(off, 'Implement a GSAP scroll animation')
  assert.equal(noScroll.summary.selected, 'gsap-core', 'the specific skill is disabled: the core skill stands in')
  assertNoInventedExecution(scroll)
  assertNoInventedExecution(both)
})
