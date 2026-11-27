import { useEffect, useMemo, useState } from 'react'
import { Exchange, Format, type Symbol as AlorSymbol } from 'alor-api'
import { ensureAlorAccessToken, getAlorRefreshToken } from '@/api/alor-client'
import { buildSpreadQuoteRow, parseArbTickerLegs, type ArbQuoteRow } from '@/arbitrages/arb-quote'
import type { ArbPair } from '@/arbitrages/arb-pairs'

/**
 * Live-котировки арбитражных спредов: WS quotes на обе ноги → (L/R)×100.
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
    const unsubs: Array<() => void | Promise<void>> = []
    /** Последние котировки ног по коду. */
    const legs = new Map<string, AlorSymbol>()
    /** ticker → { left, right } */
    const pairLegs = new Map<string, { left: string; right: string }>()

    for (const pair of pairs) {
      const parsed = parseArbTickerLegs(pair.ticker)
      if (parsed) {
        pairLegs.set(pair.ticker, parsed)
      }
    }

    const emitAll = () => {
      if (cancelled) {
        return
      }
      const next: Record<string, ArbQuoteRow> = {}
      for (const [ticker, codes] of pairLegs) {
        next[ticker] = buildSpreadQuoteRow(ticker, legs.get(codes.left), legs.get(codes.right))
      }
      setByTicker(next)
    }

    const codes = [...new Set([...pairLegs.values()].flatMap((p) => [p.left, p.right]))]

    void (async () => {
      try {
        const api = await ensureAlorAccessToken()
        if (cancelled) {
          return
        }

        if (codes.length > 0) {
          try {
            const raw = await api.instruments.getQuotes({
              symbols: codes.map((c) => `MOEX:${c}`).join(','),
              format: 'Simple',
            })
            const list = Array.isArray(raw) ? raw : []
            for (const row of list) {
              const code = String(row.symbol ?? '').trim()
              if (code) {
                legs.set(code, row)
              }
            }
            emitAll()
          } catch (error) {
            console.warn('Arb quotes REST:', error)
          }
        }

        for (const code of codes) {
          try {
            const unsubscribe = await api.subscriptions.quotes(
              {
                code,
                exchange: Exchange.MOEX,
                format: Format.Simple,
              },
              (data) => {
                if (cancelled || !data) {
                  return
                }
                const sym = String(data.symbol ?? code).trim() || code
                legs.set(sym, data)
                legs.set(code, data)
                emitAll()
              },
            )
            if (cancelled) {
              void unsubscribe()
              return
            }
            unsubs.push(() => unsubscribe())
          } catch (error) {
            console.warn(`Arb quotes WS ${code}:`, error)
          }
        }
      } catch (error) {
        console.warn('Arb quotes: ошибка подписки', error)
      }
    })()

    return () => {
      cancelled = true
      for (const unsub of unsubs) {
        void unsub()
      }
    }
    // tickersKey отражает состав pairs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey])

  return byTicker
}
