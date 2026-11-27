import { useEffect, useMemo, useState } from 'react'
import type { Symbol as AlorSymbol } from 'alor-api'
import { fetchAlorQuotesSnapshot, subscribeAlorQuotes } from '@/api/alor-quotes-hub'
import { getAlorRefreshToken } from '@/api/alor-client'
import {
  buildCompositeQuoteRow,
  parseArbTickerCodes,
  type ArbQuoteRow,
} from '@/arbitrages/arb-quote'
import type { ArbPair } from '@/arbitrages/arb-pairs'

/**
 * Live-котировки арбитражных спредов: общий hub quotes на ноги → композит.
 */
export function useArbQuotes(pairs: ArbPair[]): Record<string, ArbQuoteRow> {
  const tickersKey = useMemo(() => pairs.map((p) => p.ticker).join('|'), [pairs])
  const [byTicker, setByTicker] = useState<Record<string, ArbQuoteRow>>({})

  useEffect(() => {
    if (!getAlorRefreshToken() || pairs.length === 0) {
      setByTicker({})
      return
    }

    let cancelled = false
    const unsubs: Array<() => void> = []
    const legs = new Map<string, AlorSymbol>()
    const pairCodes = new Map<string, string[]>()

    for (const pair of pairs) {
      const codes = parseArbTickerCodes(pair.ticker)
      if (codes.length >= 2) {
        pairCodes.set(pair.ticker, codes)
      }
    }

    const emitAll = () => {
      if (cancelled) {
        return
      }
      const next: Record<string, ArbQuoteRow> = {}
      for (const ticker of pairCodes.keys()) {
        next[ticker] = buildCompositeQuoteRow(ticker, legs)
      }
      setByTicker(next)
    }

    const codes = [...new Set([...pairCodes.values()].flat())]

    void (async () => {
      try {
        if (codes.length > 0) {
          try {
            const snapshot = await fetchAlorQuotesSnapshot(codes, 'MOEX')
            if (cancelled) {
              return
            }
            for (const [code, row] of snapshot) {
              legs.set(code, row)
            }
            emitAll()
          } catch (error) {
            console.warn('Arb quotes REST:', error)
          }
        }

        for (const code of codes) {
          if (cancelled) {
            return
          }
          unsubs.push(
            subscribeAlorQuotes(code, 'MOEX', (data) => {
              if (cancelled || !data) {
                return
              }
              const sym = String(data.symbol ?? code).trim() || code
              legs.set(sym, data)
              legs.set(code, data)
              emitAll()
            }),
          )
        }
      } catch (error) {
        console.warn('Arb quotes: ошибка подписки', error)
      }
    })()

    return () => {
      cancelled = true
      for (const unsub of unsubs) {
        unsub()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey])

  return byTicker
}
