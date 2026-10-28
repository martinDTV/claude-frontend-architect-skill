// ANTI-PATTERN. Negative control for verification/ssr-test: never copy this into an application.
// One Axios instance for the whole server process whose cookie header is mutated per request, plus
// an async step in the plugin, so a request issued later can overwrite the header of a request
// still in flight. The documented pattern (plugins/api.ts from axios.md) creates the client inside
// the plugin, once per request.
import axios from 'axios'
import { toApiError } from '~/lib/http/errors'

const api = axios.create({ timeout: 15_000, headers: { Accept: 'application/json' } })
api.interceptors.response.use(undefined, (error: unknown) => {
  throw toApiError(error)
})

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig()
  api.defaults.baseURL = import.meta.server ? config.apiBaseServer : config.public.apiBase
  if (import.meta.server) {
    const { cookie } = useRequestHeaders(['cookie'])
    api.defaults.headers.common.Cookie = cookie ?? ''
  }
  // Any await here (remote config, feature flags, warm-up) lets another request run first.
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 50))
  return { provide: { api } }
})
