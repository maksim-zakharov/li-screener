/** LAST фьючерса FORTS с MOEX ISS (для цены GOLD/SILV в тройниках). */

const MOEX_ISS_ORIGIN = 'https://iss.moex.com'
const CACHE_TTL_MS = 30_000

/** Alor SHORTNAME root → ISS SECID root. */
const ALOR_ROOT_TO_ISS: Record<string, string> = {
  GOLD: 'GD',
  SILV: 'SV',
}

/** Месяц экспирации → буква FORTS. */
const MONTH_TO_LETTER: Record<number, string> = {
  3: 'H',
  6: 'M',
  9: 'U',
  12: 'Z',
}

interface MoexIssMarketdataPayload {
  marketdata?: {
    columns?: string[]
    data?: unknown[][]
  }
}

interface CacheEntry {
  /** LAST */
  last: number | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheEntry>>()

/**
 * `GOLD-12.26` / `SILV-3.27` → ISS SECID `GDZ6` / `SVH7`.
 * Если уже SECID (GDZ6) — возвращает как есть.
 */
export function resolveIssFuturesSecid(symbol: string): string {
  const raw = symbol.replace(/^MOEX:/i, '').trim().toUpperCase()
  if (!raw) {
    return ''
  }
  const m = raw.match(/^([A-Z]+)-(\d{1,2})\.(\d{2})$/)
  if (!m) {
    return raw
  }
  const root = ALOR_ROOT_TO_ISS[m[1]!] ?? m[1]!
  const month = Number(m[2])
  const year = Number(m[3])
  const letter = MONTH_TO_LETTER[month]
  if (!letter || !Number.isFinite(year)) {
    return raw
  }
  return `${root}${letter}${year % 10}`
}

function buildUrl(ticker: string): string {
  const params = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'marketdata',
    'marketdata.columns': 'SECID,LAST',
  })
  return `${MOEX_ISS_ORIGIN}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(ticker)}.json?${params.toString()}`
}

function parseLast(payload: MoexIssMarketdataPayload): number | null {
  const columns = payload.marketdata?.columns ?? []
  const rows = payload.marketdata?.data ?? []
  const idx = columns.indexOf('LAST')
  if (idx < 0 || rows.length === 0) {
    return null
  }
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue
    }
    const value = Number(row[idx])
    if (Number.isFinite(value) && value > 0) {
      return value
    }
  }
  return null
}

/**
 * LAST контракта FORTS (кэш 30с).
 */
export async function fetchMoexIssLast(symbol: string): Promise<number | null> {
  const key = resolveIssFuturesSecid(symbol)
  if (!key) {
    return null
  }
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit.last
  }
  const pending = inflight.get(key)
  if (pending) {
    return (await pending).last
  }

  const task = (async (): Promise<CacheEntry> => {
    const res = await fetch(buildUrl(key), { credentials: 'omit', mode: 'cors' })
    if (!res.ok) {
      throw new Error(`MOEX ISS HTTP ${res.status}`)
    }
    const payload = (await res.json()) as MoexIssMarketdataPayload
    const last = parseLast(payload)
    const entry: CacheEntry = { last, expiresAt: Date.now() + CACHE_TTL_MS }
    cache.set(key, entry)
    inflight.delete(key)
    return entry
  })().catch((error: unknown) => {
    inflight.delete(key)
    throw error
  })

  inflight.set(key, task)
  return (await task).last
}
