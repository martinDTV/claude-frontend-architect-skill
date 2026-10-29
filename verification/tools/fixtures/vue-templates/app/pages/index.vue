<script setup lang="ts">
const crm = useCrm()
const n = crm.items.length
// the only use of `contar` is inside a template literal expression
const summary = `Hay ${contar(n, 'tarea', 'tareas')} pendientes`
</script>
<template>
  <p :title="`${plural(n, 'tarea', 'tareas')}`">{{ summary }}</p>
</template>
