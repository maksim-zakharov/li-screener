import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatArbNumber, type ArbQuoteRow } from '@/arbitrages/arb-quote'
import {
  calcPositionLivePnl,
  formatPositionLots,
  loadArbPositions,
  resolvePositionAvgSpread,
  saveArbPositions,
  type ArbPosition,
  type ArbPositionPnl,
} from '@/arbitrages/arb-positions'
import { useLegMargins } from '@/arbitrages/useLegMargins'
import { AddArbPositionDialog } from '@/components/AddArbPositionDialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ArbPositionsPanelProps {
  /** Текущий спред на графике — дефолт в модалке */
  selectedTicker: string
  /** Live-котировки спредов (тот же store, что список слева) */
  quotes: Readonly<Record<string, ArbQuoteRow>>
  /** Доп. класс */
  className?: string
}

/**
 * Таблица позиций — разметка как PositionsWidget; PnL от live last как в списке спредов.
 */
export function ArbPositionsPanel({
  selectedTicker,
  quotes,
  className,
}: ArbPositionsPanelProps) {
  const [positions, setPositions] = useState<ArbPosition[]>(() => loadArbPositions())
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    saveArbPositions(positions)
  }, [positions])

  const marginCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const pos of positions) {
      const last = pos.legs[pos.legs.length - 1]
      if (last) {
        codes.add(last.code)
      }
    }
    return [...codes]
  }, [positions])

  const { volumeByCode } = useLegMargins(marginCodes)

  const onAdd = useCallback((position: ArbPosition) => {
    setPositions((prev) => [position, ...prev])
  }, [])

  const onRemove = useCallback((id: string) => {
    setPositions((prev) => prev.filter((row) => row.id !== id))
  }, [])

  const rows = positions.map((pos) => {
    const avgSpread = resolvePositionAvgSpread(pos) ?? pos.avgSpread
    const current = quotes[pos.ticker]?.last ?? null
    const refLeg = pos.legs[pos.legs.length - 1]
    const refVolume = refLeg ? (volumeByCode[refLeg.code] ?? null) : null
    const pnl = calcPositionLivePnl(avgSpread, current, refVolume, refLeg?.qty ?? 0)
    return { pos, avgSpread, current, pnl }
  })

  const rubPnls = rows.map((row) => (row.pnl?.kind === 'rub' ? row.pnl.value : null))
  const hasRubTotal = rubPnls.some((value) => value != null)
  const totalRub = rubPnls.reduce<number>((sum, value) => sum + (value ?? 0), 0)

  return (
    <section className={cn('flex min-h-0 shrink-0 flex-col overflow-hidden', className)}>
      <Table wrapperClassName="min-h-0 flex-1 overflow-auto pt-1">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px] text-left" colSpan={6}>
              <div className="flex items-center justify-between">
                <span>Позиции</span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 text-[10px]"
                  onClick={() => setDialogOpen(true)}
                >
                  Добавить позицию
                </Button>
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Спред</TableHead>
            <TableHead className="text-right">Средняя</TableHead>
            <TableHead className="text-right">Текущая</TableHead>
            <TableHead className="text-right">Лотность</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-[11px] text-foreground">
                Нет позиций
              </TableCell>
            </TableRow>
          ) : (
            rows.map(({ pos, avgSpread, current, pnl }) => {
              const dir = pnl == null || pnl.value === 0 ? 0 : pnl.value > 0 ? 1 : -1
              const dirClass = dir > 0 ? 'profitCell' : dir < 0 ? 'lossCell' : ''
              const currentClass =
                current == null || avgSpread === current
                  ? ''
                  : current > avgSpread
                    ? 'profitCell'
                    : 'lossCell'

              return (
                <TableRow key={pos.id}>
                  <TableCell className="pl-1.5">
                    <div className="flex flex-col">
                      <span className="max-w-[220px] truncate font-medium" title={pos.ticker}>
                        {pos.ticker}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatArbNumber(avgSpread, 3)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', currentClass)}>
                    {formatArbNumber(current, 3)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPositionLots(pos.legs)}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', dirClass)}>
                    {formatLivePnl(pnl)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-6 text-[10px]"
                      onClick={() => onRemove(pos.id)}
                    >
                      Закрыть
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
        {positions.length > 0 ? (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-right font-medium">
                Итого PnL
              </TableCell>
              <TableCell
                className={cn(
                  'text-right font-medium tabular-nums',
                  hasRubTotal && totalRub > 0
                    ? 'profitCell'
                    : hasRubTotal && totalRub < 0
                      ? 'lossCell'
                      : '',
                )}
              >
                {hasRubTotal ? formatPnlRub(totalRub) : '—'}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>

      <AddArbPositionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultTicker={selectedTicker}
        onAdd={onAdd}
      />
    </section>
  )
}

function formatLivePnl(pnl: ArbPositionPnl | null): string {
  if (pnl == null) {
    return '—'
  }
  if (pnl.kind === 'rub') {
    return formatPnlRub(pnl.value)
  }
  const sign = pnl.value > 0 ? '+' : ''
  return `${sign}${formatArbNumber(pnl.value, 3)}`
}

function formatPnlRub(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toLocaleString('ru-RU')} ₽`
}
