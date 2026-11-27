/**
 * Refresh Alor accessToken (oauth.alor.ru) — общий код для SharedWorker и вкладки.
 */

/** Origin OAuth Alor. */
export const ALOR_OAUTH_ORIGIN = 'https://oauth.alor.ru'

/** За сколько секунд до exp считаем accessToken «скоро истечёт». */
export const ALOR_ACCESS_TOKEN_SKEW_SEC = 60

/**
 * JWT accessToken истекает раньше чем через `skewSeconds`.
 * Битый / без exp — false (не форсим refresh по «истёк»).
 */
export function isAlorJwtExpiringSoon(
  token: string,
  skewSeconds: number = ALOR_ACCESS_TOKEN_SKEW_SEC,
): boolean {
  if (!token) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) {
      return false
    }
    const payloadRaw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(payloadRaw)) as { exp?: unknown }
    if (typeof payload.exp !== 'number') {
      return false
    }
    return payload.exp * 1000 - Date.now() < skewSeconds * 1000
  } catch {
    return false
  }
}

/**
 * POST `oauth.alor.ru/refresh?token=…` → AccessToken.
 */
export async function refreshAlorAccessTokenViaOauth(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const trimmed = refreshToken.trim()
  if (!trimmed) {
    throw new Error('Alor refreshToken пуст')
  }
  const url = `${ALOR_OAUTH_ORIGIN}/refresh?token=${encodeURIComponent(trimmed)}`
  const res = await fetchImpl(url, { method: 'POST' })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    const msg =
      data != null && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Alor OAuth HTTP ${res.status}`
    throw new Error(msg)
  }
  const accessToken =
    data != null && typeof data === 'object' && 'AccessToken' in data
      ? String((data as { AccessToken: unknown }).AccessToken ?? '').trim()
      : ''
  if (!accessToken) {
    throw new Error('Alor OAuth не вернул AccessToken')
  }
  return accessToken
}

/**
 * Single-flight обёртка вокруг refresh.
 */
export function createAlorAccessTokenRefresher(fetchImpl: typeof fetch = fetch): {
  /** Текущий accessToken в памяти. */
  getAccessToken: () => string | null
  /** Текущий refreshToken в памяти. */
  getRefreshToken: () => string | null
  /** Обновить креды (из вкладки). */
  setAuth: (params: { refreshToken: string | null; accessToken?: string | null }) => void
  /** Очистить креды. */
  clearAuth: () => void
  /**
   * Вернуть свежий accessToken: при необходимости refresh.
   * `force` — всегда refresh (после 401).
   */
  ensureAccessToken: (force?: boolean) => Promise<string | null>
} {
  let refreshToken: string | null = null
  let accessToken: string | null = null
  let inFlight: Promise<string | null> | null = null

  const setAuth = (params: { refreshToken: string | null; accessToken?: string | null }): void => {
    refreshToken = params.refreshToken?.trim() || null
    if (params.accessToken !== undefined) {
      accessToken = params.accessToken?.trim() || null
    }
  }

  const clearAuth = (): void => {
    refreshToken = null
    accessToken = null
    inFlight = null
  }

  const runRefresh = async (): Promise<string | null> => {
    if (!refreshToken) {
      return accessToken
    }
    const next = await refreshAlorAccessTokenViaOauth(refreshToken, fetchImpl)
    accessToken = next
    return next
  }

  const ensureAccessToken = async (force = false): Promise<string | null> => {
    if (!force && accessToken && !isAlorJwtExpiringSoon(accessToken)) {
      return accessToken
    }
    if (!refreshToken) {
      return accessToken
    }
    if (!inFlight) {
      inFlight = runRefresh().finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    setAuth,
    clearAuth,
    ensureAccessToken,
  }
}
