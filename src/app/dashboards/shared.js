'use client'
import { supabase } from '../supabaseClient'
import { ProgressBar } from '../components'
import { writeActivityLog, setLogContext, clearLogContext } from '../lib/activityLog'
// Note : la création de notifications se fait désormais côté Postgres
// via des triggers SQL (migration 011). On n'appelle plus createNotifications
// depuis le JS — c'est plus robuste (marche pour l'IA, les imports, etc.)

// ─── SOURCE UNIQUE : INFOS ENTREPRISE ───
// Modifier ici = mis à jour partout (PDFs, sidebar, footer, assistant IA)
export const COMPANY = {
  nom:       "SARL ID MAÎTRISE",
  activite:  "Ingénierie de la construction",
  adresse:   "9 Rue Henry Genestal",
  cpVille:   "76600 LE HAVRE",
  email:     "contact@id-maitrise.com",
  siret:     "921 536 181 00024",
  assurance: "Décennale MIC Insurance - N° LUN2205206",
  gerant:    "Dursun",
}

export const LocalDB = {
  get(key) {
    try {
      if (typeof window === 'undefined') return null;
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  set(key, val) {
    try {
      if (typeof window !== 'undefined')
        localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { console.error(e); }
  },
};

// ─── SUPABASE CRUD HELPERS ───
export const SB = {
  // ─── JOURNAL D'ACTIVITÉ (audit log) ───
  // Écriture "fire-and-forget" : n'empêche jamais une opération métier
  // de réussir si l'insert du log échoue (ex. table pas encore migrée).
  log(action, entityType, entityId = null, entityLabel = null, metadata = null) {
    // Délégation au helper centralisé (shortUserAgent, context, fire-and-forget)
    return writeActivityLog(supabase, {
      action, entity_type: entityType, entity_id: entityId, entity_label: entityLabel, metadata,
    })
  },

  // Expose le contexte pour que les callers (AIV, duplicate) puissent
  // tagguer les prochains logs sans créer de doublons.
  setLogContext,
  clearLogContext,

  async getLogs({
    limit = 200, before = null, userEmail = null,
    action = null, entityType = null, search = null
  } = {}) {
    let q = supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(Number(limit) || 200, 1), 500));
    if (before) q = q.lt('created_at', before);
    if (userEmail) q = q.eq('user_email', userEmail.toLowerCase().trim());
    if (action) q = q.eq('action', action);
    if (entityType) q = q.eq('entity_type', entityType);
    if (search && search.trim()) {
      // Sanitisation stricte : on garde uniquement les caractères qui ont
      // du sens pour une recherche (alphanum, espaces, quelques séparateurs
      // usuels). Tout caractère dangereux pour la syntaxe .or() de PostgREST
      // (virgule, pourcentage, parenthèse, point-virgule, quote, slash, etc.)
      // est retiré → pas de risque de contournement des filtres via injection
      // PostgREST.
      const s = search.trim()
        .replace(/[^\p{L}\p{N}\s@.\-_+°']/gu, '')
        .slice(0, 80)
      if (s) {
        // Échappe les single-quotes restantes en les dédoublant
        const safe = s.replace(/'/g, "''")
        q = q.or(
          `entity_label.ilike.%${safe}%,` +
          `user_prenom.ilike.%${safe}%,user_email.ilike.%${safe}%`
        );
      }
    }
    const { data, error } = await q;
    if (error) {
      const msg = error.message || ''
      // Détection spécifique "table manquante" pour UX dédiée dans LogsV
      if (/relation.*activity_logs.*does not exist/i.test(msg) || error.code === '42P01') {
        const e = new Error('Table activity_logs absente — exécute la migration 006.')
        e.code = 'MIGRATION_MISSING'
        throw e
      }
      throw new Error("Erreur chargement journal : " + msg);
    }
    return data || [];
  },

  // Liste distincte des utilisateurs présents dans les logs (pour le
  // filtre du LogsV). Utilise un helper DB si disponible, sinon un
  // SELECT DISTINCT "à la main".
  async getLogUsers() {
    try {
      const { data, error } = await supabase.rpc('activity_logs_distinct_users')
      if (!error && Array.isArray(data)) return data
    } catch (_) { /* fallback */ }
    const { data, error } = await supabase
      .from('activity_logs')
      .select('user_email,user_prenom')
      .not('user_email', 'is', null)
      .limit(5000)
    if (error) return []
    const seen = new Map()
    for (const row of (data || [])) {
      if (row.user_email && !seen.has(row.user_email)) {
        seen.set(row.user_email, row.user_prenom || row.user_email)
      }
    }
    return [...seen.entries()].map(([email, prenom]) => ({ email, prenom }))
  },

  async purgeOldLogs(days = 90) {
    const { data, error } = await supabase.rpc('purge_activity_logs', { p_days: days })
    if (error) throw new Error('Purge impossible : ' + error.message)
    return data ?? null
  },

  async loadAll() {
    const [ch, co, ta, pl, rv, cr, os, att] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('nom'),
      supabase.from('taches').select('*').order('created_at', { ascending: false }),
      supabase.from('planning').select('*').order('debut'),
      supabase.from('rdv').select('*').order('date'),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }).limit(200),
      supabase.from('ordres_service').select('*')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('attachments').select('id,chantier_id')
        .order('created_at', { ascending: false }),
    ]);
    if (ch.error) return { error: ch.error.message };
    // Filtrage : on masque les chantiers démo pour les admins/salariés.
    // Double protection : is_demo=true (flag DB) OU UUID fixe connu
    // (fallback si la migration is_demo n'est pas encore appliquée en prod).
    const DEMO_UUIDS = new Set([
      '11111111-1111-4111-8111-111111111d01', // Villa Moreau
      '22222222-2222-4222-8222-222222222d02', // Maison Petit
      '33333333-3333-4333-8333-333333333d03', // Pharmacie Normandie
    ]);
    const isDemo = (c) => c.is_demo || DEMO_UUIDS.has(c.id);
    const nonDemoChantiers = (ch.data || []).filter(c => !isDemo(c));
    const demoIds = new Set((ch.data || []).filter(isDemo).map(c => c.id));
    const notDemoChantier = (item) => !item?.chantier_id || !demoIds.has(item.chantier_id);
    return {
      chantiers: nonDemoChantiers.map(c => ({ ...c, lots: c.lots || [] })),
      contacts: (co.data || []).map(c => ({ ...c, chantiers: [] })),
      tasks: (ta.data || []).filter(notDemoChantier)
        .map(t => ({ ...t, chantierId: t.chantier_id })),
      planning: (pl.data || []).filter(notDemoChantier)
        .map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv: (rv.data || []).filter(notDemoChantier).map(r => ({
        ...r, chantierId: r.chantier_id, participants: r.participants || []
      })),
      compteRendus: (cr.data || []).filter(notDemoChantier)
        .map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: (os.data || []).filter(notDemoChantier),
      attachments: (att.data || []).filter(notDemoChantier),
    };
  },

  // Chantiers
  async upsertChantier(ch) {
    const row = {
      nom: ch.nom, client: ch.client, adresse: ch.adresse,
      phase: ch.phase, statut: ch.statut,
      budget: Number(ch.budget)||0, depenses: Number(ch.depenses)||0,
      date_debut: ch.dateDebut||ch.date_debut||null,
      date_fin: ch.dateFin||ch.date_fin||null,
      lots: ch.lots||[], photo_couverture: ch.photo_couverture||null,
      notes_internes: ch.notes_internes||null
    };
    if (ch.id && String(ch.id).length > 10) {
      const { data, error } = await supabase.from('chantiers')
        .update(row).eq('id', ch.id).select().single();
      if (error) throw new Error("Erreur mise à jour chantier : " + error.message);
      this.log('update', 'chantier', data.id, data.nom);
      return data;
    } else {
      const { data, error } = await supabase.from('chantiers').insert(row).select().single();
      if (error) throw new Error("Erreur création chantier : " + error.message);
      this.log('create', 'chantier', data.id, data.nom);
      return data;
    }
  },
  async deleteChantier(id) {
    const { data: prev } = await supabase.from('chantiers')
      .select('nom').eq('id', id).maybeSingle();
    await supabase.from('chantiers').delete().eq('id', id);
    this.log('delete', 'chantier', id, prev?.nom || null);
  },

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
      assurance_decennale: c.assurance_decennale||null,
      assurance_validite: c.assurance_validite||null,
      iban: c.iban||null, qualifications: c.qualifications||null,
      note: Number(c.note)||0, actif: c.actif !== false,
    };
    if (c.id && String(c.id).length > 10) {
      const { data, error } = await supabase.from('contacts')
        .update(row).eq('id', c.id).select().single();
      if (error) throw new Error("Erreur mise à jour contact : " + error.message);
      this.log('update', 'contact', data.id, data.nom);
      return data;
    } else {
      const { data, error } = await supabase.from('contacts').insert(row).select().single();
      if (error) throw new Error("Erreur création contact : " + error.message);
      this.log('create', 'contact', data.id, data.nom);
      return data;
    }
  },
  async deleteContact(id) {
    const { data: prev } = await supabase.from('contacts').select('nom').eq('id', id).maybeSingle();
    await supabase.from('contacts').delete().eq('id', id);
    this.log('delete', 'contact', id, prev?.nom || null);
  },

  // Tâches
  async upsertTask(t) {
    const chId = t.chantierId||t.chantier_id||null;
    const row = {
      chantier_id: chId||null, titre: t.titre,
      priorite: t.priorite, statut: t.statut,
      echeance: t.echeance||null, lot: t.lot||null
    };
    if (t.id && String(t.id).length > 10) {
      const { data, error } = await supabase.from('taches')
        .update(row).eq('id', t.id).select().single();
      if (error) throw new Error("Erreur mise à jour tâche : " + error.message);
      this.log('update', 'task', data.id, data.titre);
      return data;
    } else {
      const { data, error } = await supabase.from('taches').insert(row).select().single();
      if (error) throw new Error("Erreur création tâche : " + error.message);
      this.log('create', 'task', data.id, data.titre);
      return data;
    }
  },
  async deleteTask(id) {
    const { data: prev } = await supabase.from('taches').select('titre').eq('id', id).maybeSingle();
    await supabase.from('taches').delete().eq('id', id);
    this.log('delete', 'task', id, prev?.titre || null);
  },

  // Comptes Rendus
  async upsertCR(cr) {
    const chId = cr.chantierId||cr.chantier_id||null;
    const row = {
      chantier_id: chId||null, date: cr.date||null,
      numero: Number(cr.numero)||1, resume: cr.resume||"",
      participants: cr.participants||"", decisions: cr.decisions||""
    };
    if (cr.id && String(cr.id).length > 10) {
      const { data, error } = await supabase.from('compte_rendus')
        .update(row).eq('id', cr.id).select().single();
      if (error) throw new Error("Erreur mise à jour CR : " + error.message);
      this.log('update', 'cr', data.id, `CR n°${data.numero}`);
      return data;
    } else {
      const { data, error } = await supabase.from('compte_rendus').insert(row).select().single();
      if (error) throw new Error("Erreur création CR : " + error.message);
      this.log('create', 'cr', data.id, `CR n°${data.numero}`);
      return data;
    }
  },
  async deleteCR(id) {
    const { data: prev } = await supabase.from('compte_rendus')
      .select('numero').eq('id', id).maybeSingle();
    const { error } = await supabase.from('compte_rendus').delete().eq('id', id);
    if (error) { console.error("❌ Delete CR:", error.message); return; }
    this.log('delete', 'cr', id, prev?.numero ? `CR n°${prev.numero}` : null);
  },

  // Ordres de Service
  async upsertOS(os) {
    const row = {
      numero: os.numero||"OS-XXXX",
      chantier_id: os.chantier_id||null,
      client_nom: os.client_nom||"",
      client_adresse: os.client_adresse||"",
      artisan_nom: os.artisan_nom||"",
      artisan_specialite: os.artisan_specialite||"",
      artisan_adresse: os.artisan_adresse||"",
      artisan_tel: os.artisan_tel||"",
      artisan_email: os.artisan_email||"",
      artisan_siret: os.artisan_siret||"",
      date_emission: os.date_emission||null,
      date_intervention: os.date_intervention||null,
      date_fin_prevue: os.date_fin_prevue||null,
      prestations: os.prestations||[],
      montant_ht: Number(os.montant_ht)||0,
      montant_tva: Number(os.montant_tva)||0,
      montant_ttc: Number(os.montant_ttc)||0,
      statut: os.statut||'Brouillon',
      observations: os.observations||"",
      conditions: os.conditions||"",
      odoo_sign_id: os.odoo_sign_id||null,
      odoo_sign_url: os.odoo_sign_url||null,
      statut_signature: os.statut_signature||'Non envoyé'
    };
    if (os.id && String(os.id).length > 10) {
      const { data, error } = await supabase.from('ordres_service')
        .update(row).eq('id', os.id).select().single();
      if (error) throw new Error("Erreur mise à jour OS : " + error.message);
      this.log('update', 'os', data.id, data.numero);
      return data;
    } else {
      const { data, error } = await supabase.from('ordres_service').insert(row).select().single();
      if (error) throw new Error("Erreur création OS : " + error.message);
      this.log('create', 'os', data.id, data.numero);
      return data;
    }
  },
  async deleteOS(id) {
    const { data: prev } = await supabase.from('ordres_service')
      .select('numero').eq('id', id).maybeSingle();
    const { error } = await supabase.from('ordres_service').delete().eq('id', id);
    if (error) { console.error("❌ Delete OS:", error.message); return; }
    this.log('delete', 'os', id, prev?.numero || null);
  },

  // Attachments
  async uploadAttachment(file, type, itemId) {
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${type}/${itemId}/${fileName}`;
    const { error } = await supabase.storage.from('attachments').upload(filePath, file);
    if (error) throw new Error("Upload échoué: " + error.message);
    const { data: attachData, error: attachError } = await supabase.from('attachments').insert({
      [type === 'chantier' ? 'chantier_id'
        : type === 'os' ? 'os_id'
        : type === 'cr' ? 'cr_id' : 'task_id']: itemId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    }).select().single();
    if (attachError) throw new Error("Erreur enregistrement: " + attachError.message);
    this.log('create', 'attachment', attachData.id, file.name,
      { parent_type: type, parent_id: itemId });
    return attachData;
  },
  async getAttachments(type, itemId) {
    const { data, error } = await supabase.from('attachments').select('*').eq(
      type === 'chantier' ? 'chantier_id'
        : type === 'os' ? 'os_id'
        : type === 'cr' ? 'cr_id' : 'task_id',
      itemId
    ).order('uploaded_at', { ascending: false });
    if (error) throw new Error("Erreur chargement attachments: " + error.message);
    return data || [];
  },
  async deleteAttachment(id, filePath) {
    // Récupère le nom du fichier avant suppression pour un libellé lisible
    const { data: prev } = await supabase.from('attachments')
      .select('file_name').eq('id', id).maybeSingle();
    await supabase.storage.from('attachments').remove([filePath]);
    await supabase.from('attachments').delete().eq('id', id);
    this.log('delete', 'attachment', id, prev?.file_name || filePath || null);
  },
  async getAttachmentUrl(filePath) {
    const { data } = supabase.storage.from('attachments').getPublicUrl(filePath);
    return data?.publicUrl;
  },

  // Templates
  async getTemplates(type) {
    const { data, error } = await supabase.from('templates')
      .select('*').eq('type', type).order('name');
    if (error) throw new Error("Erreur chargement templates: " + error.message);
    return data || [];
  },
  async saveTemplate(type, name, description, data) {
    const { data: row, error } = await supabase.from('templates')
      .insert({ type, name, description, data }).select().single();
    if (error) throw new Error("Erreur sauvegarde template: " + error.message);
    this.log('create', 'template', row?.id || null, name, { template_type: type });
  },
  async deleteTemplate(id) {
    const { data: prev } = await supabase.from('templates')
      .select('name,type').eq('id', id).maybeSingle();
    await supabase.from('templates').delete().eq('id', id);
    this.log('delete', 'template', id, prev?.name || null,
      prev?.type ? { template_type: prev.type } : null);
  },
  async duplicateChantier(chantier) {
    const newCh = { ...chantier };
    delete newCh.id;
    delete newCh.created_at;
    newCh.nom = newCh.nom + " (copie)";
    // Tague le prochain log de upsertChantier avec la source de la copie,
    // évite de créer 2 entrées (create + duplicate) pour une seule action.
    setLogContext({
      source: 'duplicate',
      source_id: chantier?.id || null,
      source_nom: chantier?.nom || null
    });
    try {
      return await this.upsertChantier(newCh);
    } finally {
      clearLogContext();
    }
  },

  // Comments
  async addComment(type, itemId, author, content) {
    const data = { author_email: author, author_name: author.split('@')[0], content };
    if (type === 'chantier') data.chantier_id = itemId;
    else if (type === 'os') data.os_id = itemId;
    else if (type === 'cr') data.cr_id = itemId;
    else if (type === 'task') data.task_id = itemId;
    const { data: row, error } = await supabase.from('comments').insert(data).select().single();
    if (error) throw new Error("Erreur ajout commentaire: " + error.message);
    const preview = content?.length > 60 ? content.slice(0, 57) + '…' : (content || '');
    this.log('create', 'comment', row?.id || null, preview,
      { parent_type: type, parent_id: itemId });
  },
  async getComments(type, itemId) {
    const col = type === 'chantier' ? 'chantier_id'
      : type === 'os' ? 'os_id'
      : type === 'cr' ? 'cr_id' : 'task_id';
    const { data, error } = await supabase.from('comments').select('*')
      .eq(col, itemId).order('created_at', { ascending: false });
    if (error) throw new Error("Erreur chargement commentaires: " + error.message);
    return data || [];
  },
  async deleteComment(id) {
    const { data: prev } = await supabase.from('comments')
      .select('content').eq('id', id).maybeSingle();
    await supabase.from('comments').delete().eq('id', id);
    const preview = prev?.content?.length > 60
      ? prev.content.slice(0, 57) + '…'
      : (prev?.content || '');
    this.log('delete', 'comment', id, preview);
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
  // Chargement filtré pour un maître d'ouvrage (uniquement ses chantiers)
  async loadForClient(prenom, nom) {
    // Chercher les chantiers dont le champ "client" contient le prénom du maître d'ouvrage
    const term = (prenom || '').trim()
    if (!term) return {
      chantiers:[], contacts:[], tasks:[],
      planning:[], rdv:[], compteRendus:[], ordresService:[]
    }

    const { data: ch, error } = await supabase
      .from('chantiers').select('*')
      .ilike('client', `%${term}%`)
      .order('created_at', { ascending: false })

    if (error || !ch?.length) {
      return {
        chantiers:[], contacts:[], tasks:[],
        planning:[], rdv:[], compteRendus:[], ordresService:[]
      }
    }

    const ids = ch.map(c => c.id)
    const [cr, os, ta, pl] = await Promise.all([
      supabase.from('compte_rendus').select('*').in('chantier_id', ids)
        .order('date', { ascending:false }).limit(100),
      supabase.from('ordres_service').select('*').in('chantier_id', ids)
        .order('created_at', { ascending:false }).limit(100),
      supabase.from('taches').select('*').in('chantier_id', ids)
        .order('created_at', { ascending:false }),
      supabase.from('planning').select('*').in('chantier_id', ids).order('debut'),
    ])

    return {
      chantiers:    ch.map(c => ({ ...c, lots: c.lots || [] })),
      contacts:     [],
      tasks:        (ta.data||[]).map(t => ({ ...t, chantierId: t.chantier_id })),
      planning:     (pl.data||[]).map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv:          [],
      compteRendus: (cr.data||[]).map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: os.data || [],
    }
  },

  async removeAuthorizedUser(id) {
    const { error } = await supabase.from('authorized_users').delete().eq('id', id);
    if (error) throw new Error("Erreur suppression utilisateur: " + error.message);
  },
};

// ─── ICONS ───
export const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  ><path d={d} /></svg>
);
export const I = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  projects: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  planning: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z",
  budget: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  tasks: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  contacts: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  // Clipboard (ordres de service) — presse-papier avec un "OS" implicite,
  // distinct du document "reports"
  os: "M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 13l2 2 4-4",
  ai: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z M12 8v4l3 3",
  pv: "M9 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9 M14 2v7h7 M9 13h4 M9 17h6 M9 9h2",
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
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
};

// ─── COLORS ───
export const phase = { "Hors d'air": "#F59E0B", "Technique": "#3B82F6", "Finitions": "#10B981" };
export const status = {
  "En cours": "#3B82F6", "Planifié": "#8B5CF6",
  "Terminé": "#10B981", "En attente": "#F59E0B", "Urgent": "#EF4444"
};

// ─── DEFAULT DATA ───
export const defaultData = {
  chantiers: [
    { id:"ch1", nom:"Résidence Les Voiles", client:"SCI Maritime",
      adresse:"12 Quai de Southampton, Le Havre", phase:"Technique",
      statut:"En cours", budget:450000, depenses:287000,
      dateDebut:"2025-09-01", dateFin:"2026-06-30",
      lots:["Gros œuvre","Électricité","Plomberie","Menuiserie"] },
    { id:"ch2", nom:"Bureaux Port 2000", client:"HAROPA",
      adresse:"Zone industrielle Port 2000", phase:"Hors d'air",
      statut:"En cours", budget:820000, depenses:195000,
      dateDebut:"2025-11-15", dateFin:"2026-12-31",
      lots:["Structure métallique","Bardage","Électricité","CVC"] },
    { id:"ch3", nom:"Villa Sainte-Adresse", client:"M. Durand",
      adresse:"8 Rue Émile Zola, Sainte-Adresse", phase:"Finitions",
      statut:"En cours", budget:280000, depenses:241000,
      dateDebut:"2025-03-01", dateFin:"2026-04-15",
      lots:["Peinture","Revêtements sols","Menuiserie int."] },
    { id:"ch4", nom:"Réhab. Immeuble Thiers", client:"Copropriété Thiers",
      adresse:"34 Rue Thiers, Le Havre", phase:"Hors d'air",
      statut:"Planifié", budget:620000, depenses:0,
      dateDebut:"2026-04-01", dateFin:"2027-03-31",
      lots:["Ravalement","Étanchéité","Menuiseries ext."] },
    { id:"ch5", nom:"Garage Lucas", client:"M. Lucas",
      adresse:"Oudalle", phase:"Technique",
      statut:"En cours", budget:85000, depenses:32000,
      dateDebut:"2026-01-15", dateFin:"2026-05-30",
      lots:["Maçonnerie","Charpente","Couverture"] },
    { id:"ch6", nom:"Maison Friboulet", client:"Famille Friboulet",
      adresse:"Riville", phase:"Hors d'air",
      statut:"En cours", budget:320000, depenses:78000,
      dateDebut:"2025-12-01", dateFin:"2026-09-30",
      lots:["Gros œuvre","Charpente","Menuiseries ext.","Électricité","Plomberie"] },
  ],
  tasks: [
    { id:"t1", chantierId:"ch1", titre:"Vérifier tirage câbles RJ45 - Niv.2",
      priorite:"Urgent", statut:"En cours", echeance:"2026-03-18", lot:"Électricité" },
    { id:"t2", chantierId:"ch1", titre:"Réception menuiseries alu",
      priorite:"En cours", statut:"Planifié", echeance:"2026-03-22", lot:"Menuiserie" },
    { id:"t3", chantierId:"ch3", titre:"Contrôle peinture T2 apt 4B",
      priorite:"En cours", statut:"En cours", echeance:"2026-03-19", lot:"Peinture" },
    { id:"t4", chantierId:"ch2", titre:"Validation plans structure - Phase EXE",
      priorite:"Urgent", statut:"En cours", echeance:"2026-03-17", lot:"Structure métallique" },
    { id:"t5", chantierId:"ch3", titre:"Pose revêtements sols RDC",
      priorite:"En cours", statut:"Planifié", echeance:"2026-03-25", lot:"Revêtements sols" },
    { id:"t6", chantierId:"ch6", titre:"Finaliser dossier PC modificatif",
      priorite:"Urgent", statut:"En cours", echeance:"2026-03-19", lot:"Administratif" },
    { id:"t7", chantierId:"ch6", titre:"Dépôt PC modificatif mairie Riville",
      priorite:"Urgent", statut:"Planifié", echeance:"2026-03-20", lot:"Administratif" },
  ],
  rdv: [
    { id:"r1", chantierId:"ch1", titre:"Réunion de chantier hebdo",
      date:"2026-03-17", heure:"09:00", lieu:"Sur site",
      participants:["Lefèvre","Costa"] },
    { id:"r2", chantierId:"ch2", titre:"Visite MOA",
      date:"2026-03-18", heure:"14:00", lieu:"Bureau",
      participants:["HAROPA"] },
  ],
  contacts: [
    { id:"c1", nom:"Lefèvre Électricité", type:"Artisan",
      specialite:"Électricité CFO/CFA", tel:"06 12 34 56 78",
      email:"lefevre.elec@mail.fr", chantiers:["ch1","ch2"] },
    { id:"c2", nom:"Costa Plomberie", type:"Artisan",
      specialite:"Plomberie / CVC", tel:"06 23 45 67 89",
      email:"costa.plomb@mail.fr", chantiers:["ch1"] },
    { id:"c3", nom:"Normandie Peinture", type:"Artisan",
      specialite:"Peinture / Ravalement", tel:"06 34 56 78 90",
      email:"norm.peinture@mail.fr", chantiers:["ch3","ch4"] },
    { id:"c4", nom:"HAROPA", type:"Client",
      specialite:"Maîtrise d'ouvrage", tel:"02 35 xx xx xx",
      email:"projets@haropa.fr", chantiers:["ch2"] },
    { id:"c5", nom:"SCI Maritime", type:"Client",
      specialite:"Promotion immobilière", tel:"02 35 xx xx xx",
      email:"contact@sci-maritime.fr", chantiers:["ch1"] },
    { id:"c6", nom:"M. Durand", type:"Client",
      specialite:"Particulier", tel:"06 45 67 89 01",
      email:"durand@mail.fr", chantiers:["ch3"] },
    { id:"c7", nom:"Point P Le Havre", type:"Fournisseur",
      specialite:"Matériaux gros œuvre", tel:"02 35 xx xx xx",
      email:"lehavre@pointp.fr", chantiers:["ch1","ch2","ch4"] },
    { id:"c8", nom:"Rexel Normandie", type:"Fournisseur",
      specialite:"Matériel électrique", tel:"02 35 xx xx xx",
      email:"normandie@rexel.fr", chantiers:["ch1","ch2"] },
    { id:"c9", nom:"Atelier Bois Normand", type:"Artisan",
      specialite:"Menuiserie bois/alu", tel:"06 56 78 90 12",
      email:"atelierbois@mail.fr", chantiers:["ch1","ch3"] },
    { id:"c10", nom:"Famille Friboulet", type:"Client",
      specialite:"Particulier", tel:"06 78 90 12 34",
      email:"friboulet@mail.fr", chantiers:["ch6"] },
    { id:"c11", nom:"Eurofins Laboratoire", type:"Fournisseur",
      specialite:"Analyses / Contrôle", tel:"02 35 xx xx xx",
      email:"contact@eurofins.fr", chantiers:["ch5","ch6"] },
    { id:"c12", nom:"Maryam (Architecte)", type:"Artisan",
      specialite:"Architecture", tel:"06 89 01 23 45",
      email:"maryam.archi@mail.fr", chantiers:["ch6"] },
  ],
  compteRendus: [
    { id:"cr1", chantierId:"ch1", date:"2026-03-10", numero:12,
      resume:"Avancement gros œuvre 85%. Retard électricité niveau 2.",
      participants:"Lefèvre, Costa",
      decisions:"Relance Lefèvre tirage câbles avant 18/03." },
  ],
  planning: [
    { id:"p1", chantierId:"ch1", lot:"Électricité",
      tache:"Tirage câbles Niv.2", debut:"2026-03-10", fin:"2026-03-21", avancement:40 },
    { id:"p2", chantierId:"ch1", lot:"Menuiserie",
      tache:"Pose menuiseries alu", debut:"2026-03-22", fin:"2026-04-05", avancement:0 },
    { id:"p3", chantierId:"ch2", lot:"Structure",
      tache:"Montage charpente zone B", debut:"2026-03-01", fin:"2026-04-15", avancement:55 },
    { id:"p4", chantierId:"ch3", lot:"Peinture",
      tache:"Finitions apt 4B", debut:"2026-03-10", fin:"2026-03-20", avancement:70 },
    { id:"p5", chantierId:"ch6", lot:"Gros œuvre",
      tache:"Fondations + Élévation", debut:"2026-01-15", fin:"2026-04-30", avancement:35 },
    { id:"p6", chantierId:"ch5", lot:"Maçonnerie",
      tache:"Murs garage", debut:"2026-02-01", fin:"2026-03-30", avancement:60 },
  ],
};

// crypto.randomUUID() est disponible nativement (navigateurs modernes + Node 14.17+)
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2, 9); // fallback navigateurs anciens
export const fmtDate = d => d
  ? new Date(d).toLocaleDateString("fr-FR", {day:"2-digit", month:"short"})
  : "—";
export const fmtMoney = n => new Intl.NumberFormat("fr-FR", {
  style:"currency", currency:"EUR", maximumFractionDigits:0
}).format(n);
export const pct = (a,b) => b ? Math.round(a/b*100) : 0;
export const fmtTime = s =>
  new Date(s).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
export const fmtDayFr = s =>
  new Date(s).toLocaleDateString("fr-FR", {weekday:"short", day:"numeric", month:"short"});

// ─── SHARED COMPONENTS ───
export function FF({label,hint,children}) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{
        display:"block", fontSize:11, fontWeight:600, color:"#64748B",
        marginBottom:3, textTransform:"uppercase", letterSpacing:"0.05em"
      }}>{label}</label>
      {children}
      {hint && (
        <div style={{fontSize:10,color:"#94A3B8",marginTop:4,fontStyle:"italic"}}>
          {hint}
        </div>
      )}
    </div>
  );
}
export const inp = {
  width:"100%", padding:"8px 12px", border:"1.5px solid #E2E8F0",
  // fontSize 16px minimum : en dessous iOS Safari déclenche un auto-zoom
  // quand l'utilisateur focus un input, ce qui laisse la page zoomée
  // (et provoque un scroll horizontal) même après avoir perdu le focus.
  borderRadius:8, fontSize:16, outline:"none",
  fontFamily:"inherit", boxSizing:"border-box"
};
export const sel = {...inp,background:"#fff"};
export const btnP = {
  padding:"10px 18px", background:"#1E3A5F", color:"#fff",
  border:"none", borderRadius:8, fontSize:13,
  fontWeight:600, cursor:"pointer", fontFamily:"inherit"
};
export const btnS = {...btnP,background:"#F1F5F9",color:"#475569"};

export const PBar = ({value, max=100, color="#3B82F6", h=8}) => (
  <ProgressBar value={value} max={max} color={color} height={h} />
);

export function ApiBadge() {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      padding:"2px 7px", borderRadius:5,
      background:"linear-gradient(135deg,#1E3A5F,#3B82F6)",
      color:"#fff", fontSize:8, fontWeight:800, letterSpacing:"0.1em"
    }}>API</span>
  );
}
