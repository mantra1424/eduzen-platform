/**
 * Only follow redirects to pages inside this app. Without this check, a crafted
 * link could send users to another site straight after they log in ("open redirect").
 * "/groups" is fine; "//evil.com" and "https://evil.com" are not.
 */
export function safeRedirectPath(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return '/'
  }
  return path
}
