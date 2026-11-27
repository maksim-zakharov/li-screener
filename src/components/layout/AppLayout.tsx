import { NavLink, Outlet } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'text-sm font-medium transition-colors hover:text-foreground',
    isActive ? 'text-foreground' : 'text-muted-foreground',
  )

/** Общий каркас приложения со ссылками навигации. */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
          <NavLink to="/" className="font-heading text-sm font-semibold tracking-tight">
            LI Screener
          </NavLink>
          <nav className="flex items-center gap-4">
            <NavLink to="/" end className={navLinkClass}>
              Главная
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              О проекте
            </NavLink>
          </nav>
        </div>
      </header>
      <Separator />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
