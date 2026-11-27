import { useEffect, useMemo, useState } from 'react'
import { fetchMoexIssMarginMap, normalizeIssShortname } from '@/arbitrages/moex-iss-margin'

/**
 * ГО (₽/контракт) по кодам ног с MOEX ISS.
 */
export function useLegMargins(codes: string[]): {
  /** code → ГО ₽ */
  marginByCode: Record<string, number | null>
  /** Идёт загрузка */
  loading: boolean
  /** Ошибка загрузки каталога */
  error: string | null
} {
  const key = useMemo(() => codes.join('|'), [codes])
  const [marginByCode, setMarginByCode] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (codes.length === 0) {
      setMarginByCode({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const map = await fetchMoexIssMarginMap()
        if (cancelled) {
          return
        }
        const next: Record<string, number | null> = {}
        for (const code of codes) {
          next[code] = map.get(normalizeIssShortname(code)) ?? null
        }
        setMarginByCode(next)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        console.warn('ГО ISS:', err)
        setError(err instanceof Error ? err.message : String(err))
        setMarginByCode({})
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { marginByCode, loading, error }
}
