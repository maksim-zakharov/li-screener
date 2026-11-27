import type { Symbol as AlorSymbol } from 'alor-api'
import {
  compositeStepMultiples,
  MOEX_SPREAD_MULTIPLE,
  parseCompositeTicker,
  type CompositeLeg,
} from '@/chart/alor-spread'

/** Котировка строки списка арбитражей (как колонки TV Quotes List). */
export interface ArbQuoteRow {
  /** Тикер пары */
  ticker: string
  /** Последняя цена спреда */
  last: number | null
  /** Изм. (абс.) */
  change: number | null
  /** Изм. в % */
  changePercent: number | null
}

/**
 * last / prev_close из Alor Symbol.
 */
export function extractLegPrices(quote: AlorSymbol | null | undefined): {
  last: number | null
  prevClose: number | null
} {
  if (!quote) {
    return { last: null, prevClose: null }
  }
  const bid = finiteOrNull(quote.bid)
  const ask = finiteOrNull(quote.ask)
  const mid = bid != null && ask != null ? (bid + ask) / 2 : null
  const last = finiteOrNull(quote.last_price) ?? mid ?? bid ?? ask
  const prevClose = finiteOrNull(quote.prev_close_price)
  return { last, prevClose }
}

function scalePrice(value: number | null, leg: CompositeLeg): number | null {
  if (value == null) {
    return null
  }
  const divisor = leg.divisor > 0 ? leg.divisor : 1
  return (value * leg.factor) / divisor
}

/**
 * Композит: left-assoc (L/R)×step с factor/divisor на ногах.
 */
export function buildCompositeQuoteRow(
  ticker: string,
  quotesByCode: Map<string, AlorSymbol | null | undefined>,
): ArbQuoteRow {
  const legs = parseCompositeTicker(ticker)
  if (!legs || legs.length < 2) {
    return { ticker, last: null, change: null, changePercent: null }
  }

  const priced = legs.map((leg) => {
    const prices = extractLegPrices(quotesByCode.get(leg.code))
    return {
      last: scalePrice(prices.last, leg),
      prevClose: scalePrice(prices.prevClose, leg),
    }
  })

  const steps = compositeStepMultiples(legs.length)
  let last = priced[0]!.last
  let prev = priced[0]!.prevClose
  for (let i = 1; i < priced.length; i++) {
    const rightLast = priced[i]!.last
    const rightPrev = priced[i]!.prevClose
    const step = steps[i - 1] ?? MOEX_SPREAD_MULTIPLE
    last = last != null && rightLast != null && rightLast !== 0 ? (last / rightLast) * step : null
    prev = prev != null && rightPrev != null && rightPrev !== 0 ? (prev / rightPrev) * step : null
  }

  if (last == null) {
    return { ticker, last: null, change: null, changePercent: null }
  }
  if (prev == null || prev === 0) {
    return { ticker, last, change: null, changePercent: null }
  }
  const change = last - prev
  const changePercent = (change / prev) * 100
  return { ticker, last, change, changePercent }
}

/**
 * Спред (L/R)×100 + дневное изменение от prev_close ног (2 ноги).
 */
export function buildSpreadQuoteRow(
  ticker: string,
  left: AlorSymbol | null | undefined,
  right: AlorSymbol | null | undefined,
): ArbQuoteRow {
  const map = new Map<string, AlorSymbol | null | undefined>()
  const legs = parseCompositeTicker(ticker)
  if (legs?.length === 2) {
    map.set(legs[0]!.code, left)
    map.set(legs[1]!.code, right)
    return buildCompositeQuoteRow(ticker, map)
  }
  return { ticker, last: null, change: null, changePercent: null }
}

/** Коды ног композита для подписки quotes. */
export function parseArbTickerCodes(ticker: string): string[] {
  const legs = parseCompositeTicker(ticker)
  if (!legs) {
    return []
  }
  return legs.map((leg) => leg.code)
}

/** @deprecated используйте parseArbTickerCodes / parseCompositeTicker */
export function parseArbTickerLegs(ticker: string): { left: string; right: string } | null {
  const legs = parseCompositeTicker(ticker)
  if (!legs || legs.length !== 2) {
    return null
  }
  return { left: legs[0]!.code, right: legs[1]!.code }
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Формат цены / изменения в стиле TV (ru, запятая). */
export function formatArbNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Изм. в % с суффиксом. */
export function formatArbPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return `${formatArbNumber(value, digits)}%`
}
