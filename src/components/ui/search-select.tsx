import * as React from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

/** Опция выпадающего списка с поиском */
export interface SearchSelectOption {
  /** Значение опции */
  value: string;
  /** Текст для отображения и фильтрации */
  label: string;
  /** Отключена ли опция */
  disabled?: boolean;
}

export interface SearchSelectProps {
  /** Выбранное значение */
  value?: string;
  /** Колбэк смены значения */
  onValueChange?: (value: string) => void;
  /** Список опций */
  options: readonly SearchSelectOption[];
  /** Плейсхолдер, когда значение не выбрано */
  placeholder?: string;
  /** Плейсхолдер поля поиска при открытом списке */
  searchPlaceholder?: string;
  /** Текст, если нет совпадений */
  emptyText?: string;
  /** Отключён ли контрол */
  disabled?: boolean;
  /** id инпута */
  id?: string;
  /** Доп. классы на обёртку */
  className?: string;
  /** Классы на инпут */
  inputClassName?: string;
  /** Размер инпута */
  size?: 'default' | 'xs';
}

/**
 * Селект с инпутом-поиском: фильтрация опций по вводу, выбор из выпадающего списка.
 */
function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Выберите',
  searchPlaceholder = 'Поиск…',
  emptyText = 'Ничего не найдено',
  disabled = false,
  id,
  className,
  inputClassName,
  size = 'default',
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = React.useState<number | undefined>(undefined);

  const selected = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, query]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setHighlightIndex(0);
  }, [open, query]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, open]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery('');
    setHighlightIndex(0);
  }, []);

  const selectOption = React.useCallback(
    (option: SearchSelectOption) => {
      if (option.disabled) {
        return;
      }
      onValueChange?.(option.value);
      close();
      inputRef.current?.blur();
    },
    [close, onValueChange],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) {
      return;
    }
    // Пока фокус в инпуте — не закрываем (клик по якорю Radix считает outside).
    if (!nextOpen && rootRef.current?.contains(document.activeElement)) {
      return;
    }
    if (nextOpen) {
      const width = rootRef.current?.offsetWidth;
      if (width) {
        setContentWidth(width);
      }
    } else {
      setQuery('');
      setHighlightIndex(0);
    }
    setOpen(nextOpen);
  };

  const handleFocus = () => {
    if (disabled) {
      return;
    }
    const width = rootRef.current?.offsetWidth;
    if (width) {
      setContentWidth(width);
    }
    setOpen(true);
    setQuery('');
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!open) {
      setOpen(true);
    }
    setQuery(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      inputRef.current?.blur();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlightIndex];
      if (option) {
        selectOption(option);
      }
    }
  };

  const displayValue = open ? query : (selected?.label ?? '');

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={rootRef}
          data-slot="search-select"
          className={cn('relative w-full min-w-[160px]', className)}
        >
          <Input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={open ? `${id ?? 'search-select'}-listbox` : undefined}
            autoComplete="off"
            disabled={disabled}
            size={size}
            placeholder={open ? searchPlaceholder : placeholder}
            value={displayValue}
            onFocus={handleFocus}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className={cn('pr-8', inputClassName)}
          />
          <ChevronDownIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 opacity-50"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          // Клик по инпуту/якорю — не «снаружи»: иначе список открывается и сразу закрывается.
          if (rootRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          if (rootRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (rootRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
        style={contentWidth ? { width: contentWidth } : undefined}
        className={cn(
          'bg-bds-gray-bg-float text-popover-foreground border border-solid border-bds-gray-ele-line shadow-[var(--bds-shadow-l1)] min-w-[8rem] rounded-lg p-1',
        )}
      >
        <div
          ref={listRef}
          id={`${id ?? 'search-select'}-listbox`}
          role="listbox"
          className="max-h-60 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="text-muted-foreground px-2 py-1.5 text-sm">{emptyText}</div>
          ) : (
            filtered.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightIndex;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  data-index={index}
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  className={cn(
                    'text-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-hidden select-none',
                    'disabled:pointer-events-none disabled:opacity-50',
                    (isHighlighted || isSelected) &&
                      'bg-[var(--bds-trans-hover)] text-bds-brand-900-text',
                  )}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <span className="absolute right-2 flex size-3.5 items-center justify-center">
                      <CheckIcon className="size-4" />
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { SearchSelect };
