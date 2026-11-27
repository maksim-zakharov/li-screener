import type { Bar } from '@/assets/charting_library'

/** Множитель календарного спреда MOEX (как CHART_SPREAD_MULTIPLE на фронте). */
export const MOEX_SPREAD_MULTIPLE = 100

/** Ноги тикера `A/B`. */
export interface SpreadLegs {
  /** Левая нога */
  left: string
  /** Правая нога */
  right: string
}

/**
 * Парсит `GOLD-12.26/GOLD-3.27` (с опциональным `MOEX:` на ногах).
 */
export function splitSpreadLegs(symbol: string, bare: (s: string) => string): SpreadLegs | null {
  if (!symbol.includes('/')) {
    return null
  }
  const [leftRaw, rightRaw] = symbol.split('/')
  const left = bare(leftRaw ?? '')
  const right = bare(rightRaw ?? '')
  if (!left || !right) {
    return null
  }
  return { left, right }
}

/**
 * Как smartmoney `calculateCandle(..., multiple, 'div')`: (L/R)×multiple.
 */
export function ratioSpreadBar(left: Bar, right: Bar, multiple = MOEX_SPREAD_MULTIPLE): Bar | null {
  if (!(right.open > 0) || !(right.high > 0) || !(right.low > 0) || !(right.close > 0)) {
    return null
  }
  const open = (left.open / right.open) * multiple
  const close = (left.close / right.close) * multiple
  const high = (left.high / right.high) * multiple
  const low = (left.low / right.low) * multiple
  if (![open, close, high, low].every(Number.isFinite)) {
    return null
  }
  return {
    time: left.time,
    open,
    close,
    high: Math.max(open, close, high),
    low: Math.min(open, close, low),
    volume: Math.min(left.volume ?? 0, right.volume ?? 0),
  }
}

/**
 * Пересечение по time + ratio-merge (как getCommonCandles + calculateCandle на фронте).
 */
export function mergeSpreadHistory(
  leftBars: Bar[],
  rightBars: Bar[],
  multiple = MOEX_SPREAD_MULTIPLE,
): Bar[] {
  const rightByTime = new Map(rightBars.map((bar) => [bar.time, bar]))
  const out: Bar[] = []
  for (const left of leftBars) {
    const right = rightByTime.get(left.time)
    if (!right) {
      continue
    }
    const spread = ratioSpreadBar(left, right, multiple)
    if (spread) {
      out.push(spread)
    }
  }
  return out
}

/**
 * Самый ранний time (sec) среди историй — для nextTime при пустом merge.
 */
export function earliestBarTimeSec(histories: Bar[][]): number | undefined {
  let minMs: number | undefined
  for (const bars of histories) {
    for (const bar of bars) {
      if (minMs == null || bar.time < minMs) {
        minMs = bar.time
      }
    }
  }
  return minMs != null ? Math.floor(minMs / 1000) : undefined
}
