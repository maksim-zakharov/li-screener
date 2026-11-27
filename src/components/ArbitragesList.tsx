import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ArbPair } from '@/arbitrages/arb-pairs'
import {
  formatArbNumber,
  formatArbPercent,
  type ArbQuoteRow,
} from '@/arbitrages/arb-quote'
import { useArbQuotes } from '@/arbitrages/useArbQuotes'
import { ArbSpreadDetailsCard } from '@/components/ArbSpreadDetailsCard'

interface ArbitragesListProps {
  /** Пары в списке */
  pairs: ArbPair[]
  /** Выбранный ticker */
  selectedTicker: string
  /** Выбор пары */
  onSelect: (pair: ArbPair) => void
  /** Доп. класс контейнера */
  className?: string
}

/**
 * Правая колонка: список котировок арбитражей + карточка выбранного спреда.
 */
export function ArbitragesList({ pairs, selectedTicker, onSelect, className }: ArbitragesListProps) {
  const [query, setQuery] = useState('')
  const quotes = useArbQuotes(pairs)
  const selected = pairs.find((p) => p.ticker === selectedTicker) ?? pairs[0]

  const filteredPairs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return pairs
    }
    return pairs.filter((pair) => {
      const haystack = `${pair.ticker} ${pair.label} ${pair.description}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [pairs, query])

  return (
    <aside
      className={cn(
        'flex w-[440px] shrink-0 flex-col border-l border-[rgba(166,189,213,0.2)] bg-tmp-17181e',
        className,
      )}
    >
      <div className="shrink-0 border-b border-[rgba(166,189,213,0.2)] px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          aria-label="Поиск арбитражей"
          className="h-8 w-full rounded border border-[rgba(166,189,213,0.25)] bg-[rgb(28,28,34)] px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2962ff]"
        />
      </div>

      <div
        className="grid shrink-0 grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,0.85fr)] gap-1 border-b border-[rgba(166,189,213,0.15)] px-3 py-1.5 text-[11px] text-muted-foreground"
        role="row"
      >
        <span>Инструмент</span>
        <span className="text-right">Посл. цена</span>
        <span className="text-right">Изм.</span>
        <span className="text-right">Изм. в %</span>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-0.5" role="listbox" aria-label="Арбитражи">
        {filteredPairs.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">Ничего не найдено</li>
        ) : (
          filteredPairs.map((pair) => {
            const active = pair.ticker === selectedTicker
            const quote = quotes[pair.ticker]
            return (
              <li key={pair.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    'grid w-full cursor-pointer grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,0.85fr)] gap-1 px-3 py-1.5 text-left text-[13px] transition-colors',
                    active
                      ? 'bg-[rgba(41,98,255,0.12)] outline outline-1 outline-[#2962ff] -outline-offset-1'
                      : 'hover:bg-[rgba(255,255,255,0.04)]',
                  )}
                  onClick={() => onSelect(pair)}
                >
                  <span
                    className={cn(
                      'truncate font-medium',
                      active ? 'text-foreground' : 'text-[rgb(209,212,220)]',
                    )}
                    title={pair.ticker}
                  >
                    {pair.ticker}
                  </span>
                  <QuoteCells quote={quote} />
                </button>
              </li>
            )
          })
        )}
      </ul>

      {selected ? (
        <ArbSpreadDetailsCard
          pair={selected}
          currentSpread={quotes[selected.ticker]?.last ?? null}
        />
      ) : null}
    </aside>
  )
}

function QuoteCells({ quote }: { quote: ArbQuoteRow | undefined }) {
  const last = quote?.last ?? null
  const change = quote?.change ?? null
  const changePercent = quote?.changePercent ?? null
  const dir = change == null || change === 0 ? 0 : change > 0 ? 1 : -1
  const dirClass =
    dir > 0 ? 'text-[#22ab94]' : dir < 0 ? 'text-[#f23645]' : 'text-[rgb(209,212,220)]'

  return (
    <>
      <span className={cn('text-right tabular-nums', dirClass)}>
        {formatArbNumber(last, 3)}
      </span>
      <span className={cn('text-right tabular-nums', dirClass)}>
        {formatArbNumber(change, 3)}
      </span>
      <span className={cn('text-right tabular-nums', dirClass)}>
        {formatArbPercent(changePercent, 2)}
      </span>
    </>
  )
}
