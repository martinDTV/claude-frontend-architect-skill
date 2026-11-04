// A single module-level `let` that is reassigned by setActiveTenant. If this app server-renders,
// one request's tenant id lives on until the next request overwrites it, so a slow request can read
// another tenant's id (a cross-request leak). If the app is client-only (ssr: false), the binding is
// per-browser and harmless. The honest verdict depends on the rendering mode -> ambiguous, not confirmed.
let activeTenantId: string | null = null

export function useTenant() {
  function setActiveTenant(id: string) { activeTenantId = id }
  function currentTenant() { return activeTenantId }
  return { setActiveTenant, currentTenant }
}
