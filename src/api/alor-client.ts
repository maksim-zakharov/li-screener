import {
  AlorApi,
  AuthEndpoint,
  Endpoint,
  WssEndpoint,
  WssEndpointBeta,
} from 'alor-api'
import { isAlorJwtExpiringSoon } from '@/api/shared-ws/alor-auth'
import {
  isAlorSharedEnabled,
  syncAlorSharedAuth,
  warmAlorSharedWorker,
} from '@/api/shared-ws/alor-shared-bridge'

let alorApi: AlorApi | null = null
let boundToken: string | null = null
/** Single-flight для oauth refresh (tab fallback без SharedWorker). */
let refreshInFlight: Promise<void> | null = null
let accessListenerBound = false

/**
 * Читает Alor refresh token из localStorage (как в smartmoney-client).
 */
export function getAlorRefreshToken(): string | null {
  const token = localStorage.getItem('token')?.trim()
  return token || null
}

/** Событие смены Alor-токена в этой вкладке. */
export const ALOR_TOKEN_CHANGED_EVENT = 'alor-token-changed'

function bindAccessTokenListener(): void {
  if (accessListenerBound || typeof window === 'undefined') return
  accessListenerBound = true
  window.addEventListener('alor-access-token-updated', ((event: CustomEvent<{ accessToken: string }>) => {
    const access = event.detail?.accessToken?.trim()
    if (!access || !alorApi) return
    alorApi.accessToken = access
    alorApi.http.defaults.headers.common['Authorization'] = `Bearer ${access}`
  }) as EventListener)
}

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
  syncAlorSharedAuth({
    refreshToken: trimmed || null,
    accessToken: trimmed ? localStorage.getItem('accessToken') : null,
  })
  window.dispatchEvent(new Event(ALOR_TOKEN_CHANGED_EVENT))
}

/**
 * Синглтон AlorApi. Токен — `localStorage.token`.
 * При смене токена пересоздаёт клиент.
 *
 * Auth refresh в web — через SharedWorker (шаринг между вкладками);
 * tab fallback — proactive `refreshToken()` если SW недоступен.
 */
export function getAlorApi(): AlorApi {
  const token = getAlorRefreshToken()
  if (!token) {
    throw new Error('Нужен localStorage.token (Alor refresh token)')
  }

  bindAccessTokenListener()
  warmAlorSharedWorker()

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
    // После 401 interceptor кладёт новый access сюда — сохраняем + в SW.
    alorApi.onAuthCallback = (accessToken: string) => {
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken)
        syncAlorSharedAuth({ refreshToken: token, accessToken })
      }
    }
    boundToken = token
    syncAlorSharedAuth({ refreshToken: token, accessToken: savedAccess ?? null })
  }

  return alorApi
}

/**
 * Готовит AlorApi с валидным access.
 * При SharedWorker access обновляется из worker (`authUpdated`);
 * без SW — tab refresh как раньше.
 */
export async function ensureAlorAccessToken(): Promise<AlorApi> {
  const api = getAlorApi()

  const needsRefresh = (token: string | null | undefined): boolean =>
    !token || isAlorJwtExpiringSoon(token)

  if (isAlorSharedEnabled()) {
    // SW сам refresh'ит; ждём свежий access из localStorage / события.
    const access = localStorage.getItem('accessToken')?.trim()
    if (!needsRefresh(access)) {
      api.accessToken = access!
      api.http.defaults.headers.common['Authorization'] = `Bearer ${access}`
      return api
    }
    // Форсим sync — worker сделает ensureAccessToken.
    syncAlorSharedAuth({
      refreshToken: getAlorRefreshToken(),
      accessToken: access ?? null,
    })
    // Короткое ожидание authUpdated (до 1.5с).
    const fresh = await waitForAccessToken(1500)
    if (fresh && !needsRefresh(fresh)) {
      api.accessToken = fresh
      api.http.defaults.headers.common['Authorization'] = `Bearer ${fresh}`
      return api
    }
  }

  if (!needsRefresh(api.accessToken)) {
    if (api.accessToken) {
      api.http.defaults.headers.common['Authorization'] = `Bearer ${api.accessToken}`
    }
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
        syncAlorSharedAuth({
          refreshToken: getAlorRefreshToken(),
          accessToken: access,
        })
      }
    })().finally(() => {
      refreshInFlight = null
    })
  }

  await refreshInFlight
  return api
}

/**
 * Ждёт `alor-access-token-updated` или появления свежего access в localStorage.
 */
function waitForAccessToken(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const existing = localStorage.getItem('accessToken')?.trim()
    if (existing && !isAlorJwtExpiringSoon(existing)) {
      resolve(existing)
      return
    }
    let done = false
    const finish = (token: string | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      window.removeEventListener('alor-access-token-updated', onEvent as EventListener)
      resolve(token)
    }
    const onEvent = (event: CustomEvent<{ accessToken: string }>) => {
      const token = event.detail?.accessToken?.trim()
      if (token) finish(token)
    }
    const timer = window.setTimeout(() => {
      const late = localStorage.getItem('accessToken')?.trim() || null
      finish(late && !isAlorJwtExpiringSoon(late) ? late : null)
    }, timeoutMs)
    window.addEventListener('alor-access-token-updated', onEvent as EventListener)
  })
}
