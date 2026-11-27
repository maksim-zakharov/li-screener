import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'

/** Общий каркас: шапка + контент на всю оставшуюся высоту. */
export function AppLayout() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
