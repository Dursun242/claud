'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { SB, Icon, I, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, ContactInfoLink, CopyIconBtn, ContactFormModal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import {
  validateSiret, validatePhoneFR, validateEmail,
  validateIban, validateCodePostalFR, validateTvaIntra
} from '../lib/validators'
import { buildCSV, downloadCSV } from '../lib/csv'
import { supabase } from '../supabaseClient'
import { usePappersSearch } from '../hooks/usePappersSearch'

const TYPE_COLORS = {
  Artisan:"#F59E0B",Client:"#3B82F6",Fournisseur:"#10B981",
  "Sous-traitant":"#8B5CF6",Prestataire:"#EC4899",
  MOA:"#0EA5E9",Architecte:"#6366F1",BET:"#14B8A6"
}
const TYPES = ["Artisan","Sous-traitant","Prestataire","Client","Fournisseur","MOA","Architecte","BET"]

export default function ContactsV({data,save,m,reload,focusId,focusTs}) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [tf,setTf]=useState("all");
  const [q,setQ]=useState("");
  const [formError, setFormError] = useState("");
  // Recherche Pappers (entreprises + dirigeants) — voir hooks/usePappersSearch.js
  const {
    pSearch, setPSearch,
    pLoading, pResults, pError,
    searchPappers,
    importEntrepriseFromSearch,
    importDirigeantFromSearch,
    resetPappersSearch,
    fetchPappers,
  } = usePappersSearch({ setForm });
  // États import par photo
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  // Annule l'extraction Claude Vision en cours si l'utilisateur change de
  // page ou lance un nouvel import (évite requête orpheline + fuite setState).
  const extractAbortRef = useRef(null);
  useEffect(() => () => { extractAbortRef.current?.abort() }, []);
  const tc = TYPE_COLORS;
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
      { label: 'Email',          key: 'email' },
      { label: 'Adresse',        key: 'adresse' },
      { label: 'Code postal',    key: 'code_postal' },
      { label: 'Ville',          key: 'ville' },
      { label: 'SIRET',          key: 'siret' },
      { label: 'TVA intra.',     key: 'tva_intra' },
      { label: 'Site web',       key: 'site_web' },
      { label: 'IBAN',           key: 'iban' },
      { label: 'Qualifications', key: 'qualifications' },
      { label: 'Note',           get: (c) => c.note ? `${c.note}/5` : '' },
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
  const list = useMemo(() => {
    const search = q.toLowerCase();
    return (data.contacts || []).filter(c => {
      if (pendingDeleteIds.has(c.id)) return false;
      if (tf !== "all" && c.type !== tf) return false;
      if (!q) return true;
      return (
        (c.nom||"").toLowerCase().includes(search) ||
        (c.specialite||"").toLowerCase().includes(search) ||
        (c.societe||"").toLowerCase().includes(search) ||
        (c.ville||"").toLowerCase().includes(search) ||
        (c.email||"").toLowerCase().includes(search) ||
        (c.siret||"").includes(search)
      );
    });
  }, [data.contacts, q, tf, pendingDeleteIds]);

  const emptyForm = {
    nom:"",type:"Artisan",specialite:"",societe:"",fonction:"",
    tel:"",tel_fixe:"",email:"",adresse:"",code_postal:"",ville:"",
    siret:"",tva_intra:"",assurance_decennale:"",assurance_validite:"",
    iban:"",qualifications:"",site_web:"",note:0,actif:true,notes:""
  };

  const openNew=()=>{
    setForm(emptyForm);resetPappersSearch();setFormError("");setModal("new");
  };
  const openEdit=(c)=>{
    setForm({...c});resetPappersSearch();setFormError("");setModal("edit");
  };
  const closeModal=()=>{setModal(null);setFormError("");};

  // Raccourci clavier « n » pour créer un contact (sauf si on tape ou modale ouverte)
  const openNewRef = useRef(null);
  useEffect(() => { openNewRef.current = openNew; });
  useEffect(() => {
    const handler = (e) => {
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
  }, [modal]);

  // Focus depuis la recherche globale : au lieu d'ouvrir une modale,
  // on pré-remplit la recherche locale avec le nom du contact et on
  // reset le filtre de type. Résultat : la liste se filtre pour
  // afficher uniquement ce contact (plus ceux qui ont un nom similaire).
  // L'utilisateur voit la "pastille" du contact en contexte et peut
  // cliquer le crayon pour éditer s'il le souhaite.
  useEffect(() => {
    if (!focusId) return;
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
      ['Email', validateEmail(form.email)],
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

  // ── Pappers : mapping + recherche déportés dans hooks/usePappersSearch.js
  // Expose pSearch/pLoading/pResults/pError + searchPappers + les deux
  // importXxxFromSearch + fetchPappers (réutilisé par enrichFromSiret
  // plus bas pour enrichir un contact depuis un SIRET extrait par photo).

  // ─── Import par photo (Claude Vision) ─────
  //
  // Resize une image via canvas pour rester sous 1600px de largeur
  // et ≤ 5 Mo. Retourne { base64, mediaType }.
  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_W = 1600;
          let { width, height } = img;
          if (width > MAX_W) {
            height = Math.round(height * (MAX_W / width));
            width = MAX_W;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // JPEG qualité 0.85 — bon compromis taille/lisibilité pour OCR
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mediaType: 'image/jpeg' });
        };
        img.onerror = () => reject(new Error("Image illisible"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Lecture fichier échouée"));
      reader.readAsDataURL(file);
    });
  };

  // Si Claude a extrait un SIRET, on enrichit automatiquement via Pappers
  // pour fiabiliser les données officielles (adresse, TVA intra, dénomination).
  const enrichFromSiret = async (siret) => {
    try {
      const clean = (siret || "").replace(/\s/g, "");
      if (!/^\d{14}$/.test(clean)) return null;
      const res = await fetchPappers(`siret=${clean}`);
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
      const { base64, mediaType } = await resizeImage(file);

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

      // 5. Bonus : si un SIRET a été détecté, enrichit via Pappers
      if (extracted.siret) {
        const pappers = await enrichFromSiret(extracted.siret);
        if (pappers) {
          const siege = pappers.siege || {};
          // On garde les champs déjà remplis par Claude, on ajoute ce qui manque
          if (!prefilled.societe) prefilled.societe = pappers.denomination || prefilled.societe;
          if (!prefilled.tva_intra) prefilled.tva_intra = pappers.num_tva_intracommunautaire || prefilled.tva_intra;
          if (!prefilled.adresse) prefilled.adresse = siege.adresse_ligne_1 || siege.adresse || prefilled.adresse;
          if (!prefilled.code_postal) prefilled.code_postal = siege.code_postal || prefilled.code_postal;
          if (!prefilled.ville) prefilled.ville = siege.ville || prefilled.ville;
          if (!prefilled.site_web) prefilled.site_web = pappers.site_internet || prefilled.site_web;
          if (!prefilled.specialite) prefilled.specialite = pappers.libelle_activite_principale || prefilled.specialite;
        }
      }

      // 6. Ouvre la modale pré-remplie pour relecture + validation
      setForm(prefilled);
      resetPappersSearch();
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

    <div style={{
      display:"flex",justifyContent:"space-between",alignItems:"center",
      marginBottom:14,flexWrap:"wrap",gap:8
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Contacts</h1>
        <p style={{margin:"2px 0 0",fontSize:12,color:"#94A3B8"}}>
          {data.contacts.length} contact{data.contacts.length>1?"s":""}
          {(q || tf !== "all") && <> · <strong>{list.length}</strong> affiché{list.length>1?"s":""}</>}
        </p>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button
          onClick={() => fileInputRef.current?.click()}
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
          title={
            "Importer un contact depuis une photo ou une capture d'écran" +
            " (carte de visite, signature email, iOS Contacts, SMS, WhatsApp…)"
          }
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
            <>📸 Importer photo / capture</>
          )}
        </button>
        <button
          onClick={handleExportCSV}
          title="Exporter la liste filtrée au format CSV (Excel)"
          disabled={list.length === 0}
          style={{
            ...btnS,
            fontSize: 12,
            background: "#F0FDF4",
            color: "#047857",
            border: "1.5px solid #A7F3D0",
            cursor: list.length === 0 ? "not-allowed" : "pointer",
            opacity: list.length === 0 ? 0.5 : 1,
          }}
        >⬇ CSV</button>
        <button onClick={openNew}
          title="Nouveau contact (raccourci : n)"
          style={{...btnP,fontSize:12}}>+ Nouveau contact</button>
      </div>
    </div>

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
        <button onClick={()=>setImportError("")} style={{
          background:"none",border:"none",cursor:"pointer",
          color:"#DC2626",fontSize:16,padding:0
        }}>✕</button>
      </div>
    )}

    {/* Search + Filters */}
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:200}}>
        <span style={{
          position:"absolute",left:10,top:"50%",
          transform:"translateY(-50%)",pointerEvents:"none"
        }}><Icon d={I.search} size={14} color="#94A3B8"/></span>
        <input
          ref={searchInputRef}
          type="search"
          placeholder="Rechercher nom, société, ville, email… (tape /)"
          style={{...inp,paddingLeft:30,fontSize:13}}
          value={q}
          onChange={e=>setQ(e.target.value)}
        />
      </div>
    </div>
    <div style={{
      display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",
      overflowX:m?"auto":"visible",paddingBottom:m?4:0
    }}>
      <button onClick={()=>setTf("all")} style={{
        display:"inline-flex",alignItems:"center",gap:6,
        padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
        border:`1px solid ${tf==="all"?"#1E3A5F":"#E2E8F0"}`,
        background:tf==="all"?"#1E3A5F":"#fff",
        color:tf==="all"?"#fff":"#334155",cursor:"pointer",fontFamily:"inherit",
        transition:"background .15s, color .15s, border-color .15s",whiteSpace:"nowrap",
      }}>
        <span style={{
          width:7,height:7,borderRadius:"50%",
          background:tf==="all"?"#fff":"#64748B",opacity:tf==="all"?0.8:1
        }}/>
        Tous <span style={{fontSize:10,opacity:0.75,fontWeight:500}}>{data.contacts.length}</span>
      </button>
      {Object.entries(stats).map(([type,count])=>{
        const active = tf === type;
        const color = tc[type] || "#1E3A5F";
        return (
          <button key={type} onClick={()=>setTf(type)} style={{
            display:"inline-flex",alignItems:"center",gap:6,
            padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
            border:`1px solid ${active?color:"#E2E8F0"}`,
            background:active?color:"#fff",
            color:active?"#fff":"#334155",cursor:"pointer",fontFamily:"inherit",
            transition:"background .15s, color .15s, border-color .15s",whiteSpace:"nowrap",
          }}>
            <span style={{width:7,height:7,borderRadius:"50%",background:active?"#fff":color,opacity:active?0.8:1}}/>
            {type} <span style={{fontSize:10,opacity:0.75,fontWeight:500}}>{count}</span>
          </button>
        );
      })}
    </div>

    {/* Contact Cards */}
    {list.length === 0 ? (
      <div style={{
        background:"#fff",borderRadius:12,padding:"40px 24px",
        textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>👤</div>
        {data.contacts.length === 0 ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun contact pour l'instant</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
              Crée ton premier contact ou importe-en un depuis une photo/capture.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouveau contact</button>
              <button onClick={()=>fileInputRef.current?.click()}
                style={{...btnS,fontSize:12}}>📸 Importer une photo</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
              Essaie d&apos;élargir ta recherche ou de changer de filtre.
            </div>
            <button onClick={()=>{setQ("");setTf("all");}}
              style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
          </>
        )}
      </div>
    ) : (
    <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:10}}>
      {list.map(c=>(
        <div key={c.id} style={{
          background:"#fff",borderRadius:12,padding:m?14:16,
          boxShadow:"0 1px 3px rgba(15,23,42,0.05)",
          borderLeft:`4px solid ${tc[c.type]||"#94A3B8"}`,
          opacity:c.actif===false?0.55:1
        }}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                <span style={{fontSize:15,fontWeight:700,color:"#0F172A"}}>{c.nom}</span>
                <Badge text={c.type} color={tc[c.type]||"#94A3B8"}/>
                {c.actif===false && <Badge text="Inactif" color="#94A3B8"/>}
                {c.note>0 && (
                  <span title={`${c.note}/5`} style={{fontSize:11,color:"#F59E0B"}}>
                    {"★".repeat(c.note)}{"☆".repeat(5-c.note)}
                  </span>
                )}
              </div>
              {c.societe && <div style={{fontSize:12,fontWeight:600,color:"#334155",marginBottom:2}}>{c.societe}</div>}
              {c.specialite && (
                <div style={{fontSize:11,color:"#64748B",marginBottom:4}}>
                  {c.specialite}{c.fonction?` — ${c.fonction}`:""}
                </div>
              )}
              {/* Coordonnées : cliquer sur le lien appelle/envoie, cliquer sur
                  l'icône 📋 à droite copie la valeur dans le presse-papier. */}
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px 10px",fontSize:11,marginTop:4}}>
                {c.tel && (
                  <ContactInfoLink href={`tel:${c.tel.replace(/\s/g,"")}`}
                    onTap={()=>{ try {
                      SB.log('contact_tap', 'contact', c.id, `Appel → ${c.nom}`, { field: 'tel', value: c.tel })
                    } catch(_) {} }}
                    onCopy={() => copyToClipboard(c.tel, "Téléphone", c)}
                    label={`📱 ${c.tel}`}/>
                )}
                {c.tel_fixe && (
                  <ContactInfoLink href={`tel:${c.tel_fixe.replace(/\s/g,"")}`}
                    onTap={()=>{ try {
                      SB.log('contact_tap', 'contact', c.id,
                        `Appel fixe → ${c.nom}`,
                        { field: 'tel_fixe', value: c.tel_fixe })
                    } catch(_) {} }}
                    onCopy={() => copyToClipboard(c.tel_fixe, "Téléphone fixe", c)}
                    label={`☎ ${c.tel_fixe}`}/>
                )}
                {c.email && (
                  <ContactInfoLink href={`mailto:${c.email}`}
                    onTap={()=>{ try {
                      SB.log('contact_tap', 'contact', c.id, `Email → ${c.nom}`, { field: 'email', value: c.email })
                    } catch(_) {} }}
                    onCopy={() => copyToClipboard(c.email, "Email", c)}
                    label={`✉ ${c.email}`} maxWidth={220}/>
                )}
              </div>
              {(c.ville||c.adresse) && (
                <div style={{fontSize:10,color:"#94A3B8",marginTop:3,display:"inline-flex",alignItems:"center",gap:5}}>
                  📍 {[c.adresse,c.code_postal,c.ville].filter(Boolean).join(", ")}
                  <CopyIconBtn onClick={() =>
                    copyToClipboard([c.adresse,c.code_postal,c.ville].filter(Boolean).join(", "), "Adresse")
                  }/>
                </div>
              )}
              {c.siret && (
                <div style={{fontSize:10,color:"#94A3B8",marginTop:2,display:"inline-flex",alignItems:"center",gap:5}}>
                  SIRET : {c.siret}
                  <CopyIconBtn onClick={() => copyToClipboard(c.siret, "SIRET", c)}/>
                </div>
              )}
              {c.qualifications && (
                <div style={{fontSize:10,color:"#3B82F6",marginTop:2,fontWeight:600}}>
                  🏅 {c.qualifications}
                </div>
              )}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
              <button onClick={()=>openEdit(c)} title="Modifier" style={{
                background:"#F1F5F9",border:"1px solid #E2E8F0",borderRadius:6,
                cursor:"pointer",padding:"5px 7px",
                display:"flex",alignItems:"center",justifyContent:"center"
              }}>
                <Icon d={I.edit} size={13} color="#475569"/>
              </button>
              <button onClick={()=>handleDelete(c)} title="Supprimer" style={{
                background:"#fff",border:"1px solid #FECACA",borderRadius:6,
                cursor:"pointer",padding:"5px 7px",
                display:"flex",alignItems:"center",justifyContent:"center"
              }}>
                <Icon d={I.trash} size={13} color="#DC2626"/>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
    )}

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
      searchPappers={searchPappers}
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

// ContactInfoLink + CopyIconBtn vivent désormais dans
// components/ContactInfoLink.js (réutilisables hors annuaire).
