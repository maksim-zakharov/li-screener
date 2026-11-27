# TradingView Charting Library (импорты / типы)

Скопируй сюда **тот же** пакет Charting Library, что и в `public/assets/charting_library/`.

Использование в коде:

```ts
import { widget } from '@/assets/charting_library'
import type { IChartingLibraryWidget, ResolutionString } from '@/assets/charting_library'
```

Путь к бандлам для `library_path` — через `public/` (см. README там) или хелпер:

```ts
import { CHARTING_LIBRARY_PATH } from '@/lib/charting-library-path'
```
