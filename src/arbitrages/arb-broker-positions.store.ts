/** Позиция для линии Broker API на графике. */
export interface ArbBrokerChartPosition {
  /** Id позиции (уникальный). */
  id: string
  /** Тикер спреда = symbol графика. */
  symbol: string
  /** Объём (лоты опорной ноги). */
  qty: number
  /** Средняя цена спреда. */
  avgPrice: number
  /** Направление: buy / sell */
  side: 'buy' | 'sell'
  /** PnL ₽ (опционально). */
  pl?: number
  /** Тейк-профит (цена спреда). */
  takeProfit?: number
  /** Стоп-лосс (цена спреда). */
  stopLoss?: number
}

/** Патч TP/SL с графика (null = снять уровень). */
export interface ArbBrokerBracketPatch {
  /** Новая цена тейка или null. */
  takeProfit?: number | null
  /** Новая цена стопа или null. */
  stopLoss?: number | null
}

type Listener = () => void
type BracketEditListener = (positionId: string, patch: ArbBrokerBracketPatch) => void

let snapshot: readonly ArbBrokerChartPosition[] = []
const listeners = new Set<Listener>()
const bracketEditListeners = new Set<BracketEditListener>()

/** Текущий снимок позиций для broker. */
export function getArbBrokerChartPositions(): readonly ArbBrokerChartPosition[] {
  return snapshot
}

/**
 * Публикует позиции в broker (линии на графике).
 */
export function setArbBrokerChartPositions(next: readonly ArbBrokerChartPosition[]): void {
  snapshot = next
  for (const listener of listeners) {
    listener()
  }
}

/** Подписка на изменения позиций broker. */
export function subscribeArbBrokerChartPositions(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Обновляет TP/SL в снимке broker и уведомляет панель позиций.
 * Возвращает обновлённую позицию или null, если id не найден.
 */
export function patchArbBrokerPositionBrackets(
  positionId: string,
  patch: ArbBrokerBracketPatch,
): ArbBrokerChartPosition | null {
  const index = snapshot.findIndex((row) => row.id === positionId)
  if (index < 0) {
    return null
  }
  const prev = snapshot[index]!
  const nextRow: ArbBrokerChartPosition = { ...prev }
  if ('takeProfit' in patch) {
    if (patch.takeProfit == null || !Number.isFinite(patch.takeProfit) || patch.takeProfit <= 0) {
      delete nextRow.takeProfit
    } else {
      nextRow.takeProfit = patch.takeProfit
    }
  }
  if ('stopLoss' in patch) {
    if (patch.stopLoss == null || !Number.isFinite(patch.stopLoss) || patch.stopLoss <= 0) {
      delete nextRow.stopLoss
    } else {
      nextRow.stopLoss = patch.stopLoss
    }
  }
  const next = [...snapshot]
  next[index] = nextRow
  snapshot = next
  for (const listener of listeners) {
    listener()
  }
  for (const listener of bracketEditListeners) {
    listener(positionId, patch)
  }
  return nextRow
}

/** Подписка на drag TP/SL с графика → обновление позы в UI/localStorage. */
export function subscribeArbBrokerBracketEdits(listener: BracketEditListener): () => void {
  bracketEditListeners.add(listener)
  return () => {
    bracketEditListeners.delete(listener)
  }
}
