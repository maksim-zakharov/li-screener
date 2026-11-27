import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ARB_PAIRS, DEFAULT_ARB_PAIR, type ArbPair } from '@/arbitrages/arb-pairs'
import { AlorChart } from '@/components/AlorChart'
import { ArbitragesList } from '@/components/ArbitragesList'

/** Query-параметр выбранного спреда. */
const TICKER_QUERY = 'ticker'

/**
 * Пара по ticker/id из query; неизвестный → default.
 */
function resolvePairFromQuery(raw: string | null): ArbPair {
  const value = raw?.trim()
  if (!value) {
    return DEFAULT_ARB_PAIR
  }
  return ARB_PAIRS.find((pair) => pair.ticker === value || pair.id === value) ?? DEFAULT_ARB_PAIR
}

/**
 * Арбитражи: слева график спреда, справа список пар.
 * Выбранный спред — в query `?ticker=…` (HashRouter: `/#/arbitrages?ticker=…`).
 */
export function ArbitragesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = useMemo(
    () => resolvePairFromQuery(searchParams.get(TICKER_QUERY)),
    [searchParams],
  )

  /** Нет/битый ticker в query → пишем актуальный (replace). */
  useEffect(() => {
    const raw = searchParams.get(TICKER_QUERY)?.trim() ?? ''
    if (raw === selected.ticker) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(TICKER_QUERY, selected.ticker)
        return next
      },
      { replace: true },
    )
  }, [searchParams, selected.ticker, setSearchParams])

  const onSelect = useCallback(
    (pair: ArbPair) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(TICKER_QUERY, pair.ticker)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1">
        <AlorChart symbol={selected.ticker} height="100%" showWidgetBar={false} />
      </div>
      <ArbitragesList
        pairs={ARB_PAIRS}
        selectedTicker={selected.ticker}
        onSelect={onSelect}
      />
    </div>
  )
}
