import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { appHeaderNavLinkClassName } from '@/components/ui/app-header';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Пункт выпадающего меню шапки. */
export interface HeaderNavDropdownItem {
  /** Путь маршрута */
  key: string;
  /** Подпись */
  label: string;
}

interface HeaderNavDropdownProps {
  /** Подпись триггера */
  label: string;
  /** Пункты меню */
  items: HeaderNavDropdownItem[];
  /** Активен ли раздел (триггер bold) */
  isActive: boolean;
  /** Активен ли конкретный пункт */
  isItemActive?: (itemKey: string) => boolean;
  /** data-* имя на PopoverContent без префикса data- (например arbs-dropdown) */
  contentDataAttr?: string;
  /** Контролируемое open (для автоскрытия шапки) */
  open?: boolean;
  /** Смена open */
  onOpenChange?: (open: boolean) => void;
  /** Доп. класс триггера */
  className?: string;
}

const itemClassName = (active: boolean) =>
  cn(
    'block cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-tmp-ffb11a focus:bg-[rgba(255,255,255,0.06)] focus:text-tmp-ffb11a',
    active ? 'font-bold text-foreground' : 'text-foreground',
  );

/**
 * Выпадающее меню шапки (hover): общий Popover для Арбитражи / Проп / Фандинги / Скальпинг / …
 */
export function HeaderNavDropdown({
  label,
  items,
  isActive,
  isItemActive,
  contentDataAttr,
  open: openProp,
  onOpenChange,
  className,
}: HeaderNavDropdownProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  };

  const keepOpen = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const resolveItemActive = (itemKey: string) => (isItemActive ? isItemActive(itemKey) : false);

  const contentProps = contentDataAttr
    ? ({ [`data-${contentDataAttr}`]: '' } as Record<string, string>)
    : {};

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
    >
      <PopoverTrigger asChild onMouseEnter={keepOpen} onMouseLeave={scheduleClose}>
        <span className={cn(appHeaderNavLinkClassName(isActive), 'cursor-pointer gap-1', className)}>
          {label}
          <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </span>
      </PopoverTrigger>
      <PopoverContent
        {...contentProps}
        align="start"
        sideOffset={4}
        className="w-auto min-w-[8rem] p-1"
        onMouseEnter={keepOpen}
        onMouseLeave={() => setOpen(false)}
      >
        {items.map((item) => (
          <Link
            key={item.key}
            to={item.key}
            className={itemClassName(resolveItemActive(item.key))}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
