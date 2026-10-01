'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Dictée vocale (Web Speech API, fr-FR) vers un champ au choix : chaque
 * phrase reconnue est passée à `onFinal(texte)` ; `interim` contient la
 * phrase en cours. Un seul champ dicté à la fois (`target`).
 *
 * toggle(id, onFinal) : démarre la dictée pour le champ `id`, ou l'arrête
 * si elle est déjà en cours sur ce champ.
 */
export function useDictation({ onError } = {}) {
  const [target, setTarget] = useState(null)
  const [interim, setInterim] = useState('')
  const recRef = useRef(null)
  const targetRef = useRef(null)
  const cbRef = useRef(null)
  const errRef = useRef(onError)
  errRef.current = onError

  const stop = useCallback(() => {
    const r = recRef.current
    recRef.current = null
    targetRef.current = null
    setTarget(null)
    setInterim('')
    try { r?.stop() } catch { /* déjà arrêtée */ }
  }, [])

  const toggle = useCallback((id, onFinal) => {
    const same = targetRef.current === id
    if (recRef.current) stop()
    if (same) return
    const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
    if (!SR) {
      errRef.current?.('Dictée non disponible sur ce navigateur : utilise Chrome, Edge ou Safari, ou le micro du clavier.')
      return
    }
    const r = new SR()
    r.lang = 'fr-FR'
    r.continuous = true
    r.interimResults = true
    cbRef.current = onFinal
    r.onresult = (ev) => {
      let inter = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0].transcript
        if (ev.results[i].isFinal) { if (txt.trim()) cbRef.current?.(txt.trim()) } else inter += txt
      }
      setInterim(inter)
    }
    r.onerror = (ev) => {
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
        errRef.current?.('Micro bloqué par le navigateur : autorise l’accès dans les réglages.')
      }
    }
    r.onend = () => { if (recRef.current === r) stop() }
    recRef.current = r
    targetRef.current = id
    setTarget(id)
    try { r.start() } catch (e) { stop(); errRef.current?.('Micro indisponible : ' + (e?.message || e)) }
  }, [stop])

  useEffect(() => () => { try { recRef.current?.stop() } catch { /* */ } }, [])

  return { target, interim, toggle, stop }
}
