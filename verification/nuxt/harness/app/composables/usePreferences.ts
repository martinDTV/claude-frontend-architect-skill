// User preferences (persistence.md): versioned schema, localStorage, applied to the document (density attribute),
// read on the client only so the server render never depends on a browser value.
import { DEFAULT_PREFERENCES, readPreferences, writePreferences, type Preferences } from '~/lib/ui/saas/forms'

export function usePreferences() {
  const prefs = useState<Preferences>('atlas-preferences', () => DEFAULT_PREFERENCES)
  const loaded = useState('atlas-preferences-loaded', () => false)
  const colorMode = useColorMode()
  const apply = (p: Preferences) => {
    if (import.meta.client) document.documentElement.dataset.density = p.density
    colorMode.preference = p.theme
  }
  onMounted(() => {
    if (!loaded.value) {
      prefs.value = readPreferences(window.localStorage)
      loaded.value = true
    }
    apply(prefs.value)
  })
  function update(patch: Partial<Preferences>) {
    prefs.value = { ...prefs.value, ...patch }
    writePreferences(window.localStorage, prefs.value)
    apply(prefs.value)
  }
  return { prefs, update, loaded }
}
