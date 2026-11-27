/** Индикативный фандинг вечных *RUBF с MOEX ISS (FORTS marketdata.SWAPRATE). */

const MOEX_ISS_ORIGIN = 'https://iss.moex.com'
const CACHE_TTL_MS = 60_000

/**
 * ISS SWAPRATE → ₽/лот: валютные ×1000, SLVRUBF ×100.
 * Если |rate| ≥ 1 — уже в ₽/лот, повторно не умножаем.
 */
const LOT_MULTIPLIER: Record<string, number> = {
  USDRUBF: 1000,
  EURRUBF: 1000,
  CNYRUBF: 1000,
  SLVRUBF: 100,
}

interface MoexIssMarketdataPayload {
  marketdata?: {
    columns?: string[]
    data?: unknown[][]
  }
}

interface CacheEntry {
  /** ₽ за 1 лот (null — нет данных) */
  perLot: number | null
  /** Сырой SWAPRATE ISS */
  raw: number | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<CacheEntry>>()

/** Вечный *RUBF (USDRUBF, GLDRUBF, …). */
export function isMoexRubfTicker(ticker: string): boolean {
  const t = ticker.replace(/^MOEX:/i, '').trim().toUpperCase()
  if (!t || t.includes('/') || t.includes(':')) {
    return false
  }
  return /RUBF$/i.test(t)
}

/** Ноги спреда, по которым грузим фандинг. */
export function filterRubfLegCodes(codes: readonly string[]): string[] {
  return codes.filter((code) => isMoexRubfTicker(code))
}

/**
 * Множитель ISS → ₽/лот.
 */
export function getMoexRubfFundingLotMultiplier(ticker: string): number {
  return LOT_MULTIPLIER[ticker.replace(/^MOEX:/i, '').trim().toUpperCase()] ?? 1
}

/**
 * Сырой SWAPRATE → ₽ за 1 лот.
 */
export function resolveMoexRubfFundingPerLot(ticker: string, rawSwaprate: number): number {
  if (!Number.isFinite(rawSwaprate)) {
    return 0
  }
  const mult = getMoexRubfFundingLotMultiplier(ticker)
  if (mult <= 1 || Math.abs(rawSwaprate) >= 1) {
    return rawSwaprate
  }
  return rawSwaprate * mult
}

/**
 * PnL одного начисления, ₽.
 * Положительный фандинг: лонг платит, шорт получает.
 */
export function calcMoexRubfFundingPaymentRub(
  perLot: number,
  side: 'long' | 'short',
  lots: number,
): number {
  if (!Number.isFinite(perLot) || !Number.isFinite(lots) || lots <= 0) {
    return 0
  }
  const sideSign = side === 'long' ? 1 : -1
  return -sideSign * perLot * lots
}

function buildSwaprateUrl(ticker: string): string {
  const params = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'marketdata',
    'marketdata.columns': 'SECID,SWAPRATE',
  })
  return `${MOEX_ISS_ORIGIN}/iss/engines/futures/markets/forts/securities/${encodeURIComponent(ticker)}.json?${params.toString()}`
}

function parseSwaprate(payload: MoexIssMarketdataPayload): number | null {
  const columns = payload.marketdata?.columns ?? []
  const rows = payload.marketdata?.data ?? []
  const idx = columns.indexOf('SWAPRATE')
  if (idx < 0 || rows.length === 0) {
    return null
  }
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue
    }
    const value = Number(row[idx])
    if (Number.isFinite(value)) {
      return value
    }
  }
  return null
}

async function fetchOne(ticker: string): Promise<CacheEntry> {
  const key = ticker.replace(/^MOEX:/i, '').trim().toUpperCase()
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expiresAt > now) {
    return hit
  }
  const pending = inflight.get(key)
  if (pending) {
    return pending
  }

  const task = (async (): Promise<CacheEntry> => {
    const res = await fetch(buildSwaprateUrl(key), { credentials: 'omit', mode: 'cors' })
    if (!res.ok) {
      throw new Error(`MOEX ISS HTTP ${res.status}`)
    }
    const payload = (await res.json()) as MoexIssMarketdataPayload
    const raw = parseSwaprate(payload)
    const perLot = raw == null ? null : resolveMoexRubfFundingPerLot(key, raw)
    const entry: CacheEntry = { perLot, raw, expiresAt: Date.now() + CACHE_TTL_MS }
    cache.set(key, entry)
    inflight.delete(key)
    return entry
  })().catch((error: unknown) => {
    inflight.delete(key)
    throw error
  })

  inflight.set(key, task)
  return task
}

/**
 * Фандинг ₽/лот по списку *RUBF (кэш 60с).
 */
export async function fetchMoexRubfFundingPerLotByCodes(
  codes: readonly string[],
): Promise<Record<string, number | null>> {
  const rubf = filterRubfLegCodes(codes)
  const result: Record<string, number | null> = {}
  await Promise.all(
    rubf.map(async (code) => {
      try {
        const entry = await fetchOne(code)
        result[code] = entry.perLot
      } catch (err) {
        console.warn('Фандинг ISS:', code, err)
        result[code] = null
      }
    }),
  )
  return result
}
