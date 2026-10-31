export interface CleanupStack {
  add<T extends () => void>(cleanup: T): T
  track<T extends { dispose(): void }>(target: T): T
  listen(target: EventTarget, type: string, handler: EventListener): void
  dispose(): void
}
export function createCleanupStack(): CleanupStack {
  const cleanups: Array<() => void> = []
  return {
    add(cleanup) {
      cleanups.push(cleanup)
      return cleanup
    },
    track(target) {
      cleanups.push(() => target.dispose())
      return target
    },
    listen(target, type, handler) {
      target.addEventListener(type, handler)
      cleanups.push(() => target.removeEventListener(type, handler))
    },
    dispose() {
      for (const c of cleanups.splice(0).reverse()) c()
    },
  }
}
