# LI Screener

Фронтенд-шаблон на **React + TypeScript + Vite + Tailwind CSS + shadcn/ui**.

Роутинг через `HashRouter` — подходит для GitHub Pages.

## Скрипты

```bash
npm install
npm run dev      # локальная разработка
npm run build    # production-сборка в dist/
npm run preview  # превью сборки
```

## shadcn/ui

```bash
npx shadcn add button
npx shadcn add card dialog table
```

## Деплой

При пуше в `main` GitHub Actions собирает проект и публикует `dist/` на GitHub Pages.

URL: `https://maksim-zakharov.github.io/li-screener/`

В настройках репозитория: **Settings → Pages → Source: GitHub Actions**.
