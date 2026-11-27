import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Slider } from './slider';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return n;
  }
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}

function formatDisplay(n: number, step: number): string {
  if (!Number.isFinite(n)) {
    return '';
  }
  if (step >= 1) {
    return String(Math.round(n));
  }
  const s = String(roundToStep(n, step));
  return s;
}

export interface NumberInputWithSliderProps {
  /** Текущее значение */
  value: number;
  /** Вызывается с числом в пределах [min, max], с учётом step */
  onValueChange: (value: number) => void;
  /** Минимум слайдера и ввода */
  min?: number;
  /** Максимум слайдера и ввода */
  max?: number;
  /** Шаг кнопок ± и слайдера */
  step?: number;
  /** Блокировка ввода и слайдера */
  disabled?: boolean;
  /** Идентификатор для связки с label */
  id?: string;
  /** Дополнительный класс корневого контейнера */
  className?: string;
  /** Плейсхолдер поля (пустое значение) */
  placeholder?: string;
}

/**
 * Числовое поле с кнопками ± и слайдером у нижней границы (как в мобильных настройках тарифа).
 */
export function NumberInputWithSlider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  id,
  className,
  placeholder,
}: NumberInputWithSliderProps) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState(() => formatDisplay(value, step));

  const apply = React.useCallback(
    (raw: number) => {
      const rounded = roundToStep(raw, step);
      const c = clamp(rounded, min, max);
      onValueChange(c);
      setDraft(formatDisplay(c, step));
    },
    [min, max, step, onValueChange],
  );

  React.useEffect(() => {
    if (!focused) {
      setDraft(formatDisplay(value, step));
    }
  }, [value, step, focused]);

  const safeValue = clamp(roundToStep(Number.isFinite(value) ? value : min, step), min, max);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setDraft(t);
    const n = Number(t.replace(',', '.'));
    if (t.trim() !== '' && Number.isFinite(n)) {
      apply(n);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() === '' || !Number.isFinite(n)) {
      apply(min);
      return;
    }
    apply(n);
  };

  const bump = (delta: number) => {
    apply(safeValue + delta);
  };

  return (
    <div
      className={cn(
        'relative rounded-[var(--size-4,4px)] border border-solid border-input bg-input',
        'focus-within:border-primary',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <div className="flex h-10 min-h-10 w-full min-w-0 divide-x divide-input">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          placeholder={placeholder}
          value={focused ? draft : formatDisplay(safeValue, step)}
          onFocus={() => {
            setFocused(true);
            setDraft(formatDisplay(safeValue, step));
          }}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className="h-10 min-h-10 flex-1 min-w-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 tabular-nums md:text-sm"
        />
        <div className="flex shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || safeValue <= min}
            className="h-10 min-w-10 rounded-none px-2.5 text-foreground hover:text-foreground"
            aria-label="Уменьшить"
            onClick={() => bump(-step)}
          >
            <Minus className="size-4" strokeWidth={2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || safeValue >= max}
            className="h-10 min-w-10 rounded-none px-2.5 text-foreground hover:text-foreground"
            aria-label="Увеличить"
            onClick={() => bump(step)}
          >
            <Plus className="size-4" strokeWidth={2} />
          </Button>
        </div>
      </div>

      <div className="relative z-10 -mt-2 flex h-4 items-end justify-center px-2 pb-1.5 pt-0">
        <Slider
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          value={[safeValue]}
          onValueChange={(v) => {
            const n = v[0];
            if (typeof n === 'number' && Number.isFinite(n)) {
              apply(n);
            }
          }}
          className={cn(
            'w-full cursor-pointer',
            '[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:rounded-full',
            '[&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-background',
          )}
        />
      </div>
    </div>
  );
}
