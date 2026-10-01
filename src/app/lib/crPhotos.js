// Photos des comptes rendus : réduction sur l'appareil, dépôt dans le bucket
// `attachments` (rattachées au chantier, donc visibles aussi dans ses
// documents et ses reportages photo), lecture pour l'affichage et le PDF.
//
// Une photo prise pendant la réunion reste d'abord sur l'appareil
// ({ dataUrl, legende }) : elle survit au mode hors ligne (brouillon local) et
// n'est déposée qu'à l'enregistrement du CR ({ path, legende }).
import { supabase as defaultClient } from '../supabaseClient'
import { resizeImageForAI } from './imageForAI'

export const CR_PHOTO_EDGE = 1280

/** Fichier image → { dataUrl, legende } (JPEG, plus grand côté 1280 px). */
export async function photoFromFile(file, legende = '') {
  const { base64, mediaType } = await resizeImageForAI(file, { maxEdge: CR_PHOTO_EDGE, quality: 0.72 })
  return { dataUrl: `data:${mediaType};base64,${base64}`, legende }
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',')
  const type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg'
  const bytes = Uint8Array.from(atob(b64 || ''), c => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

/** Dépose une photo locale ; renvoie le chemin Storage. */
export async function uploadPhoto(dataUrl, chantierId, { sb = defaultClient, fetchImpl = fetch } = {}) {
  const { data: { session } = {} } = await sb.auth.getSession()
  const fd = new FormData()
  fd.append('file', new File([dataUrlToBlob(dataUrl)], 'photo-cr.jpg', { type: 'image/jpeg' }))
  fd.append('type', 'chantier')
  fd.append('itemId', chantierId)
  const res = await fetchImpl('/api/upload', {
    method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` }, body: fd,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok || !json.filePath) throw new Error(json.error || `Envoi de la photo impossible (${res.status})`)
  return json.filePath
}

/** URL d'affichage : locale (dataUrl) ou signée (1 h). */
export async function signedUrls(paths = [], sb = defaultClient) {
  const list = [...new Set(paths.filter(Boolean))]
  if (!list.length) return {}
  const { data, error } = await sb.storage.from('attachments').createSignedUrls(list, 3600)
  if (error || !data) return {}
  return Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]))
}

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** Toutes les photos d'un CR (sections + points) en dataUrl, pour le PDF. */
export async function loadCrImages(cr, sb = defaultClient) {
  const photos = [
    ...(cr?.sections || []).flatMap(s => s.photos || []),
    ...(cr?.taches_suivi || []).flatMap(r => r.photos || []),
  ]
  const out = {}
  const paths = [...new Set(photos.map(p => p.path).filter(p => p && !p.startsWith('local:')))]
  await Promise.all(paths.map(async (path) => {
    try {
      const { data, error } = await sb.storage.from('attachments').download(path)
      if (!error && data) out[path] = await blobToDataUrl(data)
    } catch { /* photo illisible : ignorée dans le PDF */ }
  }))
  return out
}
