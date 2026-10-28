import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = dirname(fileURLToPath(import.meta.url))
export const scriptsDir = join(here, '..', '..', 'plugins', 'frontend-architect', 'skills', 'frontend-architect', 'scripts')
export const fixtures = join(here, 'fixtures')

/** Runs a tool with --json and returns { code, report, stdout, stderr }. */
export function runTool(name, args = [], { parse = true } = {}) {
  const result = spawnSync(process.execPath, [join(scriptsDir, name), ...args, ...(parse ? ['--json'] : [])], { encoding: 'utf8' })
  let report = null
  if (parse && result.stdout.trim()) {
    try {
      report = JSON.parse(result.stdout)
    } catch (e) {
      throw new Error(`${name} did not print JSON: ${e.message}\n${result.stdout.slice(0, 500)}\n${result.stderr}`)
    }
  }
  return { code: result.status, report, stdout: result.stdout, stderr: result.stderr }
}

export const byId = (report, id) => report.findings.filter((f) => f.id === id)
