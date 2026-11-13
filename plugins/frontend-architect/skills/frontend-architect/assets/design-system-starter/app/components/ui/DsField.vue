<!--
  DsField — label, hint and error around any control. The label is mandatory and visible; the error is announced
  (role="alert") and linked to the control through aria-describedby via the default slot's scope.
  @example <DsField label="Email" :error="errors.email" v-slot="{ id, describedBy }"><input :id="id" :aria-describedby="describedBy" /></DsField>
-->
<script setup lang="ts">
const props = defineProps<{ label: string; hint?: string; error?: string; required?: boolean }>()
const id = useId()
const hintId = `${id}-hint`
const errorId = `${id}-error`
const describedBy = computed(() => [props.hint ? hintId : null, props.error ? errorId : null].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="text-sm font-medium text-[var(--fg)]">{{ label }}<span v-if="required" aria-hidden="true" class="text-[var(--danger)]"> *</span></label>
    <slot :id="id" :described-by="describedBy" :invalid="Boolean(error)" />
    <p v-if="hint && !error" :id="hintId" class="text-xs text-[var(--fg-muted)]">{{ hint }}</p>
    <p v-if="error" :id="errorId" role="alert" class="text-xs text-[var(--danger)]">{{ error }}</p>
  </div>
</template>
