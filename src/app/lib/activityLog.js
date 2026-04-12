'use client'
/**
 * Helper centralisé pour le journal d'activité (activity_logs).
 *
 * Objectifs :
 * - Un seul endroit où construire la payload (user_agent anonymisé,
 *   horodatage, etc.) : plus de copies divergentes entre SB.log,
 *   logSession et seedDemoData.
 * - Support d'un contexte module-scoped pour enrichir les logs
 *   déclenchés par l'IA ou par une duplication (évite de créer 2
 *   entrées par action).
 * - Fire-and-forget par défaut (writeActivityLog), await possible
 *   pour les cas critiques (writeActivityLogAwait).
 */

// ─── USER AGENT ANONYMISÉ ───
// On ne stocke PAS le navigator.userAgent brut (empreinte numérique
// trop précise, sans valeur métier). On extrait juste {OS, Browser}
// sans version, suffisant pour un diagnostic type "bug sur mobile
// Safari" sans transformer le journal en fingerprint.
function shortUserAgent() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  let os = 'Unknown'
  if (/iPhone|iPad|iPod/.test(ua))       os = 'iOS'
  else if (/Android/.test(ua))           os = 'Android'
  else if (/Mac OS X|Macintosh/.test(ua))os = 'macOS'
  else if (/Windows/.test(ua))           os = 'Windows'
  else if (/Linux/.test(ua))             os = 'Linux'
  let browser = 'Unknown'
  if (/Edg\//.test(ua))                  browser = 'Edge'
  else if (/OPR\//.test(ua))             browser = 'Opera'
  else if (/Firefox\//.test(ua))         browser = 'Firefox'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua))   browser = 'Safari'
  return `${os}/${browser}`
}

// ─── CONTEXTE TRANSITOIRE ───
// Permet à un caller (AIV, duplicate) de tagguer temporairement les
// prochains logs avec une metadata contextuelle (source='ai', etc.)
// pour ne pas créer 2 entrées par action.
let _ctx = null

export function setLogContext(ctx) { _ctx = ctx || null }
export function clearLogContext()  { _ctx = null }
export function getLogContext()    { return _ctx }

// ─── ÉCRITURE ───
/**
 * Insert une ligne dans activity_logs.
 *
 * @param {SupabaseClient} supabase   Client Supabase (pour éviter import circulaire)
 * @param {object}        entry       { action, entity_type, entity_id?, entity_label?, metadata? }
 * @param {boolean}       blocking    Si true → await propagé au caller (défaut: false)
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function writeActivityLog(supabase, entry, blocking = false) {
  try {
    const mergedMeta = _ctx
      ? { ..._ctx, ...(entry.metadata || {}) }
      : (entry.metadata || null)
    const payload = {
      action:       entry.action,
      entity_type:  entry.entity_type || null,
      entity_id:    entry.entity_id ? String(entry.entity_id) : null,
      entity_label: entry.entity_label || null,
      metadata:     mergedMeta && Object.keys(mergedMeta).length ? mergedMeta : null,
      user_agent:   shortUserAgent(),
    }
    const p = supabase.from('activity_logs').insert(payload)
    if (blocking) {
      const { error } = await p
      if (error) {
        console.warn('[activityLog] insert failed:', entry.action, entry.entity_type, error.message)
        return { ok: false, error: error.message }
      }
      return { ok: true }
    }
    // Fire-and-forget : ne bloque pas, mais expose l'erreur en console
    p.then(({ error }) => {
      if (error) console.warn('[activityLog] insert failed:', entry.action, entry.entity_type, error.message)
    }).catch(err => {
      console.warn('[activityLog] exception:', entry.action, entry.entity_type, err?.message || err)
    })
    return { ok: true }
  } catch (err) {
    console.warn('[activityLog] exception:', entry.action, entry.entity_type, err?.message || err)
    return { ok: false, error: err?.message || String(err) }
  }
}
