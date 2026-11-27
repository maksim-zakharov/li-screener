import { useEffect, useMemo, useState } from 'react'
import {
  ARB_PAIRS,
  arbPairLegCodes,
  type ArbPair,
} from '@/arbitrages/arb-pairs'
import { formatArbNumber } from '@/arbitrages/arb-quote'
import {
  computeCompositePriceFromLegPrices,
  createArbPositionId,
  defaultLegQtys,
  normalizeArbExitPrice,
  resolvePositionSide,
  type ArbPosition,
  type ArbPositionLeg,
  type ArbPositionSide,
} from '@/arbitrages/arb-positions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AddArbPositionDialogProps {
  /** Открыта */
  open: boolean
  /** Закрытие */
  onOpenChange: (open: boolean) => void
  /** Спред по умолчанию (текущий на графике) — для создания */
  defaultTicker?: string
  /** Редактируемая позиция (null/undefined = создание) */
  editingPosition?: ArbPosition | null
  /** Сохранение (создать или обновить) */
  onSave: (position: ArbPosition) => void
}

interface LegDraft {
  /** Код ноги */
  code: string
  /** Средняя (строка инпута) */
  avgPrice: string
  /** Объём (строка инпута) */
  qty: string
}

/**
 * Модалка: создание / редактирование позиции (спред, направление, avg/объём ног).
 */
export function AddArbPositionDialog({
  open,
  onOpenChange,
  defaultTicker,
  editingPosition,
  onSave,
}: AddArbPositionDialogProps) {
  const isEdit = editingPosition != null
  const initialPair = useMemo(() => {
    if (editingPosition) {
      return resolvePair(editingPosition.ticker) ?? ARB_PAIRS[0]!
    }
    return resolvePair(defaultTicker) ?? ARB_PAIRS[0]!
  }, [defaultTicker, editingPosition])

  const [ticker, setTicker] = useState(initialPair.ticker)
  const [side, setSide] = useState<ArbPositionSide>('buy')
  const [legs, setLegs] = useState<LegDraft[]>(() => buildLegDrafts(initialPair))
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    if (editingPosition) {
      const pair = resolvePair(editingPosition.ticker) ?? ARB_PAIRS[0]!
      setTicker(pair.ticker)
      setSide(resolvePositionSide(editingPosition))
      setLegs(buildLegDraftsFromPosition(pair, editingPosition))
      setTakeProfit(formatExitInput(editingPosition.takeProfit))
      setStopLoss(formatExitInput(editingPosition.stopLoss))
      setError(null)
      return
    }
    const pair = resolvePair(defaultTicker) ?? ARB_PAIRS[0]!
    setTicker(pair.ticker)
    setSide('buy')
    setLegs(buildLegDrafts(pair))
    setTakeProfit('')
    setStopLoss('')
    setError(null)
  }, [open, defaultTicker, editingPosition])

  const onTickerChange = (nextTicker: string) => {
    setTicker(nextTicker)
    const pair = resolvePair(nextTicker)
    if (pair) {
      setLegs(buildLegDrafts(pair))
    }
    setError(null)
  }

  const onLegChange = (index: number, patch: Partial<LegDraft>) => {
    setLegs((prev) => prev.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)))
  }

  const previewAvg = useMemo(() => {
    const priceByCode: Record<string, number> = {}
    for (const leg of legs) {
      const avgPrice = Number(leg.avgPrice.replace(',', '.'))
      if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
        return null
      }
      priceByCode[leg.code] = avgPrice
    }
    return computeCompositePriceFromLegPrices(ticker, priceByCode)
  }, [legs, ticker])

  const onSubmit = () => {
    const pair = resolvePair(ticker)
    if (!pair) {
      setError('Выберите спред')
      return
    }
    const parsedLegs: ArbPositionLeg[] = []
    const priceByCode: Record<string, number> = {}
    for (const leg of legs) {
      const avgPrice = Number(leg.avgPrice.replace(',', '.'))
      const qty = Number(leg.qty.replace(',', '.'))
      if (!Number.isFinite(avgPrice) || avgPrice <= 0) {
        setError(`Укажите среднюю цену для ${leg.code}`)
        return
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`Укажите объём для ${leg.code}`)
        return
      }
      parsedLegs.push({ code: leg.code, avgPrice, qty: Math.round(qty) })
      priceByCode[leg.code] = avgPrice
    }
    const avgSpread = computeCompositePriceFromLegPrices(pair.ticker, priceByCode)
    if (avgSpread == null) {
      setError('Не удалось посчитать среднюю спреда')
      return
    }
    const tp = takeProfit.trim() ? normalizeArbExitPrice(takeProfit) : null
    if (takeProfit.trim() && tp == null) {
      setError('Укажите корректную цену тейка')
      return
    }
    const sl = stopLoss.trim() ? normalizeArbExitPrice(stopLoss) : null
    if (stopLoss.trim() && sl == null) {
      setError('Укажите корректную цену стопа')
      return
    }
    onSave({
      id: editingPosition?.id ?? createArbPositionId(),
      ticker: pair.ticker,
      side,
      legs: parsedLegs,
      avgSpread,
      takeProfit: tp,
      stopLoss: sl,
      createdAt: editingPosition?.createdAt ?? Date.now(),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать позицию' : 'Добавить позицию'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Измените направление, средние, объёмы ног, тейк и стоп.'
              : 'Выберите спред, направление, средние/объёмы ног; при необходимости тейк и стоп.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Спред</span>
            <Select value={ticker} onValueChange={onTickerChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Спред" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {ARB_PAIRS.map((pair) => (
                  <SelectItem key={pair.id} value={pair.ticker}>
                    {pair.ticker}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Направление</span>
            <RadioGroup
              value={side}
              onValueChange={(value) => setSide(value === 'sell' ? 'sell' : 'buy')}
              className="flex flex-row gap-4"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="buy" id="arb-side-buy" />
                <Label htmlFor="arb-side-buy" className="cursor-pointer font-normal">
                  Лонг
                </Label>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem value="sell" id="arb-side-sell" />
                <Label htmlFor="arb-side-sell" className="cursor-pointer font-normal">
                  Шорт
                </Label>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            {legs.map((leg, index) => (
              <div
                key={leg.code}
                className="grid grid-cols-[minmax(0,1.1fr)_1fr_1fr] gap-2 rounded border border-[rgba(166,189,213,0.15)] p-2"
              >
                <div className="flex flex-col justify-center">
                  <span className="truncate text-xs text-muted-foreground">Нога</span>
                  <span className="truncate text-sm font-medium" title={leg.code}>
                    {leg.code}
                  </span>
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Средняя
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={leg.avgPrice}
                    onChange={(e) => onLegChange(index, { avgPrice: e.target.value })}
                    className="h-8"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Объём, лот
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={leg.qty}
                    onChange={(e) => onLegChange(index, { qty: e.target.value })}
                    className="h-8"
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Средняя спреда</span>
            <span className="tabular-nums font-medium">{formatArbNumber(previewAvg, 3)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Тейк (TP)
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="—"
                className="h-8"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Стоп (SL)
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="—"
                className="h-8"
              />
            </label>
          </div>

          {error ? <div className="text-sm text-[#f23645]">{error}</div> : null}
        </DialogBody>
        <DialogFooter className="px-5 pb-5">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button type="button" onClick={onSubmit}>
            {isEdit ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function resolvePair(ticker: string | undefined): ArbPair | undefined {
  if (!ticker?.trim()) {
    return undefined
  }
  return ARB_PAIRS.find((pair) => pair.ticker === ticker || pair.id === ticker)
}

function buildLegDrafts(pair: ArbPair): LegDraft[] {
  const codes = arbPairLegCodes(pair)
  const qtys = defaultLegQtys(pair)
  return codes.map((code, index) => ({
    code,
    avgPrice: '',
    qty: String(qtys[index] ?? 1),
  }))
}

function buildLegDraftsFromPosition(pair: ArbPair, position: ArbPosition): LegDraft[] {
  const codes = arbPairLegCodes(pair)
  const byCode = new Map(position.legs.map((leg) => [leg.code, leg]))
  const defaults = defaultLegQtys(pair)
  return codes.map((code, index) => {
    const existing = byCode.get(code)
    return {
      code,
      avgPrice: existing ? String(existing.avgPrice) : '',
      qty: existing ? String(existing.qty) : String(defaults[index] ?? 1),
    }
  })
}

/** Строка инпута для сохранённого TP/SL. */
function formatExitInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return ''
  }
  return String(value)
}
