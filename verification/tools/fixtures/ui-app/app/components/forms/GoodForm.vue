<script setup lang="ts">
import { ref } from 'vue'
const email = ref('')
const error = ref('')
const pending = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
async function submit() {
  if (pending.value) return
  pending.value = true
  try {
    await new Promise((r) => setTimeout(r, 10))
  } finally {
    pending.value = false
  }
}
</script>
<template>
  <form @submit.prevent="submit" aria-labelledby="form-title">
    <h2 id="form-title">Invite a teammate</h2>
    <label for="email">Email <span aria-hidden="true">*</span></label>
    <input id="email" v-model="email" type="email" required aria-required="true" :aria-invalid="Boolean(error)" aria-describedby="email-error" />
    <p id="email-error" role="alert">{{ error }}</p>
    <label>
      Role
      <select name="role"><option value="viewer">Viewer</option></select>
    </label>
    <button type="submit" :disabled="pending" :aria-busy="pending">Send invite</button>
    <button type="button" aria-label="Close" @click="dialog?.close()"><svg aria-hidden="true" /></button>
    <img src="/team.png" alt="Team photo" />
    <img src="/decor.png" alt="" />
    <dialog ref="dialog" aria-labelledby="dlg-title"><h3 id="dlg-title">Confirm</h3></dialog>
    <!-- negative controls (1.4 calibration on real code): a name from nested text, click plumbing, an HTML-hidden control -->
    <button type="button" @click="dialog?.showModal()"><span class="icon" aria-hidden="true" /><span>Open dialog</span></button>
    <div class="actions" @click.stop><a href="/help">Help</a></div>
    <input type="text" name="honeypot" hidden />
  </form>
</template>
