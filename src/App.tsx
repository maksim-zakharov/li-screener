import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { ArbitragesPage } from '@/pages/ArbitragesPage'
import { HomePage } from '@/pages/HomePage'

/** Корневой роутер приложения (HashRouter для GitHub Pages). */
function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="li-screener-ui-theme">
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="arbitrages" element={<ArbitragesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <Toaster position="top-center" />
    </ThemeProvider>
  )
}

export default App
