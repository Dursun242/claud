'use client'
import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { useChantiers, useContacts, useTasks, usePlanning, useRDVs, useCompteRendus, useOrdresService } from './hooks';
import { supabase } from './supabaseClient'
import { logout } from './auth'

// Lazy load PDF/Excel generators only when needed
const lazyGenerators = {
  generateOSPdf: null,
  generateCRPdf: null,
  generateOSExcel: null,
  generateCRExcel: null,
};

async function loadGenerators() {
  if (!lazyGenerators.generateOSPdf) {
    const gen = await import('./generators');
    lazyGenerators.generateOSPdf = gen.generateOSPdf;
    lazyGenerators.generateCRPdf = gen.generateCRPdf;
    lazyGenerators.generateOSExcel = gen.generateOSExcel;
    lazyGenerators.generateCRExcel = gen.generateCRExcel;
  }
  return lazyGenerators;
}

const LocalDB = {
  get(key) { try { if (typeof window === 'undefined') return null; const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); } },
};

// ─── SUPABASE CRUD HELPERS ───
const SB = {
  async loadAll() {
    const [ch, co, ta, pl, rv, cr, os] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('contacts').select('*').order('nom').limit(100),
      supabase.from('taches').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('planning').select('*').order('debut').limit(50),
      supabase.from('rdv').select('*').order('date').limit(50),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }).limit(50),
      supabase.from('ordres_service').select('*').order('created_at', { ascending: false }).limit(50),
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

  // Contacts
  async upsertContact(c) {
    const row = {
      nom: c.nom, type: c.type||"Artisan", specialite: c.specialite||null,
      tel: c.tel||null, email: c.email||null,
      adresse: c.adresse||null, siret: c.siret||null, notes: c.notes||null,
      // Champs étendus (nécessitent la migration SQL contacts_v2)
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
  async duplicateChantier(chantier) {
    const newCh = { ...chantier };
    delete newCh.id;
    delete newCh.created_at;
    newCh.nom = newCh.nom + " (copie)";
    return this.upsertChantier(newCh);
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

  // ─── AUTHORIZED USERS MANAGEMENT ───
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

// ─── ICONS ───
const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const I = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  projects: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  planning: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z",
  budget: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  tasks: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  contacts: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  ai: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z M12 8v4l3 3",
  send: "M22 2L11 13 M22 2l-7 20-4-9-9-4z",
  plus: "M12 5v14 M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  check: "M20 6L9 17l-5-5",
  settings: "M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z M12 6v12M6 12h12",
  x: "M18 6L6 18 M6 6l12 12",
  search: "M11 17.25a6.25 6.25 0 1 1 0-12.5 6.25 6.25 0 0 1 0 12.5z M16 16l4.5 4.5",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  mappin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  menu: "M3 12h18M3 6h18M3 18h18",
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8",
};

// ─── COLORS ───
const phase = { "Hors d'air": "#F59E0B", "Technique": "#3B82F6", "Finitions": "#10B981" };
const status = { "En cours": "#3B82F6", "Planifié": "#8B5CF6", "Terminé": "#10B981", "En attente": "#F59E0B", "Urgent": "#EF4444" };
const GC = { primary: "#EA4335", light: "#FEF2F2", border: "#FECACA", gradient: "linear-gradient(135deg, #EA4335 0%, #FBBC04 50%, #34A853 75%, #4285F4 100%)" };

// ─── GCAL EVENTS ───
// Google Calendar events - now fetched from real API (GCalV component)
const gcalEvents = [];

// ─── DEFAULT DATA ───
const defaultData = {
  chantiers: [
    { id:"ch1",nom:"Résidence Les Voiles",client:"SCI Maritime",adresse:"12 Quai de Southampton, Le Havre",phase:"Technique",statut:"En cours",budget:450000,depenses:287000,dateDebut:"2025-09-01",dateFin:"2026-06-30",lots:["Gros œuvre","Électricité","Plomberie","Menuiserie"] },
    { id:"ch2",nom:"Bureaux Port 2000",client:"HAROPA",adresse:"Zone industrielle Port 2000",phase:"Hors d'air",statut:"En cours",budget:820000,depenses:195000,dateDebut:"2025-11-15",dateFin:"2026-12-31",lots:["Structure métallique","Bardage","Électricité","CVC"] },
    { id:"ch3",nom:"Villa Sainte-Adresse",client:"M. Durand",adresse:"8 Rue Émile Zola, Sainte-Adresse",phase:"Finitions",statut:"En cours",budget:280000,depenses:241000,dateDebut:"2025-03-01",dateFin:"2026-04-15",lots:["Peinture","Revêtements sols","Menuiserie int."] },
    { id:"ch4",nom:"Réhab. Immeuble Thiers",client:"Copropriété Thiers",adresse:"34 Rue Thiers, Le Havre",phase:"Hors d'air",statut:"Planifié",budget:620000,depenses:0,dateDebut:"2026-04-01",dateFin:"2027-03-31",lots:["Ravalement","Étanchéité","Menuiseries ext."] },
    { id:"ch5",nom:"Garage Lucas",client:"M. Lucas",adresse:"Oudalle",phase:"Technique",statut:"En cours",budget:85000,depenses:32000,dateDebut:"2026-01-15",dateFin:"2026-05-30",lots:["Maçonnerie","Charpente","Couverture"] },
    { id:"ch6",nom:"Maison Friboulet",client:"Famille Friboulet",adresse:"Riville",phase:"Hors d'air",statut:"En cours",budget:320000,depenses:78000,dateDebut:"2025-12-01",dateFin:"2026-09-30",lots:["Gros œuvre","Charpente","Menuiseries ext.","Électricité","Plomberie"] },
  ],
  tasks: [
    { id:"t1",chantierId:"ch1",titre:"Vérifier tirage câbles RJ45 - Niv.2",priorite:"Urgent",statut:"En cours",echeance:"2026-03-18",lot:"Électricité" },
    { id:"t2",chantierId:"ch1",titre:"Réception menuiseries alu",priorite:"En cours",statut:"Planifié",echeance:"2026-03-22",lot:"Menuiserie" },
    { id:"t3",chantierId:"ch3",titre:"Contrôle peinture T2 apt 4B",priorite:"En cours",statut:"En cours",echeance:"2026-03-19",lot:"Peinture" },
    { id:"t4",chantierId:"ch2",titre:"Validation plans structure - Phase EXE",priorite:"Urgent",statut:"En cours",echeance:"2026-03-17",lot:"Structure métallique" },
    { id:"t5",chantierId:"ch3",titre:"Pose revêtements sols RDC",priorite:"En cours",statut:"Planifié",echeance:"2026-03-25",lot:"Revêtements sols" },
    { id:"t6",chantierId:"ch6",titre:"Finaliser dossier PC modificatif",priorite:"Urgent",statut:"En cours",echeance:"2026-03-19",lot:"Administratif" },
    { id:"t7",chantierId:"ch6",titre:"Dépôt PC modificatif mairie Riville",priorite:"Urgent",statut:"Planifié",echeance:"2026-03-20",lot:"Administratif" },
  ],
  rdv: [
    { id:"r1",chantierId:"ch1",titre:"Réunion de chantier hebdo",date:"2026-03-17",heure:"09:00",lieu:"Sur site",participants:["Lefèvre","Costa"] },
    { id:"r2",chantierId:"ch2",titre:"Visite MOA",date:"2026-03-18",heure:"14:00",lieu:"Bureau",participants:["HAROPA"] },
  ],
  contacts: [
    { id:"c1",nom:"Lefèvre Électricité",type:"Artisan",specialite:"Électricité CFO/CFA",tel:"06 12 34 56 78",email:"lefevre.elec@mail.fr",chantiers:["ch1","ch2"] },
    { id:"c2",nom:"Costa Plomberie",type:"Artisan",specialite:"Plomberie / CVC",tel:"06 23 45 67 89",email:"costa.plomb@mail.fr",chantiers:["ch1"] },
    { id:"c3",nom:"Normandie Peinture",type:"Artisan",specialite:"Peinture / Ravalement",tel:"06 34 56 78 90",email:"norm.peinture@mail.fr",chantiers:["ch3","ch4"] },
    { id:"c4",nom:"HAROPA",type:"Client",specialite:"Maîtrise d'ouvrage",tel:"02 35 xx xx xx",email:"projets@haropa.fr",chantiers:["ch2"] },
    { id:"c5",nom:"SCI Maritime",type:"Client",specialite:"Promotion immobilière",tel:"02 35 xx xx xx",email:"contact@sci-maritime.fr",chantiers:["ch1"] },
    { id:"c6",nom:"M. Durand",type:"Client",specialite:"Particulier",tel:"06 45 67 89 01",email:"durand@mail.fr",chantiers:["ch3"] },
    { id:"c7",nom:"Point P Le Havre",type:"Fournisseur",specialite:"Matériaux gros œuvre",tel:"02 35 xx xx xx",email:"lehavre@pointp.fr",chantiers:["ch1","ch2","ch4"] },
    { id:"c8",nom:"Rexel Normandie",type:"Fournisseur",specialite:"Matériel électrique",tel:"02 35 xx xx xx",email:"normandie@rexel.fr",chantiers:["ch1","ch2"] },
    { id:"c9",nom:"Atelier Bois Normand",type:"Artisan",specialite:"Menuiserie bois/alu",tel:"06 56 78 90 12",email:"atelierbois@mail.fr",chantiers:["ch1","ch3"] },
    { id:"c10",nom:"Famille Friboulet",type:"Client",specialite:"Particulier",tel:"06 78 90 12 34",email:"friboulet@mail.fr",chantiers:["ch6"] },
    { id:"c11",nom:"Eurofins Laboratoire",type:"Fournisseur",specialite:"Analyses / Contrôle",tel:"02 35 xx xx xx",email:"contact@eurofins.fr",chantiers:["ch5","ch6"] },
    { id:"c12",nom:"Maryam (Architecte)",type:"Artisan",specialite:"Architecture",tel:"06 89 01 23 45",email:"maryam.archi@mail.fr",chantiers:["ch6"] },
  ],
  compteRendus: [
    { id:"cr1",chantierId:"ch1",date:"2026-03-10",numero:12,resume:"Avancement gros œuvre 85%. Retard électricité niveau 2.",participants:"Lefèvre, Costa",decisions:"Relance Lefèvre tirage câbles avant 18/03." },
  ],
  planning: [
    { id:"p1",chantierId:"ch1",lot:"Électricité",tache:"Tirage câbles Niv.2",debut:"2026-03-10",fin:"2026-03-21",avancement:40 },
    { id:"p2",chantierId:"ch1",lot:"Menuiserie",tache:"Pose menuiseries alu",debut:"2026-03-22",fin:"2026-04-05",avancement:0 },
    { id:"p3",chantierId:"ch2",lot:"Structure",tache:"Montage charpente zone B",debut:"2026-03-01",fin:"2026-04-15",avancement:55 },
    { id:"p4",chantierId:"ch3",lot:"Peinture",tache:"Finitions apt 4B",debut:"2026-03-10",fin:"2026-03-20",avancement:70 },
    { id:"p5",chantierId:"ch6",lot:"Gros œuvre",tache:"Fondations + Élévation",debut:"2026-01-15",fin:"2026-04-30",avancement:35 },
    { id:"p6",chantierId:"ch5",lot:"Maçonnerie",tache:"Murs garage",debut:"2026-02-01",fin:"2026-03-30",avancement:60 },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 9);
const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short"}) : "—";
const fmtMoney = n => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);
const pct = (a,b) => b ? Math.round(a/b*100) : 0;
const fmtTime = s => new Date(s).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
const fmtDayFr = s => new Date(s).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});

// ─── SHARED COMPONENTS ───
function Modal({open,onClose,title,children,wide}) {
  if (!open) return null;
  return (<div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",backdropFilter:"blur(4px)",padding:16}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:"20px",width:wide?700:520,maxWidth:"100%",maxHeight:"85vh",overflow:"auto",boxShadow:"0 25px 50px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:17,fontWeight:700,color:"#0F172A"}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.x} size={20} color="#94A3B8"/></button>
      </div>
      {children}
    </div>
  </div>);
}

function FF({label,children}) {
  return <div style={{marginBottom:12}}><label style={{display:"block",fontSize:11,fontWeight:600,color:"#64748B",marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>{children}</div>;
}
const inp = {width:"100%",padding:"8px 12px",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:14,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const sel = {...inp,background:"#fff"};
const btnP = {padding:"10px 18px",background:"#1E3A5F",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"};
const btnS = {...btnP,background:"#F1F5F9",color:"#475569"};

function PBar({value,max=100,color="#3B82F6",h=8}) {
  return <div style={{background:"#F1F5F9",borderRadius:h,height:h,overflow:"hidden",width:"100%"}}><div style={{width:`${Math.min(Math.round(value/max*100),100)}%`,height:"100%",background:color,borderRadius:h,transition:"width .5s"}}/></div>;
}

function Badge({text,color}) {
  return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:16,fontSize:10,fontWeight:700,background:color+"18",color,whiteSpace:"nowrap"}}>{text}</span>;
}

function ApiBadge() {
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:GC.gradient,color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>;
}

function AttachmentsSection({attachments=[], type, itemId, onUpload, onDelete, loading}) {
  const fileInputRef = useRef(null);
  const handleFileSelect = async(e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await onUpload(file);
        e.target.value = '';
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
  };
  const isImage = (fileName) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  const getFileIcon = (fileName) => /\.pdf$/i.test(fileName) ? '📄' : /\.(xls|xlsx|csv)$/i.test(fileName) ? '📊' : /\.(doc|docx)$/i.test(fileName) ? '📝' : '📎';
  const getFileUrl = (filePath) => {
    const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
    return data?.publicUrl;
  };

  return (
    <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #E2E8F0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <span style={{fontSize:12,fontWeight:700,color:"#64748B"}}>📎 Attachments ({attachments.length})</span>
        <button onClick={()=>fileInputRef.current?.click()} disabled={loading} style={{background:"#3B82F6",color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",opacity:loading?0.6:1}}>
          {loading ? '⏳' : '+ Ajouter'}
        </button>
        <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{display:"none"}}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(80px,1fr))",gap:8}}>
        {attachments.map(att=>(
          <div key={att.id} style={{position:"relative",background:"#F8FAFC",borderRadius:6,padding:6,textAlign:"center"}}>
            {isImage(att.file_name) ? (
              <img src={getFileUrl(att.file_path)} style={{width:"100%",height:60,objectFit:"cover",borderRadius:4}} alt={att.file_name}/>
            ) : (
              <div style={{fontSize:24,textAlign:"center"}}>{getFileIcon(att.file_name)}</div>
            )}
            <button onClick={()=>onDelete(att.id,att.file_path)} style={{position:"absolute",top:-4,right:-4,background:"#EF4444",color:"#fff",border:"none",borderRadius:"50%",width:20,height:20,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            <div style={{fontSize:8,color:"#94A3B8",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{att.file_name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// FLOATING NEON MIC BUTTON (4-branch cross, heartbeat, neon glow)
// ═══════════════════════════════════════════
function FloatingMic({ listening, onClick, transcript, onSend, onClear, isMobile }) {
  return (<>
    {/* FLOATING BUTTON — fixed bottom-right */}
    <div style={{
      position: "fixed", bottom: isMobile ? 24 : 32, right: isMobile ? 24 : 32, zIndex: 1100,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
    }}>
      {/* Transcript bubble when listening */}
      {listening && transcript && (
        <div style={{
          background: "rgba(15,23,42,0.92)", backdropFilter: "blur(12px)",
          borderRadius: 16, padding: "12px 16px", maxWidth: isMobile ? 260 : 340,
          color: "#fff", fontSize: 13, lineHeight: 1.5,
          border: "1px solid rgba(0,255,136,0.25)",
          boxShadow: "0 0 20px rgba(0,255,136,0.15), 0 8px 32px rgba(0,0,0,0.3)",
          animation: "fadeIn .2s ease",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#00FF88", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00FF88", animation: "neonPulse 1s infinite" }} />
            Transcription en direct
          </div>
          <div>{transcript}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={onSend} style={{ padding: "5px 12px", borderRadius: 8, background: "#00FF88", color: "#0F172A", border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Envoyer à l'IA</button>
            <button onClick={onClear} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.15)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Effacer</button>
          </div>
        </div>
      )}

      {/* The neon mic button */}
      <button onClick={onClick} style={{
        position: "relative", width: 64, height: 64, borderRadius: "50%",
        background: listening
          ? "radial-gradient(circle at 40% 40%, #ff2d2d 0%, #cc0000 60%, #990000 100%)"
          : "radial-gradient(circle at 40% 40%, #1E3A5F 0%, #0F172A 70%)",
        border: listening ? "2px solid rgba(255,50,50,0.6)" : "2px solid rgba(0,255,136,0.3)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: listening
          ? "0 0 15px rgba(255,50,50,0.6), 0 0 40px rgba(255,50,50,0.3), 0 0 80px rgba(255,50,50,0.15), inset 0 0 15px rgba(255,100,100,0.2)"
          : "0 0 12px rgba(0,255,136,0.3), 0 0 30px rgba(0,255,136,0.15), 0 0 60px rgba(0,255,136,0.07), inset 0 0 10px rgba(0,255,136,0.08)",
        transition: "all .4s cubic-bezier(0.4,0,0.2,1)",
        animation: listening ? "none" : "neonBreathing 3s ease-in-out infinite",
      }}>
        {/* IA text with heartbeat */}
        <span style={{
          fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px",
          color: listening ? "#fff" : "#00FF88",
          fontFamily: "'DM Sans', sans-serif",
          animation: listening ? "heartbeat 0.8s ease-in-out infinite" : "none",
          filter: listening ? "drop-shadow(0 0 4px rgba(255,200,200,0.8))" : "drop-shadow(0 0 3px rgba(0,255,136,0.6))",
          userSelect: "none",
        }}>IA</span>

        {/* Neon glow rings */}
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%",
          border: `2px solid ${listening ? "rgba(255,80,80,0.5)" : "rgba(0,255,136,0.35)"}`,
          animation: listening ? "ripple 1.2s ease-out infinite" : "neonRing 3s ease-in-out infinite",
        }} />
        <span style={{
          position: "absolute", inset: -8, borderRadius: "50%",
          border: `1.5px solid ${listening ? "rgba(255,80,80,0.25)" : "rgba(0,255,136,0.15)"}`,
          animation: listening ? "ripple 1.2s ease-out infinite 0.25s" : "neonRing 3s ease-in-out infinite 1s",
        }} />
        {listening && <span style={{
          position: "absolute", inset: -14, borderRadius: "50%",
          border: "1px solid rgba(255,80,80,0.12)",
          animation: "ripple 1.2s ease-out infinite 0.5s",
        }} />}
      </button>
    </div>
  </>);
}

// Small inline MicButton for the AI chat input row
function MicButtonInline({ listening, onClick }) {
  return (
    <button onClick={onClick} style={{
      position: "relative", width: 44, height: 44, borderRadius: "50%",
      background: listening ? "linear-gradient(135deg, #EF4444, #DC2626)" : "linear-gradient(135deg, #1E3A5F, #3B82F6)",
      border: listening ? "2px solid rgba(255,80,80,0.4)" : "2px solid rgba(0,255,136,0.2)",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: listening ? "0 0 12px rgba(239,68,68,0.5)" : "0 0 8px rgba(0,255,136,0.2)",
      transition: "all .3s", flexShrink: 0,
    }}>
      <span style={{
        fontSize: 16, fontWeight: 900, color: "#fff", fontFamily: "'DM Sans', sans-serif",
        animation: listening ? "heartbeat 0.8s ease-in-out infinite" : "none",
        userSelect: "none",
      }}>IA</span>
    </button>
  );
}

// ═══════════════════════════════════════════
// MAIN APP (Responsive)
// ═══════════════════════════════════════════
// ADMIN PANEL
// ═══════════════════════════════════════════
function AdminV({m, reload}) {
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [newNom, setNewNom] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await SB.getAuthorizedUsers();
      setUsers(data);
    } catch (err) {
      console.error("Erreur chargement utilisateurs:", err);
    }
  };

  const handleAdd = async () => {
    if (!newEmail || !newPrenom) {
      alert("Email et prénom requis");
      return;
    }
    setLoading(true);
    try {
      await SB.addAuthorizedUser(newEmail, newPrenom, newNom);
      setNewEmail("");
      setNewPrenom("");
      setNewNom("");
      loadUsers();
      alert("✅ Salarié ajouté!");
    } catch (err) {
      alert("❌ Erreur: " + err.message);
    }
    setLoading(false);
  };

  const handleRemove = async (id) => {
    if (!window.confirm("Retirer cet accès?")) return;
    try {
      await SB.removeAuthorizedUser(id);
      loadUsers();
      alert("✅ Accès retiré");
    } catch (err) {
      alert("❌ Erreur: " + err.message);
    }
  };

  return (
    <div>
      <h1 style={{margin:"0 0 20px",fontSize:m?18:24,fontWeight:700}}>🔒 Gestion des accès</h1>

      {/* AJOUTER UN SALARIÉ */}
      <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:20}}>
        <h2 style={{margin:"0 0 14px",fontSize:15,fontWeight:700}}>➕ Ajouter un salarié</h2>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(3,1fr)",gap:12,marginBottom:12}}>
          <input type="email" placeholder="email@gmail.com" value={newEmail} onChange={e=>setNewEmail(e.target.value)} style={{padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
          <input type="text" placeholder="Prénom" value={newPrenom} onChange={e=>setNewPrenom(e.target.value)} style={{padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
          <input type="text" placeholder="Nom (optionnel)" value={newNom} onChange={e=>setNewNom(e.target.value)} style={{padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
        </div>
        <button onClick={handleAdd} disabled={loading} style={{...btnP,fontSize:12}}>
          {loading ? "⏳ Ajout..." : "✓ Ajouter"}
        </button>
      </div>

      {/* LISTE DES SALARIÉS */}
      <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        <h2 style={{margin:"0 0 14px",fontSize:15,fontWeight:700}}>👥 Utilisateurs autorisés ({users.length})</h2>
        <div style={{display:"grid",gap:10}}>
          {users.length===0 ? (
            <p style={{color:"#94A3B8",fontSize:13}}>Aucun utilisateur</p>
          ) : (
            users.map(u=>(
              <div key={u.id} style={{background:"#F8FAFC",borderRadius:10,padding:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#0F172A"}}>{u.prenom} {u.nom||""}</div>
                  <div style={{fontSize:11,color:"#64748B"}}>{u.email}</div>
                  <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>
                    {u.role==="admin"?"🔑 Admin":"👤 Salarié"}
                  </div>
                </div>
                <button onClick={()=>handleRemove(u.id)} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"6px 12px",color:"#EF4444",fontSize:12,cursor:"pointer",fontWeight:600}}>
                  Retirer
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// EXPORT HELPERS (lazy loaded)
async function exportOSPdf(data) {
  const { generateOSPdf } = await loadGenerators();
  generateOSPdf(data);
}
async function exportOSExcel(data) {
  const { generateOSExcel } = await loadGenerators();
  generateOSExcel(data);
}
async function exportCRPdf(data) {
  const { generateCRPdf } = await loadGenerators();
  generateCRPdf(data);
}
async function exportCRExcel(data) {
  const { generateCRExcel } = await loadGenerators();
  generateCRExcel(data);
}

// ═══════════════════════════════════════════
export default function App({ user }) {
  // React Query hooks
  const chantiersQuery = useChantiers();
  const contactsQuery = useContacts();
  const tasksQuery = useTasks();
  const planningQuery = usePlanning();
  const rdvQuery = useRDVs();
  const compteRendusQuery = useCompteRendus();
  const ordresServiceQuery = useOrdresService();
  const queryClient = useQueryClient();

  // Combine all queries into single data object (for backward compatibility)
  const data = useMemo(() => {
    if (chantiersQuery.isLoading || contactsQuery.isLoading || tasksQuery.isLoading) return null;
    return {
      chantiers: chantiersQuery.data || [],
      contacts: contactsQuery.data || [],
      tasks: tasksQuery.data || [],
      planning: planningQuery.data || [],
      rdv: rdvQuery.data || [],
      compteRendus: compteRendusQuery.data || [],
      ordresService: ordresServiceQuery.data || [],
    };
  }, [chantiersQuery.data, chantiersQuery.isLoading, contactsQuery.data, contactsQuery.isLoading,
      tasksQuery.data, tasksQuery.isLoading, planningQuery.data, rdvQuery.data, compteRendusQuery.data, ordresServiceQuery.data]);

  const loading = chantiersQuery.isLoading || contactsQuery.isLoading || tasksQuery.isLoading;

  // State
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // Floating mic state
  const [floatListening, setFloatListening] = useState(false);
  const [floatTranscript, setFloatTranscript] = useState("");
  const floatRecogRef = useRef(null);

  const toggleFloatMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Reconnaissance vocale non supportée. Utilisez Chrome ou Safari."); return; }
    if (floatListening && floatRecogRef.current) {
      floatRecogRef.current.stop(); setFloatListening(false); return;
    }
    const r = new SR(); r.lang = "fr-FR"; r.continuous = true; r.interimResults = true;
    floatRecogRef.current = r; let final = "";
    r.onstart = () => { setFloatListening(true); setFloatTranscript(""); };
    r.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
        else interim = ev.results[i][0].transcript;
      }
      setFloatTranscript(final + interim);
    };
    r.onerror = () => setFloatListening(false);
    r.onend = () => { setFloatListening(false); if (final.trim()) setFloatTranscript(final.trim()); };
    r.start();
  }, [floatListening]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check);
  }, []);

  // Reload data using React Query invalidation
  const reload = useCallback(async () => {
    console.log("🔄 Invalidating all queries...");
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chantiers'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['planning'] }),
      queryClient.invalidateQueries({ queryKey: ['rdv'] }),
      queryClient.invalidateQueries({ queryKey: ['compteRendus'] }),
      queryClient.invalidateQueries({ queryKey: ['ordresService'] }),
    ]);
    console.log("✅ Reload complete");
  }, [queryClient]);

  // Legacy save (no longer needed with React Query)
  const save = useCallback(async (d) => { console.log("Save called (React Query manages state now)"); }, []);

  if (loading || !data) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:48,height:48,border:"4px solid #E2E8F0",borderTopColor:"#1E3A5F",borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    </div>
  );

  const tabs = [
    {key:"dashboard",label:"Tableau de bord",icon:I.dashboard},
    {key:"projects",label:"Chantiers",icon:I.projects},
    {key:"os",label:"Ordres de Service",icon:I.reports},
    {key:"reports",label:"Comptes Rendus",icon:I.reports},
    {key:"tasks",label:"Tâches",icon:I.tasks},
    {key:"planning",label:"Planning",icon:I.planning},
    {key:"contacts",label:"Annuaire",icon:I.contacts},
    {key:"qonto",label:"Qonto",icon:null,isQonto:true},
    {key:"gcal",label:"Agenda Google",icon:null,isGcal:true},
    {key:"admin",label:"🔒 Admin",icon:I.settings},
    {key:"ai",label:"Assistant IA",icon:I.ai},
  ];

  const switchTab = (k) => { setTab(k); if (isMobile) setSidebarOpen(false); };

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",background:"#F1F5F9",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}45%{transform:scale(1.12)}60%{transform:scale(1)}}
        @keyframes ripple{0%{transform:scale(1);opacity:1}100%{transform:scale(1.8);opacity:0}}
        @keyframes neonBreathing{0%,100%{box-shadow:0 0 12px rgba(0,255,136,0.3),0 0 30px rgba(0,255,136,0.15),0 0 60px rgba(0,255,136,0.07);border-color:rgba(0,255,136,0.3)}50%{box-shadow:0 0 18px rgba(0,255,136,0.5),0 0 45px rgba(0,255,136,0.25),0 0 90px rgba(0,255,136,0.12);border-color:rgba(0,255,136,0.5)}}
        @keyframes neonRing{0%,100%{opacity:0.4;transform:scale(1)}50%{opacity:0.8;transform:scale(1.05)}}
        @keyframes neonPulse{0%,100%{opacity:1;box-shadow:0 0 3px #00FF88}50%{opacity:0.5;box-shadow:0 0 8px #00FF88}}
        @keyframes pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,0.3)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3B82F6!important;outline:none}
      `}</style>

      {/* MOBILE OVERLAY */}
      {isMobile && sidebarOpen && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:998}} onClick={()=>setSidebarOpen(false)} />}

      {/* SIDEBAR */}
      <nav style={{
        width:isMobile?260:240,position:isMobile?"fixed":"relative",left:isMobile?(sidebarOpen?0:-280):0,top:0,bottom:0,
        background:"linear-gradient(195deg,#0F172A,#1E3A5F)",color:"#fff",display:"flex",flexDirection:"column",flexShrink:0,
        zIndex:999,transition:"left .3s ease",boxShadow:isMobile&&sidebarOpen?"4px 0 20px rgba(0,0,0,0.3)":"none"
      }}>
        <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{fontSize:18,fontWeight:700}}>ID MAÎTRISE</div>
          <div style={{fontSize:10,color:"#94A3B8",marginTop:2,letterSpacing:"0.05em"}}>MAÎTRISE D'ŒUVRE • LE HAVRE</div>
        </div>
        <div style={{flex:1,padding:"10px 8px",display:"flex",flexDirection:"column",gap:2,overflow:"auto"}}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>switchTab(t.key)} style={{
              display:"flex",alignItems:"center",gap:9,padding:"9px 11px",border:"none",borderRadius:7,cursor:"pointer",fontFamily:"inherit",fontSize:12.5,fontWeight:tab===t.key?600:400,
              color:tab===t.key?(t.isGcal?"#FCA5A5":t.isQonto?"#C4B5FD":"#fff"):(t.isGcal?"#F87171":t.isQonto?"#A78BFA":"#94A3B8"),
              background:tab===t.key?(t.isGcal?"rgba(234,67,53,0.15)":t.isQonto?"rgba(124,58,237,0.15)":"rgba(255,255,255,0.12)"):"transparent",
              transition:"all .2s",textAlign:"left",width:"100%",
              borderLeft:t.isGcal&&tab===t.key?"3px solid #EA4335":t.isQonto&&tab===t.key?"3px solid #7C3AED":"3px solid transparent",
            }}>
              {t.isGcal ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#EA4335" strokeWidth="2"/><path d="M3 10h18" stroke="#EA4335" strokeWidth="2"/><path d="M8 2v4M16 2v4" stroke="#EA4335" strokeWidth="2" strokeLinecap="round"/></svg>
                : t.isQonto ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#7C3AED" strokeWidth="2"/><path d="M15 15l3 3" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                : <Icon d={t.icon} size={16} color={tab===t.key?"#60A5FA":"#64748B"}/>}
              <span style={{flex:1}}>{t.label}</span>
              {t.isGcal && <ApiBadge/>}
              {t.isQonto && <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:"linear-gradient(135deg,#7C3AED,#A855F7)",color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>}
            </button>
          ))}
        </div>
        {/* User info + Logout */}
        <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          {user && (
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} style={{width:28,height:28,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)"}} alt=""/>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{fontSize:9,color:"#64748B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={logout} style={{width:"100%",padding:"6px 10px",borderRadius:6,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#94A3B8",fontSize:10,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>
            Déconnexion
          </button>
          <div style={{fontSize:9,color:"#475569",marginTop:6}}>SARL ID MAITRISE<br/>9 Rue Henry Genestal, 76600 Le Havre</div>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main style={{flex:1,overflow:"auto",padding:isMobile?16:24,paddingTop:isMobile?60:24}}>
        {/* MOBILE HEADER */}
        {isMobile && (
          <div style={{position:"fixed",top:0,left:0,right:0,height:52,background:"#fff",borderBottom:"1px solid #E2E8F0",display:"flex",alignItems:"center",padding:"0 16px",zIndex:997,gap:12}}>
            <button onClick={()=>setSidebarOpen(true)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.menu} size={22} color="#0F172A"/></button>
            <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>ID Maîtrise</span>
            <span style={{fontSize:11,color:"#94A3B8",marginLeft:"auto"}}>{tabs.find(t=>t.key===tab)?.label}</span>
          </div>
        )}
        <div style={{animation:"fadeIn .3s ease",maxWidth:1200}}>
          <Suspense fallback={<div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>⏳ Chargement...</div>}>
            {tab==="dashboard"&&<DashboardV data={data} setTab={switchTab} m={isMobile} user={user}/>}
            {tab==="gcal"&&<GCalV m={isMobile}/>}
            {tab==="qonto"&&<QontoV m={isMobile} data={data} reload={reload}/>}
            {tab==="projects"&&<ProjectsV data={data} save={save} m={isMobile} reload={reload}/>}
            {tab==="planning"&&<PlanningV data={data} m={isMobile}/>}
            {tab==="tasks"&&<TasksV data={data} save={save} m={isMobile} reload={reload}/>}
            {tab==="contacts"&&<ContactsV data={data} save={save} m={isMobile} reload={reload}/>}
            {tab==="reports"&&<ReportsV data={data} save={save} m={isMobile} reload={reload}/>}
            {tab==="os"&&<OrdresServiceV data={data} m={isMobile} reload={reload}/>}
            {tab==="admin"&&<AdminV m={isMobile} reload={reload}/>}
            {tab==="ai"&&<AIV data={data} save={save} m={isMobile} externalTranscript={floatTranscript} clearExternal={()=>setFloatTranscript("")} reload={reload}/>}
          </Suspense>
        </div>
      </main>

      {/* FLOATING NEON MIC — visible on ALL tabs */}
      {tab !== "ai" && (
        <FloatingMic
          listening={floatListening}
          onClick={toggleFloatMic}
          transcript={floatTranscript}
          isMobile={isMobile}
          onSend={() => { setTab("ai"); /* transcript will be picked up by AIV */ }}
          onClear={() => { setFloatTranscript(""); if (floatListening && floatRecogRef.current) { floatRecogRef.current.stop(); setFloatListening(false); } }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function DashboardV({data,setTab,m,user}) {
  const today = new Date().toISOString().split("T")[0];

  const todayGcal = useMemo(() => gcalEvents.filter(e=>e.start.split("T")[0]===today), [today]);

  const urgentTasks = useMemo(() =>
    data.tasks.filter(t=>t.priorite==="Urgent"&&t.statut!=="Terminé"),
    [data.tasks]
  );

  const allActiveTasks = useMemo(() =>
    data.tasks
      .filter(t=>t.statut!=="Terminé")
      .sort((a,b)=>{
        const pri = {Urgent:0,"En cours":1,"En attente":2};
        if ((pri[a.priorite]??9) !== (pri[b.priorite]??9)) return (pri[a.priorite]??9)-(pri[b.priorite]??9);
        return new Date(a.echeance||"9999")-new Date(b.echeance||"9999");
      }),
    [data.tasks]
  );

  const chantiersEnCours = useMemo(() =>
    data.chantiers.filter(c=>c.statut==="En cours").sort((a,b)=>new Date(b.date_debut||0)-new Date(a.date_debut||0)).slice(0,3),
    [data.chantiers]
  );

  const totalB = useMemo(() =>
    data.chantiers.reduce((s,c)=>s+(Number(c.budget)||0),0),
    [data.chantiers]
  );

  const totalD = useMemo(() =>
    data.chantiers.reduce((s,c)=>s+(Number(c.depenses)||0),0),
    [data.chantiers]
  );

  const enCours = useMemo(() =>
    data.chantiers.filter(c=>c.statut==="En cours").length,
    [data.chantiers]
  );

  return (<div>
    {/* HEADER */}
    <div style={{marginBottom:24}}>
      <h1 style={{margin:0,fontSize:m?22:28,fontWeight:700,color:"#0F172A"}}>Bonjour {user?.user_metadata?.full_name?.split(" ")[0] || "Dursun"}</h1>
      <p style={{margin:"6px 0 0",color:"#64748B",fontSize:m?12:13}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"})}</p>
    </div>

    {/* ACTIONS RAPIDES */}
    <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:24}}>
      {[
        {label:"Nouvel OS",icon:"📋",tab:"orders"},
        {label:"Nouveau CR",icon:"📝",tab:"reports"},
        {label:"Nouvelle tâche",icon:"✓",tab:"tasks"},
        {label:"Nouveau chantier",icon:"🏗️",tab:"projects"},
      ].map((a,i)=>(
        <button key={i} onClick={()=>setTab(a.tab)} style={{background:"#fff",border:"1.5px solid #E2E8F0",borderRadius:10,padding:12,cursor:"pointer",transition:"all .15s",textAlign:"center",fontWeight:600,fontSize:12,color:"#0F172A",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <span style={{fontSize:20}}>{a.icon}</span>{a.label}
        </button>
      ))}
    </div>

    {/* CHANTIERS EN COURS */}
    {chantiersEnCours.length>0&&(
      <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#0F172A"}}>Chantiers en cours</h2>
          <button onClick={()=>setTab("projects")} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Voir tous →</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(3,1fr)",gap:12}}>
          {chantiersEnCours.map(ch=>{
            const ratio=pct(ch.depenses,ch.budget);
            const budgetColor=ratio>85?"#EF4444":ratio>60?"#F59E0B":"#10B981";
            return(
              <div key={ch.id} onClick={()=>setTab("projects")} style={{border:`2px solid ${phase[ch.phase]||"#E2E8F0"}`,borderRadius:10,padding:12,cursor:"pointer",background:"#FAFAFA",transition:"all .15s",":hover":{boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}}>
                <div style={{marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#0F172A",marginBottom:2}}>{ch.nom}</div>
                  <div style={{fontSize:11,color:"#64748B"}}>{ch.client}</div>
                </div>
                <PBar value={ch.depenses} max={ch.budget} color={budgetColor}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:10,color:"#94A3B8"}}>
                  <span><span style={{fontWeight:600,color:budgetColor}}>{ratio}%</span> dépensé</span>
                  <span>{fmtMoney(ch.depenses)} / {fmtMoney(ch.budget)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* À FAIRE AUJOURD'HUI */}
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:16,marginBottom:20}}>
      {/* AGENDA */}
      <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderTop:`3px solid ${GC.primary}`}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:"#0F172A"}}>📅 Agenda</span>
          <ApiBadge/>
        </div>
        {todayGcal.length===0
          ? <p style={{color:"#94A3B8",fontSize:12,margin:0}}>Aucun RDV aujourd'hui</p>
          : <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {todayGcal.map(ev=>(
                <div key={ev.id} style={{borderLeft:`3px solid ${GC.primary}`,paddingLeft:10,borderRadius:4}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#0F172A"}}>{fmtTime(ev.start)} — {ev.summary}</div>
                  {ev.location&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{ev.location}</div>}
                </div>
              ))}
            </div>
        }
      </div>

      {/* TÂCHES URGENTES */}
      <div style={{background:"#FEF2F2",borderRadius:14,padding:m?14:18,border:"1.5px solid #FECACA"}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:"#0F172A"}}>⚡ À faire</span>
          {urgentTasks.length>0&&<span style={{background:"#EF4444",color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{urgentTasks.length}</span>}
        </div>
        {allActiveTasks.length===0
          ? <p style={{color:"#94A3B8",fontSize:12,margin:0}}>Aucune tâche</p>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {allActiveTasks.slice(0,5).map(t=>{
                const ch=data.chantiers.find(c=>c.id===(t.chantierId||t.chantier_id));
                const isUrgent=t.priorite==="Urgent";
                return(
                  <div key={t.id} onClick={()=>setTab("tasks")} style={{cursor:"pointer",paddingBottom:8,borderBottom:"1px solid #F1F5F9"}}>
                    <div style={{fontSize:12,fontWeight:isUrgent?700:600,color:isUrgent?"#EF4444":"#0F172A"}}>{isUrgent?"⚠ ":""}{t.titre}</div>
                    <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>{ch?.nom}</div>
                  </div>
                );
              })}
              {allActiveTasks.length>5&&<button onClick={()=>setTab("tasks")} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600,marginTop:4}}>Voir les {allActiveTasks.length-5} autres →</button>}
            </div>
        }
      </div>
    </div>

    {/* STATISTIQUES */}
    <div style={{background:"#fff",borderRadius:14,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
      <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0F172A"}}>Vue d'ensemble</h3>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(2,1fr)",gap:16}}>
        <div style={{paddingRight:m?0:16,borderRight:m?"none":"1px solid #E2E8F0"}}>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Chantiers actifs</div>
          <div style={{fontSize:m?28:32,fontWeight:700,color:"#3B82F6",marginBottom:8}}>{enCours}</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",background:"#3B82F6",width:enCours/(data.chantiers.length||1)*100+"%"}}/>
            </div>
            <span style={{fontSize:10,color:"#64748B"}}>{enCours}/{data.chantiers.length}</span>
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:"#94A3B8",fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Budget</div>
          <div style={{fontSize:m?24:28,fontWeight:700,color:"#10B981",marginBottom:8}}>{fmtMoney(totalB)}</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748B"}}>
            <span>Dépensé: <span style={{fontWeight:600}}>{fmtMoney(totalD)}</span></span>
            <span style={{color:pct(totalD,totalB)>85?"#EF4444":pct(totalD,totalB)>60?"#F59E0B":"#10B981",fontWeight:600}}>{pct(totalD,totalB)}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// GOOGLE CALENDAR VIEW
// ═══════════════════════════════════════════
function GCalV({m}) {
  const today = new Date().toISOString().split("T")[0];
  const byDay = {}; gcalEvents.forEach(e=>{const d=e.start.split("T")[0];(byDay[d]=byDay[d]||[]).push(e);});

  return (<div>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
      <div style={{width:40,height:40,borderRadius:10,background:GC.gradient,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(234,67,53,0.3)"}}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#fff" strokeWidth="2"/><path d="M3 10h18" stroke="#fff" strokeWidth="2"/></svg>
      </div>
      <div><h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Google Calendar <ApiBadge/></h1><p style={{margin:0,fontSize:12,color:"#64748B"}}>Suivi Pro ID MAITRISE</p></div>
    </div>

    <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8,fontSize:12}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:"#22C55E",animation:"pulseGlow 2s infinite"}}/><span style={{fontWeight:600,color:"#166534"}}>Connecté</span><span style={{color:"#64748B"}}>• dursunozkan88@gmail.com</span>
    </div>

    <div style={{background:"#fff",borderRadius:14,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`1px solid ${GC.border}`}}>
      {Object.keys(byDay).sort().map(day=>{const isT=day===today; return(
        <div key={day} style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{background:isT?GC.primary:"#F1F5F9",color:isT?"#fff":"#64748B",borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:700}}>{fmtDayFr(day+"T00:00:00")}{isT?" • Aujourd'hui":""}</span>
            <div style={{flex:1,height:1,background:isT?GC.border:"#F1F5F9"}}/>
          </div>
          {byDay[day].map(ev=>(
            <div key={ev.id} style={{display:"flex",gap:12,padding:"10px 12px",marginBottom:6,borderRadius:10,background:isT?GC.light:"#FAFAFA",border:`1.5px solid ${isT?GC.border:"#F1F5F9"}`}}>
              <div style={{minWidth:55,textAlign:"center"}}><div style={{fontSize:14,fontWeight:700,color:GC.primary}}>{fmtTime(ev.start)}</div><div style={{fontSize:10,color:"#94A3B8"}}>{fmtTime(ev.end)}</div></div>
              <div style={{width:3,borderRadius:3,background:GC.gradient,flexShrink:0}}/>
              <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ev.summary}</span><ApiBadge/></div>
                {ev.description&&<div style={{fontSize:11,color:"#64748B",marginBottom:2}}>{ev.description}</div>}
                {ev.location&&<div style={{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:3}}><Icon d={I.mappin} size={10} color="#94A3B8"/>{ev.location}</div>}
              </div>
            </div>
          ))}
        </div>
      );})}
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// QONTO VIEW (Factures, Devis, Clients)
// ═══════════════════════════════════════════
const QT = { primary:"#7C3AED", light:"#F5F3FF", border:"#DDD6FE", gradient:"linear-gradient(135deg,#7C3AED,#A855F7,#C084FC)" };

function QontoBadge() {
  return <span style={{display:"inline-flex",alignItems:"center",gap:3,padding:"2px 7px",borderRadius:5,background:QT.gradient,color:"#fff",fontSize:8,fontWeight:800,letterSpacing:"0.1em"}}>API</span>;
}

function QontoV({m, data, reload}) {
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [activeTab, setActiveTab] = useState("factures");
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [qLoading, setQLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [importing, setImporting] = useState({});
  const [importMsg, setImportMsg] = useState({});

  // Charge le token depuis Supabase (cross-device), fallback localStorage
  useEffect(() => {
    (async () => {
      try {
        const { data: row } = await supabase.from('settings').select('value').eq('key','qonto-token').single();
        const t = row?.value;
        if (t && t.includes(":")) { setSavedToken(t); setToken(t); return; }
      } catch {}
      // Fallback localStorage
      const t = LocalDB.get("qonto-token");
      if (t && t.includes(":")) { setSavedToken(t); setToken(t); }
    })();
  }, []);

  const saveToken = async () => {
    const t = token.trim();
    if (!t) return;
    if (!t.includes(":")) {
      setError("Format invalide — doit être login:secret-key (avec deux-points).");
      return;
    }
    setError("");
    // Sauvegarde dans Supabase ET localStorage
    await supabase.from('settings').upsert({ key: 'qonto-token', value: t });
    LocalDB.set("qonto-token", t);
    setSavedToken(t);
    fetchAll(t);
  };

  const disconnect = async () => {
    await supabase.from('settings').delete().eq('key','qonto-token');
    LocalDB.set("qonto-token", "");
    setSavedToken(""); setToken(""); setConnected(false); setError("");
    setInvoices([]); setQuotes([]); setClients([]);
  };

  const fetchQonto = async (endpoint, tk) => {
    const res = await fetch(`/api/qonto?endpoint=${encodeURIComponent(endpoint)}&token=${encodeURIComponent(tk)}`);
    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error || `Qonto ${res.status}`); }
    return res.json();
  };

  const fetchAll = async (tk) => {
    setQLoading(true); setError("");
    try {
      const [invData, quoData, cliData] = await Promise.all([
        fetchQonto("client_invoices?exclude_imports=false", tk),
        fetchQonto("quotes", tk),
        fetchQonto("clients", tk),
      ]);
      setInvoices(invData.client_invoices || []);
      setQuotes(quoData.quotes || []);
      setClients(cliData.clients || []);
      setConnected(true);
    } catch (e) {
      setError(e.message || "Erreur de connexion à Qonto");
      setConnected(false);
    }
    setQLoading(false);
  };

  useEffect(() => { if (savedToken) fetchAll(savedToken); }, [savedToken]);

  // ── Téléchargement PDF ──
  const downloadPdf = async (item, type) => {
    // 1. Champs directs possibles selon la version de l'API Qonto
    const directUrl = item.pdf_url || item.file_url || item.pdf_download_url
      || item.attachment?.url || item.file?.url || item.document_url
      || item.attachments?.[0]?.url;
    if (directUrl) { window.open(directUrl, "_blank"); return; }

    try {
      // 2. Récupération du détail complet
      const endpoint = type === "invoice" ? `client_invoices/${item.id}` : `quotes/${item.id}`;
      const detail = await fetchQonto(endpoint, savedToken);
      const doc = detail.client_invoice || detail.quote || detail;

      const docUrl = doc.pdf_url || doc.file_url || doc.pdf_download_url
        || doc.attachment?.url || doc.file?.url || doc.document_url
        || doc.attachments?.[0]?.url;
      if (docUrl) { window.open(docUrl, "_blank"); return; }

      // 3. Qonto stocke parfois le PDF dans un attachment séparé via attachment_ids
      const attId = doc.attachment_ids?.[0] || doc.attachment_id;
      if (attId) {
        const att = await fetchQonto(`attachments/${attId}`, savedToken);
        const attUrl = att.attachment?.url || att.url || att.file_url || att.file?.url;
        if (attUrl) { window.open(attUrl, "_blank"); return; }
      }

      alert("PDF non disponible via l'API Qonto pour ce document.");
    } catch(e) { alert("Erreur récupération PDF : " + e.message); }
  };

  // ── Import client Qonto → Annuaire ──
  const importClient = async (c) => {
    const id = c.id;
    setImporting(p=>({...p,[id]:true})); setImportMsg(p=>({...p,[id]:""}));
    try {
      const siret = c.siret || c.vat_number?.replace(/^FR\d{2}/,"") || null;
      // Recherche si contact existant par SIRET ou nom
      const existBySiret = siret && (data?.contacts||[]).find(x=>x.siret===siret);
      const existByName = (data?.contacts||[]).find(x=>(x.nom||"").toLowerCase()===(c.name||"").toLowerCase());
      const existing = existBySiret || existByName;
      const nom = c.name || `${c.first_name||""} ${c.last_name||""}`.trim() || "—";
      const addr = c.billing_address || {};
      const contactData = {
        id: existing?.id,
        nom,
        societe: nom,
        type: existing?.type || (c.kind==="company"?"Client":"Client"),
        email: c.email || existing?.email || null,
        tel: c.phone_number || existing?.tel || null,
        adresse: addr.street_address || existing?.adresse || null,
        code_postal: addr.zip_code || existing?.code_postal || null,
        ville: addr.city || existing?.ville || null,
        siret: siret || existing?.siret || null,
        tva_intra: c.vat_number || existing?.tva_intra || null,
        actif: true,
      };
      await SB.upsertContact(contactData);
      await reload();
      setImportMsg(p=>({...p,[id]: existing ? "✅ Mis à jour" : "✅ Importé"}));
    } catch(e) {
      setImportMsg(p=>({...p,[id]:"❌ " + e.message}));
    }
    setImporting(p=>({...p,[id]:false}));
  };

  const invStatusColor = { draft:"#94A3B8", finalized:"#3B82F6", sent:"#8B5CF6", paid:"#10B981", canceled:"#EF4444", unpaid:"#F59E0B", pending:"#F59E0B" };
  const invStatusFr = { draft:"Brouillon", finalized:"Finalisée", sent:"Envoyée", paid:"Payée", canceled:"Annulée", unpaid:"Impayée", pending:"En attente" };
  const quoStatusColor = { pending_approval:"#F59E0B", approved:"#10B981", canceled:"#EF4444", draft:"#94A3B8" };
  const quoStatusFr = { pending_approval:"En attente", approved:"Approuvé", canceled:"Annulé", draft:"Brouillon" };

  // Qonto renvoie total_amount.value (string) ou total_amount_cents (int) selon la version
  const getAmt = (inv) => parseFloat(inv.total_amount?.value ?? (inv.total_amount_cents||0)/100) || 0;
  const paidInvoices = invoices.filter(i => i.status==="paid");
  const unpaidInvoices = invoices.filter(i => ["sent","finalized","unpaid","pending"].includes(i.status));
  const totalPaid = paidInvoices.reduce((s,i) => s + getAmt(i), 0);
  const totalUnpaid = unpaidInvoices.reduce((s,i) => s + getAmt(i), 0);

  return (<div>
    {/* HEADER */}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{width:44,height:44,borderRadius:12,background:QT.gradient,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 14px rgba(124,58,237,0.3)"}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2"/><path d="M15 15l3 3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div style={{flex:1}}>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Qonto <QontoBadge/></h1>
        <p style={{margin:0,fontSize:12,color:"#64748B"}}>Factures, Devis & Clients — API Qonto v2</p>
      </div>
      {connected && <a href="https://app.qonto.com" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:8,background:QT.primary,color:"#fff",textDecoration:"none",fontSize:12,fontWeight:600}}>Ouvrir Qonto</a>}
    </div>

    {/* TOKEN CONFIG */}
    {!savedToken ? (
      <div style={{background:"#fff",borderRadius:14,padding:24,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`2px dashed ${QT.border}`,textAlign:"center",maxWidth:500,margin:"40px auto"}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:QT.light,margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h3 style={{margin:"0 0 6px",fontSize:17,fontWeight:700}}>Connecter Qonto</h3>
        <p style={{margin:"0 0 4px",fontSize:13,color:"#64748B"}}>Entrez votre clé API Qonto au format :</p>
        <p style={{margin:"0 0 12px",fontSize:13,fontWeight:700,color:"#7C3AED",fontFamily:"monospace"}}>login:secret-key</p>
        <p style={{margin:"0 0 16px",fontSize:11,color:"#94A3B8"}}>Trouvez-la dans Qonto → Paramètres → Intégrations → API</p>
        <input value={token} onChange={e=>setToken(e.target.value)} placeholder="exemple: mon-login:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" type="password"
          style={{...inp,maxWidth:420,margin:"0 auto 12px",display:"block",textAlign:"center",fontSize:12,borderColor:QT.border}} />
        <button onClick={saveToken} style={{padding:"10px 28px",borderRadius:8,background:QT.gradient,color:"#fff",border:"none",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(124,58,237,0.3)"}}>Connecter</button>
        <p style={{margin:"12px 0 0",fontSize:11,color:"#94A3B8"}}>Le token est stocké localement sur votre appareil uniquement.</p>
      </div>
    ) : (
      <>
        {/* CONNECTION STATUS */}
        <div style={{background:connected?"#F0FDF4":"#FEF2F2",border:`1.5px solid ${connected?"#BBF7D0":"#FECACA"}`,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:connected?"#22C55E":"#EF4444",animation:connected?"pulseGlow 2s infinite":"none",flexShrink:0}}/>
            <span style={{fontWeight:600,color:connected?"#166534":"#991B1B"}}>{connected?"Connecté":"Échec de connexion"}</span>
            {connected && <span style={{color:"#64748B"}}>• {savedToken.split(":")[0]}</span>}
            <span style={{marginLeft:"auto",color:QT.primary,cursor:"pointer",fontWeight:600,fontSize:11}} onClick={()=>fetchAll(savedToken)}>Rafraîchir</span>
            <span style={{color:"#94A3B8",cursor:"pointer",fontSize:11}} onClick={disconnect}>Changer de compte</span>
          </div>
          {error && (
            <div style={{marginTop:8,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"8px 10px"}}>
              <div style={{color:"#DC2626",fontWeight:600,marginBottom:4}}>❌ {error}</div>
              {error.includes("401") && (
                <div style={{color:"#64748B",fontSize:11,lineHeight:1.6}}>
                  <b>Vérifiez vos identifiants Qonto :</b><br/>
                  1. Allez dans <b>Qonto → Paramètres → Intégrations → API</b><br/>
                  2. Copiez le <b>Login</b> et la <b>Secret key</b><br/>
                  3. Cliquez <b>"Changer de compte"</b> et entrez : <code style={{background:"#F1F5F9",padding:"1px 4px",borderRadius:3}}>votre-login:votre-secret-key</code>
                </div>
              )}
            </div>
          )}
        </div>

        {qLoading ? (
          <div style={{textAlign:"center",padding:40}}>
            <div style={{width:40,height:40,border:"4px solid #E2E8F0",borderTopColor:QT.primary,borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto 12px"}}/>
            <p style={{color:"#64748B",fontSize:13}}>Chargement depuis Qonto...</p>
          </div>
        ) : connected && (
          <>
            {/* KPI */}
            <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                {l:"Factures",v:invoices.length,c:QT.primary},
                {l:"Devis",v:quotes.length,c:"#A855F7"},
                {l:"Encaissé",v:fmtMoney(totalPaid),c:"#10B981"},
                {l:"À encaisser",v:fmtMoney(totalUnpaid),c:totalUnpaid>0?"#EF4444":"#10B981"},
              ].map((k,i)=>(
                <div key={i} style={{background:"#fff",borderRadius:12,padding:m?12:16,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderTop:`3px solid ${k.c}`}}>
                  <div style={{fontSize:10,fontWeight:600,color:"#94A3B8",textTransform:"uppercase",marginBottom:4}}>{k.l}</div>
                  <div style={{fontSize:m?18:24,fontWeight:700,color:k.c}}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* SUB-TABS */}
            <div style={{display:"flex",gap:6,marginBottom:16}}>
              {[{k:"factures",l:`Factures (${invoices.length})`},{k:"devis",l:`Devis (${quotes.length})`},{k:"clients",l:`Clients (${clients.length})`}].map(t=>(
                <button key={t.k} onClick={()=>setActiveTab(t.k)} style={{padding:"8px 16px",borderRadius:20,border:"1.5px solid",borderColor:activeTab===t.k?QT.primary:"#E2E8F0",background:activeTab===t.k?QT.primary:"#fff",color:activeTab===t.k?"#fff":"#64748B",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{t.l}</button>
              ))}
            </div>

            {/* FACTURES LIST */}
            {activeTab==="factures" && (
              <div style={{display:"grid",gap:8}}>
                {invoices.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20}}>Aucune facture trouvée</p> :
                invoices.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(inv=>(
                  <div key={inv.id} style={{background:"#fff",borderRadius:10,padding:m?12:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${invStatusColor[inv.status]||"#94A3B8"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{inv.number||"—"}</span>
                        <Badge text={invStatusFr[inv.status]||inv.status} color={invStatusColor[inv.status]||"#94A3B8"}/>
                        <QontoBadge/>
                      </div>
                      <div style={{fontSize:11,color:"#64748B"}}>{inv.contact_email||"—"} {inv.issue_date ? `• ${fmtDate(inv.issue_date)}` : ""} {inv.due_date ? `• Éch. ${fmtDate(inv.due_date)}` : ""}</div>
                    </div>
                    <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                      <div style={{fontSize:16,fontWeight:700,color:inv.status==="paid"?"#10B981":"#0F172A"}}>{fmtMoney(getAmt(inv))}</div>
                      {(inv.vat_amount?.value||inv.vat_amount_cents) && <div style={{fontSize:10,color:"#94A3B8"}}>TVA: {fmtMoney(parseFloat(inv.vat_amount?.value??(inv.vat_amount_cents||0)/100))}</div>}
                      <button onClick={()=>downloadPdf(inv,"invoice")} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>⬇ PDF</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* DEVIS LIST */}
            {activeTab==="devis" && (
              <div style={{display:"grid",gap:8}}>
                {quotes.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20}}>Aucun devis trouvé</p> :
                quotes.sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(q=>(
                  <div key={q.id} style={{background:"#fff",borderRadius:10,padding:m?12:16,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${quoStatusColor[q.status]||"#94A3B8"}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{q.number||"—"}</span>
                        <Badge text={quoStatusFr[q.status]||q.status} color={quoStatusColor[q.status]||"#94A3B8"}/>
                        <QontoBadge/>
                      </div>
                      <div style={{fontSize:11,color:"#64748B"}}>{q.contact_email||"—"} {q.issue_date ? `• Émis ${fmtDate(q.issue_date)}` : ""} {q.expiry_date ? `• Expire ${fmtDate(q.expiry_date)}` : ""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:16,fontWeight:700,color:"#0F172A"}}>{fmtMoney(parseFloat(q.total_amount?.value??(q.total_amount_cents||0)/100)||0)}</div>
                      <button onClick={()=>downloadPdf(q,"quote")} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff",marginTop:4}}>⬇ PDF</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CLIENTS LIST */}
            {activeTab==="clients" && (
              <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
                {clients.length===0 ? <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:20,gridColumn:"1/-1"}}>Aucun client trouvé</p> :
                clients.map(c=>{
                  const nom = c.name||`${c.first_name||""} ${c.last_name||""}`.trim();
                  const siret = c.siret || null;
                  const existBySiret = siret && (data?.contacts||[]).find(x=>x.siret===siret);
                  const existByName = (data?.contacts||[]).find(x=>(x.nom||"").toLowerCase()===nom.toLowerCase());
                  const existing = existBySiret || existByName;
                  return (
                  <div key={c.id} style={{background:"#fff",borderRadius:10,padding:14,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",borderLeft:`4px solid ${existing?"#10B981":c.kind==="company"?"#7C3AED":"#3B82F6"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{nom}</span>
                          <Badge text={c.kind==="company"?"Entreprise":"Particulier"} color={c.kind==="company"?"#7C3AED":"#3B82F6"}/>
                          {existing && <Badge text="Dans l'annuaire" color="#10B981"/>}
                        </div>
                        {c.email && <div style={{fontSize:11,color:"#64748B"}}>{c.email}</div>}
                        {c.phone_number && <div style={{fontSize:11,color:"#94A3B8"}}>{c.phone_number}</div>}
                        {c.billing_address?.street_address && <div style={{fontSize:10,color:"#CBD5E1",marginTop:2}}>{c.billing_address.street_address} {c.billing_address.zip_code} {c.billing_address.city}</div>}
                        {siret && <div style={{fontSize:10,color:"#94A3B8",marginTop:2}}>SIRET : {siret}</div>}
                        {existBySiret && <div style={{fontSize:10,color:"#10B981",marginTop:2}}>✓ SIRET identique à : {existBySiret.nom}</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                        <button
                          onClick={()=>importClient(c)}
                          disabled={!!importing[c.id]}
                          style={{background:existing?"#10B981":"#7C3AED",border:"none",borderRadius:6,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff",whiteSpace:"nowrap",opacity:importing[c.id]?0.6:1}}
                        >{importing[c.id]?"...":(existing?"Mettre à jour":"Importer →")}</button>
                        {importMsg[c.id] && <span style={{fontSize:10,color:importMsg[c.id].startsWith("✅")?"#10B981":"#EF4444"}}>{importMsg[c.id]}</span>}
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </>
        )}
      </>
    )}

    {/* FOOTER */}
    <div style={{marginTop:16,padding:"10px 14px",background:"#F8FAFC",borderRadius:8,display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#94A3B8",flexWrap:"wrap"}}>
      <span style={{background:QT.gradient,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:700}}>Qonto API v2</span>
      <span>•</span>
      <span>Lecture seule — GET /v2/client_invoices, /v2/quotes, /v2/clients</span>
    </div>
  </div>);
}

// Template selector component (extracted to root level to avoid conditional hooks)
function TemplateSelector({chOS, setDetailForm, setDetailModal, ch}) {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    (async () => {
      const tpl = await SB.getTemplates('os');
      setTemplates(tpl);
    })();
  }, []);

  return (
    <div>
      {templates.length === 0 ? (
        <p style={{color:"#94A3B8",fontSize:12}}>Aucun template. Créez-en un en cliquant sur 💾 sur un OS.</p>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8}}>
          {templates.map(tpl => (
            <button key={tpl.id} onClick={() => {
              const nextNum = `OS-2026-${String(chOS.length+1).padStart(3,"0")}`;
              setDetailForm({...tpl.data, numero: nextNum, chantier_id: ch.id});
              setDetailModal("editOS");
            }} style={{background:"#F0F4F8",border:"1px solid #E2E8F0",borderRadius:8,padding:12,cursor:"pointer",textAlign:"left"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#0F172A"}}>{tpl.name}</div>
              <div style={{fontSize:11,color:"#64748B"}}>{tpl.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════
function ProjectsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const [selected,setSelected]=useState(null); // Selected chantier for detail view
  const [detailModal,setDetailModal]=useState(null); // Modal for OS/CR/Tasks within chantier
  const [detailForm,setDetailForm]=useState({});
  // Detail view states (moved to root level to fix React hook rules)
  const [attachments, setAttachments] = useState([]);
  const [comments, setComments] = useState([]);
  const [shares, setShares] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharePerm, setSharePerm] = useState("view");

  const openNew=()=>{setForm({nom:"",client:"",adresse:"",phase:"Hors d'air",statut:"Planifié",budget:"",depenses:0,dateDebut:"",dateFin:"",lots:""});setModal("new");};
  const handleSave=async()=>{const e={...form,budget:Number(form.budget)||0,depenses:Number(form.depenses)||0,lots:typeof form.lots==="string"?(form.lots||"").split(",").map(l=>l.trim()).filter(Boolean):form.lots||[]};await SB.upsertChantier(e);setModal(null);reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer ce chantier ? Cette action est irréversible.")) return;await SB.deleteChantier(id);setSelected(null);reload();};

  // Load detail data when selected changes
  useEffect(() => {
    if (!selected) {
      setAttachments([]);
      setComments([]);
      setShares([]);
      return;
    }
    (async () => {
      try {
        const att = await SB.getAttachments('chantier', selected);
        const com = await SB.getComments('chantier', selected);
        const shr = await SB.getShares(selected);
        setAttachments(att);
        setComments(com);
        setShares(shr);
      } catch (e) { console.error(e); }
    })();
  }, [selected]);

  // If a chantier is selected, show detail view
  if (selected) {
    const ch = data.chantiers.find(c=>c.id===selected);
    if (!ch) { setSelected(null); return null; }

    // Get related data for this chantier
    const chTasks = (data.tasks||[]).filter(t=>(t.chantierId||t.chantier_id)===ch.id);
    const chOS = (data.ordresService||[]).filter(o=>o.chantier_id===ch.id);
    const chCR = (data.compteRendus||[]).filter(c=>(c.chantierId||c.chantier_id)===ch.id);
    const chPlanning = (data.planning||[]).filter(p=>(p.chantierId||p.chantier_id)===ch.id);
    // Intervenants = artisans des OS de ce chantier
    const artisanNames = [...new Set(chOS.map(o=>o.artisan_nom).filter(Boolean))];
    const intervenants = artisanNames.map(name => data.contacts.find(c=>c.nom===name)).filter(Boolean);
    // Also add contacts that match the client name
    const clientContact = data.contacts.find(c=>c.nom===ch.client);

    const ratio = pct(ch.depenses, ch.budget);
    const budgetColor = ratio>85?"#EF4444":ratio>60?"#F59E0B":"#10B981";

    const Section = ({title, count, color, children}) => (
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <h3 style={{margin:0,fontSize:14,fontWeight:700,color:"#0F172A"}}>{title}</h3>
          {count!==undefined && <span style={{background:(color||"#3B82F6")+"18",color:color||"#3B82F6",fontSize:11,fontWeight:700,borderRadius:10,padding:"2px 8px"}}>{count}</span>}
        </div>
        {children}
      </div>
    );

    return (<div>
      {/* Back button + Header */}
      <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,color:"#3B82F6",fontSize:13,fontWeight:600,marginBottom:16,fontFamily:"inherit",padding:0}}>
        ← Retour aux chantiers
      </button>

      {/* Chantier Header Card */}
      <div style={{background:"#fff",borderRadius:14,padding:m?16:24,boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`5px solid ${phase[ch.phase]||"#3B82F6"}`,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              <h1 style={{margin:0,fontSize:m?20:26,fontWeight:700,color:"#0F172A"}}>{ch.nom}</h1>
              <Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/>
              <Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/>
            </div>
            <div style={{fontSize:14,color:"#64748B",marginBottom:2}}>{ch.client}</div>
            <div style={{fontSize:13,color:"#94A3B8"}}>{ch.adresse}</div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:4}}>Du {fmtDate(ch.date_debut||ch.dateDebut)} au {fmtDate(ch.date_fin||ch.dateFin)}</div>
            {ch.lots?.length>0 && <div style={{fontSize:11,color:"#CBD5E1",marginTop:4}}>Lots : {ch.lots.join(", ")}</div>}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={async()=>{await SB.duplicateChantier(ch);reload();}} style={{...btnS,fontSize:12,padding:"8px 14px"}}>Dupliquer</button>
            <button onClick={()=>{setForm({...ch,lots:ch.lots?.join(", ")||"",budget:String(ch.budget),depenses:String(ch.depenses),dateDebut:ch.date_debut||ch.dateDebut||"",dateFin:ch.date_fin||ch.dateFin||""});setModal("edit");}} style={{...btnS,fontSize:12,padding:"8px 14px"}}>Modifier</button>
            <button onClick={()=>setDetailModal("share")} style={{...btnS,fontSize:12,padding:"8px 14px"}}>👥 Partager</button>
          </div>
        </div>
        {/* Budget bar */}
        <div style={{marginTop:16}}>
          <div style={{display:"grid",gridTemplateColumns:m?"repeat(2,1fr)":"repeat(4,1fr)",gap:12,marginBottom:12}}>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Budget</div><div style={{fontSize:18,fontWeight:700,color:"#0F172A"}}>{fmtMoney(ch.budget)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Dépensé</div><div style={{fontSize:18,fontWeight:700,color:budgetColor}}>{fmtMoney(ch.depenses)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Reste</div><div style={{fontSize:18,fontWeight:700,color:"#0F172A"}}>{fmtMoney(ch.budget-ch.depenses)}</div></div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:10}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:600,textTransform:"uppercase"}}>Avancement</div><div style={{fontSize:18,fontWeight:700,color:budgetColor}}>{ratio}%</div></div>
          </div>
          <PBar value={ch.depenses} max={ch.budget} color={budgetColor} h={10}/>
        </div>
      </div>

      {/* ATTACHMENTS DU CHANTIER */}
      <AttachmentsSection
        attachments={attachments}
        type="chantier"
        itemId={ch.id}
        onUpload={async(file)=>{await SB.uploadAttachment(file,'chantier',ch.id);const att=await SB.getAttachments('chantier',ch.id);setAttachments(att);}}
        onDelete={async(id,path)=>{await SB.deleteAttachment(id,path);const att=await SB.getAttachments('chantier',ch.id);setAttachments(att);}}
      />

      {/* ORDRES DE SERVICE */}
      <Section title="Ordres de Service" count={chOS.length} color="#8B5CF6">
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>{const nextNum=`OS-2026-${String(chOS.length+1).padStart(3,"0")}`;setDetailForm({numero:nextNum,chantier_id:ch.id,date_emission:new Date().toISOString().split("T")[0],statut:"Brouillon",montant_ttc:0});setDetailModal("newOS");}} style={{background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvel OS</button>
          <button onClick={()=>setDetailModal("useTemplate")} style={{background:"#8B5CF6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",opacity:0.7}}>📋 Template</button>
        </div>
        {chOS.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun OS pour ce chantier</p> :
          chOS.map(os=>(
            <div key={os.id} style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#0F172A"}}>{os.numero}</span>
                  <Badge text={os.statut||"Brouillon"} color={{"Brouillon":"#94A3B8","Émis":"#3B82F6","Signé":"#8B5CF6","En cours":"#F59E0B","Terminé":"#10B981","Annulé":"#EF4444"}[os.statut]||"#94A3B8"}/>
                </div>
                <div style={{fontSize:11,color:"#64748B"}}>{os.artisan_nom} • {(os.prestations||[]).length} prestation(s) • {fmtDate(os.date_emission)}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#1E3A5F",marginTop:4}}>{fmtMoney(os.montant_ttc||0)}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={async()=>await exportOSPdf({...os,chantier:ch.nom,adresse_chantier:ch.adresse})} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>PDF</button>
                <button onClick={async()=>await exportOSExcel({...os,chantier:ch.nom,adresse_chantier:ch.adresse})} style={{background:"#10B981",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>XLS</button>
                <button onClick={async()=>{await SB.saveTemplate('os',`Template ${os.artisan_nom}`,`Template d'OS pour ${os.artisan_nom}`,{...os});alert("✅ Template créé!");}} title="Créer un template à partir de cet OS" style={{background:"#6366F1",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>💾</button>
                <button onClick={()=>{setDetailForm(os);setDetailModal("editOS");}} style={{background:"#3B82F6",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>✎</button>
              </div>
            </div>
          ))
        }
      </Section>

      {/* COMPTES RENDUS */}
      <Section title="Comptes Rendus" count={chCR.length} color="#3B82F6">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{setDetailForm({chantierId:ch.id,date:new Date().toISOString().split("T")[0],numero:(chCR.length+1),resume:"",participants:"",decisions:""});setDetailModal("newCR");}} style={{background:"#3B82F6",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouveau CR</button>
        </div>
        {chCR.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun CR pour ce chantier</p> :
          chCR.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>(
            <div key={cr.id} style={{background:"#fff",borderRadius:10,padding:12,marginBottom:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700}}>CR n°{cr.numero}</span>
                  <span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span>
                </div>
                <div style={{fontSize:12,color:"#334155",lineHeight:1.5}}>{(cr.resume||"").substring(0,100)}{(cr.resume||"").length>100?"...":""}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={async()=>await exportCRPdf(cr,ch)} style={{background:"#EF4444",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>PDF</button>
                <button onClick={async()=>await exportCRExcel(cr,ch)} style={{background:"#10B981",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>XLS</button>
                <button onClick={()=>{setDetailForm(cr);setDetailModal("editCR");}} style={{background:"#3B82F6",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff"}}>✎</button>
              </div>
            </div>
          ))
        }
      </Section>

      {/* TÂCHES */}
      <Section title="Tâches" count={chTasks.length} color="#F59E0B">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{setDetailForm({chantierId:ch.id,titre:"",lot:"",statut:"En attente",priorite:"En attente",echeance:new Date().toISOString().split("T")[0]});setDetailModal("newTask");}} style={{background:"#F59E0B",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Nouvelle tâche</button>
        </div>
        {chTasks.length===0 ? <p style={{color:"#94A3B8",fontSize:12}}>Aucune tâche pour ce chantier</p> :
          chTasks.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:8,padding:"10px 12px",marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
              <button onClick={()=>{const updated={...t,statut:t.statut==="Terminé"?"En attente":"Terminé"};SB.upsertTask(updated);reload();}} style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${status[t.statut]||"#CBD5E1"}`,background:t.statut==="Terminé"?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",padding:0}}>
                {t.statut==="Terminé" && <Icon d={I.check} size={10} color="#fff"/>}
              </button>
              <div style={{flex:1,opacity:t.statut==="Terminé"?0.5:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>{t.lot} • {fmtDate(t.echeance)}</div>
              </div>
              <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>
              <button onClick={()=>{setDetailForm(t);setDetailModal("editTask");}} style={{background:"#3B82F6",border:"none",borderRadius:5,padding:"4px 10px",cursor:"pointer",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>✎</button>
            </div>
          ))
        }
      </Section>

      {/* INTERVENANTS */}
      <Section title="Intervenants" count={intervenants.length + (clientContact?1:0)} color="#10B981">
        {clientContact && (
          <div style={{background:"#fff",borderRadius:8,padding:12,marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)",borderLeft:"3px solid #3B82F6"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:13}}>{clientContact.nom}</span><Badge text="Client" color="#3B82F6"/></div>
            <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{clientContact.tel} • {clientContact.email}</div>
          </div>
        )}
        {intervenants.length===0 && !clientContact ? <p style={{color:"#94A3B8",fontSize:12}}>Aucun intervenant lié via les OS</p> :
          intervenants.map(c=>(
            <div key={c.id} style={{background:"#fff",borderRadius:8,padding:12,marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)",borderLeft:`3px solid ${{"Artisan":"#F59E0B","Sous-traitant":"#8B5CF6","Prestataire":"#EC4899","Fournisseur":"#10B981"}[c.type]||"#94A3B8"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:13}}>{c.nom}</span><Badge text={c.type} color={{"Artisan":"#F59E0B","Sous-traitant":"#8B5CF6","Fournisseur":"#10B981"}[c.type]||"#94A3B8"}/></div>
              <div style={{fontSize:11,color:"#64748B"}}>{c.specialite||c.societe||""}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{c.tel} • {c.email}</div>
            </div>
          ))
        }
      </Section>

      {/* PLANNING */}
      {chPlanning.length>0 && (
        <Section title="Planning" count={chPlanning.length} color="#6366F1">
          {chPlanning.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:8,padding:"10px 14px",marginBottom:6,boxShadow:"0 1px 2px rgba(0,0,0,0.03)"}}>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{p.tache}</div><div style={{fontSize:10,color:"#94A3B8"}}>{p.lot} • {fmtDate(p.debut)} → {fmtDate(p.fin)}</div></div>
              <div style={{width:80}}><PBar value={p.avancement} max={100} color="#6366F1" h={6}/><div style={{fontSize:10,fontWeight:700,color:"#6366F1",textAlign:"right",marginTop:2}}>{p.avancement}%</div></div>
            </div>
          ))}
        </Section>
      )}

      {/* COMMENTAIRES */}
      <Section title="Commentaires" count={comments.length} color="#EC4899">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input type="text" placeholder="Ajouter un commentaire..." value={newComment} onChange={e=>setNewComment(e.target.value)} style={{...inp,flex:1}}/>
          <button onClick={async()=>{await SB.addComment('chantier',ch.id,user?.email||'Anonyme',newComment);setNewComment("");const com=await SB.getComments('chantier',ch.id);setComments(com);}} style={{background:"#EC4899",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Ajouter</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {comments.map(c=>(
            <div key={c.id} style={{background:"#FEF1F7",borderRadius:8,padding:12,borderLeft:"3px solid #EC4899"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:12,color:"#0F172A"}}>{c.author_name}</span>
                <button onClick={async()=>{await SB.deleteComment(c.id);const com=await SB.getComments('chantier',ch.id);setComments(com);}} style={{background:"none",border:"none",color:"#94A3B8",cursor:"pointer",fontSize:10}}>✕</button>
              </div>
              <div style={{fontSize:12,color:"#334155",marginBottom:4}}>{c.content}</div>
              <div style={{fontSize:10,color:"#94A3B8"}}>{new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* PARTAGE */}
      <Section title="Accès & Partage" count={shares.length} color="#06B6D4">
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input type="email" placeholder="Email..." value={shareEmail} onChange={e=>setShareEmail(e.target.value)} style={{...inp,flex:1}}/>
          <select value={sharePerm} onChange={e=>setSharePerm(e.target.value)} style={{...sel,width:"120px"}}>
            <option value="view">Lecture</option>
            <option value="edit">Édition</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={async()=>{await SB.shareChantier(ch.id,shareEmail,sharePerm);setShareEmail("");const shr=await SB.getShares(ch.id);setShares(shr);}} style={{background:"#06B6D4",color:"#fff",border:"none",borderRadius:6,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Partager</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {shares.map(s=>(
            <div key={s.id} style={{background:"#ECFDF5",borderRadius:6,padding:10,display:"flex",justifyContent:"space-between",alignItems:"center",border:"1px solid #BBEFB9"}}>
              <div><div style={{fontWeight:600,fontSize:12,color:"#0F172A"}}>{s.shared_with_email}</div><div style={{fontSize:10,color:"#64748B"}}>{s.permission}</div></div>
              <button onClick={async()=>{await SB.deleteShare(s.id);const shr=await SB.getShares(ch.id);setShares(shr);}} style={{background:"none",border:"none",color:"#10B981",cursor:"pointer",fontSize:10}}>✕</button>
            </div>
          ))}
        </div>
      </Section>

      {/* MODALES POUR OS/CR/TÂCHES */}
      <Modal open={detailModal==="newOS"||detailModal==="editOS"} onClose={()=>setDetailModal(null)} title={detailModal==="newOS"?"Nouvel Ordre de Service":"Modifier l'OS"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="N° OS"><input style={inp} value={detailForm.numero||""} onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/></FF>
          <FF label="Artisan"><select style={sel} value={detailForm.artisan_nom||""} onChange={e=>setDetailForm({...detailForm,artisan_nom:e.target.value})}><option value="">— Sélectionner —</option>{data.contacts.filter(c=>c.type==="Artisan").map(a=><option key={a.id} value={a.nom}>{a.nom}</option>)}</select></FF>
          <FF label="Date émission"><input type="date" style={inp} value={detailForm.date_emission||""} onChange={e=>setDetailForm({...detailForm,date_emission:e.target.value})}/></FF>
          <FF label="Montant TTC €"><input type="number" style={inp} value={detailForm.montant_ttc||""} onChange={e=>setDetailForm({...detailForm,montant_ttc:Number(e.target.value)})}/></FF>
          <FF label="Statut"><select style={sel} value={detailForm.statut||"Brouillon"} onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option></select></FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertOS({...detailForm,chantier_id:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="newCR"||detailModal==="editCR"} onClose={()=>setDetailModal(null)} title={detailModal==="newCR"?"Nouveau Compte Rendu":"Modifier le CR"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Date"><input type="date" style={inp} value={detailForm.date||""} onChange={e=>setDetailForm({...detailForm,date:e.target.value})}/></FF>
          <FF label="N°"><input type="number" style={inp} value={detailForm.numero||""} onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/></FF>
        </div>
        <FF label="Résumé"><textarea style={{...inp,minHeight:70,resize:"vertical"}} value={detailForm.resume||""} onChange={e=>setDetailForm({...detailForm,resume:e.target.value})}/></FF>
        <FF label="Participants"><input style={inp} value={detailForm.participants||""} onChange={e=>setDetailForm({...detailForm,participants:e.target.value})}/></FF>
        <FF label="Décisions"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={detailForm.decisions||""} onChange={e=>setDetailForm({...detailForm,decisions:e.target.value})}/></FF>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertCR({...detailForm,chantierId:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="newTask"||detailModal==="editTask"} onClose={()=>setDetailModal(null)} title={detailModal==="newTask"?"Nouvelle tâche":"Modifier la tâche"}>
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Titre"><input style={inp} value={detailForm.titre||""} onChange={e=>setDetailForm({...detailForm,titre:e.target.value})}/></FF>
          <FF label="Lot"><input style={inp} value={detailForm.lot||""} onChange={e=>setDetailForm({...detailForm,lot:e.target.value})}/></FF>
          <FF label="Échéance"><input type="date" style={inp} value={detailForm.echeance||""} onChange={e=>setDetailForm({...detailForm,echeance:e.target.value})}/></FF>
          <FF label="Priorité"><select style={sel} value={detailForm.priorite||"En attente"} onChange={e=>setDetailForm({...detailForm,priorite:e.target.value})}><option>Urgent</option><option>En cours</option><option>En attente</option></select></FF>
          <FF label="Statut"><select style={sel} value={detailForm.statut||"En attente"} onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}><option>En attente</option><option>En cours</option><option>Terminé</option></select></FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button><button onClick={async()=>{await SB.upsertTask({...detailForm,chantierId:ch.id});setDetailModal(null);reload();}} style={btnP}>Enregistrer</button></div>
      </Modal>

      <Modal open={detailModal==="useTemplate"} onClose={()=>setDetailModal(null)} title="Utiliser un template d'OS">
        <TemplateSelector chOS={chOS} setDetailForm={setDetailForm} setDetailModal={setDetailModal} ch={ch} />
      </Modal>
    </div>);
  }

  // ─── LIST VIEW (default) ───
  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Chantiers</h1>
      <button onClick={openNew} style={{...btnP,fontSize:12}}><Icon d={I.plus} size={14} color="#fff"/> Nouveau</button>
    </div>
    <div style={{display:"grid",gap:12}}>
      {data.chantiers.map(ch=>(
        <div key={ch.id} onClick={()=>setSelected(ch.id)} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${phase[ch.phase]||"#94A3B8"}`,cursor:"pointer",transition:"all .2s"}}
          onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)";e.currentTarget.style.transform="translateX(4px)";}}
          onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.06)";e.currentTarget.style.transform="";}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}><span style={{fontSize:m?14:16,fontWeight:700}}>{ch.nom}</span><Badge text={ch.phase} color={phase[ch.phase]||"#64748B"}/><Badge text={ch.statut} color={status[ch.statut]||"#64748B"}/></div>
              <div style={{fontSize:12,color:"#64748B"}}>{ch.client} — {ch.adresse}</div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:11,color:"#94A3B8"}}>
                <span>{(data.ordresService||[]).filter(o=>o.chantier_id===ch.id).length} OS</span>
                <span>{(data.compteRendus||[]).filter(c=>(c.chantierId||c.chantier_id)===ch.id).length} CR</span>
                <span>{(data.tasks||[]).filter(t=>(t.chantierId||t.chantier_id)===ch.id).length} tâches</span>
              </div>
            </div>
            <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setForm({...ch,lots:ch.lots?.join(", ")||"",budget:String(ch.budget),depenses:String(ch.depenses),dateDebut:ch.date_debut||ch.dateDebut||"",dateFin:ch.date_fin||ch.dateFin||""});setModal("edit");}} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.edit} size={14} color="#64748B"/></button>
              <button onClick={()=>handleDelete(ch.id)} style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:5,cursor:"pointer"}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
            </div>
          </div>
          <div style={{marginTop:10}}>
            {(() => {
              const start = new Date(ch.date_debut || ch.dateDebut);
              const end = new Date(ch.date_fin || ch.dateFin);
              const now = new Date();
              const total = end.getTime() - start.getTime();
              const elapsed = Math.max(0, Math.min(total, now.getTime() - start.getTime()));
              const progress = total > 0 ? Math.round((elapsed / total) * 100) : 0;
              const isDone = ch.statut === "Terminé";
              const color = isDone ? "#10B981" : phase[ch.phase] || "#3B82F6";
              return (
                <>
                  <PBar value={isDone ? 100 : Math.min(progress, 100)} max={100} color={color}/>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"#94A3B8"}}>
                    <span>{fmtDate(start)} → {fmtDate(end)}</span>
                    <span style={{color, fontWeight:600}}>{isDone ? "Terminé" : progress + "%"}</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ))}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau chantier":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Client"><input style={inp} value={form.client||""} onChange={e=>setForm({...form,client:e.target.value})}/></FF>
        <FF label="Adresse"><input style={inp} value={form.adresse||""} onChange={e=>setForm({...form,adresse:e.target.value})}/></FF>
        <FF label="Phase"><select style={sel} value={form.phase||""} onChange={e=>setForm({...form,phase:e.target.value})}><option>Hors d'air</option><option>Technique</option><option>Finitions</option><option>Avant-projet</option><option>Études</option><option>Gros œuvre</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>En attente</option><option>Terminé</option></select></FF>
        <FF label="Budget €"><input type="number" style={inp} value={form.budget||""} onChange={e=>setForm({...form,budget:e.target.value})}/></FF>
        <FF label="Dépenses €"><input type="number" style={inp} value={form.depenses||""} onChange={e=>setForm({...form,depenses:e.target.value})}/></FF>
        <FF label="Début"><input type="date" style={inp} value={form.dateDebut||""} onChange={e=>setForm({...form,dateDebut:e.target.value})}/></FF>
        <FF label="Fin"><input type="date" style={inp} value={form.dateFin||""} onChange={e=>setForm({...form,dateFin:e.target.value})}/></FF>
        <FF label="Lots (virgules)"><input style={inp} value={form.lots||""} onChange={e=>setForm({...form,lots:e.target.value})}/></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>Enregistrer</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// PLANNING
// ═══════════════════════════════════════════
function PlanningV({data,m}) {
  const [filter,setFilter]=useState("all");
  const items = filter==="all"?data.planning:data.planning.filter(p=>p.chantierId===filter||p.chantier_id===filter);

  if (!data.planning || data.planning.length === 0) {
    return (<div>
      <h1 style={{margin:"0 0 20px",fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        Aucune entrée de planning. Ajoutez des tâches planifiées depuis l'onglet Chantiers.
      </div>
    </div>);
  }

  const timestamps = data.planning.map(p=>new Date(p.debut).getTime()).filter(t=>!isNaN(t));
  const endTimestamps = data.planning.map(p=>new Date(p.fin).getTime()).filter(t=>!isNaN(t));
  if (timestamps.length === 0 || endTimestamps.length === 0) return null;

  const min=new Date(Math.min(...timestamps));
  const max=new Date(Math.max(...endTimestamps));
  const total=Math.max(Math.ceil((max-min)/864e5)+1, 1);

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Planning</h1>
      <select style={{...sel,width:"auto"}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous</option>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select>
    </div>
    <div style={{background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",overflowX:"auto"}}>
      {items.length === 0
        ? <div style={{textAlign:"center",color:"#94A3B8",padding:20,fontSize:13}}>Aucune tâche pour ce chantier.</div>
        : items.map(p=>{const ch=data.chantiers.find(c=>c.id===(p.chantierId||p.chantier_id));const s=Math.max(0,Math.ceil((new Date(p.debut)-min)/864e5));const d=Math.max(1,Math.ceil((new Date(p.fin)-new Date(p.debut))/864e5)+1);const c=phase[ch?.phase]||"#3B82F6";
          return(<div key={p.id} style={{display:"flex",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #F8FAFC",minWidth:m?500:"auto"}}>
            <div style={{width:m?150:200,flexShrink:0,paddingRight:12}}><div style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{p.tache}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {p.lot}</div></div>
            <div style={{flex:1,position:"relative",height:24}}>
              <div style={{position:"absolute",left:`${s/total*100}%`,width:`${d/total*100}%`,top:3,height:18,background:c+"22",borderRadius:5,border:`1.5px solid ${c}`}}>
                <div style={{width:`${p.avancement}%`,height:"100%",background:c+"55",borderRadius:4}}/><span style={{position:"absolute",right:4,top:1,fontSize:9,fontWeight:700,color:c}}>{p.avancement}%</span>
              </div>
            </div>
          </div>);
        })
      }
    </div>
  </div>);
}

// ═══════════════════════════════════════════
// BUDGET
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════
function TasksV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [filter,setFilter]=useState("all");
  const tasks = filter==="all"?data.tasks:data.tasks.filter(t=>t.statut===filter);
  const openNew=()=>{setForm({chantierId:data.chantiers[0]?.id||"",titre:"",priorite:"En cours",statut:"Planifié",echeance:"",lot:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertTask(form);setModal(null);reload();};
  const toggle=async(t)=>{const cy=["Planifié","En cours","Terminé"];const next=cy[(cy.indexOf(t.statut)+1)%3];await SB.upsertTask({...t,statut:next});reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer cette tâche ?")) return;await SB.deleteTask(id);reload();};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Tâches</h1>
      <div style={{display:"flex",gap:8}}>
        <select style={{...sel,width:"auto",fontSize:12}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Toutes</option><option value="En cours">En cours</option><option value="Planifié">Planifiées</option><option value="Terminé">Terminées</option></select>
        <button onClick={openNew} style={{...btnP,fontSize:12,padding:"8px 14px"}}>+ Tâche</button>
      </div>
    </div>
    <div style={{display:"grid",gap:6}}>
      {tasks.map(t=>{const ch=data.chantiers.find(c=>c.id===t.chantierId);return(
        <div key={t.id} style={{display:"flex",alignItems:"center",gap:10,background:"#fff",borderRadius:10,padding:m?"10px 12px":"12px 16px",boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
          <button onClick={()=>toggle(t)} style={{width:24,height:24,borderRadius:"50%",border:`2px solid ${status[t.statut]||"#CBD5E1"}`,background:t.statut==="Terminé"?"#10B981":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{t.statut==="Terminé"&&<Icon d={I.check} size={12} color="#fff"/>}</button>
          <div style={{flex:1,opacity:t.statut==="Terminé"?.5:1}}><div style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{t.titre}</div><div style={{fontSize:10,color:"#94A3B8"}}>{ch?.nom} • {t.lot}</div></div>
          <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>{!m&&<span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(t.echeance)}</span>}
          <button onClick={()=>{setForm(t);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.edit} size={13} color="#94A3B8"/></button>
          <button onClick={()=>handleDelete(t.id)} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon d={I.trash} size={13} color="#CBD5E1"/></button>
        </div>
      );})}
    </div>
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouvelle tâche":"Modifier"}>
      <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
      <FF label="Titre"><input style={inp} value={form.titre||""} onChange={e=>setForm({...form,titre:e.target.value})}/></FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <FF label="Lot"><input style={inp} value={form.lot||""} onChange={e=>setForm({...form,lot:e.target.value})}/></FF>
        <FF label="Échéance"><input type="date" style={inp} value={form.echeance||""} onChange={e=>setForm({...form,echeance:e.target.value})}/></FF>
        <FF label="Priorité"><select style={sel} value={form.priorite||""} onChange={e=>setForm({...form,priorite:e.target.value})}><option>En cours</option><option>Urgent</option><option>En attente</option></select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Planifié</option><option>En cours</option><option>Terminé</option></select></FF>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// CONTACTS
// ═══════════════════════════════════════════
function ContactsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [tf,setTf]=useState("all");const [q,setQ]=useState("");
  const [pSearch,setPSearch]=useState("");const [pLoading,setPLoading]=useState(false);const [pResults,setPResults]=useState(null);const [pError,setPError]=useState("");
  const tc={Artisan:"#F59E0B",Client:"#3B82F6",Fournisseur:"#10B981","Sous-traitant":"#8B5CF6",Prestataire:"#EC4899",MOA:"#0EA5E9",Architecte:"#6366F1",BET:"#14B8A6"};
  const types = ["Artisan","Sous-traitant","Prestataire","Client","Fournisseur","MOA","Architecte","BET"];
  const list=data.contacts.filter(c=>{
    if(tf!=="all"&&c.type!==tf) return false;
    if(!q) return true;
    const search=q.toLowerCase();
    return (c.nom||"").toLowerCase().includes(search)||(c.specialite||"").toLowerCase().includes(search)||(c.societe||"").toLowerCase().includes(search)||(c.ville||"").toLowerCase().includes(search)||(c.email||"").toLowerCase().includes(search)||(c.siret||"").includes(search);
  });

  const emptyForm = {nom:"",type:"Artisan",specialite:"",societe:"",fonction:"",tel:"",tel_fixe:"",email:"",adresse:"",code_postal:"",ville:"",siret:"",tva_intra:"",assurance_decennale:"",assurance_validite:"",iban:"",qualifications:"",site_web:"",note:0,actif:true,notes:""};

  const openNew=()=>{setForm(emptyForm);setPSearch("");setPResults(null);setPError("");setModal("new");};
  const handleSave=async()=>{await SB.upsertContact(form);setModal(null);reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer ce contact ? Cette action est irréversible.")) return;await SB.deleteContact(id);reload();};

  // ── Pappers : mapping réponse → formulaire ──
  const fillFromPappers = (entreprise) => {
    const siege = entreprise.siege || {};
    setForm(f => ({
      ...f,
      nom: entreprise.denomination || f.nom,
      societe: entreprise.denomination || f.societe,
      siret: entreprise.siret || siege.siret || f.siret,
      tva_intra: entreprise.num_tva_intracommunautaire || f.tva_intra,
      adresse: siege.adresse_ligne_1 || siege.adresse || f.adresse,
      code_postal: siege.code_postal || f.code_postal,
      ville: siege.ville || f.ville,
      tel: entreprise.telephone || f.tel,
      email: entreprise.email || f.email,
      site_web: entreprise.site_internet || f.site_web,
      specialite: entreprise.libelle_activite_principale || f.specialite,
    }));
    setPResults(null);
    setPSearch("");
    setPError("");
  };

  const searchPappers = async () => {
    const v = pSearch.trim();
    if (!v) return;
    setPLoading(true); setPError(""); setPResults(null);
    try {
      const isSiret = /^\d{14}$/.test(v.replace(/\s/g,""));
      const cleanSiret = v.replace(/\s/g,"");
      const url = isSiret ? `/api/pappers?siret=${cleanSiret}` : `/api/pappers?q=${encodeURIComponent(v)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) { setPError(json.error || "Erreur Pappers"); return; }
      if (isSiret) {
        // Résultat direct → on remplit le form
        fillFromPappers(json);
      } else {
        // Liste de résultats → on affiche pour choisir
        const results = json.resultats || [];
        if (results.length === 0) { setPError("Aucune entreprise trouvée."); return; }
        setPResults(results);
      }
    } catch(e) { setPError("Erreur réseau : " + e.message); }
    finally { setPLoading(false); }
  };

  // Stats par type
  const stats = {};
  types.forEach(t => { const c = data.contacts.filter(x=>x.type===t).length; if(c>0) stats[t]=c; });

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Annuaire</h1>
        <p style={{margin:"2px 0 0",fontSize:12,color:"#94A3B8"}}>{data.contacts.length} contacts</p>
      </div>
      <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouveau contact</button>
    </div>

    {/* Search + Filters */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:200}}><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)"}}><Icon d={I.search} size={14} color="#94A3B8"/></span><input placeholder="Rechercher nom, société, ville, email..." style={{...inp,paddingLeft:30,fontSize:13}} value={q} onChange={e=>setQ(e.target.value)}/></div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
      <button onClick={()=>setTf("all")} style={{padding:"5px 12px",borderRadius:16,border:"1.5px solid",borderColor:tf==="all"?"#1E3A5F":"#E2E8F0",background:tf==="all"?"#1E3A5F":"#fff",color:tf==="all"?"#fff":"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Tous ({data.contacts.length})</button>
      {Object.entries(stats).map(([type,count])=>(
        <button key={type} onClick={()=>setTf(type)} style={{padding:"5px 12px",borderRadius:16,border:"1.5px solid",borderColor:tf===type?tc[type]||"#1E3A5F":"#E2E8F0",background:tf===type?tc[type]||"#1E3A5F":"#fff",color:tf===type?"#fff":"#64748B",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{type}s ({count})</button>
      ))}
    </div>

    {/* Contact Cards */}
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
      {list.map(c=>(
        <div key={c.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.04)",borderLeft:`4px solid ${tc[c.type]||"#94A3B8"}`,opacity:c.actif===false?0.5:1}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>{c.nom}</span>
                <Badge text={c.type} color={tc[c.type]||"#94A3B8"}/>
                {c.actif===false && <Badge text="Inactif" color="#94A3B8"/>}
                {c.note>0 && <span style={{fontSize:11,color:"#F59E0B"}}>{"★".repeat(c.note)}{"☆".repeat(5-c.note)}</span>}
              </div>
              {c.societe && <div style={{fontSize:12,fontWeight:600,color:"#334155",marginBottom:2}}>{c.societe}</div>}
              {c.specialite && <div style={{fontSize:11,color:"#64748B",marginBottom:3}}>{c.specialite}{c.fonction?` — ${c.fonction}`:""}</div>}
              <div style={{fontSize:11,color:"#94A3B8"}}>
                {c.tel && <span>{c.tel}</span>}
                {c.tel_fixe && <span> • {c.tel_fixe}</span>}
                {c.email && <span> • {c.email}</span>}
              </div>
              {(c.ville||c.adresse) && <div style={{fontSize:10,color:"#CBD5E1",marginTop:2}}>{[c.adresse,c.code_postal,c.ville].filter(Boolean).join(", ")}</div>}
              {c.siret && <div style={{fontSize:10,color:"#CBD5E1"}}>SIRET: {c.siret}</div>}
              {c.qualifications && <div style={{fontSize:10,color:"#3B82F6",marginTop:2}}>{c.qualifications}</div>}
            </div>
            <div style={{display:"flex",gap:3,flexShrink:0}}>
              <button onClick={()=>{setForm({...c});setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={14} color="#94A3B8"/></button>
              <button onClick={()=>handleDelete(c.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={14} color="#CBD5E1"/></button>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* MODAL — Formulaire enrichi */}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau contact":"Modifier le contact"} wide>

      {/* ── RECHERCHE PAPPERS ── */}
      <div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span style={{fontSize:12,fontWeight:700,color:"#1E40AF"}}>Recherche Pappers</span>
          <span style={{fontSize:10,color:"#60A5FA"}}>SIRET (14 chiffres) ou nom de l'entreprise</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <input
            style={{...inp,flex:1,fontSize:13}}
            placeholder="Ex: 12345678901234 ou Lefèvre Électricité..."
            value={pSearch}
            onChange={e=>setPSearch(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&searchPappers()}
          />
          <button
            onClick={searchPappers}
            disabled={pLoading||!pSearch.trim()}
            style={{...btnP,background:"#3B82F6",padding:"8px 16px",fontSize:12,opacity:pLoading||!pSearch.trim()?0.6:1,whiteSpace:"nowrap"}}
          >{pLoading?"Recherche...":"Rechercher"}</button>
        </div>
        {pError && <div style={{marginTop:8,fontSize:11,color:"#EF4444"}}>{pError}</div>}
        {pResults && (
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:11,color:"#64748B",fontWeight:600}}>Sélectionnez une entreprise :</div>
            {pResults.map((r,i)=>{
              const siege = r.siege||{};
              return (
                <button key={i} onClick={()=>fillFromPappers(r)}
                  style={{background:"#fff",border:"1.5px solid #BFDBFE",borderRadius:8,padding:"8px 12px",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontFamily:"inherit"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{r.denomination}</div>
                    <div style={{fontSize:10,color:"#64748B"}}>{siege.code_postal} {siege.ville} — SIRET {r.siret}</div>
                    {r.libelle_activite_principale&&<div style={{fontSize:10,color:"#94A3B8"}}>{r.libelle_activite_principale}</div>}
                  </div>
                  <span style={{fontSize:11,color:"#3B82F6",fontWeight:600,flexShrink:0}}>Importer →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Identité */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:4}}>Identité</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Nom / Prénom *"><input style={inp} value={form.nom||""} onChange={e=>setForm({...form,nom:e.target.value})}/></FF>
        <FF label="Société / Raison sociale"><input style={inp} value={form.societe||""} onChange={e=>setForm({...form,societe:e.target.value})}/></FF>
        <FF label="Type"><select style={sel} value={form.type||""} onChange={e=>setForm({...form,type:e.target.value})}>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Spécialité / Métier"><input style={inp} value={form.specialite||""} onChange={e=>setForm({...form,specialite:e.target.value})} placeholder="Ex: Électricité CFO/CFA, Gros œuvre..."/></FF>
        <FF label="Fonction"><input style={inp} value={form.fonction||""} onChange={e=>setForm({...form,fonction:e.target.value})} placeholder="Ex: Gérant, Conducteur de travaux..."/></FF>
      </div>

      {/* Coordonnées */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Coordonnées</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Tél. mobile"><input style={inp} value={form.tel||""} onChange={e=>setForm({...form,tel:e.target.value})} placeholder="06 ..."/></FF>
        <FF label="Tél. fixe"><input style={inp} value={form.tel_fixe||""} onChange={e=>setForm({...form,tel_fixe:e.target.value})} placeholder="02 35 ..."/></FF>
        <FF label="Email"><input type="email" style={inp} value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})}/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"2fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Adresse"><input style={inp} value={form.adresse||""} onChange={e=>setForm({...form,adresse:e.target.value})}/></FF>
        <FF label="Code postal"><input style={inp} value={form.code_postal||""} onChange={e=>setForm({...form,code_postal:e.target.value})}/></FF>
        <FF label="Ville"><input style={inp} value={form.ville||""} onChange={e=>setForm({...form,ville:e.target.value})}/></FF>
      </div>
      <FF label="Site web"><input style={inp} value={form.site_web||""} onChange={e=>setForm({...form,site_web:e.target.value})} placeholder="https://..."/></FF>

      {/* Administratif */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Administratif</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="SIRET"><input style={inp} value={form.siret||""} onChange={e=>setForm({...form,siret:e.target.value})} placeholder="XXX XXX XXX XXXXX"/></FF>
        <FF label="TVA intracommunautaire"><input style={inp} value={form.tva_intra||""} onChange={e=>setForm({...form,tva_intra:e.target.value})} placeholder="FR XX XXXXXXXXX"/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Assurance décennale"><input style={inp} value={form.assurance_decennale||""} onChange={e=>setForm({...form,assurance_decennale:e.target.value})} placeholder="N° police + assureur"/></FF>
        <FF label="Validité assurance"><input type="date" style={inp} value={form.assurance_validite||""} onChange={e=>setForm({...form,assurance_validite:e.target.value})}/></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="IBAN"><input style={inp} value={form.iban||""} onChange={e=>setForm({...form,iban:e.target.value})} placeholder="FR76 XXXX ..."/></FF>
        <FF label="Qualifications (Qualibat, RGE...)"><input style={inp} value={form.qualifications||""} onChange={e=>setForm({...form,qualifications:e.target.value})}/></FF>
      </div>

      {/* Évaluation */}
      <div style={{fontSize:11,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase",marginBottom:8,marginTop:12}}>Évaluation</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Note (étoiles)">
          <div style={{display:"flex",gap:4}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>setForm({...form,note:form.note===n?0:n})} style={{background:"none",border:"none",cursor:"pointer",fontSize:22,color:n<=(form.note||0)?"#F59E0B":"#E2E8F0"}}>★</button>
            ))}
          </div>
        </FF>
        <FF label="Statut">
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
            <input type="checkbox" checked={form.actif!==false} onChange={e=>setForm({...form,actif:e.target.checked})}/>
            {form.actif!==false?"Actif":"Inactif"}
          </label>
        </FF>
      </div>
      <FF label="Notes / Remarques"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Notes internes..."/></FF>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer</button>
      </div>
    </Modal>
  </div>);
}


// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════
function ReportsV({data,save,m,reload}) {
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});const [searchCR,setSearchCR]=useState("");
  const openNew=()=>{setForm({chantierId:data.chantiers[0]?.id||"",date:new Date().toISOString().split("T")[0],numero:(data.compteRendus||[]).length+1,resume:"",participants:"",decisions:""});setModal("new");};
  const handleSave=async()=>{await SB.upsertCR(form);setModal(null);reload();};
  const handleDelete=async(id)=>{if(!window.confirm("Supprimer ce compte rendu ?")) return;await SB.deleteCR(id);reload();};

  const filterCR=(cr)=>{const s=searchCR.toLowerCase();const ch=data.chantiers.find(c=>c.id===(cr.chantierId||cr.chantier_id));return String(cr.numero).toLowerCase().includes(s)||(ch?.nom||"").toLowerCase().includes(s)||(ch?.client||"").toLowerCase().includes(s)||(ch?.commune||"").toLowerCase().includes(s);};

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Comptes Rendus</h1>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" placeholder="Rechercher par n°, chantier, client ou commune..." value={searchCR} onChange={e=>setSearchCR(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #E2E8F0",fontSize:12,width:m?"100%":"220px"}}/>
        <button onClick={openNew} style={{...btnP,fontSize:12}}>+ CR</button>
      </div>
    </div>
    {(data.compteRendus||[]).filter(filterCR).sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>{const ch=data.chantiers.find(c=>c.id===(cr.chantierId||cr.chantier_id));return(
      <div key={cr.id} style={{background:"#fff",borderRadius:12,padding:m?14:20,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 8px",fontSize:12,fontWeight:700}}>CR n°{cr.numero}</span><span style={{fontWeight:700,fontSize:14}}>{ch?.nom}</span><span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span></div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={async()=>await exportCRPdf(cr,ch)} title="PDF" style={{background:"#EF4444",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>PDF</button>
            <button onClick={async()=>await exportCRExcel(cr,ch)} title="Excel" style={{background:"#10B981",border:"none",borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700,color:"#fff"}}>XLS</button>
            <button onClick={()=>{setForm(cr);setModal("edit");}} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.edit} size={14} color="#94A3B8"/></button>
            <button onClick={()=>handleDelete(cr.id)} style={{background:"none",border:"none",cursor:"pointer"}}><Icon d={I.trash} size={14} color="#CBD5E1"/></button>
          </div>
        </div>
        <div style={{fontSize:13,color:"#334155",lineHeight:1.6,marginBottom:8}}>{cr.resume}</div>
        <div style={{fontSize:11}}><span style={{fontWeight:600,color:"#64748B"}}>Présents:</span> <span style={{color:"#94A3B8"}}>{cr.participants}</span></div>
        {cr.decisions&&<div style={{marginTop:8,background:"#FEF3C7",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#92400E"}}><b>Décisions:</b> {cr.decisions}</div>}
      </div>
    );})}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau CR":"Modifier"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Chantier"><select style={sel} value={form.chantierId||""} onChange={e=>setForm({...form,chantierId:e.target.value})}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Date"><input type="date" style={inp} value={form.date||""} onChange={e=>setForm({...form,date:e.target.value})}/></FF>
        <FF label="N°"><input type="number" style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
      </div>
      <FF label="Résumé"><textarea style={{...inp,minHeight:80,resize:"vertical"}} value={form.resume||""} onChange={e=>setForm({...form,resume:e.target.value})}/></FF>
      <FF label="Participants"><input style={inp} value={form.participants||""} onChange={e=>setForm({...form,participants:e.target.value})}/></FF>
      <FF label="Décisions"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.decisions||""} onChange={e=>setForm({...form,decisions:e.target.value})}/></FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><button onClick={()=>setModal(null)} style={btnS}>Annuler</button><button onClick={handleSave} style={btnP}>OK</button></div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// AI ASSISTANT + SPEECH-TO-TEXT MIC
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// ORDRES DE SERVICE (avec PDF + Excel)
// ═══════════════════════════════════════════
function OrdresServiceV({data,m,reload}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [prestations,setPrestations]=useState([]);
  const [searchOS,setSearchOS]=useState("");

  const nextNum = () => {
    const existing = (data.ordresService||[]).length;
    return `OS-2026-${String(existing+1).padStart(3,"0")}`;
  };

  const openNew = () => {
    const ch = data.chantiers[0];
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: "",
      artisan_nom: "", artisan_specialite: "", artisan_tel: "", artisan_email: "", artisan_siret: "",
      date_emission: new Date().toISOString().split("T")[0], date_intervention: "", date_fin_prevue: "",
      observations: "", conditions: "Paiement à 30 jours à compter de la réception de la facture.",
      statut: "Brouillon",
    });
    setPrestations([{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
    setModal("new");
  };

  const openEdit = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    setForm({
      ...os,
      chantier: ch?.nom||"",
      adresse_chantier: ch?.adresse||"",
    });
    setPrestations((os.prestations||[]).length > 0
      ? os.prestations.map(p=>({...p, quantite:String(p.quantite||""), prix_unitaire:String(p.prix_unitaire||""), tva_taux:String(p.tva_taux||"20")}))
      : [{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]
    );
    setModal("edit");
  };

  const updateChantier = (chId) => {
    const ch = data.chantiers.find(c=>c.id===chId);
    setForm(f=>({...f, chantier_id: chId, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", client_nom: ch?.client||""}));
  };

  const updateArtisan = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({...f, artisan_nom:co.nom, artisan_specialite:co.specialite||"", artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""}));
    else setForm(f=>({...f, artisan_nom:name}));
  };

  const addPrestation = () => setPrestations(p=>[...p,{ description:"", unite:"u", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
  const removePrestation = (i) => setPrestations(p=>p.filter((_,j)=>j!==i));
  const updatePrestation = (i,field,val) => setPrestations(p=>p.map((x,j)=>j===i?{...x,[field]:val}:x));

  const calcTotals = () => {
    let ht=0, tva=0;
    prestations.forEach(p=>{
      const l = (parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0);
      ht += l; tva += l*(parseFloat(p.tva_taux)||20)/100;
    });
    return { ht, tva, ttc: ht+tva };
  };

  const handleSave = async () => {
    try {
      console.log("📝 Tentative d'enregistrement OS...");
      if (!form.numero) throw new Error("Numéro d'OS manquant");
      if (!form.chantier_id) throw new Error("Chantier manquant");
      if (prestations.length === 0) throw new Error("Au moins une prestation requise");

      const t = calcTotals();
      const osData = { ...form, prestations, montant_ht:t.ht, montant_tva:t.tva, montant_ttc:t.ttc };
      console.log("📦 Données à envoyer:", osData);

      await SB.upsertOS(osData);
      console.log("✅ OS enregistré avec succès");
      setModal(null);
      reload();
    } catch (err) {
      console.error("❌ Erreur:", err);
      alert("❌ Erreur: " + err.message);
    }
  };

  const handlePdf = async (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    await exportOSPdf({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleExcel = async (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
    await exportOSExcel({ ...os, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"" });
  };

  const handleDelete = async (id) => { if(!window.confirm("Supprimer cet ordre de service ?")) return; await SB.deleteOS(id); reload(); };

  const osStatusColor = { "Brouillon":"#94A3B8", "Émis":"#3B82F6", "Signé":"#8B5CF6", "En cours":"#F59E0B", "Terminé":"#10B981", "Annulé":"#EF4444" };
  const totals = calcTotals();

  const filterOS=(os)=>{const s=searchOS.toLowerCase();const ch=data.chantiers.find(c=>c.id===os.chantier_id);return String(os.numero).toLowerCase().includes(s)||(ch?.nom||"").toLowerCase().includes(s)||(os.client_nom||"").toLowerCase().includes(s)||(ch?.commune||"").toLowerCase().includes(s);};

  const artisans = data.contacts.filter(c=>c.type==="Artisan");

  return (<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input type="text" placeholder="Rechercher par n°, chantier, client ou commune..." value={searchOS} onChange={e=>setSearchOS(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid #E2E8F0",fontSize:12,width:m?"100%":"220px"}}/>
        <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
      </div>
    </div>

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:12}}>
      {(data.ordresService||[]).filter(filterOS).length===0 ?
        <div style={{background:"#fff",borderRadius:12,padding:30,textAlign:"center",color:"#94A3B8",fontSize:13}}>Aucun ordre de service. Cliquez "+ Nouvel OS" pour en créer un.</div>
      : (data.ordresService||[]).filter(filterOS).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).map(os=>{
        const ch = data.chantiers.find(c=>c.id===os.chantier_id);
        return (
          <div key={os.id} style={{background:"#fff",borderRadius:12,padding:m?14:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",borderLeft:`4px solid ${osStatusColor[os.statut]||"#94A3B8"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700}}>{os.numero}</span>
                  <Badge text={os.statut} color={osStatusColor[os.statut]||"#94A3B8"}/>
                  <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ch?.nom||"—"}</span>
                </div>
                <div style={{fontSize:12,color:"#64748B"}}>{os.artisan_nom} ({os.artisan_specialite}) — Client : {os.client_nom}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)} • {(os.prestations||[]).length} prestation(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(os.montant_ttc||0)}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>HT: {fmtMoney(os.montant_ht||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              <button onClick={()=>handlePdf(os)} style={{background:"#EF4444",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Télécharger PDF</button>
              <button onClick={()=>handleExcel(os)} style={{background:"#10B981",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Exporter Excel</button>
              <button onClick={()=>openEdit(os)} style={{background:"#3B82F6",border:"none",borderRadius:6,padding:"5px 14px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Modifier</button>
              <button onClick={()=>handleDelete(os.id)} style={{background:"none",border:"1px solid #FECACA",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </div>

    {/* MODAL CRÉATION OS */}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="edit"?"Modifier l'Ordre de Service":"Nouvel Ordre de Service"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="N° OS"><input style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
        <FF label="Chantier"><select style={sel} value={form.chantier_id||""} onChange={e=>updateChantier(e.target.value)}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option><option>Annulé</option></select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Client">{form.client_nom && <div style={{fontSize:13,padding:"8px 0",color:"#0F172A",fontWeight:600}}>{form.client_nom}</div>}</FF>
        <FF label="Artisan"><select style={sel} value={form.artisan_nom||""} onChange={e=>updateArtisan(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {artisans.map(a=><option key={a.id} value={a.nom}>{a.nom} ({a.specialite})</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Date émission"><input type="date" style={inp} value={form.date_emission||""} onChange={e=>setForm({...form,date_emission:e.target.value})}/></FF>
        <FF label="Date intervention"><input type="date" style={inp} value={form.date_intervention||""} onChange={e=>setForm({...form,date_intervention:e.target.value})}/></FF>
        <FF label="Date fin prévue"><input type="date" style={inp} value={form.date_fin_prevue||""} onChange={e=>setForm({...form,date_fin_prevue:e.target.value})}/></FF>
      </div>

      {/* PRESTATIONS */}
      <div style={{marginTop:12,marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:"#1E3A5F",textTransform:"uppercase"}}>Prestations</span>
          <button onClick={addPrestation} style={{fontSize:11,color:"#3B82F6",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>+ Ajouter une ligne</button>
        </div>
        {prestations.map((p,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:m?"1fr":"3fr 1fr 1fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"end"}}>
            <input placeholder="Description" style={{...inp,fontSize:12}} value={p.description} onChange={e=>updatePrestation(i,"description",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.unite} onChange={e=>updatePrestation(i,"unite",e.target.value)}>
              <option>u</option><option>m²</option><option>ml</option><option>m³</option><option>kg</option><option>h</option><option>forfait</option><option>ens</option>
            </select>
            <input placeholder="Qté" type="number" style={{...inp,fontSize:12}} value={p.quantite} onChange={e=>updatePrestation(i,"quantite",e.target.value)}/>
            <input placeholder="PU HT €" type="number" step="0.01" style={{...inp,fontSize:12}} value={p.prix_unitaire} onChange={e=>updatePrestation(i,"prix_unitaire",e.target.value)}/>
            <select style={{...sel,fontSize:12}} value={p.tva_taux} onChange={e=>updatePrestation(i,"tva_taux",e.target.value)}>
              <option value="20">20%</option><option value="10">10%</option><option value="5.5">5.5%</option><option value="0">0%</option>
            </select>
            <button onClick={()=>removePrestation(i)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon d={I.trash} size={14} color="#EF4444"/></button>
          </div>
        ))}
      </div>

      {/* TOTAUX */}
      <div style={{background:"#F8FAFC",borderRadius:8,padding:12,display:"flex",justifyContent:"flex-end",gap:20,marginBottom:12}}>
        <div><span style={{fontSize:11,color:"#64748B"}}>Total HT : </span><span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{fmtMoney(totals.ht)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TVA : </span><span style={{fontSize:14,fontWeight:700,color:"#F59E0B"}}>{fmtMoney(totals.tva)}</span></div>
        <div><span style={{fontSize:11,color:"#64748B"}}>TTC : </span><span style={{fontSize:16,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(totals.ttc)}</span></div>
      </div>

      <FF label="Observations"><textarea style={{...inp,minHeight:50,resize:"vertical"}} value={form.observations||""} onChange={e=>setForm({...form,observations:e.target.value})}/></FF>
      <FF label="Conditions de paiement"><textarea style={{...inp,minHeight:40,resize:"vertical"}} value={form.conditions||""} onChange={e=>setForm({...form,conditions:e.target.value})}/></FF>

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer l'OS</button>
      </div>
    </Modal>
  </div>);
}

// ═══════════════════════════════════════════
// AI ASSISTANT
// ═══════════════════════════════════════════
function AIV({data,save,m,externalTranscript,clearExternal,reload}) {
  const [messages,setMessages]=useState([{role:"assistant",content:"Bonjour Dursun ! Je suis l'assistant IA d'**ID Maîtrise**.\n\nJe peux tout faire :\n• **\"Crée un OS pour le chantier Friboulet, artisan Lefèvre...\"** → Ordre de Service\n• **\"Rédige un CR pour Les Voiles, présents : Lefèvre, Costa...\"** → Compte Rendu\n• **\"Nouveau chantier Villa Dupont, budget 200 000€...\"** → Chantier\n• **\"Ajoute une tâche urgente...\"** → Tâche\n• **\"RDV demain 14h réunion de chantier...\"** → Google Calendar\n• **\"Résumé avancement du chantier Les Voiles\"** → Analyse\n\nParlez ou tapez !"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [listening,setListening]=useState(false);
  const [gcalAction,setGcalAction]=useState(null);
  const recognRef = useRef(null);
  const endRef=useRef(null);
  const inputRef=useRef(null);

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  // Pick up transcript from floating mic
  useEffect(() => {
    if (externalTranscript && externalTranscript.trim()) {
      setInput(externalTranscript);
      if (clearExternal) clearExternal();
    }
  }, [externalTranscript, clearExternal]);

  // ─── SPEECH RECOGNITION ───
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("La reconnaissance vocale n'est pas supportée sur ce navigateur. Utilisez Chrome ou Safari."); return; }
    
    if (listening && recognRef.current) {
      recognRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => setListening(true);
    
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setInput(finalTranscript + interim);
    };

    recognition.onerror = (e) => {
      console.error("Speech error:", e.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      if (finalTranscript.trim()) {
        setInput(finalTranscript.trim());
      }
    };

    recognition.start();
  }, [listening]);

  const sendMessage = async () => {
    if (!input.trim()||loading) return;
    const userMsg=input.trim(); setInput(""); 
    if (listening && recognRef.current) { recognRef.current.stop(); setListening(false); }
    setMessages(prev=>[...prev,{role:"user",content:userMsg}]); setLoading(true);

    try {
      const sys = `Tu es l'assistant IA d'ID Maîtrise, maîtrise d'œuvre BTP au Havre (9 Rue Henry Genestal, 76600). Le gérant est Dursun. Tu gères le quotidien des chantiers.

DONNÉES ACTUELLES (Supabase): ${JSON.stringify(data,null,0)}
GOOGLE CALENDAR: ${JSON.stringify(gcalEvents,null,0)}

TU PEUX TOUT FAIRE :
1. Créer des chantiers, tâches, contacts, comptes rendus, ordres de service
2. Résumer l'avancement d'un chantier (budget consommé, tâches en cours, prochains RDV)
3. Créer des RDV dans Google Calendar (utilise l'action add_gcal_event)
4. Lister, rechercher et analyser toutes les données

ACTIONS — utilise un bloc JSON entre <<<ACTION>>> et <<<END_ACTION>>>

add_chantier: {"type":"add_chantier","data":{"nom":"...","client":"...","adresse":"...","phase":"...","statut":"Planifié","budget":0,"dateDebut":"YYYY-MM-DD","dateFin":"YYYY-MM-DD","lots":["..."]}}

add_task: {"type":"add_task","data":{"chantier_id":"UUID","titre":"...","priorite":"Urgent|En cours|En attente","statut":"Planifié|En cours|Terminé","echeance":"YYYY-MM-DD","lot":"..."}}

add_contact: {"type":"add_contact","data":{"nom":"...","type":"Artisan|Client|Fournisseur","specialite":"...","tel":"...","email":"...","adresse":"...","siret":"...","notes":"..."}}

update_contact: {"type":"update_contact","data":{"id":"UUID-EXISTANT","nom":"...","type":"...","specialite":"...","tel":"...","email":"...","adresse":"...","siret":"...","notes":"..."}}

add_cr: {"type":"add_cr","data":{"chantier_id":"UUID","date":"YYYY-MM-DD","numero":1,"resume":"...","participants":"...","decisions":"..."}}

update_cr: {"type":"update_cr","data":{"id":"UUID-EXISTANT","chantier_id":"UUID","date":"YYYY-MM-DD","numero":1,"resume":"...","participants":"...","decisions":"..."}}

add_os: {"type":"add_os","data":{"numero":"OS-2026-XXX","chantier_id":"UUID","client_nom":"...","client_adresse":"...","artisan_nom":"...","artisan_specialite":"...","artisan_tel":"...","artisan_email":"...","artisan_siret":"...","date_emission":"YYYY-MM-DD","date_intervention":"YYYY-MM-DD","date_fin_prevue":"YYYY-MM-DD","prestations":[{"description":"...","unite":"m²","quantite":10,"prix_unitaire":45.00,"tva_taux":20}],"observations":"...","conditions":"Paiement à 30 jours.","statut":"Émis"}}

update_os: {"type":"update_os","data":{"id":"UUID-EXISTANT","numero":"OS-2026-XXX","chantier_id":"UUID","client_nom":"...","artisan_nom":"...","artisan_specialite":"...","artisan_tel":"...","artisan_email":"...","artisan_siret":"...","date_emission":"YYYY-MM-DD","date_intervention":"YYYY-MM-DD","date_fin_prevue":"YYYY-MM-DD","prestations":[{"description":"...","unite":"m²","quantite":10,"prix_unitaire":45.00,"tva_taux":20}],"observations":"...","conditions":"...","statut":"..."}}

add_gcal_event: {"type":"add_gcal_event","data":{"title":"...","date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","location":"...","description":"..."}}

RÈGLES :
- Réponds TOUJOURS en français, concis et professionnel
- Utilise les vrais UUID des chantiers/contacts depuis les données
- Pour les OS, calcule les montants : montant_ht = somme(qte×pu), montant_tva = somme(qte×pu×tva/100), montant_ttc = ht+tva
- Phase libre (pas de contrainte)
- Quand on te demande un résumé/avancement, analyse les données et donne un point clair`;


      const response = await fetch("/api/claude", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:2000, system:sys,
          messages:messages.filter((m,i)=>m.role!=="assistant"||i>0).concat([{role:"user",content:userMsg}]).map(m=>({role:m.role,content:m.content})),
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur API (${response.status}) : ${errText.slice(0,200)}`);
      }
      const result = await response.json();
      let text = result.content?.map(c=>c.text||"").join("\n") || "Désolé, erreur.";

      const act = text.match(/<<<ACTION>>>([\s\S]*?)<<<END_ACTION>>>/);
      if (act) {
        try {
          const a=JSON.parse(act[1].trim());
          let actionLabel = "";
          
          if(a.type==="add_chantier") { await SB.upsertChantier(a.data); actionLabel="Chantier créé"; }
          else if(a.type==="add_task") { await SB.upsertTask(a.data); actionLabel="Tâche créée"; }
          else if(a.type==="add_contact") { await SB.upsertContact(a.data); actionLabel="Contact créé"; }
          else if(a.type==="update_contact") { await SB.upsertContact(a.data); actionLabel="Contact mis à jour"; }
          else if(a.type==="add_cr") { await SB.upsertCR(a.data); actionLabel="Compte rendu créé"; }
          else if(a.type==="update_cr") { await SB.upsertCR(a.data); actionLabel="Compte rendu mis à jour"; }
          else if(a.type==="add_os" || a.type==="update_os") {
            const prests = a.data.prestations || [];
            let ht=0, tva=0;
            prests.forEach(p => { const l=(parseFloat(p.quantite)||0)*(parseFloat(p.prix_unitaire)||0); ht+=l; tva+=l*(parseFloat(p.tva_taux)||20)/100; });
            await SB.upsertOS({ ...a.data, montant_ht:ht, montant_tva:tva, montant_ttc:ht+tva });
            actionLabel = a.type==="update_os" ? "Ordre de Service mis à jour" : "Ordre de Service créé";
          }
          else if(a.type==="add_gcal_event") {
            setGcalAction(a.data);
            actionLabel="RDV Google Calendar à créer";
          }
          
          if(reload) await reload();
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim()+`\n\n✅ **${actionLabel} dans Supabase !**`;
        } catch(err) {
          console.error("❌ Action error:", err);
          text=text.replace(/<<<ACTION>>>[\s\S]*?<<<END_ACTION>>>/,"").trim()+`\n\n❌ **Erreur Supabase :** ${err.message}`;
        }
      }
      setMessages(prev=>[...prev,{role:"assistant",content:text}]);
    } catch {
      setMessages(prev=>[...prev,{role:"assistant",content:"❌ Erreur API."}]);
    }
    setLoading(false); inputRef.current?.focus();
  };

  const renderMd = text => text.split("\n").map((line,i) => {
    let h=line.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>');
    return <div key={i} style={{marginBottom:line===""?6:1}} dangerouslySetInnerHTML={{__html:h||"&nbsp;"}}/>;
  });

  return (
    <div style={{display:"flex",flexDirection:"column",height:m?"calc(100vh - 76px)":"calc(100vh - 48px)"}}>
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Assistant IA</h1>
          <ApiBadge/>
        </div>
        <p style={{margin:"2px 0 0",fontSize:12,color:"#64748B"}}>Parlez ou tapez — connecté à vos données et Google Calendar</p>
      </div>

      {/* CHAT */}
      <div style={{flex:1,overflow:"auto",background:"#fff",borderRadius:12,padding:m?12:18,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:12}}>
        {messages.map((msg,i)=>(
          <div key={i} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
            <div style={{maxWidth:m?"88%":"75%",padding:"10px 14px",borderRadius:msg.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px",background:msg.role==="user"?"linear-gradient(135deg,#1E3A5F,#2563EB)":"#F8FAFC",color:msg.role==="user"?"#fff":"#334155",fontSize:13,lineHeight:1.6,border:msg.role==="user"?"none":"1px solid #E2E8F0"}}>
              {msg.role==="assistant"?renderMd(msg.content):msg.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:5,padding:10}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#94A3B8",animation:`pulse 1.4s ease-in-out ${i*.2}s infinite`}}/>)}</div>}
        <div ref={endRef}/>
      </div>

      {/* INPUT + MIC */}
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <MicButtonInline listening={listening} onClick={startListening} />
        <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()}
          placeholder={listening?"🎙️ Je vous écoute...":"Tapez ou appuyez sur le micro..."}
          style={{...inp,flex:1,padding:"12px 16px",fontSize:14,borderRadius:12,background:listening?"#FEF2F2":"#fff",borderColor:listening?"#FECACA":"#E2E8F0",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}/>
        <button onClick={sendMessage} disabled={loading} style={{...btnP,padding:"12px 16px",borderRadius:12,opacity:loading?.6:1,display:"flex",alignItems:"center",gap:5}}>
          <Icon d={I.send} size={16} color="#fff"/>{!m&&"Envoyer"}
        </button>
      </div>

      {/* QUICK ACTIONS */}
      <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
        {["Crée un OS pour...", "Rédige un CR pour...", "Résumé avancement chantiers", "Tâches urgentes", "Crée un RDV demain", "Liste artisans actifs"].map(q=>(
          <button key={q} onClick={()=>setInput(q)} style={{padding:"5px 12px",borderRadius:16,border:"1px solid #E2E8F0",background:"#fff",color:"#64748B",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{q}</button>
        ))}
      </div>
    </div>
  );
}
