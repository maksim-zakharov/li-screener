import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { SettingsDialog } from '@/components/SettingsDialog'
import {
  AppHeader as AppHeaderChrome,
  AppHeaderActions,
  AppHeaderNav,
  AppHeaderNavLink,
  appHeaderNavLinkClassName,
  APP_CHROME_OFFSET_DEFAULT,
  APP_CHROME_OFFSET_VAR,
} from '@/components/ui/app-header'
import { cn } from '@/lib/utils'

export { APP_CHROME_OFFSET_VAR } from '@/components/ui/app-header'

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
  { to: '/', label: 'Графики', end: true },
  { to: '/arbitrages', label: 'Арбитражи' },
  { to: '/about', label: 'О проекте' },
]

interface AppHeaderProps {
  /** Пункты навигации; по умолчанию — шаблон LI Screener */
  items?: AppHeaderNavItem[]
}

/**
 * Продуктовая шапка LI Screener на базе kit `AppHeader`.
 */
export function AppHeader({ items = DEFAULT_NAV_ITEMS }: AppHeaderProps) {
  const location = useLocation()
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    <>
      <AppHeaderChrome>
        <AppHeaderNav>
          {items.map((item) => (
            <AppHeaderNavLink key={item.to} asChild active={isItemActive(item)}>
              <Link to={item.to}>{item.label}</Link>
            </AppHeaderNavLink>
          ))}
        </AppHeaderNav>
        <AppHeaderActions>
          <button
            type="button"
            className={cn(appHeaderNavLinkClassName(settingsOpen), 'cursor-pointer')}
            onClick={() => setSettingsOpen(true)}
          >
            Настройки
          </button>
        </AppHeaderActions>
      </AppHeaderChrome>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
