// Appels des routes /api/* du CRM (devis, Qonto, IA) avec le JWT de la
// session + helpers PDF base64 côté navigateur.
import { supabase } from '../supabaseClient'

// Appel d'une route /api/* avec le JWT de la session. Lève une Error avec
// le message serveur ; `code` est propagé (ex. EMAIL_NOT_CONFIGURED).
export async function apiPost(path, body) {
  const { data: { session } = {} } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || `Erreur ${res.status}`)
    err.code = json.code
    throw err
  }
  return json
}

// Dépôt d'un fichier (multipart) sur une route /api/* avec le JWT
export async function apiUpload(path, formData) {
  const { data: { session } = {} } = await supabase.auth.getSession()
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` }, body: formData })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || (res.status === 413 ? 'Fichier trop volumineux (4 Mo maximum).' : `Erreur ${res.status}`))
  return json
}

// Téléchargement d'un PDF reçu en base64
export function saveBase64Pdf({ base64, filename }) {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) return
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Ouverture d'un PDF base64 dans un nouvel onglet
export function openBase64Pdf({ base64 }) {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) return
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
