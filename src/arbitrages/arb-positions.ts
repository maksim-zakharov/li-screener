import {
  compositeStepMultiples,
  MOEX_SPREAD_MULTIPLE,
  parseCompositeTicker,
} from '@/chart/alor-spread'
import { calcSpreadMovePnlRub, calcSpreadPointValueRub } from '@/arbitrages/moex-iss-margin'
import type { ArbPair } from '@/arbitrages/arb-pairs'
import { resolveLegLots } from '@/arbitrages/arb-pairs'

const STORAGE_KEY = 'li-screener.arb-positions'

/** Нога позиции: средняя и объём. */
export interface ArbPositionLeg {
  /** Код инструмента */
  code: string
  /** Средняя цена входа */
  avgPrice: number
  /** Объём, лоты */
  qty: number
}

/** Открытая арбитражная позиция. */
export interface ArbPosition {
  /** Уникальный id */
  id: string
  /** Тикер спреда */
  ticker: string
  /** Ноги с avg/qty */
  legs: ArbPositionLeg[]
  /** Средняя цена спреда на входе */
  avgSpread: number
  /** Время создания, ms */
  createdAt: number
}

/**
 * Цена композита из сырых цен ног (как buildCompositeQuoteRow / график):
 * (L×f/d / R×f/d) × step; FORTS divisor; CNY-кросс ×1000.
 */
export function computeCompositePriceFromLegPrices(
  ticker: string,
  priceByCode: Readonly<Record<string, number>>,
): number | null {
  const legs = parseCompositeTicker(ticker)
  if (!legs || legs.length < 2) {
    return null
  }
  const scaled: Array<number | null> = legs.map((leg) => {
    const raw = priceByCode[leg.code]
    if (raw == null || !Number.isFinite(raw)) {
      return null
    }
    const divisor = leg.divisor > 0 ? leg.divisor : 1
    return (raw * leg.factor) / divisor
  })
  const steps = compositeStepMultiples(legs.length, ticker)
  let value = scaled[0]!
  if (value == null) {
    return null
  }
  for (let i = 1; i < scaled.length; i++) {
    const right = scaled[i]
    const step = steps[i - 1] ?? MOEX_SPREAD_MULTIPLE
    if (right == null || right === 0) {
      return null
    }
    value = (value / right) * step
  }
  return Number.isFinite(value) ? value : null
}

/**
 * Средняя спреда позиции — всегда по формуле из цен ног (не кэш avgSpread).
 */
export function resolvePositionAvgSpread(position: ArbPosition): number | null {
  const priceByCode: Record<string, number> = {}
  for (const leg of position.legs) {
    priceByCode[leg.code] = leg.avgPrice
  }
  return computeCompositePriceFromLegPrices(position.ticker, priceByCode) ?? position.avgSpread
}

/**
 * Подпись лотности: `10 : 36 : 10`.
 */
export function formatPositionLots(legs: readonly ArbPositionLeg[]): string {
  return legs.map((leg) => String(leg.qty)).join(' : ')
}

/**
 * PnL ₽ лонга спреда: (current − avg) × стоимость пункта.
 */
export function calcPositionPnlRub(
  avgSpread: number,
  currentSpread: number | null | undefined,
  refContractVolumeRub: number | null | undefined,
  refLots: number,
): number | null {
  const pointValue = calcSpreadPointValueRub(refContractVolumeRub, refLots)
  return calcSpreadMovePnlRub(avgSpread, currentSpread, pointValue)
}

/** Live PnL: ₽ если есть объём контракта, иначе пункты спреда (как «Изм.» в списке). */
export type ArbPositionPnl =
  | { /** Режим */ kind: 'rub'; /** Значение ₽ */ value: number }
  | { /** Режим */ kind: 'pts'; /** Δ спреда */ value: number }

/**
 * Считает PnL от live last спреда (тот же last, что в списке котировок).
 */
export function calcPositionLivePnl(
  avgSpread: number,
  currentSpread: number | null | undefined,
  refContractVolumeRub: number | null | undefined,
  refLots: number,
): ArbPositionPnl | null {
  if (currentSpread == null || !Number.isFinite(currentSpread) || !Number.isFinite(avgSpread)) {
    return null
  }
  const rub = calcPositionPnlRub(avgSpread, currentSpread, refContractVolumeRub, refLots)
  if (rub != null) {
    return { kind: 'rub', value: rub }
  }
  return { kind: 'pts', value: currentSpread - avgSpread }
}

/** Дефолтные qty ног из lotRatios пары. */
export function defaultLegQtys(pair: ArbPair): number[] {
  return resolveLegLots(pair, pair.defaultBaseLots)
}

/** Загрузка позиций из localStorage. */
export function loadArbPositions(): ArbPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isArbPosition)
  } catch {
    return []
  }
}

/** Сохранение позиций. */
export function saveArbPositions(positions: readonly ArbPosition[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch (err) {
    console.warn('Сохранение позиций:', err)
  }
}

function isArbPosition(value: unknown): value is ArbPosition {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as ArbPosition
  return (
    typeof row.id === 'string' &&
    typeof row.ticker === 'string' &&
    typeof row.avgSpread === 'number' &&
    Array.isArray(row.legs) &&
    row.legs.every(
      (leg) =>
        leg &&
        typeof leg.code === 'string' &&
        typeof leg.avgPrice === 'number' &&
        typeof leg.qty === 'number',
    )
  )
}

/** Новый id позиции. */
export function createArbPositionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
