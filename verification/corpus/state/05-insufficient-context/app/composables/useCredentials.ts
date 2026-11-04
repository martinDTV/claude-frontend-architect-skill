// A genuine token-in-web-storage defect whose nature is only visible by following TWO local bindings:
//   KEY -> the string 'auth:jwt' (a credential key)
//   t   -> data.accessToken      (the credential value from the login response)
// The localStorage.setItem call references only those identifiers, so a human reading the file sees a
// JWT being persisted in web storage, but a lexical auditor that does not resolve variables sees
// setItem(KEY, t) with no secret-looking literal in the call and cannot grade it.
const KEY = 'auth:jwt'

export function useCredentials() {
  async function signIn(email: string, password: string) {
    const data = await $fetch<{ accessToken: string }>('/api/login', { method: 'POST', body: { email, password } })
    const t = data.accessToken
    localStorage.setItem(KEY, t)
  }
  return { signIn }
}
