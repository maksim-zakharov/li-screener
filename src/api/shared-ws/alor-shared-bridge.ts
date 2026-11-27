/**
 * Tab ↔ SharedWorker bridge для Alor (auth / REST / WS).
 */
import {
  ALOR_SHARED_WORKER_NAME,
  type AlorSharedCandleSubParams,
  type AlorSharedHistoryParams,
  type AlorSharedQuotesParams,
  type AlorSharedQuoteSubParams,
  type AlorSharedRpcMethod,
  type AlorSharedSecuritiesParams,
  type AlorSharedSecurityParams,
  type AlorSharedTabMessage,
  type AlorSharedWorkerMessage,
} from './alor-shared-protocol'

interface PendingRpc {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
}

interface PendingSub {
  onData: (data: unknown) => void
  onError?: (message: string) => void
}

let worker: SharedWorker | null = null
let port: MessagePort | null = null
let ready = false
let nextRequestId = 1
let nextSubId = 1
const pendingOutbox: AlorSharedTabMessage[] = []
const pendingRpc = new Map<string, PendingRpc>()
const pendingSubs = new Map<string, PendingSub>()
let initTried = false
let initFailed = false
let pageHideBound = false
let readyTimeoutId: ReturnType<typeof setTimeout> | null = null
const READY_TIMEOUT_MS = 4000

function canUseSharedWorker(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof SharedWorker === 'undefined') return false
  return true
}

/** Доступен ли Alor SharedWorker. */
export function isAlorSharedEnabled(): boolean {
  return canUseSharedWorker() && !initFailed
}

function notifyInitFailed(reason: string): void {
  if (initFailed) return
  initFailed = true
  console.warn('[AlorShared]', reason)
  if (readyTimeoutId != null) {
    clearTimeout(readyTimeoutId)
    readyTimeoutId = null
  }
  for (const [, pending] of pendingRpc) {
    pending.reject(new Error(reason))
  }
  pendingRpc.clear()
  for (const [, sub] of pendingSubs) {
    sub.onError?.(reason)
  }
}

function bindPageHideCleanup(): void {
  if (pageHideBound || typeof window === 'undefined') return
  pageHideBound = true
  window.addEventListener('pagehide', () => {
    if (!port) return
    try {
      port.postMessage({ type: 'goodbye' } satisfies AlorSharedTabMessage)
    } catch {
      // ignore
    }
  })
}

function post(msg: AlorSharedTabMessage): void {
  if (!port) {
    pendingOutbox.push(msg)
    return
  }
  if (!ready && msg.type !== 'setAuth' && msg.type !== 'clearAuth' && msg.type !== 'ping') {
    pendingOutbox.push(msg)
    return
  }
  try {
    port.postMessage(msg)
  } catch (err) {
    notifyInitFailed(
      `Alor SharedWorker postMessage failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

function flushOutbox(): void {
  if (!port || !ready) return
  while (pendingOutbox.length) {
    const msg = pendingOutbox.shift()
    if (!msg) break
    try {
      port.postMessage(msg)
    } catch (err) {
      notifyInitFailed(
        `Alor SharedWorker flush outbox failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      return
    }
  }
}

function applyAccessTokenFromWorker(accessToken: string): void {
  const trimmed = accessToken.trim()
  if (!trimmed) return
  try {
    localStorage.setItem('accessToken', trimmed)
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent('alor-access-token-updated', { detail: { accessToken: trimmed } }),
  )
}

function handleWorkerMessage(msg: AlorSharedWorkerMessage): void {
  switch (msg.type) {
    case 'ready':
      ready = true
      if (readyTimeoutId != null) {
        clearTimeout(readyTimeoutId)
        readyTimeoutId = null
      }
      flushOutbox()
      syncAlorSharedAuth()
      return
    case 'authUpdated':
      applyAccessTokenFromWorker(msg.accessToken)
      return
    case 'authError':
      console.warn('[AlorShared] auth refresh:', msg.message)
      return
    case 'rpcResult': {
      const pending = pendingRpc.get(msg.requestId)
      if (!pending) return
      pendingRpc.delete(msg.requestId)
      if (msg.ok) {
        pending.resolve(msg.data)
      } else {
        pending.reject(new Error(msg.error))
      }
      return
    }
    case 'event': {
      const sub = pendingSubs.get(msg.subId)
      sub?.onData(msg.data)
      return
    }
    case 'subError': {
      const sub = pendingSubs.get(msg.subId)
      sub?.onError?.(msg.error)
      return
    }
    case 'error':
      console.warn('[AlorShared]', msg.message)
      return
    default:
      return
  }
}

function ensureWorker(): boolean {
  if (initFailed) return false
  if (!canUseSharedWorker()) {
    initFailed = true
    return false
  }
  if (port && worker) return true
  if (initTried && !port) {
    initFailed = true
    return false
  }
  initTried = true
  try {
    worker = new SharedWorker(new URL('./alor.shared-worker.ts', import.meta.url), {
      type: 'module',
      name: ALOR_SHARED_WORKER_NAME,
    })
    port = worker.port
    port.onmessage = (ev: MessageEvent<AlorSharedWorkerMessage>) => {
      handleWorkerMessage(ev.data)
    }
    port.onmessageerror = () => {
      notifyInitFailed('Alor SharedWorker port messageerror')
    }
    worker.onerror = (ev) => {
      notifyInitFailed(`Alor SharedWorker script error: ${ev?.message ?? 'unknown'}`)
    }
    port.start()
    bindPageHideCleanup()
    readyTimeoutId = setTimeout(() => {
      if (!ready) {
        notifyInitFailed(
          `Alor SharedWorker не прислал ready за ${READY_TIMEOUT_MS}ms — fallback на вкладку`,
        )
      }
    }, READY_TIMEOUT_MS)
    return true
  } catch (err) {
    notifyInitFailed(
      `Alor SharedWorker недоступен: ${err instanceof Error ? err.message : String(err)}`,
    )
    return false
  }
}

/**
 * Отправляет refresh/access в SharedWorker.
 */
export function syncAlorSharedAuth(params?: {
  refreshToken?: string | null
  accessToken?: string | null
}): void {
  if (!ensureWorker() || !port) return
  const refreshToken =
    params?.refreshToken !== undefined ? params.refreshToken : localStorage.getItem('token')
  const accessToken =
    params?.accessToken !== undefined ? params.accessToken : localStorage.getItem('accessToken')
  const trimmedRefresh = refreshToken?.trim() || ''
  if (!trimmedRefresh) {
    post({ type: 'clearAuth' })
    return
  }
  post({
    type: 'setAuth',
    refreshToken: trimmedRefresh,
    accessToken: accessToken?.trim() || null,
  })
}

function rpc<T>(
  method: AlorSharedRpcMethod,
  params:
    | AlorSharedHistoryParams
    | AlorSharedQuotesParams
    | AlorSharedSecuritiesParams
    | AlorSharedSecurityParams,
): Promise<T> | null {
  if (!ensureWorker()) return null
  const requestId = `r${nextRequestId++}`
  return new Promise<T>((resolve, reject) => {
    pendingRpc.set(requestId, {
      resolve: (data) => resolve(data as T),
      reject,
    })
    post({ type: 'rpc', requestId, method, params })
  })
}

/**
 * REST через SharedWorker; `null` — SW недоступен (tab fallback).
 */
export function alorSharedRpc<T>(
  method: AlorSharedRpcMethod,
  params:
    | AlorSharedHistoryParams
    | AlorSharedQuotesParams
    | AlorSharedSecuritiesParams
    | AlorSharedSecurityParams,
): Promise<T> | null {
  return rpc<T>(method, params)
}

/**
 * Подписка candles/quotes через SharedWorker.
 * @returns unsubscribe или null если SW недоступен.
 */
export function alorSharedSubscribe(opts: {
  kind: 'candles' | 'quotes'
  params: AlorSharedCandleSubParams | AlorSharedQuoteSubParams
  onData: (data: unknown) => void
  onError?: (message: string) => void
}): (() => void) | null {
  if (!ensureWorker()) return null
  const subId = `s${nextSubId++}`
  pendingSubs.set(subId, { onData: opts.onData, onError: opts.onError })
  post({
    type: 'subscribe',
    subId,
    kind: opts.kind,
    params: opts.params,
  })
  return () => {
    pendingSubs.delete(subId)
    post({ type: 'unsubscribe', subId })
  }
}

/** Прогрев SharedWorker при старте приложения. */
export function warmAlorSharedWorker(): void {
  ensureWorker()
  syncAlorSharedAuth()
}
