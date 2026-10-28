<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
import axios from 'axios'
const { $api } = useNuxtApp()
const { listOportunidades } = useCrm()
const { listPlanos } = usePlanos()
const { personas } = usePersonas()
const auth = useAuthStore()
const modal0 = ref(false)
const modal1 = ref(false)
const modal2 = ref(false)
const modal3 = ref(false)
const modal4 = ref(false)
const modal5 = ref(false)
const modal6 = ref(false)
const modal7 = ref(false)
const modal8 = ref(false)
const modal9 = ref(false)
const modal10 = ref(false)
const modal11 = ref(false)
const campo0 = ref('')
const campo1 = ref('')
const campo2 = ref('')
const campo3 = ref('')
const campo4 = ref('')
const campo5 = ref('')
const campo6 = ref('')
const campo7 = ref('')
const campo8 = ref('')
const campo9 = ref('')
const campo10 = ref('')
const campo11 = ref('')
const campo12 = ref('')
const campo13 = ref('')
const campo14 = ref('')
const campo15 = ref('')
const campo16 = ref('')
const campo17 = ref('')
const campo18 = ref('')
const campo19 = ref('')
const lista0 = ref<unknown[]>([])
const lista1 = ref<unknown[]>([])
const lista2 = ref<unknown[]>([])
const lista3 = ref<unknown[]>([])
const lista4 = ref<unknown[]>([])
const lista5 = ref<unknown[]>([])
const lista6 = ref<unknown[]>([])
const lista7 = ref<unknown[]>([])
watch(campo0, () => { lista0.value = [] })
watch(campo1, () => { lista1.value = [] })
watch(campo2, () => { lista2.value = [] })
watch(campo3, () => { lista3.value = [] })
watch(campo4, () => { lista4.value = [] })
watch(campo5, () => { lista5.value = [] })
watch(campo6, () => { lista6.value = [] })
watch(campo7, () => { lista7.value = [] })
async function cargar0() {
  const { data } = await $api.get('/recurso0', { params: { q: campo0.value } })
  lista0.value = data.items
}
async function cargar1() {
  const { data } = await $api.get('/recurso1', { params: { q: campo1.value } })
  lista1.value = data.items
}
async function cargar2() {
  const { data } = await $api.get('/recurso2', { params: { q: campo2.value } })
  lista2.value = data.items
}
async function cargar3() {
  const { data } = await $api.get('/recurso3', { params: { q: campo3.value } })
  lista3.value = data.items
}
async function cargar4() {
  const { data } = await $api.get('/recurso4', { params: { q: campo4.value } })
  lista4.value = data.items
}
async function cargar5() {
  const { data } = await $api.get('/recurso5', { params: { q: campo5.value } })
  lista5.value = data.items
}
async function cargar6() {
  const { data } = await $api.get('/recurso6', { params: { q: campo6.value } })
  lista6.value = data.items
}
async function cargar7() {
  const { data } = await $api.get('/recurso7', { params: { q: campo7.value } })
  lista7.value = data.items
}
async function guardar() {
  await axios.post('/api/v1/guardar', { campo0: campo0.value })
}
onMounted(() => { cargar0(); window.addEventListener("resize", cargar1) })
</script>
<template>
  <div>
    <form @submit.prevent="guardar">
      <label>Campo 0<input v-model="campo0" /></label>
      <label>Campo 1<input v-model="campo1" /></label>
      <label>Campo 2<input v-model="campo2" /></label>
      <label>Campo 3<input v-model="campo3" /></label>
      <label>Campo 4<input v-model="campo4" /></label>
      <label>Campo 5<input v-model="campo5" /></label>
      <label>Campo 6<input v-model="campo6" /></label>
      <label>Campo 7<input v-model="campo7" /></label>
      <label>Campo 8<input v-model="campo8" /></label>
      <label>Campo 9<input v-model="campo9" /></label>
      <label>Campo 10<input v-model="campo10" /></label>
      <label>Campo 11<input v-model="campo11" /></label>
      <label>Campo 12<input v-model="campo12" /></label>
      <label>Campo 13<input v-model="campo13" /></label>
      <label>Campo 14<input v-model="campo14" /></label>
      <label>Campo 15<input v-model="campo15" /></label>
      <label>Campo 16<input v-model="campo16" /></label>
      <label>Campo 17<input v-model="campo17" /></label>
      <label>Campo 18<input v-model="campo18" /></label>
      <label>Campo 19<input v-model="campo19" /></label>
    </form>
    <table><tbody><tr v-for="row in lista0" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista1" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista2" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista3" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista4" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista5" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista6" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <table><tbody><tr v-for="row in lista7" :key="row"><td>{{ row }}</td></tr></tbody></table>
    <UModal v-model:open="modal0">
      <template #body><div v-if="modal0"><p>Modal 0</p><button @click="modal0 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal1">
      <template #body><div v-if="modal1"><p>Modal 1</p><button @click="modal1 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal2">
      <template #body><div v-if="modal2"><p>Modal 2</p><button @click="modal2 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal3">
      <template #body><div v-if="modal3"><p>Modal 3</p><button @click="modal3 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal4">
      <template #body><div v-if="modal4"><p>Modal 4</p><button @click="modal4 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal5">
      <template #body><div v-if="modal5"><p>Modal 5</p><button @click="modal5 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal6">
      <template #body><div v-if="modal6"><p>Modal 6</p><button @click="modal6 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal7">
      <template #body><div v-if="modal7"><p>Modal 7</p><button @click="modal7 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal8">
      <template #body><div v-if="modal8"><p>Modal 8</p><button @click="modal8 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal9">
      <template #body><div v-if="modal9"><p>Modal 9</p><button @click="modal9 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal10">
      <template #body><div v-if="modal10"><p>Modal 10</p><button @click="modal10 = false">Cerrar</button></div></template>
    </UModal>
    <UModal v-model:open="modal11">
      <template #body><div v-if="modal11"><p>Modal 11</p><button @click="modal11 = false">Cerrar</button></div></template>
    </UModal>
    <p v-if="campo0">Fila 0 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 1 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 2 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 3 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 4 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 5 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 6 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 7 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 8 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 9 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 10 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 11 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 12 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 13 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 14 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 15 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 16 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 17 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 18 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 19 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 20 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 21 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 22 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 23 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 24 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 25 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 26 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 27 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 28 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 29 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 30 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 31 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 32 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 33 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 34 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 35 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 36 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 37 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 38 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 39 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 40 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 41 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 42 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 43 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 44 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 45 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 46 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 47 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 48 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 49 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 50 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 51 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 52 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 53 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 54 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 55 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 56 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 57 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 58 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 59 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 60 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 61 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 62 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 63 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 64 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 65 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 66 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 67 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 68 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 69 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 70 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 71 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 72 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 73 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 74 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 75 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 76 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 77 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 78 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 79 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 80 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 81 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 82 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 83 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 84 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 85 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 86 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 87 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 88 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 89 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 90 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 91 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 92 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 93 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 94 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 95 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 96 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 97 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 98 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 99 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 100 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 101 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 102 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 103 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 104 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 105 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 106 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 107 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 108 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 109 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 110 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 111 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 112 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 113 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 114 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 115 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 116 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 117 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 118 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 119 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 120 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 121 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 122 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 123 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 124 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 125 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 126 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 127 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 128 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 129 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 130 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 131 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 132 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 133 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 134 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 135 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 136 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 137 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 138 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 139 <span>{{ campo19 }}</span></p>
    <p v-if="campo0">Fila 140 <span>{{ campo0 }}</span></p>
    <p v-if="campo1">Fila 141 <span>{{ campo1 }}</span></p>
    <p v-if="campo2">Fila 142 <span>{{ campo2 }}</span></p>
    <p v-if="campo3">Fila 143 <span>{{ campo3 }}</span></p>
    <p v-if="campo4">Fila 144 <span>{{ campo4 }}</span></p>
    <p v-if="campo5">Fila 145 <span>{{ campo5 }}</span></p>
    <p v-if="campo6">Fila 146 <span>{{ campo6 }}</span></p>
    <p v-if="campo7">Fila 147 <span>{{ campo7 }}</span></p>
    <p v-if="campo8">Fila 148 <span>{{ campo8 }}</span></p>
    <p v-if="campo9">Fila 149 <span>{{ campo9 }}</span></p>
    <p v-if="campo10">Fila 150 <span>{{ campo10 }}</span></p>
    <p v-if="campo11">Fila 151 <span>{{ campo11 }}</span></p>
    <p v-if="campo12">Fila 152 <span>{{ campo12 }}</span></p>
    <p v-if="campo13">Fila 153 <span>{{ campo13 }}</span></p>
    <p v-if="campo14">Fila 154 <span>{{ campo14 }}</span></p>
    <p v-if="campo15">Fila 155 <span>{{ campo15 }}</span></p>
    <p v-if="campo16">Fila 156 <span>{{ campo16 }}</span></p>
    <p v-if="campo17">Fila 157 <span>{{ campo17 }}</span></p>
    <p v-if="campo18">Fila 158 <span>{{ campo18 }}</span></p>
    <p v-if="campo19">Fila 159 <span>{{ campo19 }}</span></p>
  </div>
</template>
