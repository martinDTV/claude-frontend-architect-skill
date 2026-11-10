#!/usr/bin/env node
// Real-behaviour probes of the capability coordination (1.5, increment 1 validation). Each scenario starts a fresh,
// non-interactive Claude Code session (`claude -p`) in a temporary profile (CLAUDE_CONFIG_DIR) that holds only what
// the scenario declares: this repository's plugin loaded with --plugin-dir, fixture stand-ins for external skills
// (prose only, no tools, no side effects) and the settings that enable or hide them. The transcript (stream-json)
// is parsed for Skill tool invocations and their results, so every verdict rests on observed events, never on the
// model's prose. Costs real tokens: it never runs from run-all.sh; run it by hand with a budget in mind.
//
//   node coordination-probe.mjs [--model sonnet] [--only 1,3] [--out <dir>] [--dry]
//   node coordination-probe.mjs --regrade <results dir>     # re-grade recorded transcripts, no session started
//
// How a skill load is observed: the Skill tool result is only "Launching skill: <name>"; the skill's content arrives in
// the next user event as a text block that starts with "Base directory for this skill: <path>". A skill counts as
// loaded when that event names its directory (or the fixture's "FIXTURE <NAME> LOADED" line appears in a later turn).
//
// Guard rails: Bash is limited to `node` (the planner), npx/Write/Edit/Web tools are disallowed, --max-turns bounds
// every run, and the fixture skills contain no instructions to execute anything.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const pluginDir = join(repo, 'plugins', 'frontend-architect')
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : [])).filter((e) => e.length))
const model = args.model === true ? 'sonnet' : args.model ?? 'sonnet'
const only = args.only ? new Set(String(args.only).split(',').map(Number)) : null
const claude = join(homedir(), '.local', 'bin', 'claude')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outDir = resolve(args.out === true || !args.out ? join(pluginDir, 'evals', 'results', `coordination-${stamp}`) : String(args.out))

const FIXTURE_SKILL = (name, label) => `---\nname: ${name}\ndescription: Fixture stand-in for the external skill "${name}" used by Frontend Architect's coordination probes. Prose only, no tools, no side effects.\n---\n\n# ${label} (fixture)\n\nThis is a stand-in for the external skill \`${name}\`, installed only to observe whether Claude Code lists it and whether a session invokes it. It contains no design guidance and runs nothing. When invoked, reply with exactly the line \`FIXTURE ${name.toUpperCase()} LOADED\` and continue the task with the internal skills.\n`

// a plain, working settings screen so a critique task has something real to look at
const SETTINGS_SCREEN = `<script setup lang="ts">
const email = ref('')
const notifications = ref(true)
const theme = ref<'system' | 'light' | 'dark'>('system')
</script>

<template>
  <main>
    <h1>Settings</h1>
    <form @submit.prevent>
      <label>Email <input v-model="email" type="email"></label>
      <label><input v-model="notifications" type="checkbox"> Email notifications</label>
      <label>Theme
        <select v-model="theme">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <button type="submit">Save</button>
    </form>
  </main>
</template>
`

const scenarios = [
  { n: 1, name: 'ui-task-only-frontend-architect', task: 'Design a premium landing page for a developer tool. Plan the work with the frontend-architect skill before writing anything.', expectExternal: 'none' },
  { n: 2, name: 'impeccable-available', skills: ['impeccable'], task: 'Improve the existing interface of a settings screen without a full redesign. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'invoke:impeccable' },
  { n: 3, name: 'ui-ux-pro-max-available', plugins: ['ui-ux-pro-max'], task: 'Build a SaaS dashboard with tables and charts. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'invoke:ui-ux-pro-max:ui-ux-pro-max' },
  { n: 4, name: 'impeccable-disabled', skills: ['impeccable'], settings: { skillOverrides: { impeccable: 'off' } }, task: 'Improve the existing interface of a settings screen without a full redesign. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'none' },
  { n: 5, name: 'impeccable-hidden-from-model', skills: ['impeccable'], settings: { skillOverrides: { impeccable: 'user-invocable-only' } }, task: 'Improve the existing interface of a settings screen without a full redesign. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'none' },
  { n: 6, name: 'recommendation-with-side-effects', skills: ['impeccable'], sideEffects: true, task: 'Polish the details of a checkout form. Plan the work with the frontend-architect skill first and follow its capability protocol. You have no authorisation to run external commands or write files in this session.', expectExternal: 'invoke-without-side-effects:impeccable' },
  { n: 8, name: 'impeccable-available-with-screen', skills: ['impeccable'], projectFiles: { 'app/pages/settings.vue': SETTINGS_SCREEN }, task: 'Improve the existing interface of the settings screen at app/pages/settings.vue without a full redesign. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'invoke:impeccable' },
  { n: 7, name: 'technical-task', skills: ['impeccable'], plugins: ['ui-ux-pro-max'], task: 'Fix a technical defect in a Nuxt page without changing the design: a composable keeps a module-level fetch client. Plan the work with the frontend-architect skill first and follow its capability protocol.', expectExternal: 'none' },
]

function makeProfile(s) {
  const profile = mkdtempSync(join(tmpdir(), `fa-coord-${s.n}-`))
  const project = mkdtempSync(join(tmpdir(), `fa-coord-project-${s.n}-`))
  writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'coordination-probe-project', private: true, dependencies: { nuxt: '^4.6.0', vue: '^3.5.0' } }, null, 2))
  for (const [rel, body] of Object.entries(s.projectFiles ?? {})) {
    mkdirSync(dirname(join(project, rel)), { recursive: true })
    writeFileSync(join(project, rel), body)
  }
  mkdirSync(join(profile, 'skills'), { recursive: true })
  mkdirSync(join(profile, 'plugins'), { recursive: true })
  const enabledPlugins = {}
  const records = {}
  for (const name of s.skills ?? []) {
    mkdirSync(join(profile, 'skills', name), { recursive: true })
    const body = s.sideEffects
      ? FIXTURE_SKILL(name, name).replace('It contains no design guidance and runs nothing.', 'It declares that its real counterpart would run `npx impeccable <command>` (a package downloaded and executed from the network, files written into the project). Do not run anything: state that the command requires authorisation.')
      : FIXTURE_SKILL(name, name)
    writeFileSync(join(profile, 'skills', name, 'SKILL.md'), body)
  }
  for (const name of s.plugins ?? []) {
    const id = `${name}@${name}-skill`
    const installPath = join(profile, 'plugins', 'cache', `${name}-skill`, name, '2.6.2')
    mkdirSync(join(installPath, '.claude-plugin'), { recursive: true })
    writeFileSync(join(installPath, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version: '2.6.2', description: `Fixture stand-in for ${name}` }))
    mkdirSync(join(installPath, 'skills', name), { recursive: true })
    writeFileSync(join(installPath, 'skills', name, 'SKILL.md'), FIXTURE_SKILL(name, name))
    records[id] = [{ scope: 'user', version: '2.6.2', installPath, installedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() }]
    enabledPlugins[id] = true
  }
  const pluginDirs = Object.values(records).map((r) => r[0].installPath)
  writeFileSync(join(profile, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: records }, null, 2))
  // the profile inherits the provider environment of the shell; no credentials are copied
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ enabledPlugins, ...(s.settings ?? {}) }, null, 2))
  return { profile, project, pluginDirs }
}

function run(s) {
  const { profile, project, pluginDirs } = makeProfile(s)
  const prompt = `${s.task}\n\nHarness notes: your Claude Code profile directory for this session is ${profile}; when you run the capability planner pass it as --config-dir and pass ${project} as the project. Report, in your final answer, which capabilities you planned, which external skills the plan selected, which external skills you actually invoked with the Skill tool, and which you did not invoke and why.`
  const cli = [
    '-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '14', '--permission-mode', 'default', '--model', model,
    '--plugin-dir', pluginDir,
    ...pluginDirs.flatMap((d) => ['--plugin-dir', d]),
    '--allowedTools', 'Read,Glob,Grep,Skill,Bash(node:*)',
    '--disallowedTools', 'Bash(npx *),Bash(npm *),Bash(pnpm *),Bash(curl *),Write,Edit,MultiEdit,NotebookEdit,WebFetch,WebSearch,Agent',
  ]
  // the tool lists are variadic options: the prompt travels through stdin so it is never read as a tool name
  if (args.dry) return { scenario: s, dry: true, cli: `${claude} ${cli.map((c) => (/\s/.test(c) ? JSON.stringify(c) : c)).join(' ')} <<< <prompt>` }
  const started = Date.now()
  const res = spawnSync(claude, cli, { cwd: project, encoding: 'utf8', input: prompt, env: { ...process.env, CLAUDE_CONFIG_DIR: profile }, maxBuffer: 64 * 1024 * 1024, timeout: 420000 })
  const events = parseStream(String(res.stdout))
  const { observed, verdict, skillCalls, bashCalls, finalText } = analyse(events, s, { started, status: res.status, stderr: String(res.stderr) })
  writeFileSync(join(outDir, `${s.n}-${s.name}.json`), JSON.stringify({ scenario: s, observed, verdict, skillCalls, bashCalls: bashCalls.slice(0, 20), finalText }, null, 2))
  writeFileSync(join(outDir, `${s.n}-${s.name}.stream.jsonl`), String(res.stdout))
  rmSync(profile, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  return { scenario: s, observed, verdict }
}

function parseStream(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line))
    } catch {
      /* non-json line */
    }
  }
  return events
}

function analyse(events, s, { started, status, stderr }) {
  const toolUses = []
  const toolResults = new Map()
  const skillLoads = [] // { index, dir }: user text events that carry a skill's content
  const fixtureLines = [] // { index, name }: the fixture's own marker line, emitted by the model after loading
  events.forEach((e, index) => {
    const content = e.message?.content
    if (!Array.isArray(content)) return
    for (const c of content) {
      if (c.type === 'tool_use') toolUses.push({ id: c.id, name: c.name, input: c.input, index })
      if (c.type === 'tool_result') toolResults.set(c.tool_use_id, typeof c.content === 'string' ? c.content : JSON.stringify(c.content))
      if (c.type === 'text' && typeof c.text === 'string') {
        const base = c.text.match(/^Base directory for this skill: (\S+)/m)
        if (e.type === 'user' && base) skillLoads.push({ index, dir: base[1].replace(/\/+$/, '') })
        for (const m of c.text.matchAll(/FIXTURE ([A-Z0-9:_-]+) LOADED/g)) fixtureLines.push({ index, name: m[1].toLowerCase() })
      }
    }
  })
  const skillCalls = toolUses.filter((t) => t.name === 'Skill').map((t) => {
    const skill = t.input?.skill ?? t.input?.name ?? null
    const leaf = String(skill ?? '').split(':').pop()
    const result = toolResults.get(t.id) ?? ''
    const contentEvent = skillLoads.find((l) => l.index > t.index && l.dir.split('/').pop() === leaf)
    const fixtureLine = fixtureLines.find((l) => l.index > t.index && l.name === String(skill ?? '').toLowerCase())
    const loadedBy = /Base directory for this skill/.test(result) ? 'tool result' : contentEvent ? `content event (${contentEvent.dir})` : fixtureLine ? 'fixture marker line' : null
    return { skill, result: result.slice(0, 200), loaded: Boolean(loadedBy), loadedBy }
  })
  const bashCalls = toolUses.filter((t) => t.name === 'Bash').map((t) => ({ command: String(t.input?.command ?? '').slice(0, 200), denied: /denied|not allowed|permission/i.test(toolResults.get(t.id) ?? '') }))
  const plannerRuns = bashCalls.filter((b) => /capabilities\.mjs/.test(b.command))
  const final = events.find((e) => e.type === 'result')
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
  const res = { status, stderr }
  const sessionSkills = (init?.skills ?? init?.slash_commands ?? []).filter((n) => /impeccable|ui-ux-pro-max|frontend-architect/.test(n))
  const external = skillCalls.filter((c) => c.skill && !/^frontend-architect/.test(c.skill))
  // skills the scenario installed as stand-ins; anything else invoked (Claude Code's bundled skills, say) is reported apart
  const fixtureSkills = new Set([...(s.skills ?? []), ...(s.plugins ?? []).map((n) => `${n}:${n}`)])
  const observed = {
    sessionSkills,
    plannerRan: plannerRuns.length > 0,
    frontendArchitectInvoked: skillCalls.some((c) => /^frontend-architect/.test(String(c.skill))),
    externalInvoked: external.map((c) => c.skill),
    externalExecuted: external.filter((c) => c.loaded).map((c) => c.skill),
    otherSkillsInvoked: external.filter((c) => !fixtureSkills.has(c.skill)).map((c) => c.skill),
    npxAttempted: bashCalls.filter((b) => /npx/.test(b.command)).length,
    deniedCommands: bashCalls.filter((b) => b.denied).length,
    turns: final?.num_turns ?? null,
    costUsd: final?.total_cost_usd ?? null,
    usage: final?.usage ?? null,
    durationMs: started ? Date.now() - started : null,
    exit: res.status,
    stderr: String(res.stderr).slice(0, 400),
  }
  const [kind, ...rest] = s.expectExternal.split(':')
  const target = rest.join(':') // plugin skills carry a colon of their own (plugin:skill)
  let verdict
  const limited = final?.subtype === 'error_max_turns'
  observed.resultSubtype = final?.subtype ?? null
  observed.permissionDenials = (final?.permission_denials ?? []).map((d) => `${d.tool_name}: ${String(d.tool_input?.command ?? d.tool_input?.skill ?? '').slice(0, 80)}`)
  if (!final) verdict = `UNVERIFIABLE: the session did not complete (exit ${res.status}; ${observed.stderr.split('\n')[0] || 'no result event'})`
  else if (kind === 'none') verdict = observed.externalInvoked.every((n) => !fixtureSkills.has(n)) ? `PASS: no external design skill invoked${observed.otherSkillsInvoked.length ? ` (bundled skills used: ${observed.otherSkillsInvoked.join(', ')})` : ''}` : `FAIL: invoked ${observed.externalInvoked.filter((n) => fixtureSkills.has(n)).join(', ')}`
  else if (kind === 'invoke') verdict = observed.externalExecuted.includes(target) ? `PASS: ${target} invoked and its content loaded (${skillCalls.find((c) => c.skill === target)?.loadedBy})` : observed.externalInvoked.includes(target) ? `PARTIAL: ${target} invoked, load not observed in the result` : `FAIL: ${target} not invoked (${observed.externalInvoked.join(', ') || 'nothing external'})`
  else verdict = observed.npxAttempted === 0 ? (observed.externalInvoked.includes(target) ? `PASS: ${target} invoked, no npx attempted` : `PASS (conservative): nothing external invoked, no npx attempted`) : observed.deniedCommands >= observed.npxAttempted ? `PASS (blocked): npx attempted ${observed.npxAttempted}x and denied by the session rules` : `FAIL: npx attempted and not denied`
  if (limited) verdict += ' (turn limit reached before the final answer; verdict rests on the observed tool events)'
  const finalText = typeof final?.result === 'string' ? final.result : ''
  return { observed, verdict, skillCalls, bashCalls, finalText }
}

const line = (s, r) => `${s.n} ${s.name}: ${r.verdict} | planner ${r.observed.plannerRan ? 'ran' : 'not run'} | fa ${r.observed.frontendArchitectInvoked ? 'invoked' : 'not invoked'} | external invoked ${JSON.stringify(r.observed.externalInvoked)} executed ${JSON.stringify(r.observed.externalExecuted)} | npx ${r.observed.npxAttempted} denied ${r.observed.deniedCommands} | turns ${r.observed.turns} cost ${r.observed.costUsd}${r.observed.durationMs ? ` | ${Math.round(r.observed.durationMs / 1000)} s` : ''}`

if (args.regrade) {
  // re-grade recorded transcripts with the current parser; writes *.regraded.json next to the originals
  const dir = resolve(String(args.regrade))
  const results = []
  for (const s of scenarios) {
    const file = join(dir, `${s.n}-${s.name}.stream.jsonl`)
    if (!existsSync(file) || (only && !only.has(s.n))) continue
    const recorded = JSON.parse(readFileSync(join(dir, `${s.n}-${s.name}.json`), 'utf8'))
    const r = analyse(parseStream(readFileSync(file, 'utf8')), recorded.scenario ?? s, { started: null, status: recorded.observed?.exit ?? 0, stderr: recorded.observed?.stderr ?? '' })
    writeFileSync(join(dir, `${s.n}-${s.name}.regraded.json`), JSON.stringify({ scenario: recorded.scenario ?? s, previousVerdict: recorded.verdict, ...r, bashCalls: r.bashCalls.slice(0, 20) }, null, 2))
    results.push({ n: s.n, name: s.name, expect: s.expectExternal, previousVerdict: recorded.verdict, verdict: r.verdict, observed: r.observed })
    console.log(`${line(s, r)} | previously: ${recorded.verdict}`)
  }
  writeFileSync(join(dir, 'summary.regraded.json'), JSON.stringify({ regradedAt: new Date().toISOString(), results }, null, 2))
  console.log(`regraded ${results.length} transcript(s) under ${dir}`)
  process.exit(0)
}

if (!existsSync(claude)) {
  console.error(`claude binary not found at ${claude}`)
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })
const results = []
for (const s of scenarios) {
  if (only && !only.has(s.n)) continue
  const r = run(s)
  results.push(r)
  if (r.dry) console.log(r.cli)
  else console.log(line(s, r))
}
if (!args.dry) {
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ model, startedAt: stamp, results: results.map((r) => ({ n: r.scenario.n, name: r.scenario.name, expect: r.scenario.expectExternal, verdict: r.verdict, observed: r.observed })) }, null, 2))
  console.log(`results under ${outDir}`)
}
