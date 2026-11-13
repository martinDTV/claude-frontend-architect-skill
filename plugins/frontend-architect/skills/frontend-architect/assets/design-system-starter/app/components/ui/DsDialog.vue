<!--
  DsDialog — UModal with the project's rules: the title is mandatory (it names the dialog), a dirty dialog asks before
  it closes (Escape, overlay or button), and focus returns to the element that opened it.
  @example <DsDialog v-model:open="open" title="Edit shipment" :dirty="form.dirty" @close="onClose">…</DsDialog>
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{ title: string; description?: string; dirty?: boolean }>(), { dirty: false })
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ close: [reason: 'dismiss' | 'button'] }>()
const opener = ref<HTMLElement | null>(null)

watch(open, (isOpen) => {
  if (isOpen) opener.value = (document.activeElement as HTMLElement | null) ?? null
  else opener.value?.focus()
})

function finishClose(reason: 'dismiss' | 'button') {
  open.value = false
  emit('close', reason)
}
// A clean dialog is dismissible (Escape, overlay): UModal reports it through update:open=false. A dirty one is not:
// UModal emits close:prevent instead, and the user is asked.
function onUpdateOpen(value: boolean) {
  if (!value) finishClose('dismiss')
}
function onPrevented() {
  if (window.confirm('Discard your changes?')) finishClose('dismiss')
}
function onButton() {
  if (props.dirty && !window.confirm('Discard your changes?')) return
  finishClose('button')
}
</script>

<template>
  <UModal :open="open" :title="title" :description="description" :dismissible="!dirty" @update:open="onUpdateOpen" @close:prevent="onPrevented">
    <template #body><slot /></template>
    <template #footer>
      <slot name="footer" :close="onButton">
        <DsButton tone="secondary" @click="onButton">Close</DsButton>
      </slot>
    </template>
  </UModal>
</template>
