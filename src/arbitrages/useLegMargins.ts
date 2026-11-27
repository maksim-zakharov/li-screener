import { useEffect, useMemo, useState } from 'react'
import {
  fetchMoexIssFortsCatalog,
  normalizeIssShortname,
} from '@/arbitrages/moex-iss-margin'

/**
 * ГО и объём контракта (₽) по кодам ног с MOEX ISS.
 */
export function useLegMargins(codes: string[]): {
  /** code → ГО ₽ */
  marginByCode: Record<string, number | null>
  /** code → объём 1 контракта ₽ */
  volumeByCode: Record<string, number | null>
  /** Идёт загрузка */
  loading: boolean
  /** Ошибка загрузки каталога */
  error: string | null
} {
  const key = useMemo(() => codes.join('|'), [codes])
  const [marginByCode, setMarginByCode] = useState<Record<string, number | null>>({})
  const [volumeByCode, setVolumeByCode] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (codes.length === 0) {
      setMarginByCode({})
      setVolumeByCode({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const catalog = await fetchMoexIssFortsCatalog()
        if (cancelled) {
          return
        }
        const nextMargin: Record<string, number | null> = {}
        const nextVolume: Record<string, number | null> = {}
        for (const code of codes) {
          const norm = normalizeIssShortname(code)
          nextMargin[code] = catalog.marginByKey.get(norm) ?? null
          nextVolume[code] = catalog.volumeByKey.get(norm) ?? null
        }
        setMarginByCode(nextMargin)
        setVolumeByCode(nextVolume)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        console.warn('ГО ISS:', err)
        setError(err instanceof Error ? err.message : String(err))
        setMarginByCode({})
        setVolumeByCode({})
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { marginByCode, volumeByCode, loading, error }
}
