import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ArbListId, ArbPair } from '@/arbitrages/arb-pairs'
import {
  formatArbNumber,
  formatArbPercent,
  type ArbQuoteRow,
} from '@/arbitrages/arb-quote'
import { useArbQuotes } from '@/arbitrages/useArbQuotes'
import { ArbSpreadDetailsCard } from '@/components/ArbSpreadDetailsCard'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Колонки сортировки списка. */
type SortKey = 'ticker' | 'last' | 'change' | 'changePercent'
/** Направление сортировки. */
type SortDir = 'asc' | 'desc'

/** Опции выбора списка. */
const LIST_OPTIONS: { value: ArbListId; label: string }[] = [
  { value: 'forex', label: 'Форекс' },
  { value: 'stocks', label: 'Акции' },
]

interface ArbitragesListProps {
  /** Пары в списке */
  pairs: ArbPair[]
  /** Выбранный ticker */
  selectedTicker: string
  /** Выбор пары */
  onSelect: (pair: ArbPair) => void
  /** Активный список (Форекс / Акции) */
  listId: ArbListId
  /** Смена списка */
  onListChange: (listId: ArbListId) => void
  /** Live-котировки (если не переданы — подписка внутри) */
  quotes?: Record<string, ArbQuoteRow>
  /** Показывать карточку деталей под списком (десктоп) */
  showDetails?: boolean
  /** Доп. класс контейнера */
  className?: string
}

/**
 * Список котировок арбитражей (+ опционально карточка выбранного спреда).
 */
export function ArbitragesList({
  pairs,
  selectedTicker,
  onSelect,
  listId,
  onListChange,
  quotes: quotesProp,
  showDetails = true,
  className,
}: ArbitragesListProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('change')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const quotesFromHook = useArbQuotes(quotesProp ? [] : pairs)
  const quotes = quotesProp ?? quotesFromHook
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

  const sortedPairs = useMemo(() => {
    const list = [...filteredPairs]
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === 'ticker') {
        return a.ticker.localeCompare(b.ticker, 'ru') * dir
      }
      const qa = quotes[a.ticker]
      const qb = quotes[b.ticker]
      const va = quoteSortValue(qa, sortKey)
      const vb = quoteSortValue(qb, sortKey)
      if (va == null && vb == null) {
        return a.ticker.localeCompare(b.ticker, 'ru')
      }
      if (va == null) {
        return 1
      }
      if (vb == null) {
        return -1
      }
      if (va === vb) {
        return a.ticker.localeCompare(b.ticker, 'ru')
      }
      return (va < vb ? -1 : 1) * dir
    })
    return list
  }, [filteredPairs, quotes, sortDir, sortKey])

  const onSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'ticker' ? 'asc' : 'desc')
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 w-[440px] shrink-0 flex-col border-l border-[rgba(166,189,213,0.2)] bg-tmp-17181e',
        className,
      )}
    >
      <div className="flex shrink-0 gap-2 border-b border-[rgba(166,189,213,0.2)] px-3 py-2">
        <Select value={listId} onValueChange={(value) => onListChange(value as ArbListId)}>
          <SelectTrigger size="sm" aria-label="Список арбитражей" className="w-[108px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIST_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск…"
          aria-label="Поиск арбитражей"
          className="h-8 min-w-0 flex-1"
        />
      </div>

      <div
        className="grid shrink-0 grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.75fr)_minmax(0,0.85fr)] gap-1 border-b border-[rgba(166,189,213,0.15)] px-3 py-1.5 text-[11px] text-muted-foreground"
        role="row"
      >
        <SortHeader
          label="Инструмент"
          sortKey="ticker"
          activeKey={sortKey}
          dir={sortDir}
          align="left"
          onClick={onSortClick}
        />
        <SortHeader
          label="Посл. цена"
          sortKey="last"
          activeKey={sortKey}
          dir={sortDir}
          align="right"
          onClick={onSortClick}
        />
        <SortHeader
          label="Изм."
          sortKey="change"
          activeKey={sortKey}
          dir={sortDir}
          align="right"
          onClick={onSortClick}
        />
        <SortHeader
          label="Изм. в %"
          sortKey="changePercent"
          activeKey={sortKey}
          dir={sortDir}
          align="right"
          onClick={onSortClick}
        />
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-0.5" role="listbox" aria-label="Арбитражи">
        {sortedPairs.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">Ничего не найдено</li>
        ) : (
          sortedPairs.map((pair) => {
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

      {showDetails && selected ? (
        <ArbSpreadDetailsCard
          pair={selected}
          currentSpread={quotes[selected.ticker]?.last ?? null}
        />
      ) : null}
    </aside>
  )
}

interface SortHeaderProps {
  /** Текст заголовка */
  label: string
  /** Ключ колонки */
  sortKey: SortKey
  /** Активный ключ */
  activeKey: SortKey
  /** Направление */
  dir: SortDir
  /** Выравнивание */
  align: 'left' | 'right'
  /** Клик по заголовку */
  onClick: (key: SortKey) => void
}

function SortHeader({ label, sortKey, activeKey, dir, align, onClick }: SortHeaderProps) {
  const active = activeKey === sortKey
  const marker = active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <button
      type="button"
      className={cn(
        'cursor-pointer select-none transition-colors hover:text-foreground',
        align === 'right' ? 'w-full text-right' : 'text-left',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
      onClick={() => onClick(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {marker}
    </button>
  )
}

function quoteSortValue(quote: ArbQuoteRow | undefined, key: SortKey): number | null {
  if (!quote || key === 'ticker') {
    return null
  }
  const value = quote[key]
  return value != null && Number.isFinite(value) ? value : null
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
