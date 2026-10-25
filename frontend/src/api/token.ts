// Where the login token is kept between page loads.
//
// localStorage is simple and survives refreshes. The trade-off: any script running
// on the page could read it, so the app must never render untrusted HTML.
// (The alternative, an httpOnly cookie, needs CSRF protection on the backend.)

const TOKEN_KEY = 'eduzen.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage blocked (e.g. some private browsing modes)
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Not fatal: the user just has to log in again after a refresh.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clear.
  }
}
