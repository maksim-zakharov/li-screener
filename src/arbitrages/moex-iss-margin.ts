/** Каталог ГО FORTS с ISS (кэш + single-flight). */

const MOEX_ISS_ORIGIN = 'https://iss.moex.com'
const CACHE_TTL_MS = 5 * 60_000

interface MoexIssSecuritiesTablePayload {
  securities?: {
    columns?: string[]
    data?: unknown[][]
  }
}

/** SHORTNAME/SECID.upper → ГО ₽ / контракт */
let marginByKey: Map<string, number> | null = null
let expiresAt = 0
let inflight: Promise<Map<string, number>> | null = null

/** Нормализация тикера для lookup ISS. */
export function normalizeIssShortname(symbol: string): string {
  return symbol.replace(/^MOEX:/i, '').trim().toUpperCase()
}

function buildIssUrl(): string {
  const params = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'securities',
    'securities.columns': 'SECID,SHORTNAME,INITIALMARGIN',
  })
  // Прямой ISS: отражает Origin в ACAO (localhost / github.io).
  return `${MOEX_ISS_ORIGIN}/iss/engines/futures/markets/forts/securities.json?${params.toString()}`
}

function parseMarginMap(payload: MoexIssSecuritiesTablePayload): Map<string, number> {
  const map = new Map<string, number>()
  const columns = payload.securities?.columns ?? []
  const rows = payload.securities?.data ?? []
  const shortIdx = columns.indexOf('SHORTNAME')
  const secidIdx = columns.indexOf('SECID')
  const marginIdx = columns.indexOf('INITIALMARGIN')
  if (marginIdx < 0 || (shortIdx < 0 && secidIdx < 0)) {
    return map
  }
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue
    }
    const margin = Number(row[marginIdx])
    if (!Number.isFinite(margin) || !(margin > 0)) {
      continue
    }
    if (shortIdx >= 0) {
      const shortname = String(row[shortIdx] ?? '').trim()
      if (shortname) {
        map.set(normalizeIssShortname(shortname), margin)
      }
    }
    if (secidIdx >= 0) {
      const secid = String(row[secidIdx] ?? '').trim()
      if (secid) {
        map.set(normalizeIssShortname(secid), margin)
      }
    }
  }
  return map
}

/**
 * Каталог биржевого ГО FORTS (₽ на 1 контракт).
 */
export async function fetchMoexIssMarginMap(): Promise<Map<string, number>> {
  const now = Date.now()
  if (marginByKey && expiresAt > now) {
    return marginByKey
  }
  if (inflight) {
    return inflight
  }

  inflight = fetch(buildIssUrl(), { credentials: 'omit', mode: 'cors' })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`MOEX ISS HTTP ${res.status}`)
      }
      const payload = (await res.json()) as MoexIssSecuritiesTablePayload
      const map = parseMarginMap(payload)
      if (map.size === 0) {
        throw new Error('MOEX ISS: пустой каталог ГО')
      }
      marginByKey = map
      expiresAt = Date.now() + CACHE_TTL_MS
      inflight = null
      return map
    })
    .catch((error: unknown) => {
      inflight = null
      throw error
    })

  return inflight
}

/**
 * ГО ₽ на 1 контракт по тикеру (`GOLD-12.26`, `GLDRUBF`, `SI-12.26`).
 * Ошибка загрузки каталога — пробрасывается; отсутствие тикера → null.
 */
export async function lookupMoexIssMarginRub(symbol: string): Promise<number | null> {
  const key = normalizeIssShortname(symbol)
  if (!key) {
    return null
  }
  const map = await fetchMoexIssMarginMap()
  return map.get(key) ?? null
}
