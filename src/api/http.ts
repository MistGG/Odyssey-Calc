export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Request failed (${res.status} ${res.statusText})${text ? `: ${text.slice(0, 200)}` : ''}`,
    )
  }
  return res.json() as Promise<T>
}
