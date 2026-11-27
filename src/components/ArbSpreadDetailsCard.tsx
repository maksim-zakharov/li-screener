import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  arbPairLegCodes,
  resolveLegLots,
  type ArbPair,
} from '@/arbitrages/arb-pairs'
import {
  calcSpreadMovePnlRub,
  calcSpreadPointValueRub,
} from '@/arbitrages/moex-iss-margin'
import { useLegMargins } from '@/arbitrages/useLegMargins'

/** Смещение стоп/тейк по умолчанию, % от текущего спреда. */
const DEFAULT_STOP_TAKE_PCT = 0.1

interface ArbSpreadDetailsCardProps {
  /** Выбранная пара */
  pair: ArbPair
  /** Текущая цена спреда (last) */
  currentSpread?: number | null
  /** Доп. класс */
  className?: string
}

/**
 * Карточка выбранного спреда: описание, лотности, ГО, стоп/тейк и PnL.
 */
export function ArbSpreadDetailsCard({
  pair,
  currentSpread = null,
  className,
}: ArbSpreadDetailsCardProps) {
  const codes = useMemo(() => arbPairLegCodes(pair), [pair])
  const [baseLots, setBaseLots] = useState(pair.defaultBaseLots)
  const [takeInput, setTakeInput] = useState('')
  const [stopInput, setStopInput] = useState('')
  const seededPairId = useRef<string | null>(null)
  const { marginByCode, volumeByCode, loading, error } = useLegMargins(codes)

  useEffect(() => {
    setBaseLots(pair.defaultBaseLots)
    seededPairId.current = null
    setTakeInput('')
    setStopInput('')
  }, [pair.id, pair.defaultBaseLots])

  useEffect(() => {
    if (currentSpread == null || !(currentSpread > 0)) {
      return
    }
    if (seededPairId.current === pair.id) {
      return
    }
    seededPairId.current = pair.id
    const offset = DEFAULT_STOP_TAKE_PCT / 100
    setTakeInput(formatLevel(currentSpread * (1 + offset)))
    setStopInput(formatLevel(currentSpread * (1 - offset)))
  }, [currentSpread, pair.id])

  const lots = useMemo(() => resolveLegLots(pair, baseLots), [pair, baseLots])

  const rows = codes.map((code, idx) => {
    const qty = lots[idx] ?? 0
    const go = marginByCode[code]
    const margin = go != null && qty > 0 ? go * qty : null
    return { code, qty, go: go ?? null, margin }
  })

  const totalMargin = rows.reduce((sum, row) => sum + (row.margin ?? 0), 0)
  const hasAllMargins = rows.every((row) => row.margin != null)

  /** Референс для пункта спреда — последняя нога (метал / валюта). */
  const refIdx = codes.length > 0 ? codes.length - 1 : -1
  const refCode = refIdx >= 0 ? codes[refIdx] : null
  const refLots = refIdx >= 0 ? (lots[refIdx] ?? 0) : 0
  const refVolume = refCode != null ? volumeByCode[refCode] : null
  const pointValueRub = calcSpreadPointValueRub(refVolume, refLots)

  const takeLevel = parseLevel(takeInput)
  const stopLevel = parseLevel(stopInput)
  /** Тейк выше текущей → лонг, ниже → шорт. */
  const side =
    currentSpread != null && takeLevel != null && takeLevel !== currentSpread
      ? takeLevel > currentSpread
        ? 'long'
        : 'short'
      : null
  const takePnl = signedLevelPnl(currentSpread, takeLevel, pointValueRub, 'take')
  const stopPnl = signedLevelPnl(currentSpread, stopLevel, pointValueRub, 'stop')

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
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[rgb(156,165,178)]">
          <span>
            Соотношение лотов:{' '}
            <span className="tabular-nums text-foreground">{ratioLabel}</span>
          </span>
          <span>
            Текущий:{' '}
            <span className="tabular-nums text-foreground">
              {currentSpread != null && Number.isFinite(currentSpread)
                ? formatLevel(currentSpread)
                : '—'}
            </span>
          </span>
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

      <div className="mt-3 space-y-2">
        <div className="text-[11px] font-medium text-[rgb(209,212,220)]">
          Стоп / тейк
          <span className="ml-1 font-normal text-muted-foreground">
            (дефолт ±{DEFAULT_STOP_TAKE_PCT}% ·{' '}
            {side === 'long' ? 'лонг' : side === 'short' ? 'шорт' : 'сторона по тейку'})
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LevelField
            label="Тейк"
            value={takeInput}
            onChange={setTakeInput}
            pnl={takePnl}
            tone="profit"
          />
          <LevelField
            label="Стоп"
            value={stopInput}
            onChange={setStopInput}
            pnl={stopPnl}
            tone="loss"
          />
        </div>
        <div className="text-[10px] text-muted-foreground">
          Тейк выше — лонг, ниже — шорт · |Δ| × (объём {refCode ?? 'ноги'} × лоты) / 100
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

interface LevelFieldProps {
  /** Подпись поля */
  label: string
  /** Строковое значение инпута */
  value: string
  /** Изменение */
  onChange: (next: string) => void
  /** Рассчитанный PnL ₽ */
  pnl: number | null
  /** Цвет акцента PnL */
  tone: 'profit' | 'loss'
}

function LevelField({ label, value, onChange, pnl, tone }: LevelFieldProps) {
  const pnlClass =
    pnl == null || pnl === 0
      ? 'text-[rgb(209,212,220)]'
      : pnl > 0
        ? 'text-[#22ab94]'
        : 'text-[#f23645]'

  return (
    <label className="flex flex-col gap-1 rounded border border-[rgba(166,189,213,0.15)] bg-[rgba(255,255,255,0.02)] px-2 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        type="number"
        step="0.001"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className={cn(
          'h-7 w-full rounded border border-[rgba(166,189,213,0.25)] bg-[rgb(28,28,34)] px-2 text-right text-xs tabular-nums text-foreground outline-none focus:border-[#2962ff]',
          tone === 'profit' ? 'focus:border-[#22ab94]' : 'focus:border-[#f23645]',
        )}
      />
      <span className={cn('text-right text-[12px] font-semibold tabular-nums', pnlClass)}>
        {formatSignedRub(pnl)}
      </span>
    </label>
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

function formatSignedRub(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toLocaleString('ru-RU')} ₽`
}

function formatLevel(value: number): string {
  return value.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  })
}

function parseLevel(raw: string): number | null {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Тейк всегда +, стоп всегда − (по |Δ| от текущей).
 */
function signedLevelPnl(
  current: number | null | undefined,
  target: number | null | undefined,
  pointValueRub: number | null | undefined,
  kind: 'take' | 'stop',
): number | null {
  const raw = calcSpreadMovePnlRub(current, target, pointValueRub)
  if (raw == null) {
    return null
  }
  const abs = Math.abs(raw)
  return kind === 'take' ? abs : -abs
}
