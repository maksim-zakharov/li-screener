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

type Listener = () => void

let snapshot: readonly ArbBrokerChartPosition[] = []
const listeners = new Set<Listener>()

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
