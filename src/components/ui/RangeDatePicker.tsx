import { useCallback, useEffect, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { CalendarIcon, ChevronDownIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { useDateRangeDraft } from '../use-date-range-draft';
import { cn } from '@/lib/utils';

/** Пресет периода в боковой колонке. */
export interface RangeDatePickerPresetOption {
  /** Значение пресета */
  value: string;
  /** Подпись */
  label: string;
}

const rangeDatePickerTriggerVariants = cva(
  [
    'flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 border border-solid border-input bg-input px-3 py-1',
    'text-left text-foreground outline-none transition-[color,box-shadow,background-color]',
    'hover:bg-bds-gray-ele-border focus-visible:border-primary',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  ].join(' '),
  {
    variants: {
      size: {
        /** Как Input default — 40px */
        default: 'h-10 rounded-[var(--size-4,4px)] text-sm',
        /** Как Select sm / компактный тулбар — 32px */
        sm: 'h-8 rounded-[var(--size-4,4px)] text-sm',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface RangeDatePickerProps extends VariantProps<typeof rangeDatePickerTriggerVariants> {
  /** Выбранный период */
  value: DateRange;
  /** Смена периода (после выбора обеих дат) */
  onChange: (range: DateRange) => void;
  /** Плейсхолдер, если даты не выбраны */
  placeholder?: string;
  /** Число месяцев в календаре */
  numberOfMonths?: 1 | 2;
  /** Локаль для toLocaleDateString */
  locale?: string;
  /** disabled */
  disabled?: boolean;
  /** className на кнопку-триггер */
  className?: string;
  /** Выравнивание popover */
  align?: 'start' | 'center' | 'end';
  /** Пресеты слева от календаря */
  presets?: RangeDatePickerPresetOption[];
  /** Активный пресет (для подсветки) */
  activePreset?: string;
  /** Выбор пресета */
  onPresetSelect?: (value: string) => void;
  /** Контролируемое открытие */
  open?: boolean;
  /** Смена открытия */
  onOpenChange?: (open: boolean) => void;
}

/** Первый день месяца (локальное время). */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Сдвиг на N месяцев. */
function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

/**
 * Выбор периода дат в стиле Input: Popover + Calendar (mode=range).
 * При 2 месяцах — два независимых календаря (год/месяц слева не тянут правый).
 */
export function RangeDatePicker({
  value,
  onChange,
  placeholder = 'Выберите период',
  numberOfMonths = 2,
  locale = 'ru-RU',
  disabled = false,
  className,
  size = 'default',
  align = 'start',
  presets,
  activePreset,
  onPresetSelect,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: RangeDatePickerProps) {
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

  const commit = useCallback(
    (range: DateRange) => {
      onChange(range);
    },
    [onChange],
  );

  const { selected, onSelect } = useDateRangeDraft(value, open, commit);

  const hasValue = Boolean(value.from);
  const label =
    value.from && value.to
      ? `${value.from.toLocaleDateString(locale)} — ${value.to.toLocaleDateString(locale)}`
      : value.from
        ? `${value.from.toLocaleDateString(locale)} — …`
        : placeholder;

  const handlePresetSelect = (presetValue: string) => {
    onPresetSelect?.(presetValue);
    if (presetValue !== 'custom') {
      setOpen(false);
    }
  };

  const hasPresets = Boolean(presets && presets.length > 0);
  // иначе при пустом value каждый ререндер страницы даёт новый Date → сброс месяца/Select
  const fallbackMonthRef = useRef(new Date());

  const resolveLeftMonth = useCallback(() => {
    return startOfMonth(value.from ?? fallbackMonthRef.current);
  }, [value.from]);

  const resolveRightMonth = useCallback(() => {
    if (value.to) {
      return startOfMonth(value.to);
    }
    return addMonths(resolveLeftMonth(), 1);
  }, [value.to, resolveLeftMonth]);

  const [leftMonth, setLeftMonth] = useState(resolveLeftMonth);
  const [rightMonth, setRightMonth] = useState(resolveRightMonth);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLeftMonth(resolveLeftMonth());
    setRightMonth(resolveRightMonth());
  }, [open, resolveLeftMonth, resolveRightMonth]);

  const calendarShellClass = hasPresets ? undefined : 'rounded-lg border shadow-sm';
  const dualPaneClass = 'rounded-none border-0 shadow-none';

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-slot="range-date-picker-trigger"
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
        <div className={cn(hasPresets && 'flex')}>
          {hasPresets ? (
            <div className="flex min-w-[148px] flex-col gap-1 border-r p-2">
              {presets!.map((preset) => (
                <Button
                  key={preset.value}
                  type="button"
                  variant={activePreset === preset.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-start"
                  onClick={() => handlePresetSelect(preset.value)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          ) : null}
          {numberOfMonths === 2 ? (
            <div className={cn('flex', calendarShellClass)}>
              <Calendar
                mode="range"
                resetOnSelect
                numberOfMonths={1}
                month={leftMonth}
                onMonthChange={setLeftMonth}
                selected={selected}
                captionLayout="dropdown"
                onSelect={onSelect}
                className={dualPaneClass}
              />
              <Calendar
                mode="range"
                resetOnSelect
                numberOfMonths={1}
                month={rightMonth}
                onMonthChange={setRightMonth}
                selected={selected}
                captionLayout="dropdown"
                onSelect={onSelect}
                className={cn(dualPaneClass, 'border-l border-border')}
              />
            </div>
          ) : (
            <Calendar
              mode="range"
              resetOnSelect
              numberOfMonths={1}
              month={leftMonth}
              onMonthChange={setLeftMonth}
              selected={selected}
              captionLayout="dropdown"
              onSelect={onSelect}
              className={calendarShellClass}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { rangeDatePickerTriggerVariants };
