import { Exchange, Format } from 'alor-api'
import type {
  Bar,
  DatafeedConfiguration,
  DatafeedErrorCallback,
  HistoryCallback,
  IBasicDataFeed,
  LibrarySymbolInfo,
  OnReadyCallback,
  PeriodParams,
  ResolutionString,
  ResolveCallback,
  SearchSymbolResultItem,
  SearchSymbolsCallback,
  SubscribeBarsCallback,
} from '@/assets/charting_library'
import { ensureAlorAccessToken } from '@/api/alor-client'

/** Сессия MOEX для TradingView (как в smartmoney chart-session). */
const MOEX_SESSION = '0700-2350|1000-1900:17'
const MOEX_TIMEZONE = 'Europe/Moscow'

const configurationData: DatafeedConfiguration = {
  supported_resolutions: ['1', '5', '15', '60', '240', 'D', 'W'] as ResolutionString[],
  exchanges: [
    { value: 'MOEX', name: 'MOEX', desc: 'Московская биржа' },
    { value: 'SPBX', name: 'SPBX', desc: 'СПБ Биржа' },
  ],
  symbols_types: [
    { name: 'Все типы', value: '' },
    { name: 'Фьючерсы', value: 'futures' },
    { name: 'Спот', value: 'spot' },
    { name: 'Акции', value: 'stock' },
  ],
  supports_marks: false,
  supports_timescale_marks: false,
  supports_time: true,
}

/**
 * TV resolution → Alor `tf` (секунды или D/W/M/Y).
 * Как `DataService.parseTimeframe` в smartmoney-client.
 */
export function mapResolutionToAlorTf(resolution: ResolutionString): string {
  const code = resolution.slice(-1)
  if (['D', 'W', 'M', 'Y'].includes(code)) {
    return resolution
  }
  if (code === 'S') {
    return Number(resolution.substring(0, resolution.length - 1)).toString()
  }
  if (code === 'H') {
    return (Number(resolution.substring(0, resolution.length - 1)) * 60 * 60).toString()
  }
  return (Number(resolution) * 60).toString()
}

/**
 * Число знаков после запятой у шага цены (как smartmoney `getPrecision`).
 */
function getPrecision(step: number): number {
  if (!Number.isFinite(step)) {
    return 0
  }
  let e = 1
  let p = 0
  while (Math.round(step * e) / e !== step) {
    e *= 10
    p++
  }
  return p
}

/**
 * Тикер без префикса биржи / скобок TV: `MOEX:SBER`, `[MOEX:SBER]`.
 */
function bareSymbol(symbolName: string): string {
  const trimmed = symbolName.trim().replace(/^\[/, '').replace(/\]$/, '')
  const colon = trimmed.indexOf(':')
  if (colon > 0) {
    return trimmed.slice(colon + 1).trim()
  }
  return trimmed
}

/**
 * Биржа из тикера / LibrarySymbolInfo (по умолчанию MOEX).
 */
function resolveExchange(symbolName: string, fallback = 'MOEX'): 'MOEX' | 'SPBX' {
  const trimmed = symbolName.trim().replace(/^\[/, '').replace(/\]$/, '')
  const colon = trimmed.indexOf(':')
  if (colon > 0) {
    const ex = trimmed.slice(0, colon).toUpperCase()
    if (ex === 'SPBX' || ex === 'SPB') {
      return 'SPBX'
    }
    if (ex === 'MOEX') {
      return 'MOEX'
    }
  }
  const fb = fallback.toUpperCase()
  return fb === 'SPBX' || fb === 'SPB' ? 'SPBX' : 'MOEX'
}

/** Alor sector по типу Symbol Search. */
function sectorsForSymbolType(symbolType: string): Array<'FORTS' | 'FOND' | 'CURR' | undefined> {
  const t = symbolType.trim().toLowerCase()
  if (t === 'futures' || t === 'index' || t === 'spread') {
    return ['FORTS']
  }
  if (t === 'stock') {
    return ['FOND']
  }
  if (t === 'spot') {
    return ['CURR']
  }
  // Как на фронте: FORTS + общий MD (FOND/CURR без sector)
  return ['FORTS', undefined]
}

/** Нормализация type Alor → TV Symbol Search. */
function normalizeSearchType(rawType: string | null | undefined, exchange: string): string {
  const t = String(rawType ?? '')
    .trim()
    .toLowerCase()
  if (t === 'futures' || t === 'future' || t === 'fut' || t === 'forts') {
    return 'futures'
  }
  if (t === 'stock' || t === 'cs' || t === 'equity' || t === 'shares' || t === 'share' || t === 'etf') {
    return 'stock'
  }
  if (t === 'spot' || t === 'cur' || t === 'currency' || t === 'for' || t === 'fx_spot') {
    return 'spot'
  }
  if (exchange === 'SPBX') {
    return 'stock'
  }
  if (t) {
    return t
  }
  return exchange === 'MOEX' ? 'futures' : 'stock'
}

/**
 * Время свечи Alor → ms для TradingView.
 */
function candleTimeToMs(raw: number): number {
  return raw < 1e12 ? raw * 1000 : raw
}

type UnsubscribeFn = () => void | Promise<void>

/**
 * Тонкий datafeed: история getHistory + live BarsGetAndSubscribe (WS).
 */
export class AlorDatafeed implements IBasicDataFeed {
  private readonly subscriptions = new Map<string, UnsubscribeFn[]>()
  /** Последняя свеча по ключу symbol|resolution (ms) — чтобы WS не сбрасывал график историей. */
  private readonly lastBarTimeMs = new Map<string, number>()

  onReady(callback: OnReadyCallback): void {
    setTimeout(() => callback(configurationData), 0)
  }

  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: SearchSymbolsCallback,
  ): void {
    void this.runSearchSymbols(userInput, exchange, symbolType, onResult)
  }

  resolveSymbol(symbolName: string, onResolve: ResolveCallback, onError: DatafeedErrorCallback): void {
    void this.resolveSymbolAsync(symbolName, onResolve, onError)
  }

  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: DatafeedErrorCallback,
  ): void {
    void this.fetchBars(symbolInfo, resolution, periodParams, onResult, onError)
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    _onResetCacheNeededCallback: () => void,
  ): void {
    const subState = { cancelled: false }
    this.subscriptions.set(listenerGuid, [
      () => {
        subState.cancelled = true
      },
    ])

    void this.startCandleSubscription(symbolInfo, resolution, onTick, listenerGuid, subState)
  }

  unsubscribeBars(listenerGuid: string): void {
    const unsubs = this.subscriptions.get(listenerGuid)
    if (!unsubs) {
      return
    }
    for (const unsub of unsubs) {
      try {
        void unsub()
      } catch {
        // ignore
      }
    }
    this.subscriptions.delete(listenerGuid)
  }

  private barKey(symbol: string, resolution: ResolutionString): string {
    return `${symbol}|${resolution}`
  }

  /**
   * Symbol Search через Alor getSecurities (как diary / smartmoney MOEX).
   */
  private async runSearchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResult: SearchSymbolsCallback,
  ): Promise<void> {
    try {
      const api = await ensureAlorAccessToken()
      const query = bareSymbol(userInput.split('/')[0] ?? userInput)
      const exchangeFilter = String(exchange)
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean)
      const exchanges: Array<'MOEX' | 'SPBX'> =
        exchangeFilter.length === 0
          ? ['MOEX']
          : exchangeFilter.includes('SPBX') || exchangeFilter.includes('SPB')
            ? exchangeFilter.includes('MOEX')
              ? ['MOEX', 'SPBX']
              : ['SPBX']
            : ['MOEX']

      const sectors = sectorsForSymbolType(symbolType)
      const batches = await Promise.all(
        exchanges.flatMap((ex) =>
          sectors.map((sector) =>
            api.instruments
              .getSecurities({
                query: query || ' ',
                format: 'Simple',
                exchange: ex,
                limit: 80,
                ...(sector ? { sector } : {}),
              })
              .catch(() => []),
          ),
        ),
      )

      const seen = new Set<string>()
      const mapped: SearchSymbolResultItem[] = []
      for (const results of batches) {
        for (const row of results) {
          const symbol = String(row.symbol ?? '').trim()
          if (!symbol || seen.has(symbol)) {
            continue
          }
          seen.add(symbol)
          const ex = String(row.exchange ?? 'MOEX').toUpperCase() === 'SPBX' ? 'SPBX' : 'MOEX'
          mapped.push({
            symbol,
            exchange: ex,
            ticker: symbol,
            description: String(row.description ?? row.shortname ?? symbol),
            type: normalizeSearchType(row.type, ex),
          })
        }
      }

      /** Пара обычка/преф — как в diary/smartmoney. */
      const queryBase = query.toUpperCase()
      if (queryBase && !queryBase.includes('/')) {
        const pref = mapped.find((row) => {
          const sym = row.symbol.toUpperCase()
          return sym === `${queryBase}P` || sym.startsWith(`${queryBase}P-`)
        })
        if (pref && mapped.length) {
          const base = mapped.find((row) => row.symbol.toUpperCase() === queryBase) ?? mapped[0]
          const composite = `${queryBase}/${queryBase}P`
          if (!seen.has(composite)) {
            mapped.unshift({
              symbol: composite,
              exchange: base.exchange,
              ticker: composite,
              description: `${base.description}/${pref.description}`,
              type: 'spread',
            })
          }
        }
      }

      onResult(mapped)
    } catch (error) {
      console.warn('Alor Symbol Search: ошибка', error)
      onResult([])
    }
  }

  /**
   * Resolve через getSecurityByExchangeAndSymbol (minstep / pricescale как на фронте).
   */
  private async resolveSymbolAsync(
    symbolName: string,
    onResolve: ResolveCallback,
    onError: DatafeedErrorCallback,
  ): Promise<void> {
    const symbol = bareSymbol(symbolName)
    if (!symbol) {
      onError('Пустой тикер')
      return
    }

    /** Синтетическая пара SBER/SBERP — базовая нога. */
    const resolveCode = symbol.includes('/') ? symbol.split('/')[0]!.trim() : symbol
    const exchange = resolveExchange(symbolName)

    try {
      const api = await ensureAlorAccessToken()
      const security = await api.instruments.getSecurityByExchangeAndSymbol({
        symbol: resolveCode,
        exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
        format: 'Simple',
      })

      const minstep = Number(security.minstep ?? 0.01)
      const step = Number.isFinite(minstep) && minstep > 0 ? minstep : 0.01
      const precision = getPrecision(step)
      const pricescale = Number((10 ** precision).toFixed(precision))
      const type = normalizeSearchType(security.type, exchange)

      const info: LibrarySymbolInfo = {
        ticker: symbol,
        name: String(security.shortname ?? symbol),
        description: String(security.description ?? security.shortname ?? symbol),
        type,
        session: MOEX_SESSION,
        timezone: MOEX_TIMEZONE,
        exchange,
        listed_exchange: exchange,
        currency_code: String(security.currency ?? 'RUB'),
        format: 'price',
        pricescale,
        minmov: Math.max(1, Math.round(step * pricescale)),
        has_intraday: true,
        has_daily: true,
        has_seconds: true,
        has_weekly_and_monthly: true,
        supported_resolutions: configurationData.supported_resolutions,
        volume_precision: 0,
        data_status: 'streaming',
      }
      onResolve(info)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onError(message || `Инструмент не найден: ${symbol}`)
    }
  }

  private async startCandleSubscription(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onTick: SubscribeBarsCallback,
    listenerGuid: string,
    subState: { cancelled: boolean },
  ): Promise<void> {
    try {
      const api = await ensureAlorAccessToken()
      if (subState.cancelled) {
        return
      }

      const symbol = bareSymbol(symbolInfo.ticker || symbolInfo.name)
      const exchange = resolveExchange(symbolInfo.ticker || symbolInfo.name, symbolInfo.exchange || 'MOEX')
      const key = this.barKey(symbol, resolution)
      const tf = mapResolutionToAlorTf(resolution)
      const lastMs = this.lastBarTimeMs.get(key)
      // Без from Alor льёт историю → TV сбрасывает кэш и снова getBars (цикл).
      const fromSec = lastMs
        ? Math.floor(lastMs / 1000)
        : Math.floor(Date.now() / 1000) - Math.max(Number(tf) || 60, 60)

      const unsubscribe = await api.subscriptions.candles(
        {
          code: symbol.includes('/') ? symbol.split('/')[0]!.trim() : symbol,
          exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
          format: Format.Simple,
          tf: tf as '15' | '60' | '300' | '3600' | 'D' | 'W' | 'M' | 'Y',
          from: fromSec,
        },
        (data) => {
          if (subState.cancelled || !data) {
            return
          }
          const timeMs = candleTimeToMs(Number(data.time))
          if (!(timeMs > 0)) {
            return
          }

          const knownLast = this.lastBarTimeMs.get(key)
          // Старые свечи из WS-дампа ломают TV (reset → getBars → subscribe → снова дамп).
          if (knownLast != null && timeMs < knownLast) {
            return
          }

          this.lastBarTimeMs.set(key, timeMs)
          onTick({
            time: timeMs,
            open: Number(data.open),
            high: Number(data.high),
            low: Number(data.low),
            close: Number(data.close),
            volume: Number(data.volume ?? 0),
          })
        },
      )

      if (subState.cancelled) {
        void unsubscribe()
        return
      }

      const existing = this.subscriptions.get(listenerGuid) ?? []
      this.subscriptions.set(listenerGuid, [
        ...existing,
        () => {
          subState.cancelled = true
          return unsubscribe()
        },
      ])
    } catch (error) {
      console.warn('Alor WS candles: ошибка подписки', error)
    }
  }

  private async fetchBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: DatafeedErrorCallback,
  ): Promise<void> {
    try {
      const api = await ensureAlorAccessToken()
      const symbol = bareSymbol(symbolInfo.ticker || symbolInfo.name)
      const historySymbol = symbol.includes('/') ? symbol.split('/')[0]!.trim() : symbol
      const exchange = resolveExchange(symbolInfo.ticker || symbolInfo.name, symbolInfo.exchange || 'MOEX')
      const fromSec = Math.max(periodParams.from, 0)
      const toSec = Math.max(periodParams.to, 1)
      const tf = mapResolutionToAlorTf(resolution)

      const result = await api.instruments.getHistory({
        symbol: historySymbol,
        exchange,
        tf: tf as '60' | '300' | '3600' | 'D' | 'W' | 'M' | 'Y',
        from: fromSec,
        to: toSec,
        format: 'Simple',
      })

      const history = result.history ?? []
      if (history.length === 0) {
        onResult([], { noData: true })
        return
      }

      const toMs = toSec * 1000
      const fromMs = fromSec * 1000
      const bars: Bar[] = history
        .map((candle) => {
          const timeMs = candleTimeToMs(Number(candle.time))
          return {
            time: timeMs,
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
            volume: Number(candle.volume ?? 0),
          }
        })
        .filter((bar) => Number.isFinite(bar.time) && bar.time < toMs)
        .sort((a, b) => a.time - b.time)

      let filtered = bars
      if (!periodParams.firstDataRequest) {
        filtered = bars.filter((bar) => bar.time >= fromMs)
      }

      if (filtered.length === 0) {
        onResult([], { noData: true })
        return
      }

      if (periodParams.firstDataRequest) {
        const last = filtered[filtered.length - 1]
        this.lastBarTimeMs.set(this.barKey(symbol, resolution), last.time)
      }

      onResult(filtered, { noData: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onError(message)
    }
  }
}
