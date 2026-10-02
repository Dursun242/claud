/**
 * Fusion de contacts en double (accès Supabase).
 *
 * Ordre : fiche conservée mise à jour → affaires et échanges du CRM
 * rattachés à la fiche conservée → chantiers liés repris → nom mis à jour
 * dans les OS et les chantiers (liés au contact par le nom) → doublons
 * supprimés. Si une étape échoue avant la suppression, on s'arrête : les
 * doublons restent, rien n'est perdu.
 */
import { supabase as defaultClient } from '../supabaseClient'
import { writeActivityLog } from './activityLog'

const MISSING_TABLE = (err) => err && (err.code === '42P01' || /does not exist|schema cache/i.test(err.message || ''))

async function step(label, promise, { optional = false } = {}) {
  const { data, error } = await promise
  if (error && !(optional && MISSING_TABLE(error))) throw new Error(`Fusion interrompue (${label}) : ${error.message}`)
  return data
}

/**
 * @param {object} p
 * @param {object} p.keep    contact conservé (ligne actuelle)
 * @param {object[]} p.drops contacts fusionnés dans `keep` puis supprimés
 * @param {object} p.fields  valeurs finales de la fiche (lib/contactDuplicates.planMerge)
 * @returns {Promise<{ contact, moved: { affaires, echanges, chantiers, os, chantiersRenommes } }>}
 */
export async function mergeContacts({ keep, drops = [], fields }, sb = defaultClient) {
  if (!keep?.id || !drops.length) throw new Error('Rien à fusionner')
  const dropIds = drops.map(d => d.id).filter(id => id && id !== keep.id)
  if (!dropIds.length) throw new Error('Rien à fusionner')
  const finalNom = String(fields?.nom || keep.nom || '').trim()
  if (!finalNom) throw new Error('Le nom est requis')
  const moved = { affaires: 0, echanges: 0, chantiers: 0, os: 0, chantiersRenommes: 0 }

  // 1. Fiche conservée
  const { id: _id, created_at: _c, updated_at: _u, ...patch } = { ...fields, nom: finalNom } // eslint-disable-line no-unused-vars
  const contact = await step('fiche', sb.from('contacts').update(patch).eq('id', keep.id).select().single())

  // 2. CRM : affaires et échanges
  const opp = await step('affaires', sb.from('crm_opportunites').update({ contact_id: keep.id }).in('contact_id', dropIds).select('id'), { optional: true })
  moved.affaires = opp?.length || 0
  const inter = await step('échanges', sb.from('crm_interactions').update({ contact_id: keep.id }).in('contact_id', dropIds).select('id'), { optional: true })
  moved.echanges = inter?.length || 0

  // 3. Chantiers liés (contact_chantiers, unique par contact + chantier)
  const links = await step('chantiers liés', sb.from('contact_chantiers').select('contact_id, chantier_id').in('contact_id', [keep.id, ...dropIds]))
  const have = new Set((links || []).filter(l => l.contact_id === keep.id).map(l => l.chantier_id))
  const toAdd = [...new Set((links || []).filter(l => l.contact_id !== keep.id && !have.has(l.chantier_id)).map(l => l.chantier_id))]
  if (toAdd.length) {
    await step('chantiers liés', sb.from('contact_chantiers').insert(toAdd.map(chantier_id => ({ contact_id: keep.id, chantier_id }))))
    moved.chantiers = toAdd.length
  }

  // 4. Liens par le nom : OS (artisan) et chantiers (client)
  const oldNames = [...new Set([keep.nom, ...drops.map(d => d.nom)].map(n => String(n || '').trim()).filter(n => n && n !== finalNom))]
  for (const name of oldNames) {
    const os = await step('ordres de service', sb.from('ordres_service').update({ artisan_nom: finalNom }).eq('artisan_nom', name).select('id'))
    moved.os += os?.length || 0
    const ch = await step('chantiers', sb.from('chantiers').update({ client: finalNom }).eq('client', name).select('id'))
    moved.chantiersRenommes += ch?.length || 0
  }

  // 5. Suppression des doublons
  await step('suppression des doublons', sb.from('contacts').delete().in('id', dropIds))

  writeActivityLog(sb, {
    action: 'merge', entity_type: 'contact', entity_id: keep.id, entity_label: finalNom,
    metadata: { fusionnes: drops.map(d => d.nom), ...moved },
  })
  return { contact, moved }
}
