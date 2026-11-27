import { cn } from '@/lib/utils'
import type { ArbPair } from '@/arbitrages/arb-pairs'
import {
  formatArbNumber,
  formatArbPercent,
  type ArbQuoteRow,
} from '@/arbitrages/arb-quote'
import { useArbQuotes } from '@/arbitrages/useArbQuotes'

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
 * Правая колонка: список котировок арбитражей в стиле TV Quotes List.
 */
export function ArbitragesList({ pairs, selectedTicker, onSelect, className }: ArbitragesListProps) {
  const quotes = useArbQuotes(pairs)

  return (
    <aside
      className={cn(
        'flex w-[440px] shrink-0 flex-col border-l border-[rgba(166,189,213,0.2)] bg-tmp-17181e',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[rgba(166,189,213,0.2)] px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Список котировок</h2>
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
        {pairs.map((pair) => {
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
        })}
      </ul>
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
