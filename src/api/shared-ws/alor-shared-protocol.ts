/**
 * Протокол Tab ↔ SharedWorker для Alor (auth + REST + WS candles/quotes).
 */

/** Имя SharedWorker (менять при несовместимых правках). */
export const ALOR_SHARED_WORKER_NAME = 'li-screener-alor-v1'

/** Биржа Alor. */
export type AlorSharedExchange = 'MOEX' | 'SPBX'

/** RPC REST-методы в SharedWorker. */
export type AlorSharedRpcMethod =
  | 'getHistory'
  | 'getQuotes'
  | 'getSecurities'
  | 'getSecurity'

/** Параметры getHistory. */
export interface AlorSharedHistoryParams {
  /** Тикер. */
  symbol: string
  /** Биржа. */
  exchange: AlorSharedExchange
  /** ТФ Alor (сек / D/W/…). */
  tf: string
  /** from unix sec. */
  from: number
  /** to unix sec. */
  to: number
}

/** Параметры getQuotes. */
export interface AlorSharedQuotesParams {
  /** `MOEX:SBER,SPBX:…` как в Alor getQuotes. */
  symbols: string
}

/** Параметры getSecurities (search). */
export interface AlorSharedSecuritiesParams {
  /** Query. */
  query: string
  /** Биржа. */
  exchange: AlorSharedExchange
  /** Лимит. */
  limit: number
  /** Сектор (опционально). */
  sector?: string
}

/** Параметры getSecurity. */
export interface AlorSharedSecurityParams {
  /** Тикер. */
  symbol: string
  /** Биржа. */
  exchange: AlorSharedExchange
}

/** Параметры подписки на свечи. */
export interface AlorSharedCandleSubParams {
  /** Тикер. */
  code: string
  /** Биржа. */
  exchange: AlorSharedExchange
  /** ТФ Alor. */
  tf: string
  /** from unix sec. */
  from: number
}

/** Параметры подписки на quotes. */
export interface AlorSharedQuoteSubParams {
  /** Тикер. */
  code: string
  /** Биржа. */
  exchange: AlorSharedExchange
}

/** Tab → Worker */
export type AlorSharedTabMessage =
  | {
      type: 'setAuth'
      /** Refresh token. */
      refreshToken: string
      /** Access token (опционально). */
      accessToken?: string | null
    }
  | { type: 'clearAuth' }
  | { type: 'goodbye' }
  | { type: 'ping' }
  | {
      type: 'rpc'
      /** Id запроса. */
      requestId: string
      /** Метод. */
      method: AlorSharedRpcMethod
      /** Параметры. */
      params:
        | AlorSharedHistoryParams
        | AlorSharedQuotesParams
        | AlorSharedSecuritiesParams
        | AlorSharedSecurityParams
    }
  | {
      type: 'subscribe'
      /** Id подписки на стороне вкладки. */
      subId: string
      /** kind. */
      kind: 'candles' | 'quotes'
      /** Параметры. */
      params: AlorSharedCandleSubParams | AlorSharedQuoteSubParams
    }
  | {
      type: 'unsubscribe'
      /** Id подписки. */
      subId: string
    }

/** Worker → Tab */
export type AlorSharedWorkerMessage =
  | { type: 'ready' }
  | {
      type: 'authUpdated'
      /** Новый accessToken. */
      accessToken: string
    }
  | {
      type: 'authError'
      /** Сообщение. */
      message: string
    }
  | {
      type: 'rpcResult'
      requestId: string
      ok: true
      /** Тело (уже JSON-совместимо). */
      data: unknown
    }
  | {
      type: 'rpcResult'
      requestId: string
      ok: false
      error: string
    }
  | {
      type: 'event'
      /** subId вкладки. */
      subId: string
      /** Payload свечи / quote. */
      data: unknown
    }
  | {
      type: 'subError'
      subId: string
      error: string
    }
  | { type: 'error'; message: string }

/**
 * Ключ комнаты свечей (refcount в worker).
 */
export function buildAlorCandleRoomKey(params: AlorSharedCandleSubParams): string {
  return `candles:${params.exchange}:${params.code}:${params.tf}`
}

/**
 * Ключ комнаты quotes.
 */
export function buildAlorQuoteRoomKey(params: AlorSharedQuoteSubParams): string {
  return `quotes:${params.exchange}:${params.code}`
}
