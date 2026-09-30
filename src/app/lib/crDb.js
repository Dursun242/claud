/**
 * Enregistrement d'un compte rendu avec ses actions (migration 033).
 *
 * Ordre : réunion suivante dans l'agenda (table rdv) → CR (avec la photo
 * des actions) → tâches créées / mises à jour. Les identifiants sont
 * générés ici pour que la photo du CR et les tâches se référencent sans
 * seconde écriture du CR (qui déclencherait une notification « CR modifié »).
 *
 * Sans la migration 033, le CR et les tâches sont enregistrés sans les
 * nouvelles colonnes (`migrationMissing: true`).
 */
import { supabase as defaultClient } from '../supabaseClient'
import { writeActivityLog } from './activityLog'
import { planCrTasks } from './crSuivi'

const TASK_033 = ['entreprise', 'cr_origine_id', 'cr_origine_numero', 'nb_rappels', 'dernier_rappel_cr_id']

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

/**
 * @param {object} p
 * @param {object} p.form   CR saisi (id si modification, chantierId, date, numero,
 *                          resume, participants, decisions, intervenants, prochaine_reunion)
 * @param {Array}  p.rows   actions (lib/crSuivi.initialRows / newRow)
 * @param {object} [p.previousNext] prochaine_reunion enregistrée avant modification
 * @returns {Promise<{cr, snapshot, migrationMissing, failures: string[]}>}
 */
export async function saveCr({ form, rows = [], previousNext = null, sb = defaultClient, newId = uuid }) {
  const isNew = !(form.id && String(form.id).length > 10)
  const crId = isNew ? newId() : form.id
  const chantierId = form.chantierId || form.chantier_id || null
  const numero = Number(form.numero) || 1
  const intervenants = form.intervenants || []
  const plan = planCrTasks({ rows, crId, crNumero: numero, chantierId, newId })

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
  const full = { ...base, prochaine_reunion: next, taches_suivi: plan.snapshot }
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
    let res = await exec(migrationMissing ? without(payload, TASK_033) : payload)
    if (res.error && !migrationMissing && isMissingColumn(res.error)) {
      migrationMissing = true
      res = await exec(without(payload, TASK_033))
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
    cr: { ...data, chantierId: data.chantier_id, taches_suivi: data.taches_suivi || plan.snapshot },
    snapshot: plan.snapshot,
    migrationMissing,
    failures,
  }
}
