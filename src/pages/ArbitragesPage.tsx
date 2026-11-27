import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calculator, LineChart, Table2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { ARB_PAIRS, DEFAULT_ARB_PAIR, type ArbPair } from '@/arbitrages/arb-pairs'
import { useArbQuotes } from '@/arbitrages/useArbQuotes'
import { AlorChart } from '@/components/AlorChart'
import { ArbitragesList } from '@/components/ArbitragesList'
import { ArbSpreadDetailsCard } from '@/components/ArbSpreadDetailsCard'
import { MobileBottomNav, MobileBottomNavItem } from '@/components/ui/mobile-bottom-nav'
import { useIsMobile } from '@/useIsMobile'

/** Query-параметр выбранного спреда. */
const TICKER_QUERY = 'ticker'

/** Вкладки мобильного меню арбитражей. */
type ArbMobileTab = 'chart' | 'table' | 'calculator'

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
 * Арбитражи: десктоп — график + список; мобилка — табы График / Таблица / Калькулятор.
 * Выбранный спред — в query `?ticker=…` (HashRouter: `/#/arbitrages?ticker=…`).
 */
export function ArbitragesPage() {
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<ArbMobileTab>('chart')
  const [searchParams, setSearchParams] = useSearchParams()
  const quotes = useArbQuotes(ARB_PAIRS)
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

  const onSelectFromTable = useCallback(
    (pair: ArbPair) => {
      onSelect(pair)
      if (isMobile) {
        setMobileTab('chart')
      }
    },
    [isMobile, onSelect],
  )

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mobileTab === 'chart' ? (
            <div className="min-h-0 min-w-0 flex-1">
              <AlorChart symbol={selected.ticker} height="100%" showWidgetBar={false} />
            </div>
          ) : null}
          {mobileTab === 'table' ? (
            <ArbitragesList
              pairs={ARB_PAIRS}
              selectedTicker={selected.ticker}
              onSelect={onSelectFromTable}
              quotes={quotes}
              showDetails={false}
              className="w-full flex-1 border-l-0"
            />
          ) : null}
          {mobileTab === 'calculator' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ArbSpreadDetailsCard
                pair={selected}
                currentSpread={quotes[selected.ticker]?.last ?? null}
                className="border-t-0"
              />
            </div>
          ) : null}
        </div>
        <MobileBottomNav>
          <MobileBottomNavItem
            active={mobileTab === 'chart'}
            icon={<LineChart className="h-5 w-5 shrink-0" />}
            label="График"
            onClick={() => setMobileTab('chart')}
          />
          <MobileBottomNavItem
            active={mobileTab === 'table'}
            icon={<Table2 className="h-5 w-5 shrink-0" />}
            label="Таблица"
            onClick={() => setMobileTab('table')}
          />
          <MobileBottomNavItem
            active={mobileTab === 'calculator'}
            icon={<Calculator className="h-5 w-5 shrink-0" />}
            label="Калькулятор"
            onClick={() => setMobileTab('calculator')}
          />
        </MobileBottomNav>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1">
        <AlorChart symbol={selected.ticker} height="100%" showWidgetBar={false} />
      </div>
      <ArbitragesList
        pairs={ARB_PAIRS}
        selectedTicker={selected.ticker}
        onSelect={onSelect}
        quotes={quotes}
      />
    </div>
  )
}
