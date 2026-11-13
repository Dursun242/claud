'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { SB, Icon, I, inp, btnP, btnS } from '../dashboards/shared'
import { OSSignatureModal } from '../components'
import OsCard from '../components/os/OsCard'
import OsEditor from '../components/os/OsEditor'
import OsStatusPills from '../components/os/OsStatusPills'
import { OS_STATUSES } from '../components/os/osConstants'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { buildCSV, downloadCSV, formatDateFR, formatMoneyFR } from '../lib/csv'
import { supabase } from '../supabaseClient'
import { useImportDevis } from '../hooks/useImportDevis'
import { useSignaturesSync } from '../hooks/useSignaturesSync'
import { parseNewIntent } from '../lib/navIntent'
import { nextOsNumero } from '../lib/osNumero'
import { newOsDraft, draftFromOs, deleteBlockReason, validateOs } from '../lib/osRules'
import SearchField, { toolbarSelect } from '../components/SearchField'

// Indicateur d'attente dans un bouton de la barre d'outils
const HeaderSpinner = () => (
  <span aria-hidden="true" style={{
    display:"inline-block",width:12,height:12,borderRadius:"50%",
    border:"2px solid var(--separator-opaque)",borderTopColor:"var(--accent-text)",animation:"spin .8s linear infinite",
  }}/>
)

export default function OrdresServiceV({data,m,reload,focusId,focusTs,readOnly,active}) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  // Formulaire ouvert : { key, os } (modification) ou { key, draft } (création).
  // La clé remonte OsEditor à chaque ouverture.
  const [editor,setEditor]=useState(null);
  const editorSeq = useRef(0);
  const openEditor = useCallback((e) => { editorSeq.current += 1; setEditor({ ...e, key: editorSeq.current }); }, []);
  const [searchOS,setSearchOS]=useState("");
  const [statusFilter,setStatusFilter]=useState("all"); // "all" | un des OS_STATUSES
  const [sortBy,setSortBy]=useState("date_desc");       // date_desc | date_asc | amount_desc | amount_asc
  const [signModal,setSignModal]=useState(null);
  const [signSigners,setSignSigners]=useState({
    moe:{name:'',email:''},
    moa:{name:'',email:''},
    entreprise:{name:'',email:''}
  });
  const [signSending,setSignSending]=useState(false);
  const [signError,setSignError]=useState("");
  const searchInputRef = useRef(null);

  // Import devis par photo (Claude Vision) — voir hooks/useImportDevis.js
  const {
    importing,
    importError,
    setImportError,
    devisInputRef,
    handleImportDevis,
  } = useImportDevis({
    chantiers: data.chantiers,
    contacts: data.contacts,
    nextNum: () => nextNum(),
    onReady: ({ form: f, prestations: p }) => openEditor({ draft: { form: f, prestations: p } }),
  });
  // Sync signatures Odoo → Supabase, partagé avec ProjectsV via le hook
  // useSignaturesSync (throttle 2 min + coalescence in-flight).
  const { sync: syncSignatures } = useSignaturesSync();
  const [syncingSigs, setSyncingSigs] = useState(false);

  const handleSyncSignatures = useCallback(async (silent = false) => {
    if (syncingSigs) return;
    setSyncingSigs(true);
    try {
      // force=true en mode manuel pour bypasser le throttle (l'utilisateur
      // a cliqué le bouton → il veut un vrai refresh).
      const updated = await syncSignatures({ force: !silent, silent });
      if (updated == null) {
        if (!silent) addToast('Signatures à jour — aucun changement', 'info');
        return;
      }
      if (updated > 0) {
        if (!silent) {
          addToast(
            `${updated} signature${updated > 1 ? 's' : ''} mise${updated > 1 ? 's' : ''} à jour`,
            'success'
          );
        }
        reload?.();
      } else if (!silent) {
        addToast('Signatures à jour — aucun changement', 'info');
      }
    } finally {
      setSyncingSigs(false);
    }
  }, [syncingSigs, syncSignatures, addToast, reload]);

  // Sync auto silencieux au mount (respecte le throttle 2 min du hook).
  useEffect(() => {
    syncSignatures({ silent: true }).then(updated => {
      if (updated > 0) reload?.();
    });
  }, [syncSignatures, reload]);

  // Delete avec undo (5s pour annuler)
  const { pendingIds: pendingDeleteIds, scheduleDelete } = useUndoableDelete({
    label: 'OS',
    onConfirmDelete: async (os) => { await SB.deleteOS(os.id); reload(); },
  });

  // Loading state pour la génération de PDF / Excel
  // Stocke l'id+type du document en cours de génération pour afficher
  // un spinner uniquement sur le bon bouton.
  const [generating, setGenerating] = useState(null); // { id, kind: 'pdf'|'xls' } | null

  // Export CSV de la liste filtrée/triée (ce qui est visible à l'écran)
  const handleExportCSV = () => {
    if (filteredSortedOS.length === 0) {
      addToast("Aucun OS à exporter", "warning");
      return;
    }
    const columns = [
      { label: 'Numéro',        key: 'numero' },
      { label: 'Chantier',      get: (os) => chantierById.get(os.chantier_id)?.nom || '' },
      { label: 'Client',        key: 'client_nom' },
      { label: 'Destinataire',  key: 'artisan_nom' },
      { label: 'Spécialité',    key: 'artisan_specialite' },
      { label: 'Statut',        key: 'statut' },
      { label: 'Émis le',       get: (os) => formatDateFR(os.date_emission) },
      { label: 'Intervention',  get: (os) => formatDateFR(os.date_intervention) },
      { label: 'Fin prévue',    get: (os) => formatDateFR(os.date_fin_prevue) },
      { label: 'Montant HT',    get: (os) => formatMoneyFR(os.montant_ht) },
      { label: 'TVA',           get: (os) => formatMoneyFR(os.montant_tva) },
      { label: 'Montant TTC',   get: (os) => formatMoneyFR(os.montant_ttc) },
      { label: 'Nb prestations',get: (os) => (os.prestations || []).length },
    ];
    const csv = buildCSV(filteredSortedOS, columns);
    const today = new Date().toISOString().split('T')[0];
    downloadCSV(`ordres-service_${today}.csv`, csv);
    addToast(`${filteredSortedOS.length} OS exporté${filteredSortedOS.length > 1 ? 's' : ''}`, "success");
  };

  const nextNum = useCallback(() => nextOsNumero(data.ordresService), [data.ordresService]);

  // chId optionnel (string) : pré-sélectionne le chantier. Sans chantier
  // donné, le choix est laissé à la personne (pas de chantier par défaut).
  // Ignoré si openNew est branché directement sur un onClick (reçoit l'event).
  const openNew = (chId) => {
    const ch = typeof chId === 'string' ? data.chantiers.find(c => c.id === chId) : null;
    openEditor({ draft: { form: newOsDraft({ chantier: ch || (data.chantiers.length === 1 ? data.chantiers[0] : null), allOs: data.ordresService }) } });
  };

  const openEdit = useCallback((os) => openEditor({ os }), [openEditor]);

  const closeModal = useCallback(() => setEditor(null), []);

  const handleSaved = useCallback(() => { setEditor(null); reload(); }, [reload]);

  // Focus depuis la recherche globale : pré-remplit la recherche locale
  // avec le numéro de l'OS pour filtrer la liste et afficher la carte
  // correspondante. L'utilisateur voit l'OS en contexte et peut cliquer
  // "Modifier" s'il veut l'éditer.
  useEffect(() => {
    if (!focusId) return;
    const intent = parseNewIntent(focusId);
    if (intent) { if (!readOnly) openNew(intent.chantierId); return; }
    const os = (data.ordresService || []).find(o => o.id === focusId);
    if (os?.numero) setSearchOS(os.numero);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs]);

  // Raccourcis locaux : « n » crée un nouveau OS. Désactivé si on est en
  // train de taper ou si une modale est déjà ouverte.
  const openNewRef = useRef(null);
  useEffect(() => { openNewRef.current = openNew; });
  useEffect(() => {
    const handler = (e) => {
      // Onglet caché (resté monté) ou client en lecture seule : on ignore
      if (readOnly || active === false) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (editor || signModal) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, signModal, readOnly, active]);

  // Enrichissement au moment de la génération PDF/Excel :
  // l'OS en base ne stocke que artisan_nom (qui peut être la société OU
  // l'interlocuteur selon qui a créé l'OS). Pour afficher la société en
  // gros dans le PDF avec l'interlocuteur en-dessous, on cherche le
  // contact correspondant dans l'annuaire et on y récupère la société.
  // Match par SIRET (fiable) puis par nom exact.
  const enrichOsForPdf = useCallback((os) => {
    const ch = (data.chantiers || []).find(c => c.id === os.chantier_id);
    const enriched = {
      ...os,
      chantier: ch?.nom || "",
      adresse_chantier: ch?.adresse || "",
    };
    const contacts = data.contacts || [];
    const norm = (s) => String(s || '').toLowerCase().trim();
    // 1. match SIRET
    let contact = null;
    if (os.artisan_siret) {
      const clean = String(os.artisan_siret).replace(/\s/g, '');
      contact = contacts.find(c => String(c.siret || '').replace(/\s/g, '') === clean);
    }
    // 2. fallback match nom exact
    if (!contact && os.artisan_nom) {
      contact = contacts.find(c => norm(c.nom) === norm(os.artisan_nom));
    }
    if (contact?.societe) {
      enriched.artisan_societe = contact.societe;
    }
    return enriched;
  }, [data.chantiers, data.contacts]);

  const handlePdf = useCallback(async (os) => {
    if (generating) return;
    setGenerating({ id: os.id, kind: 'pdf' });
    try {
      const { generateOSPdf } = await import('../generators');
      await generateOSPdf(enrichOsForPdf(os));
      addToast(`PDF ${os.numero} généré`, 'success');
    } catch (err) {
      addToast('Erreur PDF : ' + (err?.message || 'génération impossible'), 'error');
    } finally {
      setGenerating(null);
    }
  }, [generating, enrichOsForPdf, addToast]);

  const handleExcel = useCallback(async (os) => {
    if (generating) return;
    setGenerating({ id: os.id, kind: 'xls' });
    try {
      const { generateOSExcel } = await import('../generators');
      await generateOSExcel(enrichOsForPdf(os));
      addToast(`Excel ${os.numero} généré`, 'success');
    } catch (err) {
      addToast('Erreur Excel : ' + (err?.message || 'génération impossible'), 'error');
    } finally {
      setGenerating(null);
    }
  }, [generating, enrichOsForPdf, addToast]);

  const handleDelete = useCallback(async (os) => {
    const blocked = deleteBlockReason(os);
    if (blocked) { addToast(blocked, "warning"); return; }
    const ok = await confirm({
      title: `Supprimer l'OS ${os.numero} ?`,
      message: "Tu pourras annuler cette suppression pendant 5 secondes.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    scheduleDelete(os, { itemLabel: `OS ${os.numero}` });
  }, [confirm, scheduleDelete, addToast]);

  // Dupliquer = nouvel OS repris de celui-ci (avenant, même entreprise) :
  // le formulaire s'ouvre pour relire les lignes et les dates avant
  // d'enregistrer, rien n'est créé en silence.
  const handleDuplicate = useCallback((os) => {
    const ch = (data.chantiers || []).find(c => c.id === os.chantier_id) || null;
    const d = draftFromOs(os, { chantier: ch, allOs: data.ordresService });
    d.form.observations = d.form.observations || `Suite à l'OS ${os.numero}.`;
    openEditor({ draft: d });
  }, [data.chantiers, data.ordresService, openEditor]);

  const openSignModal = useCallback((os) => {
    // Un OS incomplet (sans ligne, sans montant…) ne part pas en signature
    const err = validateOs(os, os.prestations || [], { allOs: data.ordresService });
    if (err) { addToast(`OS ${os.numero} incomplet : ${err} Ouvrez-le pour le compléter.`, "warning"); return; }
    setSignError("");
    const ch = (data.chantiers || []).find(c => c.id === os.chantier_id);
    // Entreprise (artisan)
    const artisanContact = (data.contacts || []).find(c =>
      (c.nom||"").toLowerCase().trim() === (os.artisan_nom||"").toLowerCase().trim()
    );
    const entrepriseEmail = os.artisan_email || artisanContact?.email || "";
    // MOA (client/maître d'ouvrage)
    const moaContact = (data.contacts || []).find(c =>
      (c.nom||"").toLowerCase().trim() === (os.client_nom||"").toLowerCase().trim()
    );
    const moaEmail = moaContact?.email || "";
    setSignSigners({
      moe:        { name: "Id Maîtrise", email: "contact@id-maitrise.com" },
      moa:        { name: os.client_nom || "", email: moaEmail },
      entreprise: { name: os.artisan_nom || "", email: entrepriseEmail },
    });
    setSignModal({ ...os, ch });
  }, [data.chantiers, data.contacts, data.ordresService, addToast]);

  const handleSendSign = async () => {
    if (!signModal) return;
    const { moe, moa, entreprise } = signSigners;
    if (!moe.email)        { setSignError("Email MOE (Id Maîtrise) obligatoire."); return; }
    if (!moa.email)        { setSignError("Email Maître d'ouvrage obligatoire."); return; }
    if (!entreprise.email) { setSignError("Email Entreprise obligatoire."); return; }
    setSignSending(true);
    setSignError("");
    try {
      // Enrichissement identique à handlePdf/handleExcel pour que le PDF
      // envoyé pour signature affiche bien la société en gros
      const ch = signModal.ch;
      const enriched = enrichOsForPdf(signModal);
      const { generateOSPdf } = await import('../generators');
      const pdfResult = await generateOSPdf({ ...enriched, returnBase64: true });
      if (!pdfResult?.base64) throw new Error("Impossible de générer le PDF de l'OS");
      const signers = [
        { name: moe.name,        email: moe.email,        role: 'MOE' },
        { name: moa.name,        email: moa.email,        role: 'MOA' },
        { name: entreprise.name, email: entreprise.email, role: 'Entreprise' },
      ];
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/odoo/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          pdfBase64: pdfResult.base64,
          reference: signModal.numero,
          operationName: ch?.nom || "",
          signers,
          osId: signModal.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur lors de la création');
      SB.log('odoo_sign_send', 'os', signModal.id, `OS ${signModal.numero} — envoi signature`, {
        reference: signModal.numero,
        chantier_nom: ch?.nom || null,
        signers: signers.map(s => ({ role: s.role, email: s.email })),
      });
      // Envoyer en signature, c'est émettre l'OS
      if (signModal.statut === 'Brouillon') {
        try { await SB.updateOsStatut(signModal.id, 'Émis', signModal.numero); } catch (_) {}
      }
      setSignModal(null);
      reload();
      addToast('Demande de signature envoyée aux 3 signataires via Odoo Sign', 'success');
    } catch (err) {
      setSignError(err.message);
    } finally {
      setSignSending(false);
    }
  };

  const handleResetSign = useCallback(async (os) => {
    const ok = await confirm({
      title: "Réinitialiser la signature",
      message: `Supprimer le lien Odoo Sign et le statut de signature sur l'OS ${os.numero} ?\n\n` +
        `La demande Odoo existante n'est pas annulée côté Odoo (à faire manuellement si besoin).`,
      confirmLabel: "Réinitialiser",
    });
    if (!ok) return;
    try {
      await SB.upsertOS({ ...os, odoo_sign_id: null, odoo_sign_url: null, statut_signature: null });
      SB.log('odoo_sign_reset', 'os', os.id, `OS ${os.numero} — reset signature`, {
        previous_sign_id: os.odoo_sign_id || null,
      });
      reload();
      addToast("Signature réinitialisée", "success");
    } catch (err) {
      addToast("Erreur : " + (err?.message || "impossible de réinitialiser"), "error");
    }
  }, [confirm, reload, addToast]);

  // Le lien mailto ne peut pas joindre de fichier : le PDF est téléchargé
  // d'abord, le mail préparé dit qu'il est joint, la personne l'ajoute.
  const handleEmail = useCallback(async (os) => {
    const ch = (data.chantiers || []).find(c=>c.id===os.chantier_id);
    try {
      const { generateOSPdf } = await import('../generators');
      await generateOSPdf(enrichOsForPdf(os));
    } catch (err) {
      addToast('PDF non généré : ' + (err?.message || 'erreur'), 'error');
      return;
    }
    const subject = encodeURIComponent(`Ordre de Service ${os.numero} — ${ch?.nom || ""}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVeuillez trouver ci-joint l'ordre de service ${os.numero} pour le chantier « ${ch?.nom || ""} ».\n\n` +
      `Entreprise : ${os.artisan_nom || ""}\n` +
      `Date d'émission : ${formatDateFR(os.date_emission) || ""}\n` +
      (os.date_intervention ? `Début des travaux : ${formatDateFR(os.date_intervention)}\n` : '') +
      `Montant HT : ${formatMoneyFR(os.montant_ht)} €\n` +
      `Montant TTC : ${formatMoneyFR(os.montant_ttc)} €\n\n` +
      `Merci de nous le retourner signé.\n\n` +
      `Cordialement,\nID Maîtrise`
    );
    const to = encodeURIComponent(os.artisan_email || "");
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
    addToast(`PDF ${os.numero} téléchargé : joignez-le au mail`, 'info');
    try {
      SB.log('send_email', 'os', os.id, `OS ${os.numero} — email → ${os.artisan_email || 'destinataire'}`, {
        to: os.artisan_email || null,
        chantier_nom: ch?.nom || null,
      });
    } catch (_) {}
  }, [data.chantiers, enrichOsForPdf, addToast]);

  // Handler stable pour la pill de filtre statut : permet à OsStatusPills
  // de bénéficier de son memo() (ne re-render que si filtre/compteurs changent).
  const handleStatusFilter = useCallback((k) => setStatusFilter(k), []);

  // Map chantier_id → chantier : évite les .find() O(N*M) dans les listes
  const chantierById = useMemo(
    () => new Map((data.chantiers || []).map(c => [c.id, c])),
    [data.chantiers]
  );

  // Liste filtrée par recherche + statut, puis triée selon sortBy.
  // Mémoïsée ensemble pour éviter qu'un [...filteredOS].sort() dans le JSX
  // ne crée un nouveau tableau à chaque render.
  // Exclut les OS en cours de suppression (fenêtre d'undo ouverte).
  const filteredSortedOS = useMemo(() => {
    const s = searchOS.toLowerCase().trim();
    const baseList = (data.ordresService || []).filter(os => !pendingDeleteIds.has(os.id));
    let filtered = s
      ? baseList.filter(os => {
          const ch = chantierById.get(os.chantier_id);
          return (
            String(os.numero).toLowerCase().includes(s) ||
            (ch?.nom || "").toLowerCase().includes(s) ||
            (os.artisan_nom || "").toLowerCase().includes(s) ||
            (os.client_nom || "").toLowerCase().includes(s)
          );
        })
      : baseList;
    if (statusFilter !== "all") {
      filtered = filtered.filter(os => os.statut === statusFilter);
    }
    const sorted = [...filtered];
    // Date : date d'émission, puis numéro (deux OS du même jour restent dans l'ordre)
    const byDate = (a,b) =>
      String(a.date_emission||a.created_at||"").localeCompare(String(b.date_emission||b.created_at||"")) ||
      String(a.numero||"").localeCompare(String(b.numero||""), 'fr', { numeric: true });
    switch (sortBy) {
      case "date_asc":   sorted.sort(byDate); break;
      case "amount_desc":sorted.sort((a,b) => (Number(b.montant_ttc)||0) - (Number(a.montant_ttc)||0)); break;
      case "amount_asc": sorted.sort((a,b) => (Number(a.montant_ttc)||0) - (Number(b.montant_ttc)||0)); break;
      default:           sorted.sort((a,b) => byDate(b,a)); // date_desc
    }
    return sorted;
  }, [searchOS, statusFilter, sortBy, data.ordresService, chantierById, pendingDeleteIds]);

  // Compte par statut (pour les badges des pills de filtre)
  const countByStatus = useMemo(() => {
    const acc = { all: 0 };
    OS_STATUSES.forEach(s => { acc[s] = 0; });
    (data.ordresService || []).forEach(os => {
      acc.all++;
      if (acc[os.statut] != null) acc[os.statut]++;
    });
    return acc;
  }, [data.ordresService]);

  // Un OS est "en retard" si sa date de fin prévue est passée et son statut
  // n'est ni Terminé ni Annulé. Indicateur visuel sur les cartes.
  const todayISO = new Date().toISOString().split("T")[0];
  const isOverdue = (os) =>
    os.date_fin_prevue && os.date_fin_prevue < todayISO && !["Terminé","Annulé"].includes(os.statut);

  return (<div>
    {/* Input file caché pour l'import de devis par photo.
        Pas de `capture` → iOS propose caméra + photothèque + fichiers. */}
    <input
      ref={devisInputRef}
      type="file"
      accept="image/*"
      onChange={handleImportDevis}
      style={{display:"none"}}
    />

    <div style={{
      display:"flex",justifyContent:"space-between",alignItems:"center",
      marginBottom:14,flexWrap:"wrap",gap:8
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?28:32,fontWeight:600,letterSpacing:"-0.02em",color:"var(--label)"}}>Ordres de service</h1>
        <div style={{fontSize:13,color:"var(--label-secondary)",marginTop:2}}>
          {countByStatus.all} au total
          {statusFilter !== "all" && (
            <> · <strong>{filteredSortedOS.length}</strong>{" "}
              filtré{filteredSortedOS.length>1?"s":""}
            </>
          )}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <SearchField inputRef={searchInputRef} value={searchOS} onChange={e=>setSearchOS(e.target.value)} m={m} width={260}
          label="Rechercher un OS" placeholder={m?"Rechercher n°, chantier, client…":"Rechercher n°, chantier, client… (tape /)"}/>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Trier" title="Trier"
          style={toolbarSelect(m)}>
          <option value="date_desc">Plus récents</option>
          <option value="date_asc">Plus anciens</option>
          <option value="amount_desc">Montant décroissant</option>
          <option value="amount_asc">Montant croissant</option>
        </select>
        {!readOnly && <button
          onClick={() => devisInputRef.current?.click()}
          disabled={importing}
          className="u-btn"
          style={{...btnS,display:"inline-flex",alignItems:"center",gap:6,
            cursor:importing?"wait":"pointer",opacity:importing?0.7:1}}
          title="Photographie ou screenshot un devis artisan pour auto-remplir un OS"
        >
          {importing ? <><HeaderSpinner/>Extraction…</> : <><Icon d={I.camera} size={16}/>Importer un devis</>}
        </button>}
        <button
          onClick={handleExportCSV}
          title="Exporter la liste filtrée au format CSV (Excel)"
          disabled={filteredSortedOS.length === 0}
          className="u-btn"
          style={{...btnS,display:"inline-flex",alignItems:"center",gap:6,
            cursor:filteredSortedOS.length === 0 ? "not-allowed" : "pointer",
            opacity:filteredSortedOS.length === 0 ? 0.5 : 1}}
        ><Icon d={I.download} size={16}/>CSV</button>
        {!readOnly && (
          <button
            onClick={() => handleSyncSignatures(false)}
            disabled={syncingSigs}
            title="Actualiser les statuts de signature depuis Odoo"
            className="u-btn"
            style={{...btnS,display:"inline-flex",alignItems:"center",gap:6,
              cursor:syncingSigs?"wait":"pointer",opacity:syncingSigs?0.6:1}}
          >
            {syncingSigs ? <><HeaderSpinner/>Actualisation…</> : "Signatures"}
          </button>
        )}
        {!readOnly && (
          <button onClick={openNew} title="Nouvel OS (raccourci : n)"
            style={{...btnP,display:"inline-flex",alignItems:"center",gap:4}}><Icon d={I.plus} size={16} color="#fff"/>Nouvel OS</button>
        )}
      </div>
    </div>

    {/* PILLS DE FILTRE PAR STATUT */}
    <OsStatusPills
      statusFilter={statusFilter}
      onChange={handleStatusFilter}
      countByStatus={countByStatus}
      m={m}
    />

    {importError && (
      <div style={{
        background:"var(--red-tint)",
        border:"1px solid var(--red-line)",
        borderRadius:8,
        padding:"8px 12px",
        marginBottom:12,
        fontSize:12,
        color:"var(--red-text)",
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        gap:8,
      }}>
        <span>{importError}</span>
        <button onClick={()=>setImportError("")} aria-label="Fermer le message"
          style={{background:"none",border:"none",cursor:"pointer",
            color:"var(--red-text)",fontSize:16,padding:0}}><Icon d={I.x} size={14} stroke={1.75} /></button>
      </div>
    )}

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:10}}>
      {filteredSortedOS.length===0 ? (
        <div style={{
          background:"#fff",borderRadius:12,padding:"40px 24px",
          textAlign:"center"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:8,color:"var(--label-tertiary)"}}><Icon d={I.os} size={28} stroke={1.5}/></div>
          {searchOS || statusFilter !== "all" ? (
            <>
              <div style={{fontSize:14,fontWeight:600,color:"var(--label-2)",marginBottom:4}}>Aucun résultat</div>
              <div style={{fontSize:12,color:"var(--label-secondary)",marginBottom:14}}>
                Essaie d&apos;élargir ta recherche ou de changer de statut.
              </div>
              <button onClick={()=>{setSearchOS("");setStatusFilter("all");}}
                style={btnS}>Réinitialiser les filtres</button>
            </>
          ) : (
            <>
              <div style={{fontSize:14,fontWeight:600,color:"var(--label-2)",marginBottom:4}}>Aucun ordre de service</div>
              <div style={{fontSize:12,color:"var(--label-secondary)",marginBottom:14}}>
                Crée-en un ou importe un devis par photo pour démarrer.
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={openNew} style={btnP}>+ Nouvel OS</button>
                <button onClick={()=>devisInputRef.current?.click()}
                  style={btnS}>Importer un devis</button>
              </div>
            </>
          )}
        </div>
      ) : filteredSortedOS.map(os => (
        <OsCard
          key={os.id}
          os={os}
          ch={chantierById.get(os.chantier_id)}
          overdue={isOverdue(os)}
          generating={generating}
          readOnly={readOnly}
          m={m}
          onPdf={handlePdf}
          onExcel={handleExcel}
          onEmail={handleEmail}
          onSignOpen={openSignModal}
          onSignReset={handleResetSign}
          onDuplicate={handleDuplicate}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      ))}
    </div>

    {/* FORMULAIRE CRÉATION / MODIFICATION — composants/os/OsEditor */}
    {editor && (
      <OsEditor
        key={editor.key}
        os={editor.os || null}
        draft={editor.draft || null}
        data={data}
        m={m}
        onClose={closeModal}
        onSaved={handleSaved}
        importing={importing}
        importError={importError}
        onImportClick={() => devisInputRef.current?.click()}
      />
    )}

    {/* MODAL SIGNATURE ODOO — 3 SIGNATAIRES OBLIGATOIRES */}
    <OSSignatureModal
      signModal={signModal}
      onClose={()=>setSignModal(null)}
      signers={signSigners}
      setSigners={setSignSigners}
      onSend={handleSendSign}
      sending={signSending}
      error={signError}
      inp={inp}
      btnP={btnP}
      btnS={btnS}
    />
  </div>);
}
