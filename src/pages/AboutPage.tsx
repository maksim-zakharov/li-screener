import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Страница «О проекте» для проверки HashRouter. */
export function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">О проекте</h1>
        <p className="text-muted-foreground">Пример второй страницы с hash-роутингом.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Стек</CardTitle>
          <CardDescription>Базовый набор для фронтенда скринера.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>React 19 + TypeScript</li>
            <li>Vite 8</li>
            <li>Tailwind CSS 4</li>
            <li>shadcn/ui (base-nova)</li>
            <li>React Router HashRouter</li>
            <li>GitHub Actions → GitHub Pages</li>
          </ul>
        </CardContent>
        <CardFooter>
          <Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
            На главную
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
