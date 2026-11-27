import { useEffect, useMemo, useState } from 'react'
import {
  fetchMoexRubfFundingPerLotByCodes,
  filterRubfLegCodes,
} from '@/arbitrages/moex-rubf-funding'

/** Интервал обновления индикативного фандинга. */
const POLL_MS = 60_000

/**
 * Индикативный фандинг *RUBF-ног выбранного спреда (₽/лот).
 */
export function useLegFunding(codes: string[]): {
  /** code → ₽/лот (null — нет/ошибка) */
  fundingPerLotByCode: Record<string, number | null>
  /** Есть *RUBF среди ног */
  hasRubf: boolean
  /** Идёт загрузка */
  loading: boolean
  /** Ошибка */
  error: string | null
} {
  const rubfCodes = useMemo(() => filterRubfLegCodes(codes), [codes])
  const key = useMemo(() => rubfCodes.join('|'), [rubfCodes])
  const [fundingPerLotByCode, setFundingPerLotByCode] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (rubfCodes.length === 0) {
      setFundingPerLotByCode({})
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const load = async (showLoading: boolean) => {
      if (showLoading) {
        setLoading(true)
      }
      setError(null)
      try {
        const next = await fetchMoexRubfFundingPerLotByCodes(rubfCodes)
        if (cancelled) {
          return
        }
        setFundingPerLotByCode(next)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        console.warn('Фандинг ISS:', err)
        setError(err instanceof Error ? err.message : String(err))
        setFundingPerLotByCode({})
        setLoading(false)
      }
    }

    void load(true)
    timer = setInterval(() => {
      void load(false)
    }, POLL_MS)

    return () => {
      cancelled = true
      if (timer) {
        clearInterval(timer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return {
    fundingPerLotByCode,
    hasRubf: rubfCodes.length > 0,
    loading,
    error,
  }
}
