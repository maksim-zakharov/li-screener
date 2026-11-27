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
  return ratioPair(ticker, description, [1, 1], 1)
}

/** Пара с заданным соотношением лотов. */
function ratioPair(
  ticker: string,
  description: string,
  lotRatios: number[],
  defaultBaseLots: number,
): ArbPair {
  return {
    id: ticker,
    ticker,
    label: ticker.replace(/\*/g, '×').replace(/\//g, ' / '),
    description,
    lotRatios,
    defaultBaseLots,
  }
}

/** Тройская унция, г (как в arbitrage-calculator). */
export const METAL_TROY_OUNCE_GRAMS = 31.1

/** База тройника золота: граммы / лоты GOLD. */
export const GOLD_TRIPLE_GRAMS = 311
export const GOLD_TRIPLE_METAL_LOTS = 10

/** База тройника серебра: граммы / лоты SILV (10 лотов/oz × 20 oz). */
export const SILVER_TRIPLE_GRAMS = 622
export const SILVER_TRIPLE_METAL_LOTS = 200

/** Металл тройника по кодам ног. */
export type MetalTripleKind = 'gold' | 'silver'

/**
 * Золото / серебро тройник по ногам (GLDRUBF|GOLD / SLVRUBF|SILV).
 */
export function resolveMetalTripleKind(codes: readonly string[]): MetalTripleKind | null {
  if (codes.some((c) => c === 'SLVRUBF' || /^SILV-/i.test(c))) {
    return 'silver'
  }
  if (codes.some((c) => c === 'GLDRUBF' || /^GOLD-/i.test(c))) {
    return 'gold'
  }
  return null
}

/** Тикер фьючерса металла из ног (GOLD-12.26 / SILV-12.26). */
export function resolveMetalFuturesCode(codes: readonly string[]): string | null {
  return codes.find((c) => /^GOLD-/i.test(c) || /^SILV-/i.test(c)) ?? null
}

/**
 * Лотности тройника от цены металла $/oz (LAST GOLD/SILV).
 * Формулы как в arbitrage-calculator XpbeeCalculator:
 * - gold SI = GOLD / 1000 / 31.1 × grams
 * - silver SI = (SILV / 1000 / 31.1) × 100 × grams
 * USDRUBF ≈ SI ($1000).
 */
export function resolveMetalTripleLotRatios(
  kind: MetalTripleKind,
  metalUsdPrice: number | null | undefined,
): { lotRatios: number[]; defaultBaseLots: number } {
  if (kind === 'silver') {
    const grams = SILVER_TRIPLE_GRAMS
    const metalLots = SILVER_TRIPLE_METAL_LOTS
    const fxLots =
      metalUsdPrice != null && metalUsdPrice > 0
        ? grams * (metalUsdPrice / 1000 / METAL_TROY_OUNCE_GRAMS) * 100
        : 0
    return { lotRatios: [grams, fxLots, metalLots], defaultBaseLots: grams }
  }
  const grams = GOLD_TRIPLE_GRAMS
  const metalLots = GOLD_TRIPLE_METAL_LOTS
  const fxLots =
    metalUsdPrice != null && metalUsdPrice > 0
      ? grams * (metalUsdPrice / 1000 / METAL_TROY_OUNCE_GRAMS)
      : 0
  return { lotRatios: [grams, fxLots, metalLots], defaultBaseLots: grams }
}

/**
 * Тройник металл ×31.1 / FX / GOLD|SILV.
 * Статичные лотности — fallback; в UI пересчёт от LAST металла.
 */
function metalTriplePair(ticker: string, description: string): ArbPair {
  const legs = parseCompositeTicker(ticker)
  const codes = legs?.map((l) => l.code) ?? []
  const kind = resolveMetalTripleKind(codes) ?? 'gold'
  const { lotRatios, defaultBaseLots } = resolveMetalTripleLotRatios(kind, null)
  return {
    id: ticker,
    ticker,
    label: ticker.replace(/\*/g, '×').replace(/\//g, ' / '),
    description,
    lotRatios,
    defaultBaseLots,
  }
}

/** Id списка арбитражей в UI. */
export type ArbListId = 'forex' | 'stocks'

/**
 * Пара акция TQBR / фьючерс (1:1).
 * По умолчанию фьюч = `{stock}-12.26`; исключения: SBER→SBRF, GAZP→GAZR, MTSS→MTSI, SNGS→SNGR, NVTK→NOTKM, PLZL→PLZLM, TRNFP→TRNF, CHMF→CHMFM.
 */
function stockFuturePair(stock: string, futureRoot = stock): ArbPair {
  return calendarPair(`${stock}/${futureRoot}-12.26`, `${stock} · акция / фьючерс`)
}

/**
 * Форекс / металлы / валютные календарные спреды FORTS.
 */
export const ARB_FOREX_PAIRS: ArbPair[] = [
  calendarPair('GOLD-12.26/GOLD-3.27', 'Золото · календарный спред'),
  calendarPair('SILV-12.26/SILV-3.27', 'Серебро · календарный спред'),
  calendarPair('ED-12.26/ED-3.27', 'EUR/USD · календарный спред'),
  calendarPair('CNY-12.26/CNYRUBF', 'CNY · квартал vs вечный'),
  calendarPair('CNY-3.27/CNYRUBF', 'CNY · квартал vs вечный · H27'),
  calendarPair('SI-12.26/USDRUBF', 'SI · квартал vs USDRUBF'),
  calendarPair('SI-3.27/USDRUBF', 'SI · квартал vs USDRUBF · H27'),
  calendarPair('MIX-12.26/IMOEXF', 'MIX · квартал vs IMOEXF'),
  ratioPair('SI-12.26/CNY-12.26', 'SI / CNY · квартал', [40, 267], 40),
  ratioPair('SI-3.27/CNY-3.27', 'SI / CNY · H27', [40, 267], 40),
  ratioPair('USDRUBF/CNYRUBF', 'USD / CNY · вечные', [1, 6.6683], 1),
  ratioPair('EURRUBF/CNYRUBF', 'EUR / CNY · вечные', [1, 8], 1),
  ratioPair('EURRUBF/USDRUBF/ED-12.26', 'EUR ₽ / USD ₽ vs ED', [1, 1, 1], 1),
  ratioPair('EURRUBF/USDRUBF/ED-3.27', 'EUR ₽ / USD ₽ vs ED · H27', [1, 1, 1], 1),
  calendarPair('GLDRUBF/GL-12.26', 'Золото · вечный vs квартал'),
  calendarPair('GLDRUBF/GL-3.27', 'Золото · вечный vs квартал · H27'),
  metalTriplePair('GLDRUBF*31.1/USDRUBF/GOLD-12.26', 'Золото ₽ → $/oz vs GOLD'),
  metalTriplePair('GLDRUBF*31.1/SI-12.26/GOLD-12.26', 'GLDRUBF / SI / GOLD'),
  metalTriplePair('GLDRUBF*31.1/USDRUBF/GOLD-3.27', 'Золото ₽ → $/oz vs GOLD · H27'),
  metalTriplePair('GLDRUBF*31.1/SI-3.27/GOLD-3.27', 'GLDRUBF / SI / GOLD · H27'),
  metalTriplePair('SLVRUBF*31.1/USDRUBF/SILV-12.26', 'Серебро ₽ → $/oz vs SILV'),
  metalTriplePair('SLVRUBF*31.1/USDRUBF/SILV-3.27', 'Серебро ₽ → $/oz vs SILV · H27'),
  metalTriplePair('SLVRUBF*31.1/SI-12.26/SILV-12.26', 'SLVRUBF / SI / SILV'),
  metalTriplePair('SLVRUBF*31.1/SI-3.27/SILV-3.27', 'SLVRUBF / SI / SILV · H27'),
]

/**
 * Акции TQBR vs квартальные фьючерсы `{ticker}-12.26`.
 */
export const ARB_STOCK_PAIRS: ArbPair[] = [
  stockFuturePair('SBER', 'SBRF'),
  stockFuturePair('GAZP', 'GAZR'),
  stockFuturePair('LKOH'),
  stockFuturePair('ROSN'),
  stockFuturePair('GMKN'),
  stockFuturePair('VTBR'),
  stockFuturePair('MGNT'),
  stockFuturePair('MOEX'),
  stockFuturePair('NVTK', 'NOTKM'),
  stockFuturePair('PLZL', 'PLZLM'),
  stockFuturePair('TATN'),
  stockFuturePair('SNGS', 'SNGR'),
  stockFuturePair('CHMF', 'CHMFM'),
  stockFuturePair('NLMK'),
  stockFuturePair('MAGN'),
  stockFuturePair('ALRS'),
  stockFuturePair('MTSS', 'MTSI'),
  stockFuturePair('AFLT'),
  stockFuturePair('AFKS'),
  stockFuturePair('RTKM'),
  stockFuturePair('HYDR'),
  stockFuturePair('FEES'),
  stockFuturePair('IRAO'),
  stockFuturePair('SIBN'),
  stockFuturePair('TRNFP', 'TRNF'),
  stockFuturePair('MTLR'),
  stockFuturePair('RUAL'),
  stockFuturePair('YDEX'),
  stockFuturePair('OZON'),
  stockFuturePair('VKCO'),
  stockFuturePair('POSI'),
  stockFuturePair('HEAD'),
  stockFuturePair('X5'),
  stockFuturePair('PHOR'),
  stockFuturePair('SMLT'),
  stockFuturePair('FLOT'),
  stockFuturePair('BSPB'),
  stockFuturePair('CBOM'),
  stockFuturePair('MDMG'),
  stockFuturePair('RENI'),
  stockFuturePair('LENT'),
  stockFuturePair('FIXR'),
  stockFuturePair('UPRO'),
]

/** Пары по id списка. */
export const ARB_PAIRS_BY_LIST: Record<ArbListId, ArbPair[]> = {
  forex: ARB_FOREX_PAIRS,
  stocks: ARB_STOCK_PAIRS,
}

/** Все пары (котировки / резолв ticker из query). */
export const ARB_PAIRS: ArbPair[] = [...ARB_FOREX_PAIRS, ...ARB_STOCK_PAIRS]

/** Список по умолчанию. */
export const DEFAULT_ARB_LIST: ArbListId = 'forex'

/** Пара по умолчанию. */
export const DEFAULT_ARB_PAIR = ARB_FOREX_PAIRS[0]!

/** Список, в котором лежит пара. */
export function resolveArbListId(pair: ArbPair): ArbListId {
  if (ARB_STOCK_PAIRS.some((item) => item.id === pair.id)) {
    return 'stocks'
  }
  return 'forex'
}

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
