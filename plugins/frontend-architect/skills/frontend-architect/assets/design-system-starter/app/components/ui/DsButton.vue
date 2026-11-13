<!--
  DsButton — the one button. Wraps UButton with the project's rule: while `loading` it is busy, disabled and ignores
  clicks (no double submits). Tone and size are the only visual choices; colour comes from the contract's roles.
  @example <DsButton tone="primary" :loading="saving" @click="save">Save</DsButton>
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ tone?: 'primary' | 'secondary' | 'danger'; size?: 'sm' | 'md'; loading?: boolean; disabled?: boolean; type?: 'button' | 'submit' }>(), { tone: 'primary', size: 'md', loading: false, disabled: false, type: 'button' })
const emit = defineEmits<{ click: [event: MouseEvent] }>()
const color = computed(() => (props.tone === 'danger' ? 'error' : props.tone === 'secondary' ? 'neutral' : 'primary'))
const variant = computed(() => (props.tone === 'secondary' ? 'outline' : 'solid'))
function onClick(event: MouseEvent) {
  if (props.loading || props.disabled) return
  emit('click', event)
}
</script>

<template>
  <UButton :type="type" :color="color" :variant="variant" :size="size" :loading="loading" :disabled="disabled || loading" :aria-busy="loading || undefined" @click="onClick">
    <slot name="icon" />
    <slot />
  </UButton>
</template>
