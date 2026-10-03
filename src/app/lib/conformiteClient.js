// Documents des entreprises — côté navigateur : préparation du fichier
// (photo réduite en JPEG, PDF tel quel) puis dépôt en 3 temps : URL signée
// (route), envoi direct au stockage, enregistrement + lecture IA (route).
// `post(body)` appelle la route de l'équipe (JWT) ou la route publique
// (jeton) : la même mécanique sert aux deux.

import { supabase } from '../supabaseClient'
import { resizeImageForAI } from './imageForAI'

const IMG = /^image\/(jpeg|png|webp|gif|bmp)$/i

/** Photo → JPEG (2000 px max) ; PDF ou autre : inchangé. */
export async function prepareFile(file) {
  if (!IMG.test(file?.type || '')) return file
  const { base64, mediaType } = await resizeImageForAI(file, { maxEdge: 2000, quality: 0.85 })
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const name = String(file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
  return new File([bytes], name, { type: mediaType })
}

/**
 * @param {(body: object) => Promise<object>} post  appel de route (renvoie `data`)
 * @param {{ kind: string, file: File, extra?: object }} p
 * @returns {Promise<object>} réponse de l'action « register »
 */
export async function uploadConformiteDoc(post, { kind, file, extra = {} }) {
  const ready = await prepareFile(file)
  const prep = await post({ ...extra, action: 'prepare', kind, name: ready.name, type: ready.type, size: ready.size })
  const { error } = await supabase.storage.from('attachments')
    .uploadToSignedUrl(prep.path, prep.token, ready, { contentType: prep.type })
  if (error) throw new Error(`Dépôt du fichier impossible : ${error.message}`)
  return post({ ...extra, action: 'register', kind, path: prep.path, name: prep.name })
}

/** Route publique (page /deposer/<jeton>). */
export function publicPost(token) {
  return async (body) => {
    const res = await fetch('/api/conformite/public', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.ok) throw new Error(json.error || `Erreur ${res.status}`)
    return json.data
  }
}
