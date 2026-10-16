/**
 * After logging in we may send the customer back to where they were headed (`/login?next=/dashboard`). A link such as
 * `/login?next=https://evil.example` must never turn the site into an open redirect, so only plain internal paths pass.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (next.length > 200) return fallback
  if (!next.startsWith('/')) return fallback // absolute URLs, "javascript:", "data:", relative tricks
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback // protocol-relative URLs
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback // control characters and backslashes
  if (/^\/+(login|signup)(\/|\?|#|$)/i.test(next)) return fallback // never bounce between the auth pages
  return next
}
