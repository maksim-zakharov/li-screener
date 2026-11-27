import {
  AlorApi,
  AuthEndpoint,
  Endpoint,
  WssEndpoint,
  WssEndpointBeta,
} from 'alor-api'

let alorApi: AlorApi | null = null
let boundToken: string | null = null

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
  }
  alorApi = null
  boundToken = null
  window.dispatchEvent(new Event(ALOR_TOKEN_CHANGED_EVENT))
}

/**
 * Синглтон AlorApi. Токен — `localStorage.token`.
 * При смене токена пересоздаёт клиент.
 */
export function getAlorApi(): AlorApi {
  const token = getAlorRefreshToken()
  if (!token) {
    throw new Error('Нужен localStorage.token (Alor refresh token)')
  }

  if (!alorApi || boundToken !== token) {
    alorApi = new AlorApi({
      token,
      authEndpoint: AuthEndpoint.PROD,
      endpoint: Endpoint.PROD,
      wssEndpoint: WssEndpoint.PROD,
      wssEndpointBeta: WssEndpointBeta.PROD,
      // OAuth: oauth.alor.ru/refresh — не lk-api.alor.ru
      refreshType: 'dev',
    })
    boundToken = token
  }

  return alorApi
}

/**
 * Обновляет access token перед запросами истории.
 */
export async function ensureAlorAccessToken(): Promise<AlorApi> {
  const api = getAlorApi()
  await api.refresh()
  return api
}
