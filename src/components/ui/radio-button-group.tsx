import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import { cn } from '@/lib/utils';

/** Опция сегментированного radio. */
export interface RadioButtonOption {
  /** Значение */
  value: string;
  /** Подпись сегмента */
  label: React.ReactNode;
  /** title кнопки */
  title?: string;
  /** Отключить сегмент */
  disabled?: boolean;
}

export interface RadioButtonGroupProps
  extends Omit<React.ComponentProps<typeof RadioGroupPrimitive.Root>, 'children'> {
  /** Варианты выбора */
  options: readonly RadioButtonOption[];
}

/**
 * Сегментированная группа radio в стиле Input (фон/бордер/высота/радиус).
 */
function RadioButtonGroup({ className, options, disabled, ...props }: RadioButtonGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-button-group"
      disabled={disabled}
      className={cn(
        'flex h-10 w-full overflow-hidden rounded-[var(--size-4,4px)] border border-solid border-input bg-input',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {options.map((option, index) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          title={option.title}
          disabled={option.disabled}
          data-slot="radio-button"
          className={cn(
            'flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center px-2 text-sm tabular-nums text-foreground outline-none transition-colors',
            'border-solid border-input',
            index < options.length - 1 && 'border-r',
            'focus-visible:z-10 focus-visible:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'hover:bg-bds-gray-ele-border data-[state=unchecked]:text-foreground/55 data-[state=unchecked]:hover:text-foreground',
            'data-[state=checked]:bg-foreground/10 data-[state=checked]:font-medium',
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export { RadioButtonGroup };
