/// <reference lib="webworker" />
/**
 * SharedWorker: один AlorApi + oauth refresh + coalesce REST + refcount WS
 * на все вкладки li-screener.
 */
import {
  AlorApi,
  AuthEndpoint,
  Endpoint,
  Exchange,
  Format,
  WssEndpoint,
  WssEndpointBeta,
} from 'alor-api'
import { createAlorAccessTokenRefresher } from './alor-auth'
import {
  ALOR_HISTORY_CACHE_TTL_MS,
  ALOR_QUOTES_CACHE_TTL_MS,
  ALOR_SEARCH_CACHE_TTL_MS,
  AlorReadCache,
} from './alor-read-cache'
import {
  buildAlorCandleRoomKey,
  buildAlorQuoteRoomKey,
  type AlorSharedCandleSubParams,
  type AlorSharedQuoteSubParams,
  type AlorSharedRpcMethod,
  type AlorSharedTabMessage,
  type AlorSharedWorkerMessage,
} from './alor-shared-protocol'

declare const self: SharedWorkerGlobalScope

interface PortState {
  id: string
  port: MessagePort
  /** subId вкладки → roomKey */
  subs: Map<string, string>
}

interface RoomState {
  /** Ключ комнаты. */
  key: string
  /** Порты с их subId. */
  listeners: Map<string, Set<string>>
  /** Unsubscribe Alor SDK. */
  unsubscribe: (() => void | Promise<void>) | null
  /** Идёт acquire. */
  starting: Promise<void> | null
}

const ports = new Map<string, PortState>()
const rooms = new Map<string, RoomState>()
const readCache = new AlorReadCache()
const auth = createAlorAccessTokenRefresher()
let nextPortId = 1
let messageTail: Promise<void> = Promise.resolve()
let alorApi: AlorApi | null = null
let boundRefresh: string | null = null

function post(port: MessagePort, msg: AlorSharedWorkerMessage): void {
  try {
    port.postMessage(msg)
  } catch {
    // ignore closed port
  }
}

function broadcast(msg: AlorSharedWorkerMessage): void {
  for (const ps of ports.values()) {
    post(ps.port, msg)
  }
}

function toExchange(ex: string): Exchange {
  return ex === 'SPBX' ? Exchange.SPBX : Exchange.MOEX
}

async function ensureWorkerAccessToken(force = false): Promise<string | null> {
  const before = auth.getAccessToken()
  try {
    const next = await auth.ensureAccessToken(force)
    if (next && next !== before) {
      broadcast({ type: 'authUpdated', accessToken: next })
      applyTokenToApi(next)
    } else if (next) {
      applyTokenToApi(next)
    }
    return next
  } catch (err) {
    broadcast({
      type: 'authError',
      message: err instanceof Error ? err.message : String(err),
    })
    return auth.getAccessToken()
  }
}

function applyTokenToApi(accessToken: string): void {
  const api = getOrCreateApi()
  if (!api) return
  api.accessToken = accessToken
  if (api.http?.defaults?.headers?.common) {
    api.http.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`
  }
}

function getOrCreateApi(): AlorApi | null {
  const refresh = auth.getRefreshToken()
  if (!refresh) {
    alorApi = null
    boundRefresh = null
    return null
  }
  if (!alorApi || boundRefresh !== refresh) {
    const access = auth.getAccessToken() ?? undefined
    alorApi = new AlorApi({
      token: refresh,
      accessToken: access,
      authEndpoint: AuthEndpoint.PROD,
      endpoint: Endpoint.PROD,
      wssEndpoint: WssEndpoint.PROD,
      wssEndpointBeta: WssEndpointBeta.PROD,
      refreshType: 'dev',
    })
    if (access) {
      alorApi.accessToken = access
      alorApi.http.defaults.headers.common['Authorization'] = `Bearer ${access}`
    }
    alorApi.onAuthCallback = (accessToken: string) => {
      if (!accessToken) return
      auth.setAuth({ refreshToken: refresh, accessToken })
      broadcast({ type: 'authUpdated', accessToken })
    }
    boundRefresh = refresh
  }
  return alorApi
}

async function runRpc(
  method: AlorSharedRpcMethod,
  params: Record<string, unknown>,
): Promise<unknown> {
  await ensureWorkerAccessToken(false)
  const api = getOrCreateApi()
  if (!api) {
    throw new Error('Нет Alor refresh token в SharedWorker')
  }

  switch (method) {
    case 'getHistory': {
      const p = params as {
        symbol: string
        exchange: string
        tf: string
        from: number
        to: number
      }
      const key = `history:${p.exchange}:${p.symbol}:${p.tf}:${p.from}:${p.to}`
      const cached = await readCache.run(key, ALOR_HISTORY_CACHE_TTL_MS, async () => {
        const result = await api.instruments.getHistory({
          symbol: p.symbol,
          exchange: p.exchange === 'SPBX' ? 'SPBX' : 'MOEX',
          tf: p.tf as never,
          from: p.from,
          to: p.to,
          format: 'Simple',
        })
        return { data: result }
      })
      return cached.data
    }
    case 'getQuotes': {
      const p = params as { symbols: string }
      const key = `quotes:${p.symbols}`
      const cached = await readCache.run(key, ALOR_QUOTES_CACHE_TTL_MS, async () => {
        const raw = await api.instruments.getQuotes({
          symbols: p.symbols,
          format: 'Simple',
        })
        return { data: raw }
      })
      return cached.data
    }
    case 'getSecurities': {
      const p = params as {
        query: string
        exchange: string
        limit: number
        sector?: string
      }
      const key = `sec:${p.exchange}:${p.query}:${p.limit}:${p.sector ?? ''}`
      const cached = await readCache.run(key, ALOR_SEARCH_CACHE_TTL_MS, async () => {
        const rows = await api.instruments.getSecurities({
          query: p.query,
          format: 'Simple',
          exchange: p.exchange === 'SPBX' ? 'SPBX' : 'MOEX',
          limit: p.limit,
          ...(p.sector === 'FORTS' || p.sector === 'FOND' || p.sector === 'CURR'
            ? { sector: p.sector }
            : {}),
        })
        return { data: rows }
      })
      return cached.data
    }
    case 'getSecurity': {
      const p = params as { symbol: string; exchange: string }
      const key = `security:${p.exchange}:${p.symbol}`
      const cached = await readCache.run(key, ALOR_SEARCH_CACHE_TTL_MS, async () => {
        const row = await api.instruments.getSecurityByExchangeAndSymbol({
          symbol: p.symbol,
          exchange: p.exchange === 'SPBX' ? 'SPBX' : 'MOEX',
          format: 'Simple',
        })
        return { data: row }
      })
      return cached.data
    }
    default:
      throw new Error(`Неизвестный RPC: ${method}`)
  }
}

function getOrCreateRoom(key: string): RoomState {
  let room = rooms.get(key)
  if (!room) {
    room = { key, listeners: new Map(), unsubscribe: null, starting: null }
    rooms.set(key, room)
  }
  return room
}

function fanoutRoom(roomKey: string, data: unknown): void {
  const room = rooms.get(roomKey)
  if (!room) return
  for (const [portId, subIds] of room.listeners) {
    const ps = ports.get(portId)
    if (!ps) continue
    for (const subId of subIds) {
      post(ps.port, { type: 'event', subId, data })
    }
  }
}

async function startRoom(room: RoomState, kind: 'candles' | 'quotes', params: unknown): Promise<void> {
  if (room.unsubscribe || room.starting) {
    if (room.starting) await room.starting
    return
  }
  room.starting = (async () => {
    await ensureWorkerAccessToken(false)
    const api = getOrCreateApi()
    if (!api) {
      throw new Error('Нет AlorApi для подписки')
    }
    if (kind === 'candles') {
      const p = params as AlorSharedCandleSubParams
      room.unsubscribe = await api.subscriptions.candles(
        {
          code: p.code,
          exchange: toExchange(p.exchange),
          format: Format.Simple,
          tf: p.tf as never,
          from: p.from,
        },
        (data) => {
          fanoutRoom(room.key, data)
        },
      )
    } else {
      const p = params as AlorSharedQuoteSubParams
      room.unsubscribe = await api.subscriptions.quotes(
        {
          code: p.code,
          exchange: toExchange(p.exchange),
          format: Format.Simple,
        },
        (data) => {
          fanoutRoom(room.key, data)
        },
      )
    }
  })()
    .catch((err) => {
      room.unsubscribe = null
      throw err
    })
    .finally(() => {
      room.starting = null
    })
  await room.starting
}

async function stopRoomIfEmpty(roomKey: string): Promise<void> {
  const room = rooms.get(roomKey)
  if (!room) return
  let total = 0
  for (const set of room.listeners.values()) {
    total += set.size
  }
  if (total > 0) return
  rooms.delete(roomKey)
  const unsub = room.unsubscribe
  room.unsubscribe = null
  if (unsub) {
    try {
      await unsub()
    } catch {
      // ignore
    }
  }
}

async function handleSubscribe(
  portState: PortState,
  subId: string,
  kind: 'candles' | 'quotes',
  params: AlorSharedCandleSubParams | AlorSharedQuoteSubParams,
): Promise<void> {
  const roomKey =
    kind === 'candles'
      ? buildAlorCandleRoomKey(params as AlorSharedCandleSubParams)
      : buildAlorQuoteRoomKey(params as AlorSharedQuoteSubParams)

  // Снять предыдущую комнату этого subId.
  const prev = portState.subs.get(subId)
  if (prev && prev !== roomKey) {
    const prevRoom = rooms.get(prev)
    prevRoom?.listeners.get(portState.id)?.delete(subId)
    if (prevRoom?.listeners.get(portState.id)?.size === 0) {
      prevRoom.listeners.delete(portState.id)
    }
    await stopRoomIfEmpty(prev)
  }

  portState.subs.set(subId, roomKey)
  const room = getOrCreateRoom(roomKey)
  let set = room.listeners.get(portState.id)
  if (!set) {
    set = new Set()
    room.listeners.set(portState.id, set)
  }
  set.add(subId)

  try {
    await startRoom(room, kind, params)
  } catch (err) {
    set.delete(subId)
    if (set.size === 0) room.listeners.delete(portState.id)
    portState.subs.delete(subId)
    await stopRoomIfEmpty(roomKey)
    post(portState.port, {
      type: 'subError',
      subId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function handleUnsubscribe(portState: PortState, subId: string): Promise<void> {
  const roomKey = portState.subs.get(subId)
  if (!roomKey) return
  portState.subs.delete(subId)
  const room = rooms.get(roomKey)
  if (room) {
    room.listeners.get(portState.id)?.delete(subId)
    if (room.listeners.get(portState.id)?.size === 0) {
      room.listeners.delete(portState.id)
    }
  }
  await stopRoomIfEmpty(roomKey)
}

function handlePortMessage(portState: PortState, data: AlorSharedTabMessage): void {
  switch (data.type) {
    case 'ping':
      return
    case 'goodbye':
      void detachPort(portState.id)
      return
    case 'setAuth': {
      auth.setAuth({
        refreshToken: data.refreshToken,
        accessToken: data.accessToken,
      })
      const run = async (): Promise<void> => {
        await ensureWorkerAccessToken(false)
      }
      messageTail = messageTail.then(run, run).then(
        () => undefined,
        () => undefined,
      )
      return
    }
    case 'clearAuth':
      auth.clearAuth()
      alorApi = null
      boundRefresh = null
      readCache.clear()
      return
    case 'rpc': {
      const { requestId, method, params } = data
      const port = portState.port
      const run = async (): Promise<void> => {
        try {
          const result = await runRpc(method, params as unknown as Record<string, unknown>)
          post(port, { type: 'rpcResult', requestId, ok: true, data: result })
        } catch (err) {
          post(port, {
            type: 'rpcResult',
            requestId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      messageTail = messageTail.then(run, run).then(
        () => undefined,
        () => undefined,
      )
      return
    }
    case 'subscribe': {
      const { subId, kind, params } = data
      const run = () => handleSubscribe(portState, subId, kind, params)
      messageTail = messageTail.then(run, run).then(
        () => undefined,
        () => undefined,
      )
      return
    }
    case 'unsubscribe': {
      const { subId } = data
      const run = () => handleUnsubscribe(portState, subId)
      messageTail = messageTail.then(run, run).then(
        () => undefined,
        () => undefined,
      )
      return
    }
    default:
      return
  }
}

async function detachPort(portId: string): Promise<void> {
  const ps = ports.get(portId)
  if (!ps) return
  ports.delete(portId)
  const subIds = [...ps.subs.keys()]
  for (const subId of subIds) {
    await handleUnsubscribe(ps, subId)
  }
  try {
    ps.port.close()
  } catch {
    // ignore
  }
}

function onSharedWorkerConnect(event: MessageEvent): void {
  const port = event.ports[0]
  if (!port) return
  const id = `p${nextPortId++}`
  const portState: PortState = { id, port, subs: new Map() }
  ports.set(id, portState)

  port.onmessage = (ev: MessageEvent<AlorSharedTabMessage>) => {
    handlePortMessage(portState, ev.data)
  }
  port.onmessageerror = () => {
    void detachPort(id)
  }
  port.start()
  post(port, { type: 'ready' })
  const current = auth.getAccessToken()
  if (current) {
    post(port, { type: 'authUpdated', accessToken: current })
  }
  console.info('[AlorShared worker] port connected', id)
}

addEventListener('connect', onSharedWorkerConnect as EventListener)
