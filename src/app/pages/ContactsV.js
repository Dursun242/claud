'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { SB, Icon, I, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { ContactFormModal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import {
  validateSiret, validatePhoneFR, validateEmail,
  validateIban, validateCodePostalFR, validateTvaIntra
} from '../lib/validators'
import { buildCSV, downloadCSV } from '../lib/csv'
import { supabase } from '../supabaseClient'
import { useEntrepriseSearch } from '../hooks/useEntrepriseSearch'
import { oppsByContact } from '../lib/crm'
import { parseNewIntent } from '../lib/navIntent'
import { resizeImageForAI } from '../lib/imageForAI'
import { findDuplicateGroups, duplicateReasons, pairKey } from '../lib/contactDuplicates'
import { mergeContacts } from '../lib/contactsMerge'
import DuplicatesModal from '../components/contacts/DuplicatesModal'
import ConformiteModal from '../components/conformite/ConformiteModal'
import ConformiteSuiviModal from '../components/conformite/ConformiteSuiviModal'
import { useConformite } from '../hooks/useConformite'
import { shareContactCard } from '../lib/shareVCard'
import { isSubject, complianceOf, activeCompanyIds, buildSuivi, trackedReason } from '../lib/conformite'
import SearchField from '../components/SearchField'
import ContactCard from '../components/contacts/ContactCard'
import EntrepriseScoreModal from '../components/contacts/EntrepriseScoreModal'
import { scoreCompanies } from '../lib/entrepriseScore'

// Paires marquées « pas un doublon » (sur cet appareil)
const IGNORED_KEY = 'idm_contacts_not_duplicates'
const readIgnored = () => {
  try { return new Set(JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]')) } catch { return new Set() }
}

const TYPES = ["Artisan","Sous-traitant","Prestataire","Client","Fournisseur","MOA","Architecte","BET"]

// Boutons de l'en-tête et de la barre d'outils, filtres : chrome neutre,
// le bleu de l'app est réservé à « Nouveau contact »
const headBtn = {
  display:"inline-flex",alignItems:"center",gap:8,height:36,padding:"0 14px",borderRadius:10,
  border:"1px solid var(--separator)",background:"#fff",color:"var(--label)",
  fontSize:14,fontWeight:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",
}
const toolBtn = {
  display:"inline-flex",alignItems:"center",gap:8,height:32,padding:"0 10px",borderRadius:8,
  color:"var(--label-secondary)",fontSize:13,fontWeight:500,whiteSpace:"nowrap",
}
const chip = (active) => ({
  display:"inline-flex",alignItems:"center",gap:8,height:32,padding:"0 12px",borderRadius:8,
  border:`1px solid ${active?"var(--accent)":"var(--separator)"}`,
  background:active?"var(--accent)":"#fff",color:active?"#fff":"var(--label)",
  fontSize:13,fontWeight:500,fontFamily:"inherit",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
  transition:"background-color var(--motion-fast) var(--ease-emphasized), color var(--motion-fast) var(--ease-emphasized), border-color var(--motion-fast) var(--ease-emphasized)",
})
const chipCount = (active) => ({
  fontVariantNumeric:"tabular-nums",color:active?"rgba(255,255,255,0.7)":"var(--label-tertiary)",
})

export default function ContactsV({ data, save: _save, m, reload, focusId, focusTs, crm = null, reloadCrm = null, setTab = null, active }) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [tf,setTf]=useState("all");
  // Documents administratifs des entreprises (Kbis, décennale, fiscale, URSSAF)
  const conf = useConformite({ enabled: active !== false });
  const [docsFor, setDocsFor] = useState(null);
  const [suiviOpen, setSuiviOpen] = useState(false);
  const activeIds = useMemo(() => activeCompanyIds(data), [data]);
  // Entreprises sur un chantier en cours dont un document est à revoir
  const docsToReview = useMemo(() => new Set((data.contacts || [])
    .filter(c => trackedReason(c, activeIds, conf.lastRequest)
      && complianceOf(conf.byContact, c.id, conf.today).status !== "ok")
    .map(c => c.id)), [data.contacts, activeIds, conf.lastRequest, conf.byContact, conf.today]);
  // Résumé affiché sur le bandeau « Suivi des documents »
  const suiviStats = useMemo(() => (conf.ready && !conf.missingMigration ? buildSuivi({
    contacts: data.contacts || [], byContact: conf.byContact, lastRequest: conf.lastRequest,
    activeIds, today: conf.today, globalPause: conf.globalPause,
  }).stats : null), [conf.ready, conf.missingMigration, conf.byContact, conf.lastRequest, conf.today, conf.globalPause, data.contacts, activeIds]);
  // Score des entreprises (documents, actions des CR, réunions, avis) : lib/entrepriseScore.js
  const scores = useMemo(() => scoreCompanies({
    contacts: data.contacts || [], tasks: data.tasks || [], compteRendus: data.compteRendus || [],
    ordresService: data.ordresService || [],
    byContact: conf.ready && !conf.missingMigration ? conf.byContact : null,
    legalByContact: conf.ready && !conf.missingMigration ? conf.legalByContact : null,
    today: conf.today,
  }), [data.contacts, data.tasks, data.compteRendus, data.ordresService, conf.ready, conf.missingMigration, conf.byContact, conf.legalByContact, conf.today]);
  // null : fermé · "all" : classement · id : détail d'une entreprise
  const [scoreFor, setScoreFor] = useState(null);
  const [q,setQ]=useState("");
  const [formError, setFormError] = useState("");
  // Recherche entreprise (annuaire de l'État : entreprises + dirigeants) — voir hooks/useEntrepriseSearch.js
  const {
    pSearch, setPSearch,
    pLoading, pResults, pError,
    searchEntreprise,
    importEntrepriseFromSearch,
    importDirigeantFromSearch,
    resetEntrepriseSearch,
    fetchEntreprise,
  } = useEntrepriseSearch({ setForm });
  // États import par photo
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  // Annule l'extraction Claude Vision en cours si l'utilisateur change de
  // page ou lance un nouvel import (évite requête orpheline + fuite setState).
  const extractAbortRef = useRef(null);
  useEffect(() => () => { extractAbortRef.current?.abort() }, []);
  const types = TYPES;

  // Delete avec undo (5s pour annuler)
  const { pendingIds: pendingDeleteIds, scheduleDelete } = useUndoableDelete({
    label: 'Contact',
    onConfirmDelete: async (c) => { await SB.deleteContact(c.id); reload(); },
  });

  // Copy-to-clipboard : un clic sur SIRET/email/tel copie la valeur
  // dans le presse-papier et affiche un toast de confirmation.
  const copyToClipboard = async (value, label, contact) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      addToast(`${label} copié : ${value}`, "success", 2000);
      try {
        SB.log('copy', 'contact', contact?.id || null, `${label} — ${contact?.nom || 'contact'}`, {
          field: label.toLowerCase(),
          preview: String(value).slice(0, 40),
        });
      } catch (_) {}
    } catch {
      addToast("Impossible de copier — clipboard non supporté", "warning");
    }
  };

  // Export CSV de la liste filtrée/triée (ce qui est visible à l'écran)
  const handleExportCSV = () => {
    if (list.length === 0) {
      addToast("Aucun contact à exporter", "warning");
      return;
    }
    const columns = [
      { label: 'Nom',            key: 'nom' },
      { label: 'Société',        key: 'societe' },
      { label: 'Type',           key: 'type' },
      { label: 'Spécialité',     key: 'specialite' },
      { label: 'Fonction',       key: 'fonction' },
      { label: 'Tél. mobile',    key: 'tel' },
      { label: 'Tél. fixe',      key: 'tel_fixe' },
      { label: 'Email administratif', key: 'email' },
      { label: 'Email travaux',  key: 'email_travaux' },
      { label: 'Adresse',        key: 'adresse' },
      { label: 'Code postal',    key: 'code_postal' },
      { label: 'Ville',          key: 'ville' },
      { label: 'SIRET',          key: 'siret' },
      { label: 'TVA intra.',     key: 'tva_intra' },
      { label: 'Site web',       key: 'site_web' },
      { label: 'IBAN',           key: 'iban' },
      { label: 'Qualifications', key: 'qualifications' },
      { label: 'Note',           get: (c) => c.note ? `${c.note}/5` : '' },
      { label: 'Score',          get: (c) => scores.get(c.id)?.score ?? '' },
      { label: 'Actif',          get: (c) => c.actif === false ? 'Non' : 'Oui' },
    ];
    const csv = buildCSV(list, columns);
    const today = new Date().toISOString().split('T')[0];
    downloadCSV(`contacts_${today}.csv`, csv);
    addToast(`${list.length} contact${list.length > 1 ? 's' : ''} exporté${list.length > 1 ? 's' : ''}`, "success");
    try {
      SB.log('export_csv', 'contact', null, `Export annuaire — ${list.length} contacts`, { count: list.length });
    } catch (_) {}
  };
  // Affaires CRM par contact (badge sur la carte + lien vers le pipeline)
  const crmByContact = useMemo(() => oppsByContact(crm?.opportunites || []), [crm?.opportunites]);

  // ─── Doublons ───
  const [dupOpen, setDupOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [ignored, setIgnored] = useState(() => new Set());
  useEffect(() => { setIgnored(readIgnored()); }, []);
  const dupGroups = useMemo(
    () => findDuplicateGroups((data.contacts || []).filter(c => !pendingDeleteIds.has(c.id)), ignored),
    [data.contacts, ignored, pendingDeleteIds]
  );
  // Ce qui est rattaché à un contact (affaires, chantiers, OS)
  const usage = (c) => ({
    affaires: crmByContact.get(c.id)?.n || 0,
    chantiers: (data.contactChantiers || []).filter(l => l.contact_id === c.id).length
      + (data.chantiers || []).filter(ch => ch.client === c.nom).length,
    os: (data.ordresService || []).filter(o => o.artisan_nom === c.nom).length,
  });
  const ignoreGroup = (g) => {
    const next = new Set(ignored);
    for (let i = 0; i < g.ids.length; i++) for (let j = i + 1; j < g.ids.length; j++) next.add(pairKey(g.ids[i], g.ids[j]));
    setIgnored(next);
    try { localStorage.setItem(IGNORED_KEY, JSON.stringify([...next])); } catch { /* navigation privée */ }
    addToast("Contacts marqués « pas un doublon »", "info");
  };
  const handleMerge = async ({ keep, drops, fields }) => {
    setMerging(true);
    try {
      const { moved } = await mergeContacts({ keep, drops, fields });
      await reload();
      reloadCrm?.();
      const details = [
        moved.affaires && `${moved.affaires} affaire${moved.affaires > 1 ? 's' : ''}`,
        moved.chantiers && `${moved.chantiers} chantier${moved.chantiers > 1 ? 's' : ''}`,
        moved.os && `${moved.os} OS`,
      ].filter(Boolean).join(', ');
      addToast(`Contacts fusionnés en « ${fields.nom} »${details ? ` — repris : ${details}` : ''}`, "success");
      return true;
    } catch (err) {
      addToast(err?.message || "Fusion impossible", "error");
      return false;
    } finally {
      setMerging(false);
    }
  };

  const list = useMemo(() => {
    const search = q.toLowerCase();
    return (data.contacts || []).filter(c => {
      if (pendingDeleteIds.has(c.id)) return false;
      if (tf === "__docs") { if (!docsToReview.has(c.id)) return false; }
      else if (tf !== "all" && c.type !== tf) return false;
      if (!q) return true;
      return (
        (c.nom||"").toLowerCase().includes(search) ||
        (c.specialite||"").toLowerCase().includes(search) ||
        (c.societe||"").toLowerCase().includes(search) ||
        (c.ville||"").toLowerCase().includes(search) ||
        (c.email||"").toLowerCase().includes(search) ||
        (c.email_travaux||"").toLowerCase().includes(search) ||
        (c.siret||"").includes(search)
      );
    });
  }, [data.contacts, q, tf, pendingDeleteIds, docsToReview]);

  const emptyForm = {
    nom:"",type:"Artisan",specialite:"",societe:"",fonction:"",
    tel:"",tel_fixe:"",email:"",adresse:"",code_postal:"",ville:"",
    siret:"",tva_intra:"",assurance_decennale:"",assurance_validite:"",
    iban:"",qualifications:"",site_web:"",note:0,actif:true,notes:""
  };

  const openNew=()=>{
    setForm(emptyForm);resetEntrepriseSearch();setFormError("");setModal("new");
  };
  const openEdit=(c)=>{
    setForm({...c});resetEntrepriseSearch();setFormError("");setModal("edit");
  };
  const closeModal=()=>{setModal(null);setFormError("");};

  // Raccourci clavier « n » pour créer un contact (sauf si on tape ou modale ouverte)
  const openNewRef = useRef(null);
  useEffect(() => { openNewRef.current = openNew; });
  useEffect(() => {
    const handler = (e) => {
      // Onglet caché (resté monté) : on ignore
      if (active === false) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (modal) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, active]);

  // Focus depuis la recherche globale : au lieu d'ouvrir une modale,
  // on pré-remplit la recherche locale avec le nom du contact et on
  // reset le filtre de type. Résultat : la liste se filtre pour
  // afficher uniquement ce contact (plus ceux qui ont un nom similaire).
  // L'utilisateur voit la "pastille" du contact en contexte et peut
  // cliquer le crayon pour éditer s'il le souhaite.
  useEffect(() => {
    if (!focusId) return;
    if (parseNewIntent(focusId)) { openNew(); return; }
    if (String(focusId).startsWith("docs:")) { setDocsFor(String(focusId).slice(5)); return; }
    const contact = (data.contacts || []).find(c => c.id === focusId);
    if (contact?.nom) {
      setQ(contact.nom);
      setTf("all");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs]);
  const handleSave = async () => {
    setFormError("");
    if (!form.nom || !form.nom.trim()) { setFormError("Le nom est requis."); return; }

    // Validation STRICTE : bloque la sauvegarde si le format est clairement
    // cassé (email, téléphone, code postal — des formats simples à corriger).
    const blockingChecks = [
      ['Email administratif', validateEmail(form.email)],
      ['Email travaux', validateEmail(form.email_travaux)],
      ['Téléphone mobile', validatePhoneFR(form.tel)],
      ['Téléphone fixe', validatePhoneFR(form.tel_fixe)],
      ['Code postal', validateCodePostalFR(form.code_postal)],
    ];
    for (const [label, result] of blockingChecks) {
      if (!result.valid) { setFormError(`${label} : ${result.message}`); return; }
    }

    // Validation SOFT : les champs sensibles et souvent imparfaits
    // (SIRET peut avoir une typo mineure, IBAN copié-collé partiel, TVA
    // format international variable). On N'EMPÊCHE PAS la sauvegarde,
    // juste un toast d'avertissement pour que l'utilisateur corrige
    // éventuellement plus tard.
    const warnings = [];
    const siretCheck = validateSiret(form.siret);
    if (!siretCheck.valid) warnings.push(`SIRET ${siretCheck.message}`);
    const ibanCheck = validateIban(form.iban);
    if (!ibanCheck.valid) warnings.push(`IBAN ${ibanCheck.message}`);
    const tvaCheck = validateTvaIntra(form.tva_intra);
    if (!tvaCheck.valid) warnings.push(`TVA ${tvaCheck.message}`);

    // Nouveau contact qui ressemble à un contact existant : on prévient
    if (modal === "new") {
      const twin = (data.contacts || []).map(c => ({ c, r: duplicateReasons(form, c).filter(x => x !== 'même SIRET') })).find(x => x.r.length);
      if (twin) {
        const ok = await confirm({
          title: "Ce contact existe peut-être déjà",
          message: `« ${twin.c.nom} »${twin.c.societe ? ` (${twin.c.societe})` : ""} a ${twin.r.join(" et ")}. Créer quand même un nouveau contact ?`,
          confirmLabel: "Créer quand même",
          cancelLabel: "Revenir à la fiche",
        });
        if (!ok) return;
      }
    }
    try {
      await SB.upsertContact(form);
      setModal(null);
      reload();
      if (warnings.length > 0) {
        addToast("Contact enregistré · " + warnings.join(" · ") + " à vérifier", "warning", 5000);
      } else {
        addToast(modal === "edit" ? "Contact mis à jour" : "Contact créé", "success");
      }
    } catch (err) {
      setFormError(err?.message || "Erreur lors de l'enregistrement.");
    }
  };
  // Enregistrer le contact dans le téléphone : fiche .vcf préparée ici et
  // confiée au menu de partage (iPhone : « Contacts » → « Créer un contact »)
  const saveToPhone = (c) => {
    try { SB.log('export_vcard', 'contact', c.id, `Contact enregistré dans le téléphone — ${c.nom}`) } catch (_) {}
    shareContactCard(c).then((r) => {
      if (r === 'downloaded') addToast("Fiche contact téléchargée (.vcf) : ouvre-la pour l'ajouter à tes contacts", "info");
    }).catch(() => addToast("Impossible de préparer la fiche contact", "error"));
  };
  const handleDelete = async (c) => {
    const ok = await confirm({
      title: `Supprimer ${c.nom} ?`,
      message: "Tu pourras annuler cette suppression pendant 5 secondes." +
        " Les OS liés à ce contact ne seront pas supprimés mais perdront l'association.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    scheduleDelete(c, { itemLabel: `Contact ${c.nom}` });
  };

  // ── Recherche entreprise : mapping + recherche déportés dans hooks/useEntrepriseSearch.js
  // Expose pSearch/pLoading/pResults/pError + searchEntreprise + les deux
  // importXxxFromSearch + fetchEntreprise (réutilisé par enrichFromSiret
  // plus bas pour enrichir un contact depuis un SIRET extrait par photo).

  // ─── Import par photo (Claude Vision) : image préparée par lib/imageForAI ───

  // Si un SIRET a été extrait, on enrichit automatiquement via l'annuaire des entreprises
  // pour fiabiliser les données officielles (adresse, TVA intra, dénomination).
  const enrichFromSiret = async (siret) => {
    try {
      const clean = (siret || "").replace(/\s/g, "");
      if (!/^\d{14}$/.test(clean)) return null;
      const res = await fetchEntreprise(`siret=${clean}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleImportPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset pour permettre de re-sélectionner la même photo
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImportError("Ce fichier n'est pas une image.");
      return;
    }

    setImporting(true);
    setImportError("");
    try {
      SB.log('import_photo', 'contact', null, `Import contact par photo — ${file.name}`, {
        file_name: file.name,
        file_size: file.size,
      });
    } catch (_) {}

    try {
      // 1. Redimensionne + convertit en base64
      const { base64, mediaType } = await resizeImageForAI(file);

      // 2. Récupère le JWT Supabase pour authentifier la requête
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setImportError("Session expirée, reconnectez-vous.");
        return;
      }

      // 3. Appelle la route serveur qui parle à Claude Vision
      extractAbortRef.current?.abort();
      extractAbortRef.current = new AbortController();
      let res;
      try {
        res = await fetch('/api/extract-contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ imageBase64: base64, mediaType }),
          signal: extractAbortRef.current.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') return;
        throw err;
      }
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error || "Extraction échouée");
        return;
      }

      const extracted = json.data || {};
      if (!extracted || Object.keys(extracted).length === 0) {
        setImportError(
          "Aucune information de contact n'a pu être détectée sur cette image. Essayez une photo plus nette."
        );
        return;
      }

      // 4. Pré-remplit le formulaire en fusionnant avec les defaults
      const prefilled = { ...emptyForm, ...extracted };

      // 5. Bonus : si un SIRET a été détecté, enrichit via l'annuaire des entreprises
      if (extracted.siret) {
        const ent = await enrichFromSiret(extracted.siret);
        if (ent) {
          const siege = ent.siege || {};
          // On garde les champs déjà remplis par Claude, on ajoute ce qui manque
          if (!prefilled.societe) prefilled.societe = ent.denomination || prefilled.societe;
          if (!prefilled.tva_intra) prefilled.tva_intra = ent.num_tva_intracommunautaire || prefilled.tva_intra;
          if (!prefilled.adresse) prefilled.adresse = siege.adresse_ligne_1 || siege.adresse || prefilled.adresse;
          if (!prefilled.code_postal) prefilled.code_postal = siege.code_postal || prefilled.code_postal;
          if (!prefilled.ville) prefilled.ville = siege.ville || prefilled.ville;
          if (!prefilled.site_web) prefilled.site_web = ent.site_internet || prefilled.site_web;
          if (!prefilled.specialite) prefilled.specialite = ent.libelle_activite_principale || prefilled.specialite;
        }
      }

      // 6. Ouvre la modale pré-remplie pour relecture + validation
      setForm(prefilled);
      resetEntrepriseSearch();
      setModal("new");
    } catch (err) {
      setImportError("Erreur : " + (err?.message || String(err)));
    } finally {
      setImporting(false);
    }
  };

  // Stats par type
  const stats = {};
  types.forEach(t => { const c = data.contacts.filter(x=>x.type===t).length; if(c>0) stats[t]=c; });

  return (<div>
    {/* Input file caché. Pas de `capture` pour que iOS propose les 3 options :
        "Prendre une photo", "Photothèque", "Choisir un fichier" — permet
        d'importer aussi bien une photo fraîche qu'une capture d'écran
        existante (iOS Contacts, SMS, WhatsApp, etc.). */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      onChange={handleImportPhoto}
      style={{display:"none"}}
    />

    {/* En-tête : titre, une action principale, une secondaire */}
    <div style={{
      display:"flex",justifyContent:"space-between",alignItems:"flex-end",
      marginBottom:16,flexWrap:"wrap",gap:12
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?28:32,fontWeight:600,letterSpacing:"-0.01em",lineHeight:1.15,color:"var(--label)"}}>Contacts</h1>
        <p style={{margin:"4px 0 0",fontSize:13,color:"var(--label-secondary)",fontVariantNumeric:"tabular-nums"}}>
          {data.contacts.length} contact{data.contacts.length>1?"s":""}
          {(q || tf !== "all") && <> · {list.length} affiché{list.length>1?"s":""}</>}
        </p>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="u-press"
          style={{...headBtn, cursor:importing?"wait":"pointer", opacity:importing?0.7:1}}
          title={
            "Importer un contact depuis une photo ou une capture d'écran" +
            " (carte de visite, signature email, iOS Contacts, SMS, WhatsApp…)"
          }
        >
          {importing ? (
            <>
              <span aria-hidden="true" style={{
                display:"inline-block",width:12,height:12,
                border:"2px solid var(--separator-opaque)",borderTopColor:"var(--label-secondary)",
                borderRadius:"50%",animation:"spin 0.8s linear infinite"
              }}/>
              Lecture…
            </>
          ) : (
            <><Icon d={I.camera} size={16} stroke={1.5} color="var(--label-secondary)"/>{m ? "Photo" : "Importer une photo"}</>
          )}
        </button>
        <button onClick={openNew} className="u-btn"
          title="Nouveau contact (raccourci : n)"
          style={{...btnP,minHeight:m?44:36,height:m?44:36,padding:"0 16px",fontSize:14,fontWeight:500,display:"inline-flex",alignItems:"center",gap:8}}>
          <Icon d={I.plus} size={16} stroke={2} color="#fff"/>Nouveau contact
        </button>
      </div>
    </div>

    {importError && (
      <div role="alert" style={{
        background:"var(--red-tint)",
        border:"1px solid var(--red-line)",
        borderRadius:8,
        padding:"8px 12px",
        marginBottom:12,
        fontSize:13,
        color:"var(--red-text)",
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        gap:8,
      }}>
        <span>{importError}</span>
        <button onClick={()=>setImportError("")} aria-label="Fermer le message" className="u-icon-btn"
          style={{width:24,height:24,borderRadius:6,color:"var(--red-text)"}}>
          <Icon d={I.x} size={14} stroke={1.5}/>
        </button>
      </div>
    )}

    {/* Recherche + outils de la liste */}
    <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{flex:"1 1 240px",minWidth:0}}>
        <SearchField inputRef={searchInputRef} value={q} onChange={e=>setQ(e.target.value)} m={m} width="100%"
          label="Rechercher un contact" placeholder={m?"Rechercher":"Rechercher (/)"}/>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {scores.size > 0 && (
          <button onClick={() => setScoreFor("all")} className="u-icon-btn" style={toolBtn}
            title="Classement des entreprises par score (documents, actions de chantier, réunions, avis)">
            <Icon d={I.ranking} size={16} stroke={1.5} color="var(--label-tertiary)"/>Classement
          </button>
        )}
        {dupGroups.length > 0 && (
          <button onClick={() => setDupOpen(true)} className="u-icon-btn" style={toolBtn}
            title="Contacts qui semblent en double : vérifier et fusionner">
            <span aria-hidden="true" style={{width:6,height:6,borderRadius:3,background:"var(--orange)"}}/>
            Doublons <span style={{color:"var(--label-tertiary)",fontVariantNumeric:"tabular-nums"}}>{dupGroups.length}</span>
          </button>
        )}
        <button onClick={handleExportCSV} className="u-icon-btn" disabled={list.length === 0}
          title="Exporter la liste filtrée au format CSV (Excel)"
          style={{...toolBtn, cursor: list.length === 0 ? "not-allowed" : "pointer", opacity: list.length === 0 ? 0.5 : 1}}>
          <Icon d={I.sheet} size={16} stroke={1.5} color="var(--label-tertiary)"/>CSV
        </button>
      </div>
    </div>

    {/* Suivi des documents des entreprises : une ligne neutre */}
    {conf.ready && (
      <button onClick={()=>setSuiviOpen(true)} className="u-press"
        title="Avancement des documents des entreprises et aperçu des relances automatiques"
        style={{
          display:"flex",alignItems:"center",gap:12,width:"100%",
          background:"#fff",border:"1px solid var(--separator)",borderRadius:12,padding:m?"12px":"12px 16px",
          marginBottom:16,fontFamily:"inherit",textAlign:"left",color:"var(--label)",
        }}>
        <Icon d={I.reports} size={18} stroke={1.5} color="var(--label-tertiary)"/>
        <span style={{flex:1,minWidth:0}}>
          <span style={{display:"block",fontSize:14,fontWeight:500}}>Suivi des documents des entreprises</span>
          <span style={{display:"block",fontSize:13,color:"var(--label-secondary)",marginTop:2,fontVariantNumeric:"tabular-nums"}}>
            {conf.missingMigration ? "À activer : migrations 036 à 038 dans Supabase"
              : suiviStats ? [
                `${suiviStats.aJour}/${suiviStats.actives} entreprise${suiviStats.actives>1?"s":""} suivie${suiviStats.actives>1?"s":""} à jour`,
                `${suiviStats.docsRecus}/${suiviStats.docsTotal} documents`,
                conf.globalPause ? "relances suspendues" : `${suiviStats.prochainPassage} relance${suiviStats.prochainPassage>1?"s":""} au prochain passage`,
              ].join(" · ") : ""}
          </span>
        </span>
        <Icon d={I.chevronRight} size={16} stroke={1.5} color="var(--label-tertiary)"/>
      </button>
    )}

    {/* Filtres par type */}
    <div role="group" aria-label="Filtrer par type" style={{
      display:"flex",gap:8,marginBottom:16,flexWrap:m?"nowrap":"wrap",
      overflowX:m?"auto":"visible",paddingBottom:m?4:0
    }}>
      <button onClick={()=>setTf("all")} aria-pressed={tf==="all"} style={chip(tf==="all")}>
        Tous <span style={chipCount(tf==="all")}>{data.contacts.length}</span>
      </button>
      {Object.entries(stats).map(([type,count])=>(
        <button key={type} onClick={()=>setTf(type)} aria-pressed={tf===type} style={chip(tf===type)}>
          {type} <span style={chipCount(tf===type)}>{count}</span>
        </button>
      ))}
      {docsToReview.size > 0 && (
        <button onClick={()=>setTf(tf==="__docs"?"all":"__docs")} aria-pressed={tf==="__docs"}
          title="Entreprises suivies (chantier en cours ou demande envoyée) dont un document est manquant, erroné, expiré ou expire bientôt"
          style={chip(tf==="__docs")}>
          <span aria-hidden="true" style={{width:6,height:6,borderRadius:3,background:"var(--red)"}}/>
          Documents à revoir <span style={chipCount(tf==="__docs")}>{docsToReview.size}</span>
        </button>
      )}
    </div>

    {/* Fiches */}
    {list.length === 0 ? (
      <div style={{
        background:"#fff",border:"1px solid var(--separator)",borderRadius:12,padding:"40px 24px",
        textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:8
      }}>
        <Icon d={I.contacts} size={32} stroke={1.5} color="var(--label-tertiary)"/>
        {data.contacts.length === 0 ? (
          <>
            <div style={{fontSize:15,fontWeight:600,color:"var(--label)"}}>Aucun contact pour l&apos;instant</div>
            <div style={{fontSize:13,color:"var(--label-secondary)",marginBottom:8}}>
              Crée ton premier contact ou importe-le depuis une photo de carte de visite
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={openNew} className="u-btn" style={{...btnP,fontSize:14,fontWeight:500}}>Nouveau contact</button>
              <button onClick={()=>fileInputRef.current?.click()} className="u-press" style={headBtn}>Importer une photo</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:15,fontWeight:600,color:"var(--label)"}}>Aucun résultat</div>
            <div style={{fontSize:13,color:"var(--label-secondary)",marginBottom:8}}>
              Élargis la recherche ou change de filtre
            </div>
            <button onClick={()=>{setQ("");setTf("all");}} className="u-press" style={headBtn}>Réinitialiser les filtres</button>
          </>
        )}
      </div>
    ) : (
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"repeat(auto-fill, minmax(340px, 1fr))",gap:12}}>
      {list.map(c=>(
        <ContactCard key={c.id} c={c} m={m}
          score={scores.get(c.id)}
          showDocs={(isSubject(c) || conf.lastRequest.has(c.id)) && conf.ready && !conf.missingMigration}
          legal={conf.legalByContact?.get(c.id)}
          compliance={complianceOf(conf.byContact, c.id, conf.today)}
          deals={crmByContact.get(c.id)}
          onDeals={setTab ? ()=>setTab("crm", `contact:${c.id}`) : null}
          onNewDeal={setTab ? ()=>setTab("crm", `new:${c.id}`) : null}
          onScore={()=>setScoreFor(c.id)}
          onDocs={()=>setDocsFor(c.id)}
          onEdit={()=>openEdit(c)}
          onDelete={()=>handleDelete(c)}
          onSaveToPhone={()=>saveToPhone(c)}
          onCopy={(value,label)=>copyToClipboard(value,label,c)}/>
      ))}
    </div>
    )}

    <ConformiteSuiviModal open={suiviOpen} onClose={() => setSuiviOpen(false)}
      contacts={data.contacts || []} conformite={conf} activeIds={activeIds}
      onOpenContact={(id) => { setSuiviOpen(false); setDocsFor(id); }}
      onChanged={() => { conf.reload(); reload?.(); }} />

    <ConformiteModal open={!!docsFor} onClose={() => setDocsFor(null)}
      contact={(data.contacts || []).find(c => c.id === docsFor) || null}
      compliance={complianceOf(conf.byContact, docsFor, conf.today)}
      lastRequest={conf.lastRequest.get(docsFor) || null}
      missingMigration={conf.missingMigration}
      legal={conf.legalByContact?.get(docsFor) || null}
      onChanged={() => { conf.reload(); reload?.(); }} />

    <EntrepriseScoreModal open={!!scoreFor} onClose={() => setScoreFor(null)}
      contacts={data.contacts || []} scores={scores} focusId={scoreFor === "all" ? null : scoreFor}
      onOpenDocs={conf.ready && !conf.missingMigration ? (id) => { setScoreFor(null); setDocsFor(id); } : null}
      onEdit={(c) => { setScoreFor(null); openEdit(c); }} />

    <DuplicatesModal open={dupOpen} groups={dupGroups} usage={usage} merging={merging}
      onClose={() => setDupOpen(false)} onIgnore={ignoreGroup} onMerge={handleMerge} />

    {/* MODAL — Formulaire contact (délégué à ContactFormModal) */}
    <ContactFormModal
      modal={modal}
      onClose={closeModal}
      form={form}
      setForm={setForm}
      formError={formError}
      setFormError={setFormError}
      handleSave={handleSave}
      types={types}
      m={m}
      importing={importing}
      importError={importError}
      onImportClick={() => fileInputRef.current?.click()}
      pSearch={pSearch}
      setPSearch={setPSearch}
      pLoading={pLoading}
      pResults={pResults}
      pError={pError}
      searchEntreprise={searchEntreprise}
      importEntrepriseFromSearch={importEntrepriseFromSearch}
      importDirigeantFromSearch={importDirigeantFromSearch}
      FF={FF}
      inp={inp}
      sel={sel}
      btnP={btnP}
      btnS={btnS}
    />
  </div>);
}

