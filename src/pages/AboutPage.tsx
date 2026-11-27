import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/** Страница «О проекте» для проверки HashRouter. */
export function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">О проекте</h1>
        <p className="text-muted-foreground">Пример второй страницы с hash-роутингом.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Стек</CardTitle>
          <CardDescription>Тот же визуальный язык, что у crypto-spreads.com.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>React + TypeScript + Vite</li>
            <li>Tailwind CSS 4 + BDS design tokens</li>
            <li>shadcn/ui (new-york, Radix)</li>
            <li>ThemeProvider (dark по умолчанию)</li>
            <li>HashRouter + GitHub Pages</li>
          </ul>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" asChild>
            <Link to="/">На главную</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
