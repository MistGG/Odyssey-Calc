import type { FetchJsonError } from '../api/http'

/** Max concurrent wiki GETs (shared across guidebook, tier list, etc.). */
export const WIKI_QUEUE_MAX_CONCURRENT = 4
/** Minimum gap between starting new wiki GETs. */
export const WIKI_QUEUE_DELAY_MS = 250
/** Pause queue after HTTP 429 before retrying. */
export const WIKI_RATE_LIMIT_COOLDOWN_MS = 10_000

type QueueTask<T> = {
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  retries: number
}

let active = 0
let backoffUntil = 0
const queue: QueueTask<unknown>[] = []

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function isRateLimitError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const status = (e as FetchJsonError).status
  if (status === 429) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /429|too many requests|rate limit/i.test(msg)
}

async function drainQueue(): Promise<void> {
  while (active < WIKI_QUEUE_MAX_CONCURRENT && queue.length > 0) {
    const now = Date.now()
    if (now < backoffUntil) {
      await sleep(backoffUntil - now)
      continue
    }

    const task = queue.shift() as QueueTask<unknown>
    active += 1
    try {
      const result = await task.run()
      task.resolve(result)
    } catch (e) {
      if (isRateLimitError(e) && task.retries < 3) {
        backoffUntil = Math.max(backoffUntil, Date.now() + WIKI_RATE_LIMIT_COOLDOWN_MS)
        task.retries += 1
        queue.unshift(task)
        if (import.meta.env.DEV) {
          console.warn(
            `[Odyssey Calc] Wiki rate limit — pausing ${Math.ceil(WIKI_RATE_LIMIT_COOLDOWN_MS / 1000)}s`,
          )
        }
      } else {
        task.reject(e)
      }
    } finally {
      active -= 1
      if (WIKI_QUEUE_DELAY_MS > 0) await sleep(WIKI_QUEUE_DELAY_MS)
    }
  }
}

/** Run a wiki GET through the shared concurrency-limited queue. */
export function runWikiRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: fn,
      resolve: resolve as (value: unknown) => void,
      reject,
      retries: 0,
    })
    void drainQueue()
  })
}
