// a channel and a worker with no cleanup at all
export function useChannel() {
  const channel = new BroadcastChannel('crm')
  const worker = new Worker(new URL('./worker.js', import.meta.url))
  channel.postMessage('hello')
  return { channel, worker }
}
