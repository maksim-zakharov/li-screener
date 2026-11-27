import type { Symbol as AlorSymbol } from 'alor-api'
import type { DatafeedQuoteValues, QuoteData } from '@/assets/charting_library'

/**
 * Маппинг Alor Symbol → TradingView QuoteOkData (Watchlist / Details / Legend).
 * `n` должен совпадать с запрошенным chart-именем.
 */
export function mapAlorSymbolToQuote(chartName: string, quote: AlorSymbol | null | undefined): QuoteData {
  if (!quote) {
    return {
      n: chartName,
      s: 'ok',
      v: {
        short_name: chartName,
        description: chartName,
        original_name: chartName,
        ch: 0,
        chp: 0,
      },
    }
  }

  const bid = finiteOrUndef(quote.bid)
  const ask = finiteOrUndef(quote.ask)
  const mid = bid != null && ask != null ? (bid + ask) / 2 : undefined
  const lp = finiteOrUndef(quote.last_price) ?? mid ?? bid ?? ask
  const resolvedBid = bid ?? lp
  const resolvedAsk = ask ?? lp
  const spread =
    resolvedBid != null && resolvedAsk != null ? Math.max(0, resolvedAsk - resolvedBid) : undefined

  const v: DatafeedQuoteValues = {
    short_name: String(quote.symbol ?? chartName),
    exchange: String(quote.exchange ?? 'MOEX'),
    description: String(quote.description ?? quote.symbol ?? chartName),
    original_name: chartName,
    ch: finiteOrUndef(quote.change) ?? 0,
    chp: finiteOrUndef(quote.change_percent) ?? 0,
  }

  if (lp != null) {
    v.lp = lp
    v.prev_close_price = finiteOrUndef(quote.prev_close_price) ?? lp
  }
  if (resolvedBid != null) {
    v.bid = resolvedBid
  }
  if (resolvedAsk != null) {
    v.ask = resolvedAsk
  }
  if (spread != null) {
    v.spread = spread
  }

  const open = finiteOrUndef(quote.open_price)
  if (open != null) {
    v.open_price = open
  }
  const high = finiteOrUndef(quote.high_price)
  if (high != null) {
    v.high_price = high
  }
  const low = finiteOrUndef(quote.low_price)
  if (low != null) {
    v.low_price = low
  }
  const volume = finiteOrUndef(quote.volume)
  if (volume != null) {
    v.volume = volume
  }

  return { n: chartName, s: 'ok', v }
}

function finiteOrUndef(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined
  }
  const n = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(n) ? n : undefined
}
