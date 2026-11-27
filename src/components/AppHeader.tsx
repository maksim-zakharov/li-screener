import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * CSS-переменная суммарного хрома сверху (шапка + pt-1 контента).
 * Страницы с `h-[calc(100vh-…)]` должны вычитать `var(--app-chrome-offset)`.
 */
export const APP_CHROME_OFFSET_VAR = '--app-chrome-offset'
/** Обычная шапка h-12 (48px) + pt-1 (4px) */
const APP_CHROME_OFFSET_DEFAULT = '52px'

/** Пункт навигации шапки. */
export interface AppHeaderNavItem {
  /** Путь маршрута */
  to: string
  /** Подпись */
  label: string
  /** Точное совпадение пути (для `/`) */
  end?: boolean
}

const DEFAULT_NAV_ITEMS: AppHeaderNavItem[] = [
  { to: '/', label: 'Главная', end: true },
  { to: '/about', label: 'О проекте' },
]

interface AppHeaderProps {
  /** Пункты навигации; по умолчанию — шаблон LI Screener */
  items?: AppHeaderNavItem[]
}

const headerBorderColor = 'rgba(166, 189, 213, 0.2)'

const navLinkClass = (active: boolean) =>
  cn(
    'inline-flex h-12 box-border items-center px-3 py-4 text-[14px] leading-none text-foreground transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-tmp-ffb11a',
    active ? 'font-bold text-foreground' : 'font-medium',
  )

/**
 * Шапка приложения в стиле smartmoney-client AppHeader (kit chrome).
 */
export function AppHeader({ items = DEFAULT_NAV_ITEMS }: AppHeaderProps) {
  const location = useLocation()

  useEffect(() => {
    document.documentElement.style.setProperty(APP_CHROME_OFFSET_VAR, APP_CHROME_OFFSET_DEFAULT)
    return () => {
      document.documentElement.style.removeProperty(APP_CHROME_OFFSET_VAR)
    }
  }, [])

  const isItemActive = (item: AppHeaderNavItem) => {
    if (item.end) {
      return location.pathname === item.to
    }
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  }

  return (
    <header
      className="flex h-[calc(3rem+env(safe-area-inset-top))] w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden bg-tmp-17181e px-2 pt-[env(safe-area-inset-top)]"
      style={{ borderColor: headerBorderColor }}
    >
      <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="-ml-1 flex w-max items-center gap-1">
          {items.map((item) => (
            <Link key={item.to} to={item.to} className={navLinkClass(isItemActive(item))}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
