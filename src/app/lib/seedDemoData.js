/**
 * seedDemoData — Insère les données de démonstration dans Supabase
 * lors de la première connexion (quand la base est vide).
 *
 * Extrait depuis AdminDashboard.js pour garder le useEffect de
 * chargement compact et lisible.
 *
 * Séquence :
 * 1. Insert chantiers → récupère les UUIDs générés par Supabase
 * 2. Insert contacts
 * 3. Map ancien id → nouveau UUID pour lier les tâches et CR
 * 4. Insert tâches + comptes rendus avec les vrais chantier_id
 *
 * En cas d'échec : rollback des chantiers insérés pour ne pas
 * laisser la base à moitié remplie.
 *
 * @param {object} supabase - Le client Supabase
 * @param {object} defaultData - Les données de démo (depuis shared.js)
 * @returns {boolean} true si le seed a réussi, false sinon
 */
export async function seedDemoData(supabase, defaultData) {
  let insertedChIds = []
  try {
    const chantierRows = defaultData.chantiers.map(({ id, dateDebut, dateFin, ...rest }) => ({
      ...rest, date_debut: dateDebut || null, date_fin: dateFin || null
    }))
    const { data: insertedCh, error: errCh } = await supabase.from('chantiers').insert(chantierRows).select()
    if (errCh) throw new Error("Erreur insert chantiers: " + errCh.message)
    insertedChIds = (insertedCh || []).map(c => c.id)

    const contactRows = defaultData.contacts.map(({ id, chantiers, ...rest }) => rest)
    const { error: errCo } = await supabase.from('contacts').insert(contactRows).select()
    if (errCo) throw new Error("Erreur insert contacts: " + errCo.message)

    // Map ancien id → nouveau UUID pour lier les tâches
    const chMap = {}
    if (insertedCh) {
      defaultData.chantiers.forEach((defCh, i) => {
        if (insertedCh[i]) chMap[defCh.id] = insertedCh[i].id
      })
    }

    const taskRows = defaultData.tasks.map(({ id, chantierId, ...rest }) => ({
      ...rest, chantier_id: chMap[chantierId] || null
    })).filter(t => t.chantier_id)
    if (taskRows.length > 0) {
      const { error: errTa } = await supabase.from('taches').insert(taskRows)
      if (errTa) throw new Error("Erreur insert tâches: " + errTa.message)
    }

    if (defaultData.compteRendus) {
      const crRows = defaultData.compteRendus.map(({ id, chantierId, ...rest }) => ({
        ...rest, chantier_id: chMap[chantierId] || null
      })).filter(c => c.chantier_id)
      if (crRows.length > 0) {
        const { error: errCr } = await supabase.from('compte_rendus').insert(crRows)
        if (errCr) throw new Error("Erreur insert CR: " + errCr.message)
      }
    }

    // Trace l'initialisation dans le journal d'activité (admin only)
    try {
      await supabase.from('activity_logs').insert({
        action: 'seed',
        entity_type: 'system',
        entity_label: 'Initialisation données de démonstration',
        metadata: {
          chantiers: (defaultData.chantiers || []).length,
          contacts:  (defaultData.contacts  || []).length,
          tasks:     (defaultData.tasks     || []).length,
          compteRendus: (defaultData.compteRendus || []).length,
        },
        user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent.slice(0, 255) : null,
      })
    } catch (_) { /* silencieux */ }

    return true
  } catch (seedErr) {
    // Rollback : supprimer les chantiers insérés pour ne pas laisser la base à moitié remplie
    if (insertedChIds.length > 0) {
      await supabase.from('chantiers').delete().in('id', insertedChIds).catch(() => {})
    }
    console.error("Seed échoué, rollback effectué:", seedErr.message)
    return false
  }
}
