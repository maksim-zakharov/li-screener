import type { Bar } from '@/assets/charting_library'

/** Множитель календарного / композитного спреда MOEX (как CHART_SPREAD_MULTIPLE). */
export const MOEX_SPREAD_MULTIPLE = 100

/** Грамм в тройской унции (GLDRUBF → $/oz). */
export const GLDRUBF_TROY_OUNCE_MULTIPLIER = 31.1

/** Нога композита `CODE` или `CODE*factor`. */
export interface CompositeLeg {
  /** Код Alor (без биржи и без `*factor`) */
  code: string
  /** Множитель OHLC (`GLDRUBF*31.1` → 31.1) */
  factor: number
  /** Делитель OHLC (SI/EU → 1000) */
  divisor: number
}

/** Ноги тикера `A/B` (legacy). */
export interface SpreadLegs {
  /** Левая нога */
  left: string
  /** Правая нога */
  right: string
}

/**
 * Bare без префикса биржи: `MOEX:SBER` → `SBER`.
 */
export function bareLegCode(raw: string): string {
  const trimmed = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  const colon = trimmed.indexOf(':')
  if (colon > 0) {
    return trimmed.slice(colon + 1).trim()
  }
  return trimmed
}

/**
 * Парсит `GOLD-12.26/GOLD-3.27` (с опциональным `MOEX:` на ногах).
 */
export function splitSpreadLegs(symbol: string, bare: (s: string) => string = bareLegCode): SpreadLegs | null {
  const legs = parseCompositeTicker(symbol, bare)
  if (!legs || legs.length !== 2) {
    return null
  }
  return { left: legs[0]!.code, right: legs[1]!.code }
}

/** Фьючерс SI (`SI`, `SI-12.26`, `SI1!`). */
function isSiFuturesCode(code: string): boolean {
  return /^SI(-\d{1,2}\.\d{2}|1!)?$/i.test(code.trim())
}

/** Фьючерс EU. */
function isEuFuturesCode(code: string): boolean {
  return /^EU(-\d{1,2}\.\d{2}|1!)?$/i.test(code.trim())
}

/**
 * Парсит композит: `A/B`, `GLDRUBF*31.1/USDRUBF/GOLD-12.26`.
 * SI/EU /1000: левая нога или SI справа от GLDRUBF (как smartmoney).
 */
export function parseCompositeTicker(
  symbol: string,
  bare: (s: string) => string = bareLegCode,
): CompositeLeg[] | null {
  if (!symbol.includes('/')) {
    return null
  }
  const rawParts = symbol
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (rawParts.length < 2) {
    return null
  }

  const legs: CompositeLeg[] = rawParts.map((part) => {
    const stripped = bare(part)
    const star = stripped.indexOf('*')
    let code = stripped
    let factor = 1
    if (star > 0) {
      code = stripped.slice(0, star).trim()
      const f = Number(stripped.slice(star + 1).trim())
      if (Number.isFinite(f) && f > 0) {
        factor = f
      }
    }
    return { code, factor, divisor: 1 }
  })

  if (legs.some((leg) => !leg.code)) {
    return null
  }

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!
    const siEu = isSiFuturesCode(leg.code) || isEuFuturesCode(leg.code)
    if (!siEu) {
      continue
    }
    const first = legs[0]!.code.toUpperCase()
    if (i === 0 || first === 'GLDRUBF' || first === 'SLVRUBF') {
      leg.divisor = 1000
    }
  }

  return legs
}

/**
 * Шаги слияния (длина = legs-1): промежуточные ×1, последний ×100.
 */
export function compositeStepMultiples(legCount: number): number[] {
  if (legCount < 2) {
    return []
  }
  const steps = new Array(legCount - 1).fill(1) as number[]
  steps[steps.length - 1] = MOEX_SPREAD_MULTIPLE
  return steps
}

/** Масштаб OHLC ноги: ×factor / divisor. */
export function scaleLegBar(bar: Bar, factor: number, divisor: number): Bar {
  const m = factor / (divisor > 0 ? divisor : 1)
  if (m === 1) {
    return bar
  }
  return {
    ...bar,
    open: bar.open * m,
    high: bar.high * m,
    low: bar.low * m,
    close: bar.close * m,
  }
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
 * N-ногие истории: scale ног → left-assoc (L/R)×step.
 */
export function mergeCompositeHistory(histories: Bar[][], legs: CompositeLeg[]): Bar[] {
  if (legs.length < 2 || histories.length !== legs.length) {
    return []
  }
  const scaled = histories.map((bars, idx) => {
    const leg = legs[idx]!
    return bars.map((bar) => scaleLegBar(bar, leg.factor, leg.divisor))
  })
  const steps = compositeStepMultiples(legs.length)
  let merged = scaled[0]!
  for (let i = 1; i < scaled.length; i++) {
    merged = mergeSpreadHistory(merged, scaled[i]!, steps[i - 1] ?? MOEX_SPREAD_MULTIPLE)
  }
  return merged
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

/**
 * Склейка live-баров ног в одну свечу спреда (совпадающий time).
 */
export function mergeCompositeLiveBars(legBars: Bar[], legs: CompositeLeg[]): Bar | null {
  if (legBars.length !== legs.length || legBars.length < 2) {
    return null
  }
  const t0 = legBars[0]!.time
  if (legBars.some((b) => b.time !== t0)) {
    return null
  }
  const scaled = legBars.map((bar, idx) => scaleLegBar(bar, legs[idx]!.factor, legs[idx]!.divisor))
  const steps = compositeStepMultiples(legs.length)
  let merged: Bar | null = scaled[0]!
  for (let i = 1; i < scaled.length; i++) {
    merged = ratioSpreadBar(merged, scaled[i]!, steps[i - 1] ?? MOEX_SPREAD_MULTIPLE)
    if (!merged) {
      return null
    }
  }
  return merged
}
