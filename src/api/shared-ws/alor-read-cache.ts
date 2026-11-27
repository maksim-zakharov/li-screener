/**
 * Shared in-flight + TTL-кеш для Alor REST (один upstream на все вкладки / порты).
 */

/** TTL котировок, мс. */
export const ALOR_QUOTES_CACHE_TTL_MS = 5_000

/** TTL поиска Securities, мс. */
export const ALOR_SEARCH_CACHE_TTL_MS = 30_000

/** TTL history (короткий — только антишторм), мс. */
export const ALOR_HISTORY_CACHE_TTL_MS = 3_000

/** Успешный результат для кеша. */
export interface AlorCachedPayload {
  /** Тело ответа. */
  data: unknown
}

/**
 * Кеш + in-flight: cache hit → payload; иначе общий promise; ошибки в кеш не пишем.
 */
export class AlorReadCache {
  private readonly _cache = new Map<string, { data: unknown; expiresAt: number }>()
  private readonly _inFlight = new Map<string, Promise<AlorCachedPayload>>()
  private readonly _now: () => number

  constructor(params?: { now?: () => number }) {
    this._now = params?.now ?? Date.now
  }

  /**
   * Один fetch: waiters делят promise; при ttlMs &gt; 0 кладём в кеш после успеха.
   */
  run(key: string, ttlMs: number, fetchFn: () => Promise<AlorCachedPayload>): Promise<AlorCachedPayload> {
    if (ttlMs > 0) {
      const entry = this._cache.get(key)
      if (entry && entry.expiresAt > this._now()) {
        return Promise.resolve({ data: entry.data })
      }
      if (entry) {
        this._cache.delete(key)
      }
    }

    const existing = this._inFlight.get(key)
    if (existing) {
      return existing
    }

    const promise = fetchFn()
      .then((payload) => {
        if (ttlMs > 0) {
          this._cache.set(key, {
            data: payload.data,
            expiresAt: this._now() + ttlMs,
          })
        }
        return payload
      })
      .finally(() => {
        this._inFlight.delete(key)
      })

    this._inFlight.set(key, promise)
    return promise
  }

  /** Полная очистка. */
  clear(): void {
    this._cache.clear()
    this._inFlight.clear()
  }
}
