// skill-activation-surface (1.8 increment 1b): the only thing the model reads before deciding to activate a skill or a
// subagent is its frontmatter description, cut at 1,536 characters in the listing and dropped entirely when the listing
// budget overflows (least-invoked first). These checks keep that surface within the documented limits and the project's
// own ceiling, with the key use case and a real trigger phrase first — they do not and cannot prove activation.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = join(here, '..', '..', 'plugins', 'frontend-architect')
const fm = (file) => {
  const src = readFileSync(file, 'utf8')
  const m = /^---\n([\s\S]*?)\n---/.exec(src)
  assert.ok(m, `${file} has frontmatter`)
  const out = {}
  for (const line of m[1].split('\n')) { const k = /^([a-z-]+):\s*(.*)$/.exec(line); if (k) out[k[1]] = k[2] }
  return out
}
const skills = { architect: fm(join(plugin, 'skills/frontend-architect/SKILL.md')), creative: fm(join(plugin, 'skills/creative-frontend/SKILL.md')) }
const reviewer = fm(join(plugin, 'agents/frontend-reviewer.md'))
const LISTING_CAP = 1536, PROJECT_CEILING = 1000
const firstSentence = (s) => s.split(/(?<=\.)\s/)[0]

test('every description is under the documented 1,536-character listing cap and the project ceiling', () => {
  for (const [name, f] of Object.entries({ ...skills, reviewer })) {
    assert.ok(f.description, `${name} has a description`)
    assert.ok(f.description.length <= LISTING_CAP, `${name}: ${f.description.length} > ${LISTING_CAP} (would be truncated)`)
    assert.ok(f.description.length <= PROJECT_CEILING, `${name}: ${f.description.length} > ${PROJECT_CEILING} (project ceiling; shorter listings survive the budget)`)
  }
})

test('the key use case and a trigger the pilot prompts use appear within the first two sentences', () => {
  const twoSentences = (s) => s.split(/(?<=\.)\s/).slice(0, 2).join(' ')
  assert.match(twoSentences(skills.architect.description), /\b(audit|review|refactor|structure)/i, 'frontend-architect leads with its use cases')
  assert.match(twoSentences(skills.architect.description), /Nuxt|Vue|Next\.js|React/, 'and names the frameworks users say')
  assert.match(twoSentences(skills.creative.description), /\b(look|feel|design|motion|animation|3D)/i, 'creative-frontend leads with its use cases')
  assert.match(firstSentence(reviewer.description), /read-only reviewer/i)
  assert.match(reviewer.description, /use proactively/i, 'the documented phrasing for subagents')
  assert.match(reviewer.description, /what should we fix first/i, 'the exact ask of the pilot prompts')
})

test('nothing prevents model invocation and the two skills do not compete on the same first-sentence triggers', () => {
  for (const [name, f] of Object.entries(skills)) assert.notEqual(f['disable-model-invocation'], 'true', `${name} stays model-invocable`)
  const words = (s) => new Set(firstSentence(s).toLowerCase().match(/\b(audit|review|refactor|structure|architecture|state|api|motion|animation|3d|design|visual|look|feel)\b/g) ?? [])
  const a = words(skills.architect.description), c = words(skills.creative.description)
  const shared = [...a].filter((w) => c.has(w))
  assert.deepEqual(shared, [], `the first sentences share trigger words: ${shared.join(', ')}`)
})
