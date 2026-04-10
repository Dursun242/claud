import { supabase } from '@/app/supabaseClient'

/**
 * Service pour gérer les Comptes Rendus (CR)
 * CRUD + Commentaires + Timeline par semaine
 */

export const crService = {
  // ─── READ ───
  async getAll() {
    const { data, error } = await supabase
      .from('compte_rendus')
      .select('*')
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getByChantier(chantierId) {
    const { data, error } = await supabase
      .from('compte_rendus')
      .select('*')
      .eq('chantier_id', chantierId)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getByWeek(chantierId, semaine, annee) {
    const { data, error } = await supabase
      .from('compte_rendus')
      .select('*')
      .eq('chantier_id', chantierId)
      .eq('semaine', semaine)
      .eq('annee', annee)
      .order('date', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('compte_rendus')
      .select('*')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  },

  // ─── CREATE/UPDATE ───
  async upsert(cr, userId) {
    const payload = {
      chantier_id: cr.chantier_id,
      date: cr.date,
      numero: cr.numero,
      resume: cr.resume || '',
      participants: cr.participants || '',
      decisions: cr.decisions || '',
      semaine: cr.semaine || getWeekNumber(new Date(cr.date)),
      annee: cr.annee || new Date(cr.date).getFullYear(),
      photos: cr.photos || [],
      created_by_user: userId,
      last_edited_by_user: userId,
      last_edited_at: new Date().toISOString(),
    }

    if (cr.id) {
      // UPDATE
      const { data, error } = await supabase
        .from('compte_rendus')
        .update(payload)
        .eq('id', cr.id)
        .select()
        .single()
      if (error) throw error
      return data
    } else {
      // CREATE
      const { data, error } = await supabase
        .from('compte_rendus')
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
      .from('compte_rendus')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // ─── PHOTOS ───
  async addPhoto(crId, photoUrl) {
    const cr = await this.getById(crId)
    const photos = cr.photos || []
    const updated = [...photos, photoUrl]
    const { error } = await supabase
      .from('compte_rendus')
      .update({ photos: updated })
      .eq('id', crId)
    if (error) throw error
    return updated
  },

  async removePhoto(crId, photoUrl) {
    const cr = await this.getById(crId)
    const updated = (cr.photos || []).filter(p => p !== photoUrl)
    const { error } = await supabase
      .from('compte_rendus')
      .update({ photos: updated })
      .eq('id', crId)
    if (error) throw error
    return updated
  },

  // ─── COMMENTAIRES ───
  async getComments(crId) {
    const { data, error } = await supabase
      .from('cr_commentaires')
      .select('*')
      .eq('cr_id', crId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async addComment(crId, userId, userRole, contenu, type = 'commentaire') {
    const { data, error } = await supabase
      .from('cr_commentaires')
      .insert({
        cr_id: crId,
        user_id: userId,
        user_role: userRole,
        contenu,
        type,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCommentStatus(commentId, status) {
    const { error } = await supabase
      .from('cr_commentaires')
      .update({ status })
      .eq('id', commentId)
    if (error) throw error
  },

  async deleteComment(commentId) {
    const { error } = await supabase
      .from('cr_commentaires')
      .delete()
      .eq('id', commentId)
    if (error) throw error
  },
}

// ─── HELPER ───
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
