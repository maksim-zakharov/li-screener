# LI Screener

Фронтенд-шаблон на **React + TypeScript + Vite + Tailwind CSS**.

UI-кит, токены и дизайн перенесены из [smartmoney-client](https://github.com/maksim-zakharov/smartmoney-client) (crypto-spreads.com): shadcn/ui new-york + Radix, BDS-токены, dark theme.

Роутинг через `HashRouter` — подходит для GitHub Pages.

## Скрипты

```bash
npm install
npm run dev      # локальная разработка
npm run build    # production-сборка в dist/
npm run preview  # превью сборки
```

## UI-кит

Компоненты: `src/components/ui/`  
Стили и design tokens: `src/index.css`  
Тема: `src/components/theme-provider.tsx` (по умолчанию `dark`)

## TradingView Charting Library

Скопируй пакет библиотеки в **обе** папки (как в smartmoney-client):

| Папка | Зачем |
|-------|--------|
| `public/assets/charting_library/` | статика для `library_path` |
| `src/assets/charting_library/` | `import { widget }` и типы |

```ts
import { widget } from '@/assets/charting_library'
import { CHARTING_LIBRARY_PATH } from '@/lib/charting-library-path'
// library_path: CHARTING_LIBRARY_PATH
```

## Деплой

При пуше в `main` GitHub Actions собирает проект и публикует `dist/` на GitHub Pages.

URL: `https://maksim-zakharov.github.io/li-screener/`

В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.
