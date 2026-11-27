import { Exchange, Format, type Symbol as AlorSymbol } from 'alor-api'
import { ensureAlorAccessToken } from '@/api/alor-client'

type QuoteListener = (quote: AlorSymbol) => void

interface QuotesRoom {
  /** Слушатели вкладки */
  listeners: Set<QuoteListener>
  /** Отписка Alor WS (одна на комнату) */
  unsubscribe: (() => void | Promise<void>) | null
  /** Старт подписки in-flight */
  starting: Promise<void> | null
  /** Последняя котировка */
  last: AlorSymbol | null
}

const rooms = new Map<string, QuotesRoom>()

function roomKey(exchange: string, code: string): string {
  return `${exchange.toUpperCase()}:${code.trim().toUpperCase()}`
}

/**
 * Одна WS QuotesSubscribe на (exchange, code) во вкладке; refcount слушателей.
 * @returns unsubscribe слушателя (не обязательно снимает WS)
 */
export function subscribeAlorQuotes(
  code: string,
  exchange: 'MOEX' | 'SPBX',
  onData: QuoteListener,
): () => void {
  const trimmed = code.trim()
  if (!trimmed) {
    return () => undefined
  }
  const key = roomKey(exchange, trimmed)
  let room = rooms.get(key)
  if (!room) {
    room = { listeners: new Set(), unsubscribe: null, starting: null, last: null }
    rooms.set(key, room)
  }
  room.listeners.add(onData)
  if (room.last) {
    try {
      onData(room.last)
    } catch {
      // ignore
    }
  }
  if (!room.unsubscribe && !room.starting) {
    room.starting = startRoom(key, trimmed, exchange, room).finally(() => {
      if (room) {
        room.starting = null
      }
    })
  }

  return () => {
    const current = rooms.get(key)
    if (!current) {
      return
    }
    current.listeners.delete(onData)
    if (current.listeners.size > 0) {
      return
    }
    const unsub = current.unsubscribe
    current.unsubscribe = null
    current.last = null
    rooms.delete(key)
    if (unsub) {
      void Promise.resolve(unsub()).catch((err) => {
        console.warn('Alor quotes hub: ошибка отписки', key, err)
      })
    }
  }
}

/**
 * REST-снимок котировок по кодам (дедуп), обновляет кэш комнат.
 */
export async function fetchAlorQuotesSnapshot(
  codes: readonly string[],
  exchange: 'MOEX' | 'SPBX' = 'MOEX',
): Promise<Map<string, AlorSymbol>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  const out = new Map<string, AlorSymbol>()
  if (unique.length === 0) {
    return out
  }
  const api = await ensureAlorAccessToken()
  const wire = unique.map((code) => `${exchange}:${code}`).join(',')
  const raw = await api.instruments.getQuotes({ symbols: wire, format: 'Simple' })
  const list = Array.isArray(raw) ? raw : []
  for (const row of list) {
    const code = String(row.symbol ?? '').trim()
    if (!code) {
      continue
    }
    out.set(code, row)
    const key = roomKey(exchange, code)
    const room = rooms.get(key)
    if (room) {
      room.last = row
    }
  }
  return out
}

async function startRoom(
  key: string,
  code: string,
  exchange: 'MOEX' | 'SPBX',
  room: QuotesRoom,
): Promise<void> {
  try {
    const api = await ensureAlorAccessToken()
    if (!rooms.has(key) || room.listeners.size === 0) {
      return
    }
    const unsubscribe = await api.subscriptions.quotes(
      {
        code,
        exchange: exchange === 'SPBX' ? Exchange.SPBX : Exchange.MOEX,
        format: Format.Simple,
      },
      (data) => {
        if (!data || !rooms.has(key)) {
          return
        }
        const current = rooms.get(key)
        if (!current) {
          return
        }
        current.last = data
        for (const listener of [...current.listeners]) {
          try {
            listener(data)
          } catch (err) {
            console.warn('Alor quotes hub: ошибка listener', key, err)
          }
        }
      },
    )
    if (!rooms.has(key) || room.listeners.size === 0) {
      void unsubscribe()
      return
    }
    room.unsubscribe = unsubscribe
  } catch (err) {
    console.warn('Alor quotes hub: ошибка подписки', key, err)
  }
}
