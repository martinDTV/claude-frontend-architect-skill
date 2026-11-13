<!--
  DsField — label, hint and error around any control. The label is mandatory and visible; the error is announced
  (role="alert") and linked to the control through aria-describedby; `required` and `invalid` reach the control through
  the default slot's scope, so assistive technology hears what the asterisk shows.
  @example <DsField label="Email" required :error="errors.email" v-slot="{ id, describedBy, required, invalid }"><input :id="id" :aria-describedby="describedBy" :required="required" :aria-invalid="invalid || undefined" /></DsField>
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
    <slot :id="id" :described-by="describedBy" :invalid="Boolean(error)" :required="Boolean(required)" />
    <p v-if="hint && !error" :id="hintId" class="text-xs text-[var(--fg-muted)]">{{ hint }}</p>
    <p v-if="error" :id="errorId" role="alert" class="text-xs text-[var(--danger)]">{{ error }}</p>
  </div>
</template>
