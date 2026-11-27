import type { DateRange } from 'react-day-picker';

function isSameDay(a: Date | undefined, b: Date | undefined): boolean {
  if (a == null || b == null) {
    return false;
  }
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Когда picker двигает уже полный range (без resetOnSelect),
 * берём день, который изменился, как новый from.
 */
export function resolveDateRangeRestartFrom(previous: DateRange | undefined, next: DateRange): Date {
  if (previous?.from != null && !isSameDay(previous.from, next.from)) {
    return next.from!;
  }
  if (previous?.to != null && next.to != null && !isSameDay(previous.to, next.to)) {
    return next.to;
  }
  return next.from!;
}

/** Результат одного шага выбора диапазона */
export interface DateRangeDraftStepResult {
  /**
   * Черновик календаря.
   * `undefined` — драфт не начат, в календаре показывать value (инпут).
   * `{ from, to?: undefined }` — идёт выбор.
   */
  draft: DateRange | undefined;
  /** Вовне в value/инпут, если from+to готовы */
  commit: DateRange | null;
}

/**
 * Шаг выбора в календаре.
 * `triggerDate` — день клика (нужен, когда RDP шлёт range=undefined при сбросе single-day).
 */
export function reduceDateRangeDraftSelect(
  draft: DateRange | undefined,
  value: DateRange | undefined,
  range: DateRange | undefined,
  triggerDate?: Date,
): DateRangeDraftStepResult {
  const waitingForTo = draft?.from != null && draft.to == null;

  if (waitingForTo) {
    if (range?.from != null && range.to != null) {
      return { draft: undefined, commit: range };
    }
    if (range?.from != null && range.to == null) {
      return { draft: { from: range.from, to: undefined }, commit: null };
    }
    // сброс mid-draft: начинаем from с кликнутого дня
    if (triggerDate != null) {
      return { draft: { from: triggerDate, to: undefined }, commit: null };
    }
    return { draft: { from: draft.from, to: undefined }, commit: null };
  }

  // RDP clear (клик по single-day value) → всё равно начинаем draft с этого дня
  if (range == null) {
    if (triggerDate != null) {
      return { draft: { from: triggerDate, to: undefined }, commit: null };
    }
    return { draft: undefined, commit: null };
  }

  const previous = draft ?? value;
  const clickedFrom =
    range.from != null && range.to != null
      ? resolveDateRangeRestartFrom(previous, range)
      : range.from;

  if (clickedFrom == null) {
    if (triggerDate != null) {
      return { draft: { from: triggerDate, to: undefined }, commit: null };
    }
    return { draft: undefined, commit: null };
  }

  return { draft: { from: clickedFrom, to: undefined }, commit: null };
}
