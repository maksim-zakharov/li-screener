/** Арбитражная пара для списка / графика. */
export interface ArbPair {
  /** Уникальный id (= ticker) */
  id: string
  /** Тикер графика: ноги через `/` */
  ticker: string
  /** Подпись в списке */
  label: string
  /** Краткое описание */
  description: string
}

/**
 * Статический список арбитражей (календарные спреды FORTS и т.п.).
 */
export const ARB_PAIRS: ArbPair[] = [
  {
    id: 'GOLD-12.26/GOLD-3.27',
    ticker: 'GOLD-12.26/GOLD-3.27',
    label: 'GOLD-12.26 / GOLD-3.27',
    description: 'Золото · календарный спред',
  },
  {
    id: 'SILV-12.26/SILV-3.27',
    ticker: 'SILV-12.26/SILV-3.27',
    label: 'SILV-12.26 / SILV-3.27',
    description: 'Серебро · календарный спред',
  },
  {
    id: 'ED-12.26/ED-3.27',
    ticker: 'ED-12.26/ED-3.27',
    label: 'ED-12.26 / ED-3.27',
    description: 'EUR/USD · календарный спред',
  },
]

/** Пара по умолчанию. */
export const DEFAULT_ARB_PAIR = ARB_PAIRS[0]!
