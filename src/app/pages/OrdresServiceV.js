'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { SB, Icon, I, fmtMoney, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { OSSignatureModal, OSFormModal } from '../components'
import OsCard from '../components/os/OsCard'
import OsStatusPills from '../components/os/OsStatusPills'
import { OS_STATUSES } from '../components/os/osConstants'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { buildCSV, downloadCSV, formatDateFR, formatMoneyFR } from '../lib/csv'
import { supabase } from '../supabaseClient'
import { useImportDevis } from '../hooks/useImportDevis'
import { usePrestationManager } from '../hooks/usePrestationManager'
import { useSignaturesSync } from '../hooks/useSignaturesSync'

export default function OrdresServiceV({data,m,reload,focusId,focusTs,readOnly}) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  // Prestations + calcul HT/TVA/TTC — voir hooks/usePrestationManager.js
  const {
    prestations,
    setPrestations,
    addPrestation,
    removePrestation,
    updatePrestation,
    totals,
  } = usePrestationManager([]);
  const [searchOS,setSearchOS]=useState("");
  const [statusFilter,setStatusFilter]=useState("all"); // "all" | un des OS_STATUSES
  const [sortBy,setSortBy]=useState("date_desc");       // date_desc | date_asc | amount_desc | amount_asc
  const [formError,setFormError]=useState("");          // erreur de validation affichée dans la modale
  const [saving,setSaving]=useState(false);
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
    onReady: ({ form: f, prestations: p }) => {
      setForm(f)
      setPrestations(p)
      setModal("new")
    },
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

  const nextNum = useCallback(() => {
    const nums = (data.ordresService||[]).map(os => {
      const m = String(os.numero||"").match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `OS-${new Date().getFullYear()}-${String(next).padStart(3,"0")}`;
  }, [data.ordresService]);

  const openNew = () => {
    const ch = data.chantiers[0];
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: "",
      artisan_nom: "", artisan_specialite: "", artisan_adresse: "",
      artisan_tel: "", artisan_email: "", artisan_siret: "",
      date_emission: new Date().toISOString().split("T")[0], date_intervention: "", date_fin_prevue: "",
      observations: "", conditions: "Paiement à 30 jours à compter de la réception de la facture.",
      statut: "Brouillon",
    });
    setPrestations([{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
    setFormError("");
    setModal("new");
  };

  const openEdit = useCallback((os) => {
    const ch = (data.chantiers || []).find(c=>c.id===os.chantier_id);
    setForm({
      ...os,
      chantier: ch?.nom||"",
      adresse_chantier: ch?.adresse||"",
    });
    setPrestations((os.prestations||[]).length > 0
      ? os.prestations.map(p=>({
          ...p,
          quantite:String(p.quantite||""),
          prix_unitaire:String(p.prix_unitaire||""),
          tva_taux:String(p.tva_taux||"20")
        }))
      : [{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]
    );
    setFormError("");
    setModal("edit");
  }, [data.chantiers, setPrestations]);

  const closeModal = useCallback(() => { setModal(null); setFormError(""); }, []);

  // Focus depuis la recherche globale : pré-remplit la recherche locale
  // avec le numéro de l'OS pour filtrer la liste et afficher la carte
  // correspondante. L'utilisateur voit l'OS en contexte et peut cliquer
  // "Modifier" s'il veut l'éditer.
  useEffect(() => {
    if (!focusId) return;
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
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = (t?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      if (modal || signModal) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, signModal]);

  const updateChantier = (chId) => {
    const ch = data.chantiers.find(c=>c.id===chId);
    setForm(f=>({
      ...f, chantier_id: chId, chantier: ch?.nom||"",
      adresse_chantier: ch?.adresse||"", client_nom: ch?.client||""
    }));
  };

  const updateDestinataire = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({
      ...f,
      artisan_nom:co.nom,
      artisan_specialite:co.specialite||co.type||"",
      artisan_adresse:co.adresse||"",
      artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""
    }));
    else setForm(f=>({...f, artisan_nom:name}));
  };

  // addPrestation / removePrestation / updatePrestation / totals sont
  // fournis par le hook usePrestationManager (voir l'import + destructuring
  // en haut du composant).

  const handleSave = async () => {
    if (saving) return;
    // Validation basique des prestations — affichée dans la modale, pas en alert()
    setFormError("");
    if (!form.numero) { setFormError("Le numéro d'OS est requis."); return; }
    if (!form.chantier_id) { setFormError("Sélectionne un chantier."); return; }
    if (!form.artisan_nom) { setFormError("Sélectionne un destinataire (artisan)."); return; }
    for (const p of prestations) {
      const q = parseFloat(p.quantite);
      const pu = parseFloat(p.prix_unitaire);
      if (p.description && (isNaN(q) || q < 0 || isNaN(pu) || pu < 0)) {
        setFormError("Vérifie les quantités et prix unitaires — aucune valeur négative ou invalide.");
        return;
      }
    }
    setSaving(true);
    try {
      const osData = { ...form, prestations, montant_ht: totals.ht, montant_tva: totals.tva, montant_ttc: totals.ttc };
      await SB.upsertOS(osData);
      setModal(null);
      setFormError("");
      reload();
      addToast(modal === "edit" ? "OS mis à jour" : "OS créé", "success");
    } catch (err) {
      setFormError(err?.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

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
    const ok = await confirm({
      title: `Supprimer l'OS ${os.numero} ?`,
      message: "Tu pourras annuler cette suppression pendant 5 secondes.",
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    scheduleDelete(os, { itemLabel: `OS ${os.numero}` });
  }, [confirm, scheduleDelete]);

  const handleDuplicate = useCallback(async (os) => {
    try {
      const {
        id: _id,
        created_at: _created_at,
        odoo_sign_id: _odoo_sign_id,
        odoo_sign_url: _odoo_sign_url,
        statut_signature: _statut_signature,
        ...rest
      } = os;
      const newNumero = nextNum();
      SB.setLogContext({ source: 'duplicate', source_id: os.id, source_numero: os.numero });
      try {
        await SB.upsertOS({
          ...rest,
          numero: newNumero,
          statut: "Brouillon",
          date_emission: new Date().toISOString().split("T")[0],
          odoo_sign_id: null,
          odoo_sign_url: null,
          statut_signature: null,
        });
      } finally {
        SB.clearLogContext();
      }
      try {
        SB.log('duplicate', 'os', os.id,
          `OS ${os.numero} dupliqué → ${newNumero}`,
          { from_numero: os.numero, new_numero: newNumero });
      } catch (_) {}
      reload();
      addToast("OS dupliqué en brouillon", "success");
    } catch (err) {
      addToast("Erreur : " + (err?.message || "duplication impossible"), "error");
    }
  }, [addToast, reload, nextNum]);

  const openSignModal = useCallback((os) => {
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
  }, [data.chantiers, data.contacts]);

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

  const handleEmail = useCallback((os) => {
    const ch = (data.chantiers || []).find(c=>c.id===os.chantier_id);
    const subject = encodeURIComponent(`Ordre de Service ${os.numero} — ${ch?.nom || ""}`);
    const body = encodeURIComponent(
      `Bonjour,\n\nVeuillez trouver ci-joint l'Ordre de Service ${os.numero} pour le chantier "${ch?.nom || ""}".\n\n` +
      `Destinataire : ${os.artisan_nom || ""}\n` +
      `Date d'émission : ${os.date_emission || ""}\n` +
      `Montant TTC : ${Number(os.montant_ttc||0).toLocaleString("fr-FR")} €\n\n` +
      `Cordialement,\nID Maîtrise`
    );
    const to = encodeURIComponent(os.artisan_email || "");
    window.open(`mailto:${to}?subject=${subject}&body=${body}`);
    try {
      SB.log('send_email', 'os', os.id, `OS ${os.numero} — email → ${os.artisan_email || 'destinataire'}`, {
        to: os.artisan_email || null,
        chantier_nom: ch?.nom || null,
      });
    } catch (_) {}
  }, [data.chantiers]);

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
    switch (sortBy) {
      case "date_asc":   sorted.sort((a,b) => new Date(a.created_at||0) - new Date(b.created_at||0)); break;
      case "amount_desc":sorted.sort((a,b) => (Number(b.montant_ttc)||0) - (Number(a.montant_ttc)||0)); break;
      case "amount_asc": sorted.sort((a,b) => (Number(a.montant_ttc)||0) - (Number(b.montant_ttc)||0)); break;
      default:           sorted.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0)); // date_desc
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

  // Tous les contacts regroupés par type (pour les dropdowns du formulaire)
  const contactsParType = useMemo(() => {
    return (data.contacts || []).reduce((acc, c) => {
      const type = c.type || "Autre";
      if (!acc[type]) acc[type] = [];
      acc[type].push(c);
      return acc;
    }, {});
  }, [data.contacts]);

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
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {countByStatus.all} au total
          {statusFilter !== "all" && (
            <> · <strong>{filteredSortedOS.length}</strong>{" "}
              filtré{filteredSortedOS.length>1?"s":""}
            </>
          )}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{position:"absolute",left:9,top:"50%",
            transform:"translateY(-50%)",opacity:0.5}}
            width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="#64748B" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher n°, chantier, client… (tape /)"
            value={searchOS}
            onChange={e=>setSearchOS(e.target.value)}
            style={{
              padding:"7px 10px 7px 28px",borderRadius:7,
              border:"1px solid #E2E8F0",fontSize:12,width:"100%",
              boxSizing:"border-box",fontFamily:"inherit"
            }}
          />
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} title="Trier"
          style={{
            padding:"7px 8px",borderRadius:7,border:"1px solid #E2E8F0",
            fontSize:12,background:"#fff",cursor:"pointer",fontFamily:"inherit"
          }}>
          <option value="date_desc">📅 Plus récents</option>
          <option value="date_asc">📅 Plus anciens</option>
          <option value="amount_desc">💰 Montant ↓</option>
          <option value="amount_asc">💰 Montant ↑</option>
        </select>
        {!readOnly && <button
          onClick={() => devisInputRef.current?.click()}
          disabled={importing}
          style={{
            ...btnS,
            fontSize:12,
            background:"#EEF2FF",
            color:"#4F46E5",
            border:"1.5px solid #C7D2FE",
            cursor:importing?"wait":"pointer",
            opacity:importing?0.7:1,
            display:"flex",
            alignItems:"center",
            gap:6,
          }}
          title="Photographie ou screenshot un devis artisan pour auto-remplir un OS"
        >
          {importing ? (
            <>
              <span style={{
                display:"inline-block",width:12,height:12,
                border:"2px solid #C7D2FE",borderTopColor:"#4F46E5",
                borderRadius:"50%",animation:"spin 0.8s linear infinite"
              }}/>
              Extraction…
            </>
          ) : (
            <>📸 Importer devis</>
          )}
        </button>}
        <button
          onClick={handleExportCSV}
          title="Exporter la liste filtrée au format CSV (Excel)"
          disabled={filteredSortedOS.length === 0}
          style={{
            ...btnS,
            fontSize: 12,
            background: "#F0FDF4",
            color: "#047857",
            border: "1.5px solid #A7F3D0",
            cursor: filteredSortedOS.length === 0 ? "not-allowed" : "pointer",
            opacity: filteredSortedOS.length === 0 ? 0.5 : 1,
          }}
        >⬇ CSV</button>
        {!readOnly && (
          <button
            onClick={() => handleSyncSignatures(false)}
            disabled={syncingSigs}
            title="Actualiser les statuts de signature depuis Odoo"
            style={{
              background:'#F5F3FF', color:'#6D28D9', border:'1px solid #DDD6FE',
              borderRadius:6, padding:'8px 12px', fontSize:12, fontWeight:600,
              cursor: syncingSigs ? 'wait' : 'pointer',
              opacity: syncingSigs ? 0.6 : 1,
              fontFamily: 'inherit',
              display:'inline-flex', alignItems:'center', gap:6,
            }}
          >
            {syncingSigs ? (
              <>
                <span style={{
                  display:'inline-block',width:10,height:10,
                  border:'2px solid #DDD6FE',borderTopColor:'#6D28D9',
                  borderRadius:'50%',animation:'spin .8s linear infinite'
                }}/>
                Sync…
              </>
            ) : '🔄 Signatures'}
          </button>
        )}
        {!readOnly && (
          <button onClick={openNew} title="Nouvel OS (raccourci : n)"
            style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
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
        background:"#FEF2F2",
        border:"1px solid #FECACA",
        borderRadius:8,
        padding:"8px 12px",
        marginBottom:12,
        fontSize:12,
        color:"#DC2626",
        display:"flex",
        justifyContent:"space-between",
        alignItems:"center",
        gap:8,
      }}>
        <span>{importError}</span>
        <button onClick={()=>setImportError("")}
          style={{background:"none",border:"none",cursor:"pointer",
            color:"#DC2626",fontSize:16,padding:0}}>✕</button>
      </div>
    )}

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:10}}>
      {filteredSortedOS.length===0 ? (
        <div style={{
          background:"#fff",borderRadius:12,padding:"40px 24px",
          textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
        }}>
          <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>📋</div>
          {searchOS || statusFilter !== "all" ? (
            <>
              <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
              <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
                Essaie d&apos;élargir ta recherche ou de changer de statut.
              </div>
              <button onClick={()=>{setSearchOS("");setStatusFilter("all");}}
                style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
            </>
          ) : (
            <>
              <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun ordre de service</div>
              <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
                Crée-en un ou importe un devis par photo pour démarrer.
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
                <button onClick={()=>devisInputRef.current?.click()}
                  style={{...btnS,fontSize:12}}>📸 Importer un devis</button>
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

    {/* MODAL CRÉATION / ÉDITION OS — composant OSFormModal */}
    <OSFormModal
      modal={modal}
      onClose={closeModal}
      form={form}
      setForm={setForm}
      updateChantier={updateChantier}
      updateDestinataire={updateDestinataire}
      prestations={prestations}
      addPrestation={addPrestation}
      removePrestation={removePrestation}
      updatePrestation={updatePrestation}
      totals={totals}
      formError={formError}
      setFormError={setFormError}
      saving={saving}
      handleSave={handleSave}
      chantiers={data.chantiers}
      contactsParType={contactsParType}
      importing={importing}
      importError={importError}
      onImportClick={() => devisInputRef.current?.click()}
      m={m}
      FF={FF}
      inp={inp}
      sel={sel}
      btnP={btnP}
      btnS={btnS}
      Icon={Icon}
      I={I}
      fmtMoney={fmtMoney}
    />

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
