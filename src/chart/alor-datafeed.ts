import { Exchange, Format } from 'alor-api'
import type {
  Bar,
  DatafeedConfiguration,
  DatafeedErrorCallback,
  HistoryCallback,
  IBasicDataFeed,
  IDatafeedQuotesApi,
  LibrarySymbolInfo,
  OnReadyCallback,
  PeriodParams,
  QuotesCallback,
  QuotesErrorCallback,
  ResolutionString,
  ResolveCallback,
  SearchSymbolResultItem,
  SearchSymbolsCallback,
  SubscribeBarsCallback,
} from '@/assets/charting_library'
import { ensureAlorAccessToken } from '@/api/alor-client'
import { mapAlorSymbolToQuote } from '@/chart/alor-quotes'
import {
  earliestBarTimeSec,
  mergeSpreadHistory,
  MOEX_SPREAD_MULTIPLE,
  ratioSpreadBar,
  splitSpreadLegs as splitSpreadLegsRaw,
} from '@/chart/alor-spread'

/** Сессия MOEX для TradingView (как в smartmoney chart-session). */
const MOEX_SESSION = '0700-2350|1000-1900:17'
const MOEX_TIMEZONE = 'Europe/Moscow'

/** Поддерживаемые ТФ (Alor tf в секундах: 1 / 5 / 15 / 60 / …). */
const SUPPORTED_RESOLUTIONS = [
  '1S',
  '5S',
  '15S',
  '1',
  '5',
  '15',
  '60',
  '240',
  'D',
  'W',
] as ResolutionString[]

const configurationData: DatafeedConfiguration = {
  supported_resolutions: SUPPORTED_RESOLUTIONS,
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

/** Ноги спреда `A/B` без префиксов биржи. */
function splitSpreadLegs(symbol: string) {
  return splitSpreadLegsRaw(symbol, bareSymbol)
}

type UnsubscribeFn = () => void | Promise<void>
type AlorTf = '15' | '60' | '300' | '3600' | 'D' | 'W' | 'M' | 'Y'

/**
 * Datafeed: история + свечи WS + котировки Watchlist (Alor quotes REST/WS).
 */
export class AlorDatafeed implements IBasicDataFeed, IDatafeedQuotesApi {
  private readonly subscriptions = new Map<string, UnsubscribeFn[]>()
  /** Подписки Quote Session (Watchlist / Details). */
  private readonly quoteSubscriptions = new Map<string, UnsubscribeFn[]>()
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
    this.clearUnsubs(this.subscriptions, listenerGuid)
  }

  /**
   * Снимок котировок для Watchlist / Details / Legend — Alor REST getQuotes.
   */
  getQuotes(symbols: string[], onDataCallback: QuotesCallback, onErrorCallback: QuotesErrorCallback): void {
    void this.fetchQuotesSnapshot(symbols, onDataCallback, onErrorCallback)
  }

  /**
   * Live-котировки Watchlist — Alor WS QuotesSubscribe.
   */
  subscribeQuotes(
    symbols: string[],
    fastSymbols: string[],
    onRealtimeCallback: QuotesCallback,
    listenerGUID: string,
  ): void {
    const subState = { cancelled: false }
    this.quoteSubscriptions.set(listenerGUID, [
      () => {
        subState.cancelled = true
      },
    ])
    void this.startQuotesSubscription(symbols, fastSymbols, onRealtimeCallback, listenerGUID, subState)
  }

  unsubscribeQuotes(listenerGUID: string): void {
    this.clearUnsubs(this.quoteSubscriptions, listenerGUID)
  }

  private clearUnsubs(store: Map<string, UnsubscribeFn[]>, listenerGuid: string): void {
    const unsubs = store.get(listenerGuid)
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
    store.delete(listenerGuid)
  }

  private barKey(symbol: string, resolution: ResolutionString): string {
    return `${symbol}|${resolution}`
  }

  /**
   * REST-снимок: GET /md/v2/Securities/{MOEX:SBER,...}/quotes
   */
  private async fetchQuotesSnapshot(
    symbols: string[],
    onDataCallback: QuotesCallback,
    onErrorCallback: QuotesErrorCallback,
  ): Promise<void> {
    try {
      const api = await ensureAlorAccessToken()
      const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
      if (unique.length === 0) {
        onDataCallback([])
        return
      }

      const alorKeys = unique.map((chartName) => {
        const code = bareSymbol(chartName)
        const exchange = resolveExchange(chartName)
        return { chartName, code, exchange, wire: `${exchange}:${code}` }
      })

      const raw = await api.instruments.getQuotes({
        symbols: alorKeys.map((k) => k.wire).join(','),
        format: 'Simple',
      })
      const list = Array.isArray(raw) ? raw : []

      const byWire = new Map<string, (typeof list)[number]>()
      for (const row of list) {
        const code = String(row.symbol ?? '').trim()
        const ex = String(row.exchange ?? 'MOEX').toUpperCase()
        if (code) {
          byWire.set(`${ex}:${code}`, row)
          byWire.set(code, row)
        }
      }

      onDataCallback(
        alorKeys.map(({ chartName, code, wire }) =>
          mapAlorSymbolToQuote(chartName, byWire.get(wire) ?? byWire.get(code)),
        ),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onErrorCallback(message)
    }
  }

  /**
   * WS QuotesSubscribe на каждый тикер; fastSymbols обновляются в том же потоке.
   */
  private async startQuotesSubscription(
    symbols: string[],
    fastSymbols: string[],
    onRealtimeCallback: QuotesCallback,
    listenerGUID: string,
    subState: { cancelled: boolean },
  ): Promise<void> {
    try {
      const api = await ensureAlorAccessToken()
      if (subState.cancelled) {
        return
      }

      const unique = [...new Set([...symbols, ...fastSymbols].map((s) => s.trim()).filter(Boolean))]
      // Сразу отдать REST-снимок, чтобы Watchlist не ждал первый WS-тик.
      void this.fetchQuotesSnapshot(unique, onRealtimeCallback, () => undefined)

      const unsubs: UnsubscribeFn[] = []
      for (const chartName of unique) {
        const code = bareSymbol(chartName)
        if (!code || code.includes('/')) {
          onRealtimeCallback([mapAlorSymbolToQuote(chartName, null)])
          continue
        }
        const exchange = resolveExchange(chartName)
        try {
          const unsubscribe = await api.subscriptions.quotes(
            {
              code,
              exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
              format: Format.Simple,
            },
            (data) => {
              if (subState.cancelled) {
                return
              }
              onRealtimeCallback([mapAlorSymbolToQuote(chartName, data)])
            },
          )
          if (subState.cancelled) {
            void unsubscribe()
            return
          }
          unsubs.push(() => {
            subState.cancelled = true
            return unsubscribe()
          })
        } catch (error) {
          console.warn(`Alor quotes WS: ошибка подписки ${chartName}`, error)
          onRealtimeCallback([mapAlorSymbolToQuote(chartName, null)])
        }
      }

      if (subState.cancelled) {
        for (const unsub of unsubs) {
          void unsub()
        }
        return
      }

      const existing = this.quoteSubscriptions.get(listenerGUID) ?? []
      this.quoteSubscriptions.set(listenerGUID, [...existing, ...unsubs])
    } catch (error) {
      console.warn('Alor quotes: ошибка subscribeQuotes', error)
    }
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
   * Синтетический LibrarySymbolInfo для `A/B` (как smartmoney для isSentetic).
   * Не зависит от Alor securities — иначе TV пишет «такого инструмента не существует».
   */
  private buildSpreadSymbolInfo(
    symbol: string,
    legs: { left: string; right: string },
    exchange: 'MOEX' | 'SPBX',
    currency = 'RUB',
  ): LibrarySymbolInfo {
    /** Как DEFAULT_CHART_PRECISION на фронте для спредов. */
    const precision = 3
    const pricescale = 10 ** precision
    return {
      ticker: symbol,
      name: symbol,
      description: `(${legs.left}/${legs.right})×${MOEX_SPREAD_MULTIPLE}`,
      type: 'spread',
      session: MOEX_SESSION,
      timezone: MOEX_TIMEZONE,
      exchange,
      listed_exchange: exchange,
      currency_code: currency,
      format: 'price',
      pricescale,
      minmov: 1,
      has_intraday: true,
      has_daily: true,
      has_seconds: true,
      seconds_multipliers: ['1', '5', '15'],
      has_weekly_and_monthly: true,
      supported_resolutions: SUPPORTED_RESOLUTIONS,
      volume_precision: 0,
      data_status: 'streaming',
    }
  }

  /**
   * Resolve: одиночный — Alor security; спред `A/B` — всегда синтетика (ноги для history/WS).
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

    const legs = splitSpreadLegs(symbol)
    const exchange = resolveExchange(symbolName)

    if (legs) {
      let currency = 'RUB'
      try {
        const api = await ensureAlorAccessToken()
        const security = await api.instruments
          .getSecurityByExchangeAndSymbol({
            symbol: legs.left,
            exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
            format: 'Simple',
          })
          .catch(() => null)
        if (security?.currency) {
          currency = String(security.currency)
        }
      } catch (error) {
        console.warn(`Alor resolve spread ${symbol}:`, error)
      }
      onResolve(this.buildSpreadSymbolInfo(symbol, legs, exchange, currency))
      return
    }

    try {
      const api = await ensureAlorAccessToken()
      const security = await api.instruments.getSecurityByExchangeAndSymbol({
        symbol,
        exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
        format: 'Simple',
      })

      const minstep = Number(security.minstep ?? 0.01)
      const step = Number.isFinite(minstep) && minstep > 0 ? minstep : 0.01
      const precision = getPrecision(step)
      const pricescale = Number((10 ** precision).toFixed(precision))

      const info: LibrarySymbolInfo = {
        ticker: symbol,
        name: String(security.shortname ?? symbol),
        description: String(security.description ?? security.shortname ?? symbol),
        type: normalizeSearchType(security.type, exchange),
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
        seconds_multipliers: ['1', '5', '15'],
        has_weekly_and_monthly: true,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
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
      const alorExchange = exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX
      const key = this.barKey(symbol, resolution)
      const tf = mapResolutionToAlorTf(resolution) as AlorTf
      const lastMs = this.lastBarTimeMs.get(key)
      // Без from Alor льёт историю → TV сбрасывает кэш и снова getBars (цикл).
      const fromSec = lastMs
        ? Math.floor(lastMs / 1000)
        : Math.floor(Date.now() / 1000) - Math.max(Number(tf) || 60, 60)

      const legs = splitSpreadLegs(symbol)
      if (legs) {
        const lastLeft: { bar: Bar | null } = { bar: null }
        const lastRight: { bar: Bar | null } = { bar: null }

        const emitSpread = () => {
          if (subState.cancelled || !lastLeft.bar || !lastRight.bar) {
            return
          }
          // Как на фронте для MOEX: только совпадающий time.
          if (lastLeft.bar.time !== lastRight.bar.time) {
            return
          }
          const spread = ratioSpreadBar(lastLeft.bar, lastRight.bar, MOEX_SPREAD_MULTIPLE)
          if (!spread) {
            return
          }
          const knownLast = this.lastBarTimeMs.get(key)
          if (knownLast != null && spread.time < knownLast) {
            return
          }
          this.lastBarTimeMs.set(key, spread.time)
          onTick(spread)
        }

        const toBar = (data: {
          time?: number
          open?: number
          high?: number
          low?: number
          close?: number
          volume?: number
        }): Bar | null => {
          const timeMs = candleTimeToMs(Number(data.time))
          if (!(timeMs > 0)) {
            return null
          }
          return {
            time: timeMs,
            open: Number(data.open),
            high: Number(data.high),
            low: Number(data.low),
            close: Number(data.close),
            volume: Number(data.volume ?? 0),
          }
        }

        const [unsubLeft, unsubRight] = await Promise.all([
          api.subscriptions.candles(
            { code: legs.left, exchange: alorExchange, format: Format.Simple, tf, from: fromSec },
            (data) => {
              if (subState.cancelled || !data) {
                return
              }
              const bar = toBar(data)
              if (!bar) {
                return
              }
              lastLeft.bar = bar
              emitSpread()
            },
          ),
          api.subscriptions.candles(
            { code: legs.right, exchange: alorExchange, format: Format.Simple, tf, from: fromSec },
            (data) => {
              if (subState.cancelled || !data) {
                return
              }
              const bar = toBar(data)
              if (!bar) {
                return
              }
              lastRight.bar = bar
              emitSpread()
            },
          ),
        ])

        if (subState.cancelled) {
          void unsubLeft()
          void unsubRight()
          return
        }

        const existing = this.subscriptions.get(listenerGuid) ?? []
        this.subscriptions.set(listenerGuid, [
          ...existing,
          () => {
            subState.cancelled = true
            return unsubLeft()
          },
          () => unsubRight(),
        ])
        return
      }

      const unsubscribe = await api.subscriptions.candles(
        {
          code: symbol,
          exchange: alorExchange,
          format: Format.Simple,
          tf,
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

  private async fetchHistoryBars(
    symbol: string,
    exchange: 'MOEX' | 'SPBX',
    tf: string,
    fromSec: number,
    toSec: number,
  ): Promise<Bar[]> {
    const api = await ensureAlorAccessToken()
    const result = await api.instruments.getHistory({
      symbol,
      exchange,
      tf: tf as AlorTf,
      from: fromSec,
      to: toSec,
      format: 'Simple',
    })
    const toMs = toSec * 1000
    return (result.history ?? [])
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
      .filter((bar) => Number.isFinite(bar.time) && bar.time <= toMs)
      .sort((a, b) => a.time - b.time)
  }

  private async fetchBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: PeriodParams,
    onResult: HistoryCallback,
    onError: DatafeedErrorCallback,
  ): Promise<void> {
    try {
      // Как на фронте: на первом запросе to=now — иначе TV тащит stale to от прошлого символа.
      const effectiveParams: PeriodParams = periodParams.firstDataRequest
        ? { ...periodParams, to: Math.floor(Date.now() / 1000) }
        : periodParams

      const symbol = bareSymbol(symbolInfo.ticker || symbolInfo.name)
      const exchange = resolveExchange(symbolInfo.ticker || symbolInfo.name, symbolInfo.exchange || 'MOEX')
      const fromSec = Math.max(effectiveParams.from, 0)
      const toSec = Math.max(effectiveParams.to, 1)
      const tf = mapResolutionToAlorTf(resolution)
      const fromMs = fromSec * 1000
      const legs = splitSpreadLegs(symbol)

      let bars: Bar[]
      let nextTime: number | undefined
      if (legs) {
        const [leftBars, rightBars] = await Promise.all([
          this.fetchHistoryBars(legs.left, exchange, tf, fromSec, toSec).catch((err) => {
            console.warn(`Alor history ${legs.left}:`, err)
            return [] as Bar[]
          }),
          this.fetchHistoryBars(legs.right, exchange, tf, fromSec, toSec).catch((err) => {
            console.warn(`Alor history ${legs.right}:`, err)
            return [] as Bar[]
          }),
        ])
        bars = mergeSpreadHistory(leftBars, rightBars, MOEX_SPREAD_MULTIPLE)
        if (bars.length === 0) {
          nextTime = earliestBarTimeSec([leftBars, rightBars])
          console.warn(
            `Alor spread ${symbol}: left=${leftBars.length} right=${rightBars.length} merged=0`,
          )
        }
      } else {
        bars = await this.fetchHistoryBars(symbol, exchange, tf, fromSec, toSec)
      }

      let filtered = bars
      if (!effectiveParams.firstDataRequest) {
        filtered = bars.filter((bar) => bar.time >= fromMs)
      }

      if (filtered.length === 0) {
        onResult([], {
          noData: true,
          nextTime: nextTime ?? (fromSec > 0 ? fromSec : undefined),
        })
        return
      }

      if (effectiveParams.firstDataRequest) {
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
