import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

import { cn } from '@/lib/utils';

/**
 * CSS-переменная суммарного хрома сверху (шапка + pt-1 контента в App).
 * Страницы с `h-[calc(100vh-…)]` должны вычитать `var(--app-chrome-offset)`.
 */
export const APP_CHROME_OFFSET_VAR = '--app-chrome-offset';
/** Обычная шапка h-12 (48px) + pt-1 (4px) */
export const APP_CHROME_OFFSET_DEFAULT = '52px';
/** Автоскрытие: полоска h-1 (4px) + pt-1 (4px) */
export const APP_CHROME_OFFSET_AUTO_HIDE = '8px';
/** Цвет бордера шапки (как в AppHeader) */
export const APP_HEADER_BORDER_COLOR = 'rgba(166, 189, 213, 0.2)';

/**
 * Класс пункта навигации шапки (Link / кнопка).
 */
export function appHeaderNavLinkClassName(active: boolean): string {
  return cn(
    'inline-flex h-12 box-border items-center px-3 py-4 text-[14px] leading-none text-foreground transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-tmp-ffb11a',
    active ? 'font-bold text-foreground' : 'font-medium',
  );
}

interface AppHeaderProps extends React.ComponentProps<'header'> {}

/**
 * Корневая шапка приложения (kit chrome): фон, высота, safe-area.
 */
function AppHeader({ className, style, ...props }: AppHeaderProps) {
  return (
    <header
      data-slot="app-header"
      className={cn(
        'flex h-[calc(3rem+env(safe-area-inset-top))] w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden bg-tmp-17181e px-2 pt-[env(safe-area-inset-top)]',
        className,
      )}
      style={{ borderColor: APP_HEADER_BORDER_COLOR, ...style }}
      {...props}
    />
  );
}

interface AppHeaderNavProps extends React.ComponentProps<'nav'> {}

/**
 * Горизонтальный скролл-контейнер пунктов меню шапки.
 */
function AppHeaderNav({ className, children, ...props }: AppHeaderNavProps) {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav data-slot="app-header-nav" className={cn('-ml-1 flex w-max items-center gap-1', className)} {...props}>
        {children}
      </nav>
    </div>
  );
}

interface AppHeaderActionsProps extends React.ComponentProps<'div'> {}

/**
 * Правый блок шапки (язык, WS, UserMenu).
 */
function AppHeaderActions({ className, ...props }: AppHeaderActionsProps) {
  return (
    <div
      data-slot="app-header-actions"
      className={cn('ml-auto flex shrink-0 items-center gap-2', className)}
      {...props}
    />
  );
}

interface AppHeaderNavLinkProps extends React.ComponentProps<'a'> {
  /** Активный пункт */
  active?: boolean;
  /** Рендер как дочерний элемент (Link и т.п.) */
  asChild?: boolean;
}

/**
 * Пункт навигации шапки (ссылка или asChild → Link).
 */
function AppHeaderNavLink({
  className,
  active = false,
  asChild = false,
  ...props
}: AppHeaderNavLinkProps) {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp
      data-slot="app-header-nav-link"
      className={cn(appHeaderNavLinkClassName(active), className)}
      {...props}
    />
  );
}

interface AppHeaderAutoHideProps {
  /** Шапка видна (hover / открытое меню) */
  revealed: boolean;
  /** Hover enter на зону шапки */
  onMouseEnter?: () => void;
  /** Hover leave */
  onMouseLeave?: () => void;
  /** Содержимое — обычно `<AppHeader />` */
  children: React.ReactNode;
}

/**
 * Автоскрытие шапки: полоска h-1 + выезд header по hover.
 */
function AppHeaderAutoHide({
  revealed,
  onMouseEnter,
  onMouseLeave,
  children,
}: AppHeaderAutoHideProps) {
  return (
    <div
      data-slot="app-header-auto-hide"
      className="relative z-50 h-1 w-full shrink-0"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1 transition-colors',
          revealed
            ? 'pointer-events-none bg-transparent'
            : 'bg-[rgba(166,189,213,0.45)] hover:bg-tmp-ffb11a/60',
        )}
        aria-hidden
      />
      <div
        className={cn(
          'absolute inset-x-0 top-0 shadow-md transition-transform duration-200 ease-out',
          revealed ? 'translate-y-0' : 'pointer-events-none -translate-y-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export {
  AppHeader,
  AppHeaderNav,
  AppHeaderActions,
  AppHeaderNavLink,
  AppHeaderAutoHide,
};
