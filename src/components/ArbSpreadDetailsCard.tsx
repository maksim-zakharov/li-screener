import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  arbPairLegCodes,
  resolveLegLots,
  type ArbPair,
} from '@/arbitrages/arb-pairs'
import { useLegMargins } from '@/arbitrages/useLegMargins'

interface ArbSpreadDetailsCardProps {
  /** Выбранная пара */
  pair: ArbPair
  /** Доп. класс */
  className?: string
}

/**
 * Карточка выбранного спреда: описание, лотности, ГО и маржа на объём.
 */
export function ArbSpreadDetailsCard({ pair, className }: ArbSpreadDetailsCardProps) {
  const codes = useMemo(() => arbPairLegCodes(pair), [pair])
  const [baseLots, setBaseLots] = useState(pair.defaultBaseLots)
  const { marginByCode, loading, error } = useLegMargins(codes)

  useEffect(() => {
    setBaseLots(pair.defaultBaseLots)
  }, [pair.id, pair.defaultBaseLots])

  const lots = useMemo(() => resolveLegLots(pair, baseLots), [pair, baseLots])

  const rows = codes.map((code, idx) => {
    const qty = lots[idx] ?? 0
    const go = marginByCode[code]
    const margin = go != null && qty > 0 ? go * qty : null
    return { code, qty, go: go ?? null, margin }
  })

  const totalMargin = rows.reduce((sum, row) => sum + (row.margin ?? 0), 0)
  const hasAllMargins = rows.every((row) => row.margin != null)

  const ratioLabel = pair.lotRatios.map((r) => formatRatio(r)).join(' : ')

  return (
    <div
      className={cn(
        'shrink-0 border-t border-[rgba(166,189,213,0.2)] bg-[rgb(19,19,23)] px-3 py-3',
        className,
      )}
    >
      <div className="mb-2">
        <div className="truncate text-sm font-semibold text-foreground" title={pair.ticker}>
          {pair.ticker}
        </div>
        <div className="text-xs text-muted-foreground">{pair.description}</div>
        <div className="mt-1 text-[11px] text-[rgb(156,165,178)]">
          Соотношение лотов: <span className="tabular-nums text-foreground">{ratioLabel}</span>
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">Объём (1-я нога)</span>
        <input
          type="number"
          min={1}
          step={1}
          value={baseLots}
          onChange={(e) => {
            const n = Number(e.target.value)
            setBaseLots(Number.isFinite(n) && n > 0 ? n : 1)
          }}
          className="h-7 w-24 rounded border border-[rgba(166,189,213,0.25)] bg-[rgb(28,28,34)] px-2 text-right text-xs tabular-nums text-foreground outline-none focus:border-[#2962ff]"
        />
        <span className="text-[11px]">лот.</span>
      </label>

      <div className="overflow-hidden rounded border border-[rgba(166,189,213,0.15)]">
        <div className="grid grid-cols-[minmax(0,1.2fr)_0.7fr_1fr_1fr] gap-1 bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Нога</span>
          <span className="text-right">Лоты</span>
          <span className="text-right">ГО, ₽</span>
          <span className="text-right">Маржа, ₽</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.code}
            className="grid grid-cols-[minmax(0,1.2fr)_0.7fr_1fr_1fr] gap-1 border-t border-[rgba(166,189,213,0.08)] px-2 py-1.5 text-[12px]"
          >
            <span className="truncate font-medium text-[rgb(209,212,220)]" title={row.code}>
              {row.code}
            </span>
            <span className="text-right tabular-nums text-foreground">{row.qty}</span>
            <span className="text-right tabular-nums text-[rgb(209,212,220)]">
              {loading && row.go == null ? '…' : formatRub(row.go)}
            </span>
            <span className="text-right tabular-nums text-foreground">
              {loading && row.margin == null ? '…' : formatRub(row.margin)}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,1.2fr)_0.7fr_1fr_1fr] gap-1 border-t border-[rgba(166,189,213,0.2)] bg-[rgba(41,98,255,0.08)] px-2 py-1.5 text-[12px] font-semibold">
          <span className="text-foreground">Итого</span>
          <span />
          <span />
          <span className="text-right tabular-nums text-foreground">
            {loading && !hasAllMargins ? '…' : formatRub(hasAllMargins ? totalMargin : null)}
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-2 text-[11px] text-[#f23645]">Не удалось загрузить ГО: {error}</div>
      ) : (
        <div className="mt-2 text-[10px] text-muted-foreground">
          ГО — INITIALMARGIN (₽ на 1 контракт) с MOEX ISS
        </div>
      )}
    </div>
  )
}

function formatRatio(value: number): string {
  if (Number.isInteger(value)) {
    return String(value)
  }
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

function formatRub(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toLocaleString('ru-RU', {
    maximumFractionDigits: 0,
  })} ₽`
}
