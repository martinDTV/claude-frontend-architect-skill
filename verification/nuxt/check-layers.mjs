#!/usr/bin/env node
// Asserts, from the files `nuxt prepare` generates, that the layer under layers/base is registered
// and resolved the way nuxt-layers.md claims: component and composable paths point into the layer,
// and the layer's runtimeConfig / app.config keys reach the generated types. Run after `nuxt prepare`.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(root, '.nuxt', p), 'utf8')
const checks = [
  ['components.d.ts registers BaseTag from the layer', () => /export const BaseTag: typeof import\("\.\.\/layers\/base\/app\/components\/base\/BaseTag\.vue"\)\['default'\]/.test(read('components.d.ts'))],
  ['components.d.ts registers LazyBaseTag from the layer', () => /export const LazyBaseTag: LazyComponent<typeof import\("\.\.\/layers\/base\/app\/components\/base\/BaseTag\.vue"\)/.test(read('components.d.ts'))],
  ['components.d.ts registers LayerDemo from the app', () => /export const LayerDemo: typeof import\("\.\.\/app\/components\/LayerDemo\.vue"\)\['default'\]/.test(read('components.d.ts'))],
  ['types/imports.d.ts auto-imports useLayerInfo from the layer', () => /const useLayerInfo: typeof import\('\.\.\/\.\.\/layers\/base\/app\/composables\/useLayerInfo'\)\.useLayerInfo/.test(read('types/imports.d.ts'))],
  ['types/runtime-config.d.ts types runtimeConfig.public.layerName from the layer', () => /interface SharedPublicRuntimeConfig \{[\s\S]*?layerName: string/.test(read('types/runtime-config.d.ts'))],
  ['types/runtime-config.d.ts still types the app\'s own keys (apiBase)', () => /interface SharedPublicRuntimeConfig \{[\s\S]*?apiBase: string/.test(read('types/runtime-config.d.ts'))],
  ['types/app.config.d.ts merges the layer app.config (from the layer app/ directory)', () => /import cfg\d+ from "\.\.\/\.\.\/layers\/base\/app\/app\.config"/.test(read('types/app.config.d.ts')) && /Defu<typeof inlineConfig, \[[^\]]*typeof cfg\d+/.test(read('types/app.config.d.ts'))],
]
let failed = 0
for (const [name, fn] of checks) {
  let ok = false
  try {
    ok = fn()
  } catch (e) {
    ok = false
  }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
if (failed) {
  console.error(`check-layers: ${failed} assertion(s) failed`)
  process.exit(1)
}
console.log('check-layers: layer registration verified from generated types')
