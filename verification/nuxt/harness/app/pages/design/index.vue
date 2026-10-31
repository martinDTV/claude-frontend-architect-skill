<script setup lang="ts">
// The design system page: the contract rendered by the app that consumes it (roles with their resolved colours and the
// ratio each pair reaches in the active theme, type scale, spacing, radius, elevation, motion, interactive states).
// Reads app/design/contract.json (copied by extract.mjs) and the computed styles of the page itself, so what is shown
// is what the stylesheet applies, not what the file promises.
import contract from '~/design/contract.json'

useHead({ title: 'Design contract' })

const roles = ['canvas', 'surface', 'surface-raised', 'fg', 'fg-muted', 'border', 'border-strong', 'accent', 'accent-fg', 'accent-hover', 'focus', 'success', 'success-fg', 'warning', 'warning-fg', 'danger', 'danger-fg', 'info', 'info-fg'] as const
const pairs: Array<[string, string, number]> = [['fg', 'canvas', 4.5], ['fg-muted', 'canvas', 4.5], ['fg', 'surface', 4.5], ['accent-fg', 'accent', 4.5], ['accent', 'canvas', 4.5], ['border-strong', 'canvas', 3], ['focus', 'canvas', 3], ['danger', 'canvas', 4.5]]
const sizes = Object.keys(contract.typography.steps) as Array<keyof typeof contract.typography.steps>
const spacing = contract.spacing.scale
const radii = Object.entries(contract.radius.scale)
const levels = contract.elevation.levels
const durations = Object.entries(contract.motion.durations)

const colorMode = useColorMode()
const resolved = ref<Record<string, string>>({})
const ratios = ref<Array<{ fg: string; bg: string; ratio: number; required: number }>>([])
const luminance = (hex: string) => {
  const c = hex.replace('#', '')
  const lin = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  const n = (i: number) => parseInt(c.slice(i, i + 2), 16)
  return 0.2126 * lin(n(0)) + 0.7152 * lin(n(2)) + 0.0722 * lin(n(4))
}
const rgbToHex = (rgb: string) => { const m = rgb.match(/\d+/g); return m ? '#' + m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('') : rgb }
const measure = () => {
  const probe = document.createElement('div')
  document.body.appendChild(probe)
  const out: Record<string, string> = {}
  for (const role of roles) { probe.style.color = `var(--${role})`; out[role] = rgbToHex(getComputedStyle(probe).color) }
  probe.remove()
  resolved.value = out
  ratios.value = pairs.map(([fg, bg, required]) => { const a = luminance(out[fg]!), b = luminance(out[bg]!); const [hi, lo] = a > b ? [a, b] : [b, a]; return { fg, bg, required, ratio: Number(((hi + 0.05) / (lo + 0.05)).toFixed(2)) } })
}
onMounted(measure)
watch(() => colorMode.value, () => nextTick(measure))
const busy = ref(false)
const sent = ref(false)
const toast = useToast()
const confirm = async () => { busy.value = true; await new Promise((r) => setTimeout(r, 600)); busy.value = false; sent.value = true; toast.add({ title: 'Preference saved', description: 'Density stays compact on this device.', color: 'success' }) }
</script>

<template>
  <main class="mx-auto max-w-(--container-page) px-4 py-8 text-fg sm:px-6" data-design-page>
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm text-fg-muted">Design contract · {{ contract.name }} v{{ contract.version }} · {{ contract.density }}</p>
        <h1 class="text-2xl font-semibold tracking-tight">{{ contract.direction.adjectives.join(' · ') }}</h1>
        <p class="mt-2 max-w-prose whitespace-pre-line text-fg-muted">{{ contract.direction.statement }}</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- the stored preference lives in the browser: the server cannot know it, so the name and the button render on the client only -->
        <ClientOnly>
          <span class="text-sm text-fg-muted" data-theme-name>{{ colorMode.value }}</span>
          <UColorModeButton aria-label="Toggle colour theme" data-theme-toggle />
          <template #fallback><span class="inline-block h-8 w-28" aria-hidden="true" /></template>
        </ClientOnly>
      </div>
    </header>

    <section aria-labelledby="roles" class="mb-10">
      <h2 id="roles" class="mb-3 text-lg font-semibold">Colour roles as applied</h2>
      <ul class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-roles>
        <li v-for="role in roles" :key="role" class="rounded-md border border-border p-2 text-sm" :data-role="role">
          <span class="mb-2 block h-10 rounded-sm border border-border" :style="{ background: `var(--${role})` }" aria-hidden="true" />
          <span class="block font-medium">{{ role }}</span>
          <span class="block break-all font-mono text-xs text-fg-muted" data-hex>{{ resolved[role] }}</span>
        </li>
      </ul>
      <div class="mt-4 overflow-x-auto"><table class="w-full text-sm" data-pairs>
        <caption class="sr-only">Contrast of the semantic pairs in the active theme</caption>
        <thead><tr class="text-left text-fg-muted"><th class="py-1 pr-4 font-medium">Pair</th><th class="py-1 pr-4 font-medium">Ratio</th><th class="py-1 font-medium">Required</th></tr></thead>
        <tbody>
          <tr v-for="p in ratios" :key="p.fg + p.bg" class="border-t border-border" :data-pair="`${p.fg}/${p.bg}`" :data-pass="p.ratio >= p.required">
            <td class="py-1 pr-4">{{ p.fg }} on {{ p.bg }}</td>
            <td class="py-1 pr-4 tabular-nums">{{ p.ratio }}:1</td>
            <td class="py-1 tabular-nums">{{ p.required }}:1 <span v-if="p.ratio >= p.required" class="text-success">✓ passes</span><span v-else class="text-danger">✗ below</span></td>
          </tr>
        </tbody>
      </table></div>
    </section>

    <section aria-labelledby="type" class="mb-10">
      <h2 id="type" class="mb-3 text-lg font-semibold">Type scale · ratio {{ contract.typography.ratio }}</h2>
      <ol class="space-y-2" data-type-scale>
        <li v-for="name in sizes" :key="name" class="flex items-baseline gap-4 border-b border-border pb-2">
          <span class="w-12 font-mono text-xs text-fg-muted">{{ name }}</span>
          <span :style="{ fontSize: `var(--text-${name})` }" class="min-w-0 break-words leading-tight">Dispatch board, 14 loads unassigned</span>
        </li>
      </ol>
      <p class="mt-2 font-mono text-sm tabular-nums">1,284.50 · 0.75 · 12:40 · tabular numbers {{ contract.typography.tabularNumbers ? 'on' : 'off' }}</p>
    </section>

    <section aria-labelledby="space" class="mb-10 grid gap-8 lg:grid-cols-3">
      <div>
        <h2 id="space" class="mb-3 text-lg font-semibold">Spacing · {{ contract.spacing.base }}px base</h2>
        <ul class="space-y-1" data-spacing>
          <li v-for="v in spacing" :key="v" class="flex items-center gap-3 text-sm"><span class="h-3 bg-accent" :style="{ width: `var(--space-${v})` }" aria-hidden="true" /><span class="font-mono text-fg-muted">{{ v }}</span></li>
        </ul>
      </div>
      <div>
        <h2 class="mb-3 text-lg font-semibold">Radius · {{ contract.radius.policy }}</h2>
        <ul class="flex flex-wrap gap-3" data-radius>
          <li v-for="[name, px] in radii" :key="name" class="flex flex-col items-center gap-1 text-xs text-fg-muted"><span class="block h-12 w-12 border border-border-strong bg-surface" :style="{ borderRadius: `var(--radius-${name})` }" aria-hidden="true" />{{ name }} · {{ px >= 9999 ? 'full' : px + 'px' }}</li>
        </ul>
        <h2 class="mb-3 mt-6 text-lg font-semibold">Elevation · {{ contract.elevation.policy }}</h2>
        <ul class="flex flex-wrap gap-4" data-elevation>
          <li v-for="level in levels" :key="level.name" class="flex h-16 w-24 items-center justify-center rounded-md bg-surface-raised text-xs text-fg-muted" :style="{ boxShadow: `var(--shadow-${level.name})` }">{{ level.name }}</li>
        </ul>
      </div>
      <div>
        <h2 class="mb-3 text-lg font-semibold">Motion · reduced motion {{ contract.motion.reducedMotion }}</h2>
        <ul class="space-y-2 text-sm" data-motion>
          <li v-for="[name, ms] in durations" :key="name" class="flex items-center gap-3"><span class="w-10 font-mono text-fg-muted">{{ name }}</span><span class="h-2 flex-1 rounded-full bg-border"><span class="motion-bar block h-2 rounded-full bg-accent" :style="{ animationDuration: `${ms}ms` }" /></span><span class="font-mono tabular-nums text-fg-muted">{{ ms }}ms</span></li>
        </ul>
      </div>
    </section>

    <section aria-labelledby="states" class="mb-10">
      <h2 id="states" class="mb-3 text-lg font-semibold">Interactive states</h2>
      <div class="flex flex-wrap items-center gap-3" data-states>
        <UButton label="Primary action" color="primary" />
        <UButton label="Secondary" color="neutral" variant="outline" />
        <UButton label="Disabled" color="primary" disabled />
        <UButton :label="sent ? 'Saved' : 'Save preference'" color="primary" variant="soft" :loading="busy" :disabled="busy" data-confirm @click="confirm" />
        <UInput placeholder="Search shipments" aria-label="Search shipments" icon="i-lucide-search" class="max-w-full" />
        <UBadge label="On time" color="success" variant="subtle" />
        <UBadge label="At risk" color="warning" variant="subtle" />
        <UBadge label="Late" color="error" variant="subtle" />
      </div>
      <p class="mt-3 text-sm text-fg-muted">Focus ring: {{ contract.states.focusRing.width }}px, offset {{ contract.states.focusRing.offset }}px · targets ≥ {{ contract.states.minTarget }}px · disabled at {{ contract.states.disabledOpacity }} opacity · hover: {{ contract.states.hover }}</p>
    </section>
  </main>
</template>

<style scoped>
.motion-bar { width: 0; animation-name: grow; animation-timing-function: var(--ease-standard); animation-fill-mode: forwards; animation-iteration-count: infinite; animation-direction: alternate; }
@keyframes grow { from { width: 0; } to { width: 100%; } }
</style>
