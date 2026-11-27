import { useCallback, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/lib/utils'
import { formatArbNumber, type ArbQuoteRow } from '@/arbitrages/arb-quote'
import {
  setArbBrokerChartPositions,
  subscribeArbBrokerBracketEdits,
  type ArbBrokerChartPosition,
} from '@/arbitrages/arb-broker-positions.store'
import {
  calcPositionLivePnl,
  formatPositionLots,
  formatPositionSide,
  loadArbPositions,
  normalizeArbExitPrice,
  resolvePositionAvgSpread,
  resolvePositionSide,
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
 * Клик по строке — редактирование.
 */
export function ArbPositionsPanel({
  selectedTicker,
  quotes,
  className,
}: ArbPositionsPanelProps) {
  const [positions, setPositions] = useState<ArbPosition[]>(() => loadArbPositions())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPosition, setEditingPosition] = useState<ArbPosition | null>(null)

  useEffect(() => {
    saveArbPositions(positions)
  }, [positions])

  useEffect(() => {
    return () => {
      setArbBrokerChartPositions([])
    }
  }, [])

  /** Drag TP/SL на графике → те же поля в позе / таблице / localStorage. */
  useEffect(() => {
    return subscribeArbBrokerBracketEdits((positionId, patch) => {
      /** sync: иначе тик quotes перезапишет broker-снимок без TP/SL. */
      flushSync(() => {
        setPositions((prev) => {
          const index = prev.findIndex((row) => row.id === positionId)
          if (index < 0) {
            return prev
          }
          const current = prev[index]!
          const nextRow: ArbPosition = { ...current }
          if ('takeProfit' in patch) {
            nextRow.takeProfit = normalizeArbExitPrice(patch.takeProfit)
          }
          if ('stopLoss' in patch) {
            nextRow.stopLoss = normalizeArbExitPrice(patch.stopLoss)
          }
          const next = [...prev]
          next[index] = nextRow
          return next
        })
      })
    })
  }, [])

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

  const onDialogOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingPosition(null)
    }
  }, [])

  const onOpenCreate = useCallback(() => {
    setEditingPosition(null)
    setDialogOpen(true)
  }, [])

  const onOpenEdit = useCallback((position: ArbPosition) => {
    setEditingPosition(position)
    setDialogOpen(true)
  }, [])

  const onSave = useCallback((position: ArbPosition) => {
    setPositions((prev) => {
      const index = prev.findIndex((row) => row.id === position.id)
      if (index >= 0) {
        const next = [...prev]
        next[index] = position
        return next
      }
      return [position, ...prev]
    })
  }, [])

  const onRemove = useCallback((id: string) => {
    setPositions((prev) => prev.filter((row) => row.id !== id))
  }, [])

  const rows = positions.map((pos) => {
    const side = resolvePositionSide(pos)
    const avgSpread = resolvePositionAvgSpread(pos) ?? pos.avgSpread
    const current = quotes[pos.ticker]?.last ?? null
    const refLeg = pos.legs[pos.legs.length - 1]
    const refVolume = refLeg ? (volumeByCode[refLeg.code] ?? null) : null
    const refLots = refLeg?.qty ?? 0
    const pnl = calcPositionLivePnl(avgSpread, current, refVolume, refLots, side)
    const takeProfit = normalizeOptionalPrice(pos.takeProfit)
    const stopLoss = normalizeOptionalPrice(pos.stopLoss)
    const tpPnl =
      takeProfit != null ? calcPositionLivePnl(avgSpread, takeProfit, refVolume, refLots, side) : null
    const slPnl =
      stopLoss != null ? calcPositionLivePnl(avgSpread, stopLoss, refVolume, refLots, side) : null
    return { pos, side, avgSpread, current, pnl, takeProfit, stopLoss, tpPnl, slPnl }
  })

  useEffect(() => {
    const chartPositions: ArbBrokerChartPosition[] = positions.map((pos) => {
      const side = resolvePositionSide(pos)
      const avgSpread = resolvePositionAvgSpread(pos) ?? pos.avgSpread
      const current = quotes[pos.ticker]?.last ?? null
      const refLeg = pos.legs[pos.legs.length - 1]
      const refVolume = refLeg ? (volumeByCode[refLeg.code] ?? null) : null
      const pnl = calcPositionLivePnl(avgSpread, current, refVolume, refLeg?.qty ?? 0, side)
      const qty = pos.legs[0]?.qty ?? 1
      const takeProfit = normalizeOptionalPrice(pos.takeProfit)
      const stopLoss = normalizeOptionalPrice(pos.stopLoss)
      return {
        id: pos.id,
        symbol: pos.ticker,
        qty: qty > 0 ? qty : 1,
        avgPrice: avgSpread,
        side,
        ...(pnl?.kind === 'rub' ? { pl: pnl.value } : {}),
        ...(takeProfit != null ? { takeProfit } : {}),
        ...(stopLoss != null ? { stopLoss } : {}),
      }
    })
    setArbBrokerChartPositions(chartPositions)
  }, [positions, quotes, volumeByCode])

  const rubPnls = rows.map((row) => (row.pnl?.kind === 'rub' ? row.pnl.value : null))
  const hasRubTotal = rubPnls.some((value) => value != null)
  const totalRub = rubPnls.reduce<number>((sum, value) => sum + (value ?? 0), 0)

  return (
    <section className={cn('flex min-h-0 shrink-0 flex-col overflow-hidden', className)}>
      <Table wrapperClassName="min-h-0 flex-1 overflow-auto pt-1">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px] text-left" colSpan={COLUMN_COUNT}>
              <div className="flex items-center justify-between">
                <span>Позиции</span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="h-6 text-[10px]"
                  onClick={onOpenCreate}
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
            <TableHead className="text-right">Напр.</TableHead>
            <TableHead className="text-right">Средняя</TableHead>
            <TableHead className="text-right">Текущая</TableHead>
            <TableHead className="text-right">Лотность</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">TP</TableHead>
            <TableHead className="text-right">SL</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="text-center text-[11px] text-foreground">
                Нет позиций
              </TableCell>
            </TableRow>
          ) : (
            rows.map(({ pos, side, avgSpread, current, pnl, takeProfit, stopLoss, tpPnl, slPnl }) => {
              const dir = pnl == null || pnl.value === 0 ? 0 : pnl.value > 0 ? 1 : -1
              const dirClass = dir > 0 ? 'profitCell' : dir < 0 ? 'lossCell' : ''
              const currentClass =
                current == null || avgSpread === current
                  ? ''
                  : current > avgSpread
                    ? 'profitCell'
                    : 'lossCell'
              const sideClass = side === 'buy' ? 'profitCell' : 'lossCell'

              return (
                <TableRow
                  key={pos.id}
                  className="cursor-pointer"
                  onClick={() => onOpenEdit(pos)}
                >
                  <TableCell className="pl-1.5">
                    <div className="flex flex-col">
                      <span className="max-w-[220px] truncate font-medium" title={pos.ticker}>
                        {pos.ticker}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', sideClass)}>
                    {formatPositionSide(side)}
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
                  <TableCell className="text-right tabular-nums">
                    {renderExitLevelCell(takeProfit, tpPnl, 'tp')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {renderExitLevelCell(stopLoss, slPnl, 'sl')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-6 text-[10px]"
                      onClick={(event) => {
                        event.stopPropagation()
                        onRemove(pos.id)
                      }}
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
              <TableCell colSpan={5} className="text-right font-medium">
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
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>

      <AddArbPositionDialog
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        defaultTicker={selectedTicker}
        editingPosition={editingPosition}
        onSave={onSave}
      />
    </section>
  )
}

const COLUMN_COUNT = 9

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

/** Положительная цена уровня или null. */
function normalizeOptionalPrice(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

/** Ячейка TP/SL: цена + ожидаемый PnL (как в /trading-diary). */
function renderExitLevelCell(
  price: number | null,
  expectedPnl: ArbPositionPnl | null,
  kind: 'tp' | 'sl',
) {
  if (price == null) {
    return '—'
  }
  const priceClass = kind === 'tp' ? 'text-amber-500' : 'text-red-400'
  const pnlDir =
    expectedPnl == null || expectedPnl.value === 0 ? 0 : expectedPnl.value > 0 ? 1 : -1
  const pnlClass = pnlDir > 0 ? 'profitCell' : pnlDir < 0 ? 'lossCell' : ''
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={priceClass}>{formatArbNumber(price, 3)}</span>
      {expectedPnl != null ? (
        <span className={cn('text-[10px]', pnlClass)}>{formatLivePnl(expectedPnl)}</span>
      ) : null}
    </div>
  )
}
