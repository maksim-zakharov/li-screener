# TradingView Charting Library (статика)

Скопируй сюда содержимое Charting Library (как в smartmoney-client `public/assets/charting_library/`):

- `charting_library.js` / `.esm.js` / `.d.ts`
- `bundles/`
- `package.json`, `datafeed-api.d.ts`, …

Vite отдаёт это как `/li-screener/assets/charting_library/…`.

В виджете:

```ts
library_path: `${import.meta.env.BASE_URL}assets/charting_library/`
```

Типы и `import { widget }` — из `src/assets/charting_library` (скопируй туда тот же пакет).
