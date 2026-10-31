<script setup lang="ts">
// One renderer for the states of a data region: a skeleton with the final shape, an empty state with the next action,
// an error in human terms with a retry and the request id, and the content when ready.
import type { RegionState } from '~/composables/useShipments'
defineProps<{ state: RegionState; region: string; rows?: number; title: string; emptyTitle: string; emptyText: string; emptyAction?: { label: string; to: string }; error?: { message: string; requestId: string } | null }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div :data-region="region" :data-state="state">
    <div v-if="state === 'loading'" role="status" :aria-label="`Loading ${title}`" class="space-y-2" data-loading>
      <USkeleton v-for="i in rows ?? 6" :key="i" class="h-9 w-full" />
      <span class="sr-only">Loading {{ title }}</span>
    </div>
    <UEmpty v-else-if="state === 'empty'" icon="i-lucide-inbox" :title="emptyTitle" :description="emptyText" data-empty>
      <template v-if="emptyAction" #actions>
        <UButton :label="emptyAction.label" :to="emptyAction.to" color="primary" />
      </template>
    </UEmpty>
    <UAlert v-else-if="state === 'error'" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="`${title} could not be loaded`" :description="`${error?.message ?? 'The service did not answer.'} Request ${error?.requestId ?? ''}: quote it to the help desk if it keeps happening.`" role="alert" data-error :actions="[{ label: 'Try again', color: 'error', variant: 'solid', onClick: () => emit('retry') }]" />
    <slot v-else />
  </div>
</template>
