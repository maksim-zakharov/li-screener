import {
  AlorApi,
  AuthEndpoint,
  Endpoint,
  WssEndpoint,
  WssEndpointBeta,
} from 'alor-api'

let alorApi: AlorApi | null = null
let boundToken: string | null = null
/** Single-flight для oauth refresh. */
let refreshInFlight: Promise<void> | null = null

/**
 * Читает Alor refresh token из localStorage (как в smartmoney-client).
 */
export function getAlorRefreshToken(): string | null {
  const token = localStorage.getItem('token')?.trim()
  return token || null
}

/** Событие смены Alor-токена в этой вкладке. */
export const ALOR_TOKEN_CHANGED_EVENT = 'alor-token-changed'

/**
 * Сохраняет refresh token в `localStorage.token` и сбрасывает синглтон AlorApi.
 */
export function setAlorRefreshToken(token: string | null): void {
  const trimmed = token?.trim() || ''
  if (trimmed) {
    localStorage.setItem('token', trimmed)
  } else {
    localStorage.removeItem('token')
    localStorage.removeItem('accessToken')
  }
  alorApi = null
  boundToken = null
  refreshInFlight = null
  window.dispatchEvent(new Event(ALOR_TOKEN_CHANGED_EVENT))
}

/**
 * JWT access скоро истечёт (или битый) — нужен oauth refresh.
 * Без токена → true (надо получить).
 */
function isAccessTokenExpiringSoon(token: string | null | undefined, skewSec = 60): boolean {
  if (!token) {
    return true
  }
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) {
      return true
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number
    }
    const exp = Number(payload.exp)
    if (!Number.isFinite(exp)) {
      return true
    }
    return exp * 1000 <= Date.now() + skewSec * 1000
  } catch {
    return true
  }
}

/**
 * Синглтон AlorApi. Токен — `localStorage.token`.
 * При смене токена пересоздаёт клиент.
 *
 * Refresh access: interceptor alor-api только на HTTP 401 (не на 404/400).
 * Плюс proactive `refreshToken()` если access нет / скоро истечёт.
 */
export function getAlorApi(): AlorApi {
  const token = getAlorRefreshToken()
  if (!token) {
    throw new Error('Нужен localStorage.token (Alor refresh token)')
  }

  if (!alorApi || boundToken !== token) {
    const savedAccess = localStorage.getItem('accessToken')?.trim() || undefined
    alorApi = new AlorApi({
      token,
      accessToken: savedAccess,
      authEndpoint: AuthEndpoint.PROD,
      endpoint: Endpoint.PROD,
      wssEndpoint: WssEndpoint.PROD,
      wssEndpointBeta: WssEndpointBeta.PROD,
      // OAuth: oauth.alor.ru/refresh — не lk-api.alor.ru
      refreshType: 'dev',
    })
    if (savedAccess) {
      alorApi.accessToken = savedAccess
      alorApi.http.defaults.headers.common['Authorization'] = `Bearer ${savedAccess}`
    }
    // После 401 interceptor кладёт новый access сюда — сохраняем.
    alorApi.onAuthCallback = (accessToken: string) => {
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken)
      }
    }
    boundToken = token
  }

  return alorApi
}

/**
 * Готовит AlorApi с валидным access.
 * Oauth refresh — только если access нет / истекает; иначе interceptor на 401.
 * Не вызывать `api.refresh()` (это retry-очередь interceptor) — только `refreshToken()`.
 */
export async function ensureAlorAccessToken(): Promise<AlorApi> {
  const api = getAlorApi()

  if (!isAccessTokenExpiringSoon(api.accessToken)) {
    api.http.defaults.headers.common['Authorization'] = `Bearer ${api.accessToken}`
    return api
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const result = await api.refreshToken()
      const access = result?.AccessToken || api.accessToken
      if (access) {
        api.accessToken = access
        api.http.defaults.headers.common['Authorization'] = `Bearer ${access}`
        localStorage.setItem('accessToken', access)
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }

  await refreshInFlight
  return api
}
