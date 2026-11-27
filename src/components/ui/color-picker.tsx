import * as React from 'react';

import { cn } from '@/lib/utils';

export interface ColorPickerProps extends Omit<React.ComponentProps<'input'>, 'type' | 'size'> {
  /** Размер контрола. */
  size?: 'default' | 'sm';
}

/**
 * Выбор цвета на базе нативного `input[type=color]` в стилях UIKit.
 */
const ColorPicker = React.forwardRef<HTMLInputElement, ColorPickerProps>(
  ({ className, size = 'default', disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="color"
        data-slot="color-picker"
        disabled={disabled}
        className={cn(
          'border-border cursor-pointer rounded-md border bg-input p-0.5 shadow-xs outline-none transition-[color,box-shadow]',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:border-primary',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          '[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0',
          '[&::-moz-color-swatch]:rounded-[3px] [&::-moz-color-swatch]:border-0',
          size === 'default' && 'size-9',
          size === 'sm' && 'size-7',
          className,
        )}
        {...props}
      />
    );
  },
);
ColorPicker.displayName = 'ColorPicker';

export { ColorPicker };
