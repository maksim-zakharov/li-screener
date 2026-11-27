/** Каталог ГО + объём контракта FORTS с ISS (кэш + single-flight). */

import { MOEX_SPREAD_MULTIPLE } from '@/chart/alor-spread'

const MOEX_ISS_ORIGIN = 'https://iss.moex.com'
const CACHE_TTL_MS = 5 * 60_000

interface MoexIssSecuritiesTablePayload {
  securities?: {
    columns?: string[]
    data?: unknown[][]
  }
}

/** Каталог FORTS: ГО и объём 1 контракта. */
export interface MoexIssFortsCatalog {
  /** SHORTNAME/SECID → ГО ₽ */
  marginByKey: Map<string, number>
  /** SHORTNAME/SECID → объём 1 контракта ₽ (settle/minstep×stepprice) */
  volumeByKey: Map<string, number>
}

let catalogCache: (MoexIssFortsCatalog & { expiresAt: number }) | null = null
let inflight: Promise<MoexIssFortsCatalog> | null = null

/** Нормализация тикера для lookup ISS. */
export function normalizeIssShortname(symbol: string): string {
  return symbol.replace(/^MOEX:/i, '').trim().toUpperCase()
}

function buildIssUrl(): string {
  const params = new URLSearchParams({
    'iss.meta': 'off',
    'iss.only': 'securities',
    'securities.columns': 'SECID,SHORTNAME,INITIALMARGIN,PREVSETTLEPRICE,MINSTEP,STEPPRICE',
  })
  return `${MOEX_ISS_ORIGIN}/iss/engines/futures/markets/forts/securities.json?${params.toString()}`
}

function putKey(map: Map<string, number>, raw: string, value: number): void {
  const key = normalizeIssShortname(raw)
  if (key) {
    map.set(key, value)
  }
}

function parseCatalog(payload: MoexIssSecuritiesTablePayload): MoexIssFortsCatalog {
  const marginByKey = new Map<string, number>()
  const volumeByKey = new Map<string, number>()
  const columns = payload.securities?.columns ?? []
  const rows = payload.securities?.data ?? []
  const shortIdx = columns.indexOf('SHORTNAME')
  const secidIdx = columns.indexOf('SECID')
  const marginIdx = columns.indexOf('INITIALMARGIN')
  const settleIdx = columns.indexOf('PREVSETTLEPRICE')
  const minstepIdx = columns.indexOf('MINSTEP')
  const steppriceIdx = columns.indexOf('STEPPRICE')

  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue
    }
    const shortname = shortIdx >= 0 ? String(row[shortIdx] ?? '').trim() : ''
    const secid = secidIdx >= 0 ? String(row[secidIdx] ?? '').trim() : ''
    if (!shortname && !secid) {
      continue
    }

    if (marginIdx >= 0) {
      const margin = Number(row[marginIdx])
      if (Number.isFinite(margin) && margin > 0) {
        if (shortname) putKey(marginByKey, shortname, margin)
        if (secid) putKey(marginByKey, secid, margin)
      }
    }

    if (settleIdx >= 0 && minstepIdx >= 0 && steppriceIdx >= 0) {
      const settle = Number(row[settleIdx])
      const minstep = Number(row[minstepIdx])
      const stepprice = Number(row[steppriceIdx])
      if (settle > 0 && minstep > 0 && stepprice > 0) {
        const volume = (settle / minstep) * stepprice
        if (Number.isFinite(volume) && volume > 0) {
          if (shortname) putKey(volumeByKey, shortname, volume)
          if (secid) putKey(volumeByKey, secid, volume)
        }
      }
    }
  }

  return { marginByKey, volumeByKey }
}

/**
 * Каталог FORTS: ГО + объём контракта.
 */
export async function fetchMoexIssFortsCatalog(): Promise<MoexIssFortsCatalog> {
  const now = Date.now()
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache
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
      const catalog = parseCatalog(payload)
      if (catalog.marginByKey.size === 0) {
        throw new Error('MOEX ISS: пустой каталог ГО')
      }
      catalogCache = { ...catalog, expiresAt: Date.now() + CACHE_TTL_MS }
      inflight = null
      return catalog
    })
    .catch((error: unknown) => {
      inflight = null
      throw error
    })

  return inflight
}

/** @deprecated используйте fetchMoexIssFortsCatalog */
export async function fetchMoexIssMarginMap(): Promise<Map<string, number>> {
  const catalog = await fetchMoexIssFortsCatalog()
  return catalog.marginByKey
}

/**
 * ГО ₽ на 1 контракт.
 */
export async function lookupMoexIssMarginRub(symbol: string): Promise<number | null> {
  const key = normalizeIssShortname(symbol)
  if (!key) {
    return null
  }
  const catalog = await fetchMoexIssFortsCatalog()
  return catalog.marginByKey.get(key) ?? null
}

/**
 * Объём 1 контракта ₽ (settle/minstep×stepprice).
 */
export async function lookupMoexIssContractVolumeRub(symbol: string): Promise<number | null> {
  const key = normalizeIssShortname(symbol)
  if (!key) {
    return null
  }
  const catalog = await fetchMoexIssFortsCatalog()
  return catalog.volumeByKey.get(key) ?? null
}

/**
 * ₽ за 1 пункт спреда на оси ×100: volume×lots / 100.
 * Референс — обычно последняя нога (GOLD/SILV/USDRUBF).
 */
export function calcSpreadPointValueRub(
  contractVolumeRub: number | null | undefined,
  lots: number,
  multiple = MOEX_SPREAD_MULTIPLE,
): number | null {
  if (contractVolumeRub == null || !(contractVolumeRub > 0) || !(lots > 0) || !(multiple > 0)) {
    return null
  }
  return (contractVolumeRub * lots) / multiple
}

/**
 * PnL ₽ при движении спреда с current до target (лонг раздвижки).
 */
export function calcSpreadMovePnlRub(
  current: number | null | undefined,
  target: number | null | undefined,
  pointValueRub: number | null | undefined,
): number | null {
  if (
    current == null ||
    target == null ||
    pointValueRub == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    !Number.isFinite(pointValueRub)
  ) {
    return null
  }
  return (target - current) * pointValueRub
}
