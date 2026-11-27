import { useState } from 'react'
import { ARB_PAIRS, DEFAULT_ARB_PAIR, type ArbPair } from '@/arbitrages/arb-pairs'
import { AlorChart } from '@/components/AlorChart'
import { ArbitragesList } from '@/components/ArbitragesList'

/**
 * Арбитражи: слева график спреда, справа список пар (как «Графики», но со списком).
 */
export function ArbitragesPage() {
  const [selected, setSelected] = useState<ArbPair>(DEFAULT_ARB_PAIR)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1">
        <AlorChart symbol={selected.ticker} height="100%" showWidgetBar={false} />
      </div>
      <ArbitragesList
        pairs={ARB_PAIRS}
        selectedTicker={selected.ticker}
        onSelect={setSelected}
      />
    </div>
  )
}
