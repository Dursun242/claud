/**
 * Enregistrement d'un compte rendu avec ses actions (migration 033).
 *
 * Ordre : photos locales déposées → réunion suivante dans l'agenda (table
 * rdv) → CR (sections par lot + photo des points) → tâches créées / mises à jour. Les identifiants sont
 * générés ici pour que la photo du CR et les tâches se référencent sans
 * seconde écriture du CR (qui déclencherait une notification « CR modifié »).
 *
 * Sans la migration 033, le CR et les tâches sont enregistrés sans les
 * nouvelles colonnes (`migrationMissing: true`).
 */
import { supabase as defaultClient } from '../supabaseClient'
import { writeActivityLog } from './activityLog'
import { planCrTasks, sectionsForDb } from './crSuivi'
import { uploadPhoto } from './crPhotos'

const TASK_033 = ['entreprise', 'num_point', 'photos', 'cr_origine_id', 'cr_origine_numero', 'nb_rappels', 'dernier_rappel_cr_id']

export const isMissingColumn = (err) => !!err && (err.code === 'PGRST204' || err.code === '42703'
  || /column .*(does not exist|schema cache)/i.test(err.message || ''))

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)))

/** Réunion suivante dans l'agenda (création, mise à jour ou retrait). Jamais bloquant. */
async function syncNextMeeting(sb, { next, prevNext, chantierId, numero, intervenants }) {
  const rdvId = prevNext?.rdv_id || null
  try {
    if (!next?.date) {
      if (rdvId) await sb.from('rdv').delete().eq('id', rdvId)
      return null
    }
    const row = {
      chantier_id: chantierId, titre: `Réunion de chantier n°${(Number(numero) || 0) + 1}`,
      date: next.date, heure: next.heure || null, lieu: next.lieu || null,
      participants: (intervenants || []).filter(i => i.convoque !== false)
        .map(i => i.societe && i.societe !== i.nom ? `${i.nom} (${i.societe})` : i.nom).filter(Boolean),
      notes: `Convocation du compte rendu n°${numero}`,
    }
    if (rdvId) {
      const { data, error } = await sb.from('rdv').update(row).eq('id', rdvId).select('id').maybeSingle()
      if (!error && data) return rdvId
    }
    const { data, error } = await sb.from('rdv').insert(row).select('id').single()
    return error ? null : data.id
  } catch {
    return null
  }
}

/** Dépose les photos encore locales (points et sections). Jamais bloquant. */
async function uploadPending({ rows, sections, chantierId, upload }) {
  const failures = []
  const cache = new Map()
  const up = async (list = []) => Promise.all((list || []).map(async (p) => {
    if (!p || p.path || !p.dataUrl) return p
    try {
      if (!cache.has(p.dataUrl)) cache.set(p.dataUrl, upload(p.dataUrl, chantierId))
      return { path: await cache.get(p.dataUrl), legende: p.legende || '' }
    } catch (e) {
      failures.push(e?.message || 'photo non envoyée')
      return p
    }
  }))
  const outRows = []
  for (const r of rows) outRows.push(r.photos?.length ? { ...r, photos: await up(r.photos) } : r)
  const outSections = []
  for (const s of sections) outSections.push(s.photos?.length ? { ...s, photos: await up(s.photos) } : s)
  return { rows: outRows, sections: outSections, failures }
}

/**
 * @param {object} p
 * @param {object} p.form   CR saisi (id si modification, chantierId, date, numero,
 *                          resume, participants, decisions, intervenants,
 *                          prochaine_reunion, statut)
 * @param {Array}  p.rows      points (lib/crSuivi.initialRows / newRow)
 * @param {Array}  p.sections  sections par lot (lib/crSuivi.buildSections)
 * @param {number} [p.nextNum] numéro du prochain point du chantier
 * @param {object} [p.previousNext] prochaine_reunion enregistrée avant modification
 * @returns {Promise<{cr, snapshot, migrationMissing, failures: string[], photoFailures: string[], rows, sections}>}
 */
export async function saveCr({
  form, rows = [], sections = [], nextNum = 1, previousNext = null,
  sb = defaultClient, newId = uuid, upload = uploadPhoto,
}) {
  const isNew = !(form.id && String(form.id).length > 10)
  const crId = isNew ? newId() : form.id
  const chantierId = form.chantierId || form.chantier_id || null
  const numero = Number(form.numero) || 1
  const intervenants = form.intervenants || []

  const uploaded = await uploadPending({ rows, sections, chantierId, upload })
  const plan = planCrTasks({ rows: uploaded.rows, crId, crNumero: numero, chantierId, newId, nextNum })

  const next = form.prochaine_reunion?.date ? {
    date: form.prochaine_reunion.date,
    heure: form.prochaine_reunion.heure || '',
    lieu: form.prochaine_reunion.lieu || '',
  } : null
  const rdvId = await syncNextMeeting(sb, { next, prevNext: previousNext, chantierId, numero, intervenants })
  if (next && rdvId) next.rdv_id = rdvId

  const base = {
    chantier_id: chantierId, date: form.date || null, numero,
    resume: form.resume || '', participants: form.participants || '', decisions: form.decisions || '',
    intervenants,
  }
  const full = {
    ...base, prochaine_reunion: next, taches_suivi: plan.snapshot,
    sections: sectionsForDb(uploaded.sections), statut: form.statut === 'Diffusé' ? 'Diffusé' : 'Brouillon',
  }
  const write = (row) => (isNew
    ? sb.from('compte_rendus').insert({ id: crId, ...row }).select().single()
    : sb.from('compte_rendus').update(row).eq('id', crId).select().single())

  let migrationMissing = false
  let { data, error } = await write(full)
  if (error && isMissingColumn(error)) {
    migrationMissing = true
    ;({ data, error } = await write(base))
  }
  if (error) throw new Error((isNew ? 'Erreur création CR : ' : 'Erreur mise à jour CR : ') + error.message)
  writeActivityLog(sb, { action: isNew ? 'create' : 'update', entity_type: 'cr', entity_id: data.id, entity_label: `CR n°${data.numero}` })

  const failures = []
  const run = async (label, exec, payload) => {
    let row = migrationMissing ? without(payload, TASK_033) : payload
    if (!Object.keys(row).length) return
    let res = await exec(row)
    if (res.error && !migrationMissing && isMissingColumn(res.error)) {
      migrationMissing = true
      row = without(payload, TASK_033)
      if (!Object.keys(row).length) return
      res = await exec(row)
    }
    if (res.error) failures.push(`${label} : ${res.error.message}`)
  }
  for (const task of plan.inserts) {
    await run(task.titre, (row) => sb.from('taches').insert(row), task)
  }
  for (const { id, patch } of plan.updates) {
    const label = plan.snapshot.find(s => s.id === id)?.titre || 'tâche'
    await run(label, (row) => sb.from('taches').update(row).eq('id', id), patch)
  }
  if (plan.inserts.length || plan.updates.length) {
    writeActivityLog(sb, {
      action: 'update', entity_type: 'cr', entity_id: data.id, entity_label: `CR n°${data.numero}`,
      metadata: { taches_creees: plan.inserts.length, taches_modifiees: plan.updates.length },
    })
  }

  return {
    cr: {
      ...data, chantierId: data.chantier_id,
      taches_suivi: data.taches_suivi || plan.snapshot,
      sections: data.sections || sectionsForDb(uploaded.sections),
      prochaine_reunion: data.prochaine_reunion !== undefined ? data.prochaine_reunion : next,
    },
    snapshot: plan.snapshot,
    migrationMissing,
    failures,
    photoFailures: uploaded.failures,
    rows: uploaded.rows,
    sections: uploaded.sections,
  }
}

/** CR envoyé aux intervenants : statut « Diffusé ». Jamais bloquant. */
export async function markDiffused(crId, sb = defaultClient) {
  try {
    const { error } = await sb.from('compte_rendus')
      .update({ statut: 'Diffusé', diffuse_le: new Date().toISOString() }).eq('id', crId)
    return !error
  } catch {
    return false
  }
}
