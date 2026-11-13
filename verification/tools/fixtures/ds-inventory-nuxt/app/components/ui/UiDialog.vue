<!--
  UiDialog — UModal with the project's rules: a title is mandatory (it names the dialog), Escape asks for
  confirmation when the form is dirty, and focus returns to the opener on close.
-->
<script setup lang="ts">
const props = defineProps<{ title: string; dirty?: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ close: [reason: 'escape' | 'button'] }>()
const opener = ref<HTMLElement | null>(null)

watch(open, (isOpen) => {
  if (isOpen) opener.value = document.activeElement as HTMLElement | null
  else opener.value?.focus()
})

function onEscape() {
  if (props.dirty && !window.confirm('Discard changes?')) return
  open.value = false
  emit('close', 'escape')
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :close="{ onClick: () => emit('close', 'button') }" @keydown.escape.prevent="onEscape">
    <template #body><slot /></template>
    <template #footer><slot name="footer" /></template>
  </UModal>
</template>
