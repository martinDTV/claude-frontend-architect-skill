// The key name contains a credential word ("password"), but the VALUE is a boolean literal: this is a
// UI flag recording that the user dismissed a password-strength hint, not a stored secret. From the code
// alone the evidence is insufficient to call it a leak - a reviewer must read the key to decide. The
// correct auditor behaviour is a HEURISTIC "read this" finding, never a confirmed token-in-storage.
export function useOnboarding() {
  function dismissPasswordTips() {
    localStorage.setItem('password-strength-tips-seen', true)
  }
  return { dismissPasswordTips }
}
