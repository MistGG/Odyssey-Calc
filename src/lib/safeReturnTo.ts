/** Restrict post-login navigation to in-app hash routes (blocks open redirects). */
export function safeReturnTo(raw: string | null | undefined, fallback = '/'): string {
  const value = raw?.trim()
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  if (value.includes('://') || value.includes('\\')) return fallback
  return value
}
