import type { Symbol as AlorSymbol } from 'alor-api'
import { MOEX_SPREAD_MULTIPLE, splitSpreadLegs } from '@/chart/alor-spread'

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

/**
 * Спред (L/R)×100 + дневное изменение от prev_close ног.
 */
export function buildSpreadQuoteRow(
  ticker: string,
  left: AlorSymbol | null | undefined,
  right: AlorSymbol | null | undefined,
  multiple = MOEX_SPREAD_MULTIPLE,
): ArbQuoteRow {
  const l = extractLegPrices(left)
  const r = extractLegPrices(right)
  const last =
    l.last != null && r.last != null && r.last !== 0 ? (l.last / r.last) * multiple : null
  const prev =
    l.prevClose != null && r.prevClose != null && r.prevClose !== 0
      ? (l.prevClose / r.prevClose) * multiple
      : null
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

/** Ноги тикера `A/B` без префикса биржи. */
export function parseArbTickerLegs(ticker: string): { left: string; right: string } | null {
  return splitSpreadLegs(ticker, (part) => {
    const trimmed = part.trim()
    const colon = trimmed.indexOf(':')
    return colon > 0 ? trimmed.slice(colon + 1).trim() : trimmed
  })
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
