import { Outlet } from 'react-router-dom'
import { AppHeader } from '@/components/AppHeader'

/** Общий каркас приложения с шапкой из кита. */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col pt-1">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
