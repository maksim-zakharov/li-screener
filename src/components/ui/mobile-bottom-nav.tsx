import * as React from 'react';
import { cn } from '@/lib/utils';
import { UNDERLINE_TAB_MUTED } from './underline-tabs';

/**
 * Класс пункта нижнего мобильного меню (как tabbar Cex/Cex).
 */
export function mobileBottomNavItemClassName(active: boolean): string {
  return cn(
    'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-sm transition-colors',
    active ? 'font-semibold text-foreground' : 'font-medium',
  );
}

/**
 * Inline-стиль неактивного пункта (muted, как underline-табы).
 */
export function mobileBottomNavItemStyle(active: boolean): React.CSSProperties | undefined {
  return active ? undefined : { color: UNDERLINE_TAB_MUTED };
}

interface MobileBottomNavProps extends React.ComponentProps<'nav'> {
  /** Пункты меню (кнопки / кастом вроде LanguageSwitcher) */
  children: React.ReactNode;
}

/**
 * Нижнее мобильное меню: ряд равномерных пунктов на `bg-card` + safe-area.
 */
function MobileBottomNav({ className, children, ...props }: MobileBottomNavProps) {
  return (
    <nav
      data-slot="mobile-bottom-nav"
      className={cn('mobile-bottom-nav relative z-10 flex shrink-0 bg-card', className)}
      {...props}
    >
      {children}
    </nav>
  );
}

interface MobileBottomNavItemProps extends React.ComponentProps<'button'> {
  /** Активный пункт */
  active?: boolean;
  /** Иконка (обычно Lucide size h-5 w-5) */
  icon?: React.ReactNode;
  /** Подпись */
  label: React.ReactNode;
}

/**
 * Пункт нижнего мобильного меню (button — без синего цвета ссылок).
 */
function MobileBottomNavItem({
  active = false,
  icon,
  label,
  className,
  style,
  type = 'button',
  ...props
}: MobileBottomNavItemProps) {
  return (
    <button
      type={type}
      data-slot="mobile-bottom-nav-item"
      data-active={active ? 'true' : undefined}
      className={cn(mobileBottomNavItemClassName(active), className)}
      style={{ ...mobileBottomNavItemStyle(active), ...style }}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export { MobileBottomNav, MobileBottomNavItem };
