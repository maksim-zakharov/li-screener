import { useEffect, useMemo, useState } from 'react'
import {
  resolveMetalFuturesCode,
  resolveMetalTripleKind,
  resolveMetalTripleLotRatios,
  type ArbPair,
} from '@/arbitrages/arb-pairs'
import { fetchMoexIssLast } from '@/arbitrages/moex-iss-last'

/** Обновление LAST металла. */
const POLL_MS = 30_000

/**
 * Лотности тройника GLD/SLV от живого LAST GOLD/SILV (ISS).
 * Для не-металлических пар возвращает исходные lotRatios пары.
 */
export function useMetalTripleLots(
  pair: ArbPair,
  codes: string[],
): {
  /** Актуальные lotRatios */
  lotRatios: number[]
  /** Базовый объём 1-й ноги */
  defaultBaseLots: number
  /** LAST металла $/oz */
  metalUsdPrice: number | null
  /** Тикер металла */
  metalCode: string | null
  /** Идёт загрузка цены */
  loading: boolean
} {
  const kind = useMemo(() => resolveMetalTripleKind(codes), [codes])
  const metalCode = useMemo(() => resolveMetalFuturesCode(codes), [codes])
  const [metalUsdPrice, setMetalUsdPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!kind || !metalCode) {
      setMetalUsdPrice(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined

    const load = async (showLoading: boolean) => {
      if (showLoading) {
        setLoading(true)
      }
      try {
        const last = await fetchMoexIssLast(metalCode)
        if (cancelled) {
          return
        }
        setMetalUsdPrice(last)
        setLoading(false)
      } catch (err) {
        if (cancelled) {
          return
        }
        console.warn('LAST металла ISS:', metalCode, err)
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
  }, [kind, metalCode])

  const resolved = useMemo(() => {
    if (!kind) {
      return {
        lotRatios: pair.lotRatios,
        defaultBaseLots: pair.defaultBaseLots,
      }
    }
    return resolveMetalTripleLotRatios(kind, metalUsdPrice)
  }, [kind, metalUsdPrice, pair.defaultBaseLots, pair.lotRatios])

  return {
    lotRatios: resolved.lotRatios,
    defaultBaseLots: resolved.defaultBaseLots,
    metalUsdPrice,
    metalCode,
    loading: Boolean(kind) && loading && metalUsdPrice == null,
  }
}
