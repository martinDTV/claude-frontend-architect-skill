// The public surface of the design system: import components from here, never from their files.
// design-system-inventory.mjs reads this barrel to decide what is public.
export { default as DsButton } from './DsButton.vue'
export { default as DsIconButton } from './DsIconButton.vue'
export { default as DsField } from './DsField.vue'
export { default as DsSelect } from './DsSelect.vue'
export { default as DsDialog } from './DsDialog.vue'
export { default as DsDataRegion } from './DsDataRegion.vue'
export { default as DsEmptyState } from './DsEmptyState.vue'
export { default as DsStatusBadge } from './DsStatusBadge.vue'
export { default as DsKpi } from './DsKpi.vue'
export type { DataView } from './data-view'
