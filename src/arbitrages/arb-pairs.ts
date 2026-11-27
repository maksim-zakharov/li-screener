import { parseCompositeTicker } from '@/chart/alor-spread'

/** Арбитражная пара для списка / графика. */
export interface ArbPair {
  /** Уникальный id (= ticker) */
  id: string
  /** Тикер графика: ноги через `/` */
  ticker: string
  /** Подпись в списке */
  label: string
  /** Краткое описание */
  description: string
  /**
   * Лотности ног при базовом объёме `defaultBaseLots` (первая нога).
   * Календарные — 1:1; GLD-тройки — 311 / SI≈36 / GOLD 10.
   */
  lotRatios: number[]
  /** Базовый объём (лоты первой ноги) по умолчанию */
  defaultBaseLots: number
}

/** Календарный спред 1:1. */
function calendarPair(
  ticker: string,
  description: string,
): ArbPair {
  return {
    id: ticker,
    ticker,
    label: ticker.replace(/\//g, ' / '),
    description,
    lotRatios: [1, 1],
    defaultBaseLots: 1,
  }
}

/**
 * Тройник GLDRUBF|SLVRUBF×31.1 / FX / GOLD|SILV — лотности 311 / ~36 / 10.
 * USDRUBF ≈ SI по размеру лота $1000.
 */
function metalTriplePair(ticker: string, description: string): ArbPair {
  const legs = parseCompositeTicker(ticker)
  const codes = legs?.map((l) => l.code) ?? []
  const hasSi = codes.some((c) => /^SI-/i.test(c))
  return {
    id: ticker,
    ticker,
    label: ticker.replace(/\*/g, '×').replace(/\//g, ' / '),
    description,
    lotRatios: hasSi ? [311, 35.78, 10] : [311, 36, 10],
    defaultBaseLots: 311,
  }
}

/**
 * Статический список арбитражей (календарные спреды FORTS и т.п.).
 */
export const ARB_PAIRS: ArbPair[] = [
  calendarPair('GOLD-12.26/GOLD-3.27', 'Золото · календарный спред'),
  calendarPair('SILV-12.26/SILV-3.27', 'Серебро · календарный спред'),
  calendarPair('ED-12.26/ED-3.27', 'EUR/USD · календарный спред'),
  calendarPair('CNY-12.26/CNYRUBF', 'CNY · квартал vs вечный'),
  calendarPair('CNY-3.27/CNYRUBF', 'CNY · квартал vs вечный · H27'),
  calendarPair('SI-12.26/USDRUBF', 'SI · квартал vs USDRUBF'),
  calendarPair('SI-3.27/USDRUBF', 'SI · квартал vs USDRUBF · H27'),
  metalTriplePair('GLDRUBF*31.1/USDRUBF/GOLD-12.26', 'Золото ₽ → $/oz vs GOLD'),
  metalTriplePair('GLDRUBF*31.1/SI-12.26/GOLD-12.26', 'GLDRUBF / SI / GOLD'),
  metalTriplePair('GLDRUBF*31.1/USDRUBF/GOLD-3.27', 'Золото ₽ → $/oz vs GOLD · H27'),
  metalTriplePair('GLDRUBF*31.1/SI-3.27/GOLD-3.27', 'GLDRUBF / SI / GOLD · H27'),
  metalTriplePair('SLVRUBF*31.1/USDRUBF/SILV-12.26', 'Серебро ₽ → $/oz vs SILV'),
  metalTriplePair('SLVRUBF*31.1/USDRUBF/SILV-3.27', 'Серебро ₽ → $/oz vs SILV · H27'),
  metalTriplePair('SLVRUBF*31.1/SI-12.26/SILV-12.26', 'SLVRUBF / SI / SILV'),
  metalTriplePair('SLVRUBF*31.1/SI-3.27/SILV-3.27', 'SLVRUBF / SI / SILV · H27'),
]

/** Пара по умолчанию. */
export const DEFAULT_ARB_PAIR = ARB_PAIRS[0]!

/**
 * Лоты ног от базового объёма (лоты 1-й ноги).
 * Первая нога = baseLots; остальные пропорционально lotRatios.
 */
export function resolveLegLots(pair: ArbPair, baseLots: number): number[] {
  const ratios = pair.lotRatios
  if (ratios.length === 0) {
    return []
  }
  const baseRatio = ratios[0]!
  if (!(baseRatio > 0) || !(baseLots > 0)) {
    return ratios.map(() => 0)
  }
  return ratios.map((ratio, idx) => {
    if (idx === 0) {
      return Math.round(baseLots)
    }
    return Math.round((baseLots * ratio) / baseRatio)
  })
}

/** Коды ног тикера. */
export function arbPairLegCodes(pair: ArbPair): string[] {
  return parseCompositeTicker(pair.ticker)?.map((leg) => leg.code) ?? []
}
