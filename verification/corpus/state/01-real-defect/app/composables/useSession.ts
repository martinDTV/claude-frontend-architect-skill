// A real defect: the JWT is written to a non-HttpOnly cookie FROM JavaScript, so any script
// (an XSS payload, a third-party tag) can read document.cookie and steal the session. The server
// should set this cookie with HttpOnly; the browser code should never see the token at all.
export function useSession() {
  async function signIn(email: string, password: string) {
    const data = await $fetch<{ accessToken: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    document.cookie = `session_token=${data.accessToken}; path=/; max-age=3600`
  }
  return { signIn }
}
