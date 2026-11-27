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

## Деплой

При пуше в `main` GitHub Actions собирает проект и публикует `dist/` на GitHub Pages.

URL: `https://maksim-zakharov.github.io/li-screener/`

В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.
