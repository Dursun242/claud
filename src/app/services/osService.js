import { supabase } from '@/app/supabaseClient'

/**
 * Service pour gérer les Ordres de Service (OS)
 * CRUD + Validation Client
 */

export const osService = {
  // ─── READ ───
  async getAll() {
    const { data, error } = await supabase
      .from('ordres_service')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getByChantier(chantierId) {
    const { data, error } = await supabase
      .from('ordres_service')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('ordres_service')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  // ─── CREATE/UPDATE ───
  async upsert(os) {
    const payload = {
      numero: os.numero || 'OS-XXXX',
      chantier_id: os.chantier_id,
      client_nom: os.client_nom || '',
      client_adresse: os.client_adresse || '',
      artisan_nom: os.artisan_nom || '',
      artisan_specialite: os.artisan_specialite || '',
      artisan_tel: os.artisan_tel || '',
      artisan_email: os.artisan_email || '',
      artisan_siret: os.artisan_siret || '',
      date_emission: os.date_emission,
      date_intervention: os.date_intervention,
      date_fin_prevue: os.date_fin_prevue,
      prestations: os.prestations || [],
      montant_ht: Number(os.montant_ht) || 0,
      montant_tva: Number(os.montant_tva) || 0,
      montant_ttc: Number(os.montant_ttc) || 0,
      statut: os.statut || 'Brouillon',
      observations: os.observations || '',
      conditions: os.conditions || 'Paiement à 30 jours à compter de la réception de la facture.',
      client_id: os.client_id || null,
    }

    if (os.id) {
      // UPDATE
      const { data, error } = await supabase
        .from('ordres_service')
        .update(payload)
        .eq('id', os.id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      // CREATE
      const { data, error } = await supabase
        .from('ordres_service')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    }
  },

  // ─── DELETE ───
  async delete(id) {
    const { error } = await supabase
      .from('ordres_service')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ─── VALIDATION CLIENT ───
  async validateByClient(osId, clientId) {
    // 1. Mettre à jour OS
    const { error: updateError } = await supabase
      .from('ordres_service')
      .update({
        validation_client: true,
        date_validation_client: new Date().toISOString(),
        client_id: clientId,
      })
      .eq('id', osId)
    if (updateError) throw updateError

    // 2. Enregistrer la validation
    const { error: insertError } = await supabase
      .from('os_validations')
      .insert({
        os_id: osId,
        client_id: clientId,
      })
    if (insertError && !insertError.message.includes('duplicate')) throw insertError

    return true
  },

  // ─── HELPER ───
  async isValidatedByClient(osId) {
    const { data, error } = await supabase
      .from('ordres_service')
      .select('validation_client, date_validation_client')
      .eq('id', osId)
      .single()
    if (error) throw error
    return data
  },
}
