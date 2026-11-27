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

/** Стартовая страница шаблона. */
export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">LI Screener</h1>
        <p className="text-muted-foreground">
          Шаблон на React, TypeScript, Vite, Tailwind CSS и shadcn/ui с деплоем на GitHub Pages.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Готово к разработке</CardTitle>
          <CardDescription>
            Роутинг через HashRouter — маршруты работают на GitHub Pages без серверного rewrite.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Добавляйте страницы в <code className="text-foreground">src/pages</code>, компоненты UI —
          через <code className="text-foreground">npx shadcn add</code>.
        </CardContent>
        <CardFooter>
          <Link to="/about" className={cn(buttonVariants())}>
            О проекте
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
