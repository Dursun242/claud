'use client'
import { supabase } from '../supabaseClient'

/**
 * Service CRUD centralisé pour Supabase
 * Extrait du AdminDashboard.js pour réutilisabilité
 * Contient toute la logique d'accès aux données
 */
export const supabaseService = {
  async loadAll() {
    const [ch, co, ta, pl, rv, cr, os] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('nom'),
      supabase.from('taches').select('*').order('created_at', { ascending: false }),
      supabase.from('planning').select('*').order('debut'),
      supabase.from('rdv').select('*').order('date'),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }),
      supabase.from('ordres_service').select('*').order('created_at', { ascending: false }),
    ]);
    return {
      chantiers: (ch.data || []).map(c => ({ ...c, lots: c.lots || [] })),
      contacts: (co.data || []).map(c => ({ ...c, chantiers: [] })),
      tasks: (ta.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
      planning: (pl.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv: (rv.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
      compteRendus: (cr.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: os.data || [],
    };
  },

  // Chantiers
  async upsertChantier(ch) {
    const row = { nom: ch.nom, client: ch.client, adresse: ch.adresse, phase: ch.phase, statut: ch.statut, budget: Number(ch.budget)||0, depenses: Number(ch.depenses)||0, date_debut: ch.dateDebut||ch.date_debut||null, date_fin: ch.dateFin||ch.date_fin||null, lots: ch.lots||[] };
    if (ch.id && String(ch.id).length > 10) {
      const { data, error } = await supabase.from('chantiers').update(row).eq('id', ch.id).select().single();
      if (error) throw new Error("Erreur mise à jour chantier : " + error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('chantiers').insert(row).select().single();
      if (error) throw new Error("Erreur création chantier : " + error.message);
      return data;
    }
  },
  async deleteChantier(id) { await supabase.from('chantiers').delete().eq('id', id); },
  async duplicateChantier(chantier) {
    const newCh = { ...chantier };
    delete newCh.id;
    delete newCh.created_at;
    newCh.nom = newCh.nom + " (copie)";
    return this.upsertChantier(newCh);
  },

  // Contacts
  async upsertContact(c) {
    const row = {
      nom: c.nom, type: c.type||"Artisan", specialite: c.specialite||null,
      tel: c.tel||null, email: c.email||null,
      adresse: c.adresse||null, siret: c.siret||null, notes: c.notes||null,
      societe: c.societe||null, fonction: c.fonction||null,
      tel_fixe: c.tel_fixe||null, code_postal: c.code_postal||null, ville: c.ville||null,
      site_web: c.site_web||null, tva_intra: c.tva_intra||null,
      assurance_decennale: c.assurance_decennale||null, assurance_validite: c.assurance_validite||null,
      iban: c.iban||null, qualifications: c.qualifications||null,
      note: Number(c.note)||0, actif: c.actif !== false,
    };
    if (c.id && String(c.id).length > 10) {
      const { data, error } = await supabase.from('contacts').update(row).eq('id', c.id).select().single();
      if (error) throw new Error("Erreur mise à jour contact : " + error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('contacts').insert(row).select().single();
      if (error) throw new Error("Erreur création contact : " + error.message);
      return data;
    }
  },
  async deleteContact(id) { await supabase.from('contacts').delete().eq('id', id); },

  // Tâches
  async upsertTask(t) {
    const chId = t.chantierId||t.chantier_id||null;
    const row = { chantier_id: chId||null, titre: t.titre, priorite: t.priorite, statut: t.statut, echeance: t.echeance||null, lot: t.lot||null };
    if (t.id && String(t.id).length > 10) {
      const { data, error } = await supabase.from('taches').update(row).eq('id', t.id).select().single();
      if (error) throw new Error("Erreur mise à jour tâche : " + error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('taches').insert(row).select().single();
      if (error) throw new Error("Erreur création tâche : " + error.message);
      return data;
    }
  },
  async deleteTask(id) { await supabase.from('taches').delete().eq('id', id); },

  // Comptes Rendus
  async upsertCR(cr) {
    const chId = cr.chantierId||cr.chantier_id||null;
    const row = { chantier_id: chId||null, date: cr.date||null, numero: Number(cr.numero)||1, resume: cr.resume||"", participants: cr.participants||"", decisions: cr.decisions||"" };
    if (cr.id && String(cr.id).length > 10) {
      const { data, error } = await supabase.from('compte_rendus').update(row).eq('id', cr.id).select().single();
      if (error) throw new Error("Erreur mise à jour CR : " + error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('compte_rendus').insert(row).select().single();
      if (error) throw new Error("Erreur création CR : " + error.message);
      return data;
    }
  },
  async deleteCR(id) { const { error } = await supabase.from('compte_rendus').delete().eq('id', id); if (error) console.error("❌ Delete CR:", error.message); },

  // Ordres de Service
  async upsertOS(os) {
    const row = { numero: os.numero||"OS-XXXX", chantier_id: os.chantier_id||null, client_nom: os.client_nom||"", client_adresse: os.client_adresse||"", artisan_nom: os.artisan_nom||"", artisan_specialite: os.artisan_specialite||"", artisan_tel: os.artisan_tel||"", artisan_email: os.artisan_email||"", artisan_siret: os.artisan_siret||"", date_emission: os.date_emission||null, date_intervention: os.date_intervention||null, date_fin_prevue: os.date_fin_prevue||null, prestations: os.prestations||[], montant_ht: Number(os.montant_ht)||0, montant_tva: Number(os.montant_tva)||0, montant_ttc: Number(os.montant_ttc)||0, statut: os.statut||'Brouillon', observations: os.observations||"", conditions: os.conditions||"" };
    if (os.id && String(os.id).length > 10) {
      const { data, error } = await supabase.from('ordres_service').update(row).eq('id', os.id).select().single();
      if (error) throw new Error("Erreur mise à jour OS : " + error.message);
      return data;
    } else {
      const { data, error } = await supabase.from('ordres_service').insert(row).select().single();
      if (error) throw new Error("Erreur création OS : " + error.message);
      return data;
    }
  },
  async deleteOS(id) { const { error } = await supabase.from('ordres_service').delete().eq('id', id); if (error) console.error("❌ Delete OS:", error.message); },

  // Attachments
  async uploadAttachment(file, type, itemId) {
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${type}/${itemId}/${fileName}`;
    const { error } = await supabase.storage.from('attachments').upload(filePath, file);
    if (error) throw new Error("Upload échoué: " + error.message);
    const { data: attachData, error: attachError } = await supabase.from('attachments').insert({
      [type === 'chantier' ? 'chantier_id' : type === 'os' ? 'os_id' : type === 'cr' ? 'cr_id' : 'task_id']: itemId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    }).select().single();
    if (attachError) throw new Error("Erreur enregistrement: " + attachError.message);
    return attachData;
  },
  async getAttachments(type, itemId) {
    const { data, error } = await supabase.from('attachments').select('*').eq(
      type === 'chantier' ? 'chantier_id' : type === 'os' ? 'os_id' : type === 'cr' ? 'cr_id' : 'task_id',
      itemId
    ).order('uploaded_at', { ascending: false });
    if (error) throw new Error("Erreur chargement attachments: " + error.message);
    return data || [];
  },
  async deleteAttachment(id, filePath) {
    await supabase.storage.from('attachments').remove([filePath]);
    await supabase.from('attachments').delete().eq('id', id);
  },
  async getAttachmentUrl(filePath) {
    const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
    return data?.publicUrl;
  },

  // Templates
  async getTemplates(type) {
    const { data, error } = await supabase.from('templates').select('*').eq('type', type).order('name');
    if (error) throw new Error("Erreur chargement templates: " + error.message);
    return data || [];
  },
  async saveTemplate(type, name, description, data) {
    const { error } = await supabase.from('templates').insert({ type, name, description, data });
    if (error) throw new Error("Erreur sauvegarde template: " + error.message);
  },
  async deleteTemplate(id) {
    await supabase.from('templates').delete().eq('id', id);
  },

  // Comments
  async addComment(type, itemId, author, content) {
    const data = { author_email: author, author_name: author.split('@')[0], content };
    if (type === 'chantier') data.chantier_id = itemId;
    else if (type === 'os') data.os_id = itemId;
    else if (type === 'cr') data.cr_id = itemId;
    else if (type === 'task') data.task_id = itemId;
    const { error } = await supabase.from('comments').insert(data);
    if (error) throw new Error("Erreur ajout commentaire: " + error.message);
  },
  async getComments(type, itemId) {
    const col = type === 'chantier' ? 'chantier_id' : type === 'os' ? 'os_id' : type === 'cr' ? 'cr_id' : 'task_id';
    const { data, error } = await supabase.from('comments').select('*').eq(col, itemId).order('created_at', { ascending: false });
    if (error) throw new Error("Erreur chargement commentaires: " + error.message);
    return data || [];
  },
  async deleteComment(id) {
    await supabase.from('comments').delete().eq('id', id);
  },

  // Sharing
  async shareChantier(chantierId, email, permission = 'view') {
    const { error } = await supabase.from('sharing').insert({ chantier_id: chantierId, shared_with_email: email, permission });
    if (error) throw new Error("Erreur partage: " + error.message);
  },
  async getShares(chantierId) {
    const { data, error } = await supabase.from('sharing').select('*').eq('chantier_id', chantierId);
    if (error) throw new Error("Erreur chargement partages: " + error.message);
    return data || [];
  },
  async deleteShare(id) {
    await supabase.from('sharing').delete().eq('id', id);
  },

  // Authorized Users
  async getAuthorizedUsers() {
    const { data, error } = await supabase.from('authorized_users').select('*').order('prenom');
    if (error) throw new Error("Erreur chargement utilisateurs: " + error.message);
    return data || [];
  },
  async addAuthorizedUser(email, prenom, nom, role = 'salarié') {
    const { data, error } = await supabase.from('authorized_users').insert({
      email, prenom, nom, role, actif: true
    }).select().single();
    if (error) throw new Error("Erreur ajout utilisateur: " + error.message);
    return data;
  },
  async removeAuthorizedUser(id) {
    const { error } = await supabase.from('authorized_users').delete().eq('id', id);
    if (error) throw new Error("Erreur suppression utilisateur: " + error.message);
  },
};
