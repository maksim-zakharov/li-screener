import { useCallback, useRef, useState } from 'react';
import { CalendarIcon, ChevronDownIcon } from 'lucide-react';
import type { VariantProps } from 'class-variance-authority';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { rangeDatePickerTriggerVariants } from './RangeDatePicker';
import { cn } from '@/lib/utils';

export interface DatePickerProps extends VariantProps<typeof rangeDatePickerTriggerVariants> {
  /** Выбранная дата */
  value?: Date;
  /** Смена даты */
  onChange: (date: Date | undefined) => void;
  /** Плейсхолдер, если дата не выбрана */
  placeholder?: string;
  /** Локаль для toLocaleDateString */
  locale?: string;
  /** disabled триггера */
  disabled?: boolean;
  /** className на кнопку-триггер */
  className?: string;
  /** Выравнивание popover */
  align?: 'start' | 'center' | 'end';
  /** id триггера */
  id?: string;
  /** Месяц по умолчанию в календаре */
  defaultMonth?: Date;
  /** Доп. disabled дат в календаре */
  isDateDisabled?: (date: Date) => boolean;
  /** Кастомная подпись выбранной даты */
  formatValue?: (date: Date) => string;
  /** Контролируемое открытие */
  open?: boolean;
  /** Смена открытия */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Выбор одной даты в стиле RangeDatePicker: Popover + Calendar (mode=single).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Выберите дату',
  locale = 'ru-RU',
  disabled = false,
  className,
  size = 'default',
  align = 'start',
  id,
  defaultMonth,
  isDateDisabled,
  formatValue,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: DatePickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChangeProp?.(next);
    },
    [isControlled, onOpenChangeProp],
  );

  const hasValue = Boolean(value);
  const label = value
    ? formatValue
      ? formatValue(value)
      : value.toLocaleDateString(locale)
    : placeholder;
  const fallbackMonthRef = useRef(new Date());
  const resolvedDefaultMonth = defaultMonth ?? value ?? fallbackMonthRef.current;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          data-slot="date-picker-trigger"
          className={cn(
            rangeDatePickerTriggerVariants({ size }),
            !hasValue && 'text-[color:var(--placeholder)]',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarIcon className="size-4 shrink-0 opacity-50" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[100] w-auto overflow-hidden p-0" align={align}>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          defaultMonth={resolvedDefaultMonth}
          selected={value}
          disabled={isDateDisabled}
          onSelect={(next) => {
            onChange(next);
            if (next) {
              setOpen(false);
            }
          }}
          className="rounded-lg border shadow-sm"
        />
      </PopoverContent>
    </Popover>
  );
}
