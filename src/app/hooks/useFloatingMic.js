'use client'
import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * useFloatingMic — encapsule la logique de reconnaissance vocale
 * du micro flottant néon.
 *
 * Extrait depuis AdminDashboard.js pour garder le shell propre.
 * Peut être réutilisé dans ClientDashboard si besoin un jour.
 *
 * @param {Object}   [options]
 * @param {Function} [options.onError] (message) => void — remonte les
 *        erreurs utilisateur (navigateur non supporté, micro bloqué…).
 *        Les dashboards passent `addToast` pour afficher un toast au lieu
 *        d'un alert() bloquant. Si omis, l'erreur n'est que loggée console.
 *
 * Retourne :
 * - listening      : boolean (true quand le micro capte)
 * - transcript     : string (texte reconnu, interim + final)
 * - toggle()       : démarre ou arrête la reconnaissance
 * - clear()        : efface le transcript + stoppe si en cours
 * - setTranscript  : setter direct (pour injecter un transcript externe)
 */
export function useFloatingMic({ onError } = {}) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  // Reconnaissance en cours. clear() et le démontage remettent ce ref à null :
  // les évènements tardifs (onresult / onend après stop()) d'une reconnaissance
  // qui n'est plus la courante sont ignorés, sinon « Effacer » restaurerait le texte.
  const recognRef = useRef(null)
  // Stocke la dernière callback dans un ref : évite de reconstruire `toggle`
  // (et de casser les useCallback en aval) à chaque render du dashboard.
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const notifyError = useCallback((msg) => {
    if (onErrorRef.current) onErrorRef.current(msg)
  }, [])

  const toggle = useCallback(() => {
    try {
      const SR = typeof window !== 'undefined'
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null

      if (!SR) {
        notifyError("Reconnaissance vocale non supportée — utilisez Chrome, Edge ou Safari")
        return
      }

      if (listening && recognRef.current) {
        recognRef.current.stop()
        setListening(false)
        return
      }

      const r = new SR()
      r.lang = "fr-FR"
      r.continuous = true
      r.interimResults = true
      recognRef.current = r
      let finalText = ""

      r.onstart = () => {
        if (recognRef.current !== r) return
        setListening(true)
        setTranscript("")
      }
      r.onresult = (ev) => {
        if (recognRef.current !== r) return
        let interim = ""
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript + " "
          else interim = ev.results[i][0].transcript
        }
        setTranscript(finalText + interim)
      }
      r.onerror = (ev) => {
        console.error('[FloatingMic] recognition error', ev?.error)
        setListening(false)
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
          notifyError("Micro bloqué par le navigateur — autorise l'accès dans les réglages")
        }
      }
      r.onend = () => {
        if (recognRef.current !== r) return
        setListening(false)
        if (finalText.trim()) setTranscript(finalText.trim())
      }
      r.start()
    } catch (e) {
      console.error('[FloatingMic] toggleFloatMic exception', e)
      notifyError("Erreur micro : " + (e?.message || String(e)))
      setListening(false)
    }
  }, [listening, notifyError])

  const clear = useCallback(() => {
    setTranscript("")
    const r = recognRef.current
    recognRef.current = null
    if (r) {
      try { r.stop() } catch { /* déjà arrêtée */ }
    }
    setListening(false)
  }, [])

  // Démontage : on coupe le micro et on ignore ses derniers évènements
  useEffect(() => () => {
    const r = recognRef.current
    recognRef.current = null
    if (r) {
      try { r.stop() } catch { /* déjà arrêtée */ }
    }
  }, [])

  return { listening, transcript, setTranscript, toggle, clear }
}
