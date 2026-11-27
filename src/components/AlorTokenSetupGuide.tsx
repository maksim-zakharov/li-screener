import { cn } from '@/lib/utils'

interface AlorTokenSetupGuideProps {
  /** Доп. класс */
  className?: string
}

/**
 * Инструкция по получению Alor API-ключа, если токен ещё не задан.
 */
export function AlorTokenSetupGuide({ className }: AlorTokenSetupGuideProps) {
  return (
    <ol
      className={cn(
        'list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground',
        className,
      )}
    >
      <li>
        Стать клиентом по ссылке{' '}
        <a
          href="https://www.alorbroker.ru/open?promo=L0008"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[#2962ff] underline-offset-2 hover:underline"
        >
          alorbroker.ru/open?promo=L0008
        </a>
      </li>
      <li>
        Далее зарегистрироваться на{' '}
        <a
          href="https://alor.dev"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-[#2962ff] underline-offset-2 hover:underline"
        >
          alor.dev
        </a>
      </li>
      <li>На странице разработчика выпустить API-ключ.</li>
    </ol>
  )
}
