'use client'
import { useReportWebVitals } from 'next/web-vitals'

// Remonte les Core Web Vitals (LCP, CLS, INP, FCP, TTFB) dans la console
// en dev et vers /api/metrics en prod si l'endpoint existe. Le hook ne
// s'exécute que dans le navigateur — zéro overhead serveur.
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[web-vitals]', metric.name, Math.round(metric.value), metric.rating)
      return
    }
    try {
      const body = JSON.stringify(metric)
      const url = '/api/metrics'
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' })
        navigator.sendBeacon(url, blob)
      } else {
        fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } })
          .catch(() => {})
      }
    } catch {}
  })
  return null
}
