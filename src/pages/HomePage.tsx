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

/** Стартовая страница шаблона. */
export function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">LI Screener</h1>
        <p className="text-muted-foreground">
          UI-кит и дизайн из smartmoney-client: токены BDS, dark theme, shadcn/ui (new-york).
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
          Компоненты в <code className="text-foreground">src/components/ui</code>, стили и токены — в{' '}
          <code className="text-foreground">src/index.css</code>.
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link to="/about">О проекте</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
