'use client'
import { useState, useRef, useCallback } from 'react'

/**
 * useFloatingMic — encapsule la logique de reconnaissance vocale
 * du micro flottant néon.
 *
 * Extrait depuis AdminDashboard.js pour garder le shell propre.
 * Peut être réutilisé dans ClientDashboard si besoin un jour.
 *
 * Retourne :
 * - listening      : boolean (true quand le micro capte)
 * - transcript     : string (texte reconnu, interim + final)
 * - toggle()       : démarre ou arrête la reconnaissance
 * - clear()        : efface le transcript + stoppe si en cours
 * - setTranscript  : setter direct (pour injecter un transcript externe)
 */
export function useFloatingMic() {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const recognRef = useRef(null)

  const toggle = useCallback(() => {
    try {
      const SR = typeof window !== 'undefined'
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null

      if (!SR) {
        alert("Reconnaissance vocale non supportée par ce navigateur.\n\nUtilisez Chrome, Edge ou Safari (pas Firefox ni Brave).")
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
        setListening(true)
        setTranscript("")
      }
      r.onresult = (ev) => {
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
          alert("Micro bloqué par le navigateur.\n\nAutorise l'accès au micro pour ce site dans les réglages du navigateur.")
        }
      }
      r.onend = () => {
        setListening(false)
        if (finalText.trim()) setTranscript(finalText.trim())
      }
      r.start()
    } catch (e) {
      console.error('[FloatingMic] toggleFloatMic exception', e)
      alert("Erreur lors du démarrage de la reconnaissance vocale :\n" + (e?.message || String(e)))
      setListening(false)
    }
  }, [listening])

  const clear = useCallback(() => {
    setTranscript("")
    if (listening && recognRef.current) {
      recognRef.current.stop()
      setListening(false)
    }
  }, [listening])

  return { listening, transcript, setTranscript, toggle, clear }
}
