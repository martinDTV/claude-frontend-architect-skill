import { onScopeDispose } from 'vue'
// the same resources, closed when the scope ends
export function useChannelSafe() {
  const channel = new BroadcastChannel('sales')
  const worker = new Worker(new URL('./worker.js', import.meta.url))
  onScopeDispose(() => {
    channel.close()
    worker.terminate()
  })
  return { channel, worker }
}
