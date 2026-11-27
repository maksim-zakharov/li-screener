import { AlorChart } from '@/components/AlorChart'

/** Стартовая страница: график на всю доступную площадь. */
export function HomePage() {
  return (
    <div className="min-h-0 flex-1">
      <AlorChart symbol="SBER" height="100%" />
    </div>
  )
}
