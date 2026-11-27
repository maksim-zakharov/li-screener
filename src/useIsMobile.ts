import { useEffect, useState } from 'react'

/** Порог ширины (px): ниже — мобильный вид. */
const MOBILE_BREAKPOINT = 768

/**
 * Мобильный вид при ширине окна меньше 768px.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}
