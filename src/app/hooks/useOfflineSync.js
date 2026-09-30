'use client'
// useOfflineSync — branche l'usage hors ligne pour l'utilisateur connecté :
//   - restaure au démarrage les dernières données consultées (IndexedDB) ;
//   - les sauvegarde après chaque chargement ;
//   - envoie la file d'attente dès que le réseau revient.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOnlineStatus } from './useOnlineStatus'
import { restoreQueries, persistQueries } from '../lib/offlineCache'
import { readOutbox, flushOutbox, OUTBOX_EVENT } from '../lib/offlineStore'

/**
 * @param {string} email      utilisateur connecté (cache et file par utilisateur)
 * @param {object} handlers   { [type]: async (payload) => void } pour la file
 * @param {function} [onFlushed]  appelé avec le nombre d'envois réussis
 */
export function useOfflineSync(email, handlers, onFlushed) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [pending, setPending] = useState(() => readOutbox(email).length)
  const [restoredAt, setRestoredAt] = useState(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed
  const flushing = useRef(false)

  useEffect(() => {
    if (!email) return undefined
    let alive = true
    restoreQueries(queryClient, email).then((at) => { if (alive && at) setRestoredAt(at) })
    const stop = persistQueries(queryClient, email)
    return () => { alive = false; stop() }
  }, [queryClient, email])

  useEffect(() => {
    const onChange = () => setPending(readOutbox(email).length)
    window.addEventListener(OUTBOX_EVENT, onChange)
    return () => window.removeEventListener(OUTBOX_EVENT, onChange)
  }, [email])

  const flush = useCallback(async () => {
    if (!email || flushing.current || !readOutbox(email).length) return
    flushing.current = true
    try {
      const { sent, remaining } = await flushOutbox(email, handlersRef.current)
      setPending(remaining)
      if (sent) {
        await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        onFlushedRef.current?.(sent)
      }
    } finally {
      flushing.current = false
    }
  }, [email, queryClient])

  useEffect(() => {
    if (online) flush()
  }, [online, flush])

  return { online, pending, restoredAt, flush }
}
