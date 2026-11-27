import { useEffect, useRef, useState } from 'react'
import type {
  ChartingLibraryFeatureset,
  IBrokerTerminal,
  IChartingLibraryWidget,
  LanguageCode,
  ResolutionString,
  Timezone,
  TradingTerminalFeatureset,
  TradingTerminalWidgetOptions,
} from '@/assets/charting_library'
import { TradedGroupHorizontalAlignment, widget } from '@/assets/charting_library'
import { ALOR_TOKEN_CHANGED_EVENT, getAlorRefreshToken } from '@/api/alor-client'
import { AlorTokenSetupGuide } from '@/components/AlorTokenSetupGuide'
import { AlorDatafeed } from '@/chart/alor-datafeed'
import {
  ARB_READONLY_BROKER_CONFIG,
  createArbReadonlyBroker,
  type ArbReadonlyBroker,
} from '@/chart/arb-readonly-broker'
import { createLocalChartSaveLoadAdapter } from '@/chart/chart-save-load-adapter'
import { CHARTING_LIBRARY_PATH } from '@/lib/charting-library-path'

interface AlorChartProps {
  /** Тикер MOEX */
  symbol?: string
  /** Стартовый ТФ TradingView */
  interval?: ResolutionString
  /** Высота контейнера */
  height?: number | string
  /** Локаль виджета */
  locale?: LanguageCode
  /** Показывать правую панель TV (watchlist / details). По умолчанию true. */
  showWidgetBar?: boolean
}

/**
 * Полный UI графика. Broker — только линии позиций (read-only),
 * торговый UI выключен.
 */
const DISABLED_FEATURES: TradingTerminalFeatureset[] = [
  'widget_logo' as ChartingLibraryFeatureset as TradingTerminalFeatureset,
  'trading_account_manager',
  'open_account_manager',
  'order_panel',
  'order_info',
  'buy_sell_buttons',
  'broker_button',
  'trading_notifications',
  'show_trading_notifications_history',
  'show_order_panel_on_start',
  'dom_widget',
]

const ENABLED_FEATURES: TradingTerminalFeatureset[] = [
  'side_toolbar_in_fullscreen_mode',
  'header_in_fullscreen_mode',
  'chart_crosshair_menu',
  'seconds_resolution',
  'chart_template_storage',
  'use_localstorage_for_settings',
  'items_favoriting',
  'study_templates',
  'datasource_copypaste',
  /** Рисунки отдельно от layout — saveLineToolsAndGroups / loadLineToolsAndGroups */
  'saveload_separate_drawings_storage',
  'determine_first_data_request_size_using_visible_range' as TradingTerminalFeatureset,
]

/** Нормализация тикера для сравнения (без биржи, upper). */
function normalizeChartSymbol(value: string): string {
  return value
    .trim()
    .replace(/^MOEX:/i, '')
    .replace(/^SPBX:/i, '')
    .toUpperCase()
}

/**
 * Ставит тикер на activeChart с retry и защитой от устаревших ответов.
 */
async function applyChartSymbol(
  chartWidget: IChartingLibraryWidget,
  symbol: string,
  genRef: { current: number },
): Promise<void> {
  const next = symbol.trim()
  if (!next) {
    return
  }
  const gen = ++genRef.current

  for (let attempt = 0; attempt < 3; attempt++) {
    if (gen !== genRef.current) {
      return
    }
    try {
      const chartApi = chartWidget.activeChart()
      if (!chartApi) {
        await new Promise((resolve) => window.setTimeout(resolve, 50))
        continue
      }
      const current = normalizeChartSymbol(String(chartApi.symbol?.() ?? ''))
      if (current === normalizeChartSymbol(next)) {
        return
      }
      const ok = await Promise.resolve(chartApi.setSymbol(next))
      if (gen !== genRef.current) {
        return
      }
      const after = normalizeChartSymbol(String(chartApi.symbol?.() ?? ''))
      if (ok !== false || after === normalizeChartSymbol(next)) {
        try {
          chartApi.reloadLineToolsFromServer?.()
        } catch {
          // ignore
        }
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 80))
    } catch (err) {
      if (gen !== genRef.current) {
        return
      }
      console.warn('AlorChart setSymbol:', err)
      await new Promise((resolve) => window.setTimeout(resolve, 80))
    }
  }
}

/**
 * TradingView-график Alor (MOEX) с полным UI.
 * Виджет создаётся один раз; смена тикера — `setSymbol` без remount (как TradeFi).
 * Пересоздание — только при смене токена.
 */
export function AlorChart({
  symbol = 'SBER',
  interval = '15' as ResolutionString,
  height = 520,
  locale = 'ru',
  showWidgetBar = true,
}: AlorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<IChartingLibraryWidget | null>(null)
  const brokerRef = useRef<ArbReadonlyBroker | null>(null)
  const propsRef = useRef({ symbol, interval, locale, showWidgetBar })
  propsRef.current = { symbol, interval, locale, showWidgetBar }
  /** Поколение setSymbol — отсекает устаревшие async-ответы (ready / load_last_chart / клик). */
  const setSymbolGenRef = useRef(0)

  const [tokenMissing, setTokenMissing] = useState(() => !getAlorRefreshToken())
  const [error, setError] = useState<string | null>(null)
  /** Инкремент только при ALOR_TOKEN_CHANGED — единственный повод пересоздать виджет. */
  const [chartEpoch, setChartEpoch] = useState(0)
  /** Бамп после onChartReady — чтобы setSymbol сработал, когда iframe уже есть. */
  const [chartReadyVersion, setChartReadyVersion] = useState(0)

  useEffect(() => {
    const onTokenChanged = () => {
      setTokenMissing(!getAlorRefreshToken())
      setChartEpoch((epoch) => epoch + 1)
    }
    window.addEventListener(ALOR_TOKEN_CHANGED_EVENT, onTokenChanged)
    return () => window.removeEventListener(ALOR_TOKEN_CHANGED_EVENT, onTokenChanged)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    if (!getAlorRefreshToken()) {
      setTokenMissing(true)
      return
    }

    setTokenMissing(false)
    setError(null)
    setChartReadyVersion(0)

    const {
      symbol: currentSymbol,
      interval: currentInterval,
      locale: currentLocale,
      showWidgetBar: widgetBarOn,
    } = propsRef.current
    if (!currentSymbol.trim()) {
      return
    }

    const datafeed = new AlorDatafeed()
    const disabledFeatures: TradingTerminalFeatureset[] = [...DISABLED_FEATURES]
    if (!widgetBarOn) {
      disabledFeatures.push(
        'right_toolbar',
        'show_right_widgets_panel_by_default',
      )
    }

    const config: TradingTerminalWidgetOptions = {
      debug: false,
      container,
      symbol: currentSymbol.trim(),
      interval: currentInterval,
      locale: currentLocale,
      library_path: CHARTING_LIBRARY_PATH,
      datafeed,
      fullscreen: false,
      autosize: true,
      timezone: 'Europe/Moscow' as Timezone,
      theme: 'dark',
      overrides: {
        'paneProperties.background': 'rgb(16,16,20)',
        'paneProperties.backgroundType': 'solid',
        'tradingProperties.showPositions': true,
        'tradingProperties.positionPL.visibility': true,
        'tradingProperties.extendLeft': true,
        'tradingProperties.lineLength': 50,
        /** PnL/qty бейдж по центру линии, не справа. */
        'tradingProperties.horizontalAlignment': TradedGroupHorizontalAlignment.Center,
        'tradingProperties.showReverse': false,
      },
      loading_screen: {
        backgroundColor: 'rgb(16,16,20)',
        foregroundColor: 'rgb(173,177,184)',
      },
      disabled_features: disabledFeatures,
      enabled_features: ENABLED_FEATURES,
      custom_css_url: `${CHARTING_LIBRARY_PATH}tw-chart-theme.css`,
      auto_save_delay: 1,
      client_id: 'li-screener',
      user_id: 'local',
      load_last_chart: true,
      save_load_adapter: createLocalChartSaveLoadAdapter(),
      widgetbar: {
        details: widgetBarOn,
        watchlist: widgetBarOn,
        news: false,
        datawindow: widgetBarOn,
      },
      broker_config: ARB_READONLY_BROKER_CONFIG,
      broker_factory: (host): IBrokerTerminal => {
        const broker = createArbReadonlyBroker(host)
        brokerRef.current = broker
        return broker
      },
    }

    let chartWidget: IChartingLibraryWidget
    try {
      chartWidget = new widget(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    widgetRef.current = chartWidget

    chartWidget.onChartReady(() => {
      if (widgetRef.current !== chartWidget) {
        return
      }
      try {
        chartWidget.applyOverrides({
          'tradingProperties.horizontalAlignment': TradedGroupHorizontalAlignment.Center,
          'tradingProperties.lineLength': 50,
          'tradingProperties.extendLeft': true,
          'tradingProperties.positionPL.visibility': true,
          'tradingProperties.showReverse': false,
        })
      } catch {
        // ignore
      }
      try {
        chartWidget.activeChart().getTimezoneApi().setTimezone('Europe/Moscow')
      } catch {
        // ignore
      }
      try {
        chartWidget.subscribe('onAutoSaveNeeded', () => {
          if (widgetRef.current !== chartWidget) {
            return
          }
          void chartWidget.saveChartToServer({ defaultChartName: 'li-screener' }).catch((err) => {
            console.warn('AlorChart auto-save:', err)
          })
        })
      } catch {
        // ignore
      }
      setChartReadyVersion((v) => v + 1)
      /**
       * load_last_chart подменяет тикер после ready — ещё раз жёстко ставим props.
       * Поколение отсечёт ответ, если пользователь уже кликнул другой тикер.
       */
      window.setTimeout(() => {
        if (widgetRef.current !== chartWidget) {
          return
        }
        void applyChartSymbol(chartWidget, propsRef.current.symbol, setSymbolGenRef)
      }, 100)
    })

    return () => {
      setSymbolGenRef.current += 1
      try {
        brokerRef.current?.destroy()
      } catch {
        // ignore
      }
      brokerRef.current = null
      try {
        chartWidget.remove()
      } catch {
        // already removed
      }
      if (widgetRef.current === chartWidget) {
        widgetRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- symbol меняется через setSymbol
  }, [chartEpoch])

  /**
   * Смена тикера без remount — как TradeFi: activeChart().setSymbol.
   */
  useEffect(() => {
    const chartWidget = widgetRef.current
    const next = symbol.trim()
    if (!next || !chartWidget || chartReadyVersion <= 0) {
      return
    }
    void applyChartSymbol(chartWidget, next, setSymbolGenRef)
  }, [symbol, chartReadyVersion])

  const sizeStyle = typeof height === 'number' ? { height } : { height }

  return (
    <div className="relative size-full min-h-0 overflow-hidden bg-tmp-17181e" style={sizeStyle}>
      {tokenMissing ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-tmp-17181e px-4">
          <div className="w-full max-w-md rounded-md border border-[rgba(166,189,213,0.2)] bg-[rgb(19,19,23)] px-4 py-4 shadow-lg">
            <div className="mb-1 text-sm font-semibold text-foreground">Нужен Alor refresh token</div>
            <p className="mb-3 text-xs text-muted-foreground">
              Откройте «Настройки» в шапке и вставьте API-ключ. Как получить:
            </p>
            <AlorTokenSetupGuide />
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-0 top-0 z-10 bg-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div ref={containerRef} className="size-full min-h-0" />
    </div>
  )
}
