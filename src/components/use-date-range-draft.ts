import { useEffect, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import { reduceDateRangeDraftSelect } from './date-range-draft';

/**
 * value (инпут / onChange) и draft (календарь) раздельно.
 *
 * - пока draft не начат → в календаре value
 * - идёт выбор (есть from, нет to) → в календаре draft
 * - выбрали 2 даты → onCommit(value), draft сброшен → снова value
 */
export function useDateRangeDraft(
  value: DateRange | undefined,
  popoverOpen: boolean,
  onCommit: (range: DateRange) => void,
): {
  /** Что рисовать в Calendar.selected */
  selected: DateRange | undefined;
  /** Calendar.onSelect — (range, triggerDate) */
  onSelect: (range: DateRange | undefined, triggerDate?: Date) => void;
} {
  const [draft, setDraft] = useState<DateRange | undefined>();
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  draftRef.current = draft;
  valueRef.current = value;

  useEffect(() => {
    if (!popoverOpen) {
      setDraft(undefined);
      draftRef.current = undefined;
    }
  }, [popoverOpen]);

  const isDrafting = draft?.from != null && draft.to == null;

  return {
    selected: isDrafting ? draft : value,
    onSelect: (range, triggerDate) => {
      const step = reduceDateRangeDraftSelect(draftRef.current, valueRef.current, range, triggerDate);
      draftRef.current = step.draft;
      setDraft(step.draft);
      if (step.commit != null) {
        onCommit(step.commit);
      }
    },
  };
}
