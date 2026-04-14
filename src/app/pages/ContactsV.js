'use client'
import { useState, useRef, useEffect } from 'react'
import { SB, Icon, I, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import {
  validateSiret, validatePhoneFR, validateEmail,
  validateIban, validateCodePostalFR, validateTvaIntra
} from '../lib/validators'
import { buildCSV, downloadCSV } from '../lib/csv'
import { supabase } from '../supabaseClient'

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
  const [pSearch,setPSearch]=useState("");
  const [pLoading,setPLoading]=useState(false);
  const [pResults,setPResults]=useState(null);
  const [pError,setPError]=useState("");
  // États import par photo
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
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
  const list=data.contacts.filter(c=>{
    if(pendingDeleteIds.has(c.id)) return false;
    if(tf!=="all"&&c.type!==tf) return false;
    if(!q) return true;
    const search=q.toLowerCase();
    return (
      (c.nom||"").toLowerCase().includes(search)||
      (c.specialite||"").toLowerCase().includes(search)||
      (c.societe||"").toLowerCase().includes(search)||
      (c.ville||"").toLowerCase().includes(search)||
      (c.email||"").toLowerCase().includes(search)||
      (c.siret||"").includes(search)
    );
  });

  const emptyForm = {
    nom:"",type:"Artisan",specialite:"",societe:"",fonction:"",
    tel:"",tel_fixe:"",email:"",adresse:"",code_postal:"",ville:"",
    siret:"",tva_intra:"",assurance_decennale:"",assurance_validite:"",
    iban:"",qualifications:"",site_web:"",note:0,actif:true,notes:""
  };

  const openNew=()=>{
    setForm(emptyForm);setPSearch("");setPResults(null);
    setPError("");setFormError("");setModal("new");
  };
  const openEdit=(c)=>{
    setForm({...c});setPSearch("");setPResults(null);
    setPError("");setFormError("");setModal("edit");
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

  // ── Pappers : mapping entreprise complète → formulaire ──
  //
  // Règles clés :
  // 1. NE PAS écraser form.nom avec entreprise.denomination. Si le user
  //    a déjà un nom (saisi ou extrait par Claude Vision), on le garde.
  // 2. Si form.nom est vide, on essaie de le remplir avec le 1er
  //    dirigeant/représentant trouvé dans l'entreprise.
  // 3. entreprise.denomination → toujours dans form.societe.
  // 4. Si on a un dirigeant (via options.dirigeant ou via les
  //    representants de l'entreprise), on remplit form.fonction avec
  //    sa qualité (Gérant, Président, etc.) si elle est vide.
  const fillFromPappers = (entreprise, options = {}) => {
    const siege = entreprise.siege || {};

    // Chercher un dirigeant : priorité à options.dirigeant (passé explicitement),
    // sinon premier représentant de l'entreprise
    const representants = entreprise.representants
      || entreprise.dirigeants_actuels
      || entreprise.dirigeants
      || [];
    const dirigeant = options.dirigeant || representants[0] || null;

    const formatName = (d) => {
      if (!d) return "";
      const prenom = (d.prenom || "").trim();
      const nom = (d.nom || d.nom_usage || "").trim();
      return `${prenom} ${nom}`.trim();
    };
    const dirigeantName = formatName(dirigeant);

    setForm(f => ({
      ...f,
      // Nom : on GARDE ce qui est déjà rempli. Si vide, on prend le dirigeant.
      nom: (f.nom && f.nom.trim()) || dirigeantName || f.nom,
      // Société : toujours la dénomination officielle Pappers
      societe: entreprise.denomination || entreprise.nom_entreprise || f.societe,
      // Fonction : garde ce qui est rempli, sinon la qualité du dirigeant
      fonction: (f.fonction && f.fonction.trim()) || dirigeant?.qualite || f.fonction,
      // Administratif
      siret: entreprise.siret || siege.siret || f.siret,
      tva_intra: entreprise.num_tva_intracommunautaire || f.tva_intra,
      // Adresse du siège
      adresse: siege.adresse_ligne_1 || siege.adresse || f.adresse,
      code_postal: siege.code_postal || f.code_postal,
      ville: siege.ville || f.ville,
      // Contact
      tel: entreprise.telephone || f.tel,
      email: entreprise.email || f.email,
      site_web: entreprise.site_internet || f.site_web,
      // Activité → spécialité (utile pour typer : Plombier/Élec/etc.)
      specialite: entreprise.libelle_activite_principale || f.specialite,
    }));
    setPResults(null);
    setPSearch("");
    setPError("");
  };

  // ── Helper Pappers avec auth JWT ──────────
  // Centralise les appels à /api/pappers en y injectant le Bearer token.
  const fetchPappers = async (queryString) => {
    const { data: { session } } = await supabase.auth.getSession();
    return fetch(`/api/pappers?${queryString}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token || ''}` },
    });
  };

  // ─── Helper : fetch complet d'une entreprise par son SIRET ────
  // Utile quand on a un résultat de recherche léger (pas de representants) :
  // on va chercher le détail complet avant d'appeler fillFromPappers.
  const fetchFullEntreprise = async (siret) => {
    if (!siret) return null;
    try {
      const res = await fetchPappers(`siret=${encodeURIComponent(siret)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Clic "Importer" sur un résultat entreprise : on fetch le détail complet
  // puis on remplit le formulaire
  const importEntrepriseFromSearch = async (entrepriseLight) => {
    setPLoading(true);
    try {
      const siret = entrepriseLight.siret || entrepriseLight.siege?.siret;
      const full = (siret && await fetchFullEntreprise(siret)) || entrepriseLight;
      fillFromPappers(full);
    } finally {
      setPLoading(false);
    }
  };

  // Clic "Importer" sur un résultat dirigeant : on fetch l'entreprise
  // complète puis on remplit le form en forçant le nom/prénom du dirigeant
  const importDirigeantFromSearch = async (dirigeantInfo, entrepriseLight) => {
    setPLoading(true);
    try {
      const siret = entrepriseLight.siret || entrepriseLight.siege?.siret;
      const full = (siret && await fetchFullEntreprise(siret)) || entrepriseLight;
      fillFromPappers(full, { dirigeant: dirigeantInfo });
    } finally {
      setPLoading(false);
    }
  };

  const searchPappers = async () => {
    const v = pSearch.trim();
    if (!v) return;
    setPLoading(true); setPError(""); setPResults(null);
    try {
      const isSiret = /^\d{14}$/.test(v.replace(/\s/g,""));
      const cleanSiret = v.replace(/\s/g,"");
      const qs = isSiret ? `siret=${cleanSiret}` : `q=${encodeURIComponent(v)}`;
      try {
        SB.log('search_pappers', 'contact', null,
          `Recherche Pappers — ${v}`,
          { query: v, type: isSiret ? 'siret' : 'text' });
      } catch (_) {}
      const res = await fetchPappers(qs);
      const json = await res.json();
      if (!res.ok) { setPError(json.error || "Erreur Pappers"); return; }
      if (isSiret) {
        // Lookup direct : on a déjà l'entreprise complète
        fillFromPappers(json);
      } else {
        // Recherche texte : on a { resultats, dirigeants }
        const companies = json.resultats || [];
        const dirigeants = json.dirigeants || [];
        if (companies.length === 0 && dirigeants.length === 0) {
          setPError("Aucune entreprise ni dirigeant trouvé.");
          return;
        }
        setPResults({ companies, dirigeants });
      }
    } catch(e) { setPError("Erreur réseau : " + e.message); }
    finally { setPLoading(false); }
  };

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
      const res = await fetch('/api/extract-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
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
      setPSearch("");
      setPResults(null);
      setPError("");
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

    {/* MODAL — Formulaire enrichi */}
    <Modal open={!!modal} onClose={closeModal} title={modal==="new"?"Nouveau contact":"Modifier le contact"} wide>

      {/* ── IMPORT PAR PHOTO (visible uniquement en création) ── */}
      {modal==="new" && (
        <div style={{
          background:"#EEF2FF",border:"1.5px solid #C7D2FE",
          borderRadius:10,padding:"12px 14px",marginBottom:12
        }}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15}}>📸</span>
            <span style={{fontSize:12,fontWeight:700,color:"#4338CA"}}>Import par photo ou capture d'écran</span>
            <span style={{fontSize:10,color:"#818CF8",width:"100%"}}>
              Carte de visite, signature email, contact iOS, SMS, WhatsApp…
            </span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{
              width:"100%",
              padding:"10px 14px",
              borderRadius:8,
              border:"1.5px dashed #A5B4FC",
              background:"#fff",
              color:"#4F46E5",
              fontSize:13,
              fontWeight:600,
              cursor:importing?"wait":"pointer",
              fontFamily:"inherit",
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:8,
              opacity:importing?0.7:1,
            }}
          >
            {importing ? (
              <>
                <span style={{
                display:"inline-block",width:12,height:12,
                border:"2px solid #C7D2FE",borderTopColor:"#4F46E5",
                borderRadius:"50%",animation:"spin 0.8s linear infinite"
              }}/>
                Extraction en cours…
              </>
            ) : (
              <>📷 Choisir une photo ou une capture d'écran</>
            )}
          </button>
          {importError && (
            <div style={{marginTop:8,fontSize:11,color:"#DC2626"}}>{importError}</div>
          )}
        </div>
      )}

      {/* ── RECHERCHE PAPPERS ── */}
      <div style={{
        background:"#EFF6FF",border:"1.5px solid #BFDBFE",
        borderRadius:10,padding:"12px 14px",marginBottom:16
      }}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="#3B82F6" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span style={{fontSize:12,fontWeight:700,color:"#1E40AF"}}>Recherche Pappers</span>
          <span style={{fontSize:10,color:"#60A5FA",width:"100%"}}>
            SIRET (14 chiffres), nom d&apos;entreprise ou nom d&apos;un dirigeant
          </span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <input
            style={{...inp,flex:1,fontSize:13}}
            placeholder="SIRET, Lefèvre Électricité, Yusuf Caglayan..."
            value={pSearch}
            onChange={e=>setPSearch(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&searchPappers()}
          />
          <button
            onClick={searchPappers}
            disabled={pLoading||!pSearch.trim()}
            style={{
              ...btnP,background:"#3B82F6",padding:"8px 16px",fontSize:12,
              opacity:pLoading||!pSearch.trim()?0.6:1,whiteSpace:"nowrap"
            }}
          >{pLoading?"Recherche...":"Rechercher"}</button>
        </div>
        {pError && <div style={{marginTop:8,fontSize:11,color:"#EF4444"}}>{pError}</div>}
        {pResults && (
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:10}}>

            {/* ── Section ENTREPRISES ── */}
            {pResults.companies?.length > 0 && (
              <div>
                <div style={{
                  fontSize:11,color:"#64748B",fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6
                }}>
                  🏢 Entreprises ({pResults.companies.length})
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pResults.companies.map((r,i)=>{
                    const siege = r.siege||{};
                    return (
                      <button key={`c-${i}`} onClick={()=>importEntrepriseFromSearch(r)} disabled={pLoading}
                        style={{
                          background:"#fff",border:"1.5px solid #BFDBFE",
                          borderRadius:8,padding:"8px 12px",
                          cursor:pLoading?"wait":"pointer",textAlign:"left",
                          display:"flex",justifyContent:"space-between",
                          alignItems:"center",gap:8,fontFamily:"inherit",
                          opacity:pLoading?0.6:1
                        }}>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>
                            {r.denomination||r.nom_entreprise}
                          </div>
                          <div style={{fontSize:10,color:"#64748B"}}>
                            {siege.code_postal} {siege.ville} — SIRET {r.siret}
                          </div>
                          {r.libelle_activite_principale && (
                            <div style={{fontSize:10,color:"#94A3B8"}}>
                              {r.libelle_activite_principale}
                            </div>
                          )}
                        </div>
                        <span style={{fontSize:11,color:"#3B82F6",fontWeight:600,flexShrink:0}}>Importer →</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Section DIRIGEANTS ── */}
            {pResults.dirigeants?.length > 0 && (
              <div>
                <div style={{
                  fontSize:11,color:"#64748B",fontWeight:700,
                  textTransform:"uppercase",letterSpacing:"0.03em",marginBottom:6
                }}>
                  👤 Dirigeants ({pResults.dirigeants.length})
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pResults.dirigeants.flatMap((d,i)=>{
                    // Chaque dirigeant peut être lié à plusieurs entreprises.
                    // On "aplatit" : une ligne = un duo (dirigeant, entreprise).
                    const entreprises = d.entreprises || d.companies || (d.entreprise ? [d.entreprise] : []);
                    const dirigeantInfo = {
                      nom: d.nom || d.nom_usage,
                      prenom: d.prenom,
                      qualite: d.qualite || d.fonction,
                    };
                    const fullName = `${dirigeantInfo.prenom||""} ${dirigeantInfo.nom||""}`.trim();

                    if (entreprises.length === 0) return [];

                    return entreprises.map((ent, j) => {
                      const siege = ent.siege || {};
                      return (
                        <button
                          key={`d-${i}-${j}`}
                          onClick={() => importDirigeantFromSearch(dirigeantInfo, ent)}
                          disabled={pLoading}
                          style={{
                            background:"#fff",border:"1.5px solid #C7D2FE",
                            borderRadius:8,padding:"8px 12px",
                            cursor:pLoading?"wait":"pointer",textAlign:"left",
                            display:"flex",justifyContent:"space-between",
                            alignItems:"center",gap:8,
                            fontFamily:"inherit",opacity:pLoading?0.6:1
                          }}
                        >
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>
                              {fullName}
                              {dirigeantInfo.qualite && (
                                <span style={{
                                  fontSize:10,color:"#6366F1",
                                  fontWeight:600,marginLeft:6
                                }}>({dirigeantInfo.qualite})</span>
                              )}
                            </div>
                            <div style={{fontSize:11,fontWeight:600,color:"#4338CA"}}>
                              {ent.denomination || ent.nom_entreprise}
                            </div>
                            <div style={{fontSize:10,color:"#64748B"}}>
                              {[
                                siege.code_postal || ent.code_postal,
                                siege.ville || ent.ville,
                              ].filter(Boolean).join(" ")}
                              {ent.siret && <> — SIRET {ent.siret}</>}
                            </div>
                          </div>
                          <span style={{fontSize:11,color:"#6366F1",fontWeight:600,flexShrink:0}}>Importer →</span>
                        </button>
                      );
                    });
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Identité */}
      <div style={{
        fontSize:11,fontWeight:700,color:"#1E3A5F",
        textTransform:"uppercase",marginBottom:8,marginTop:4
      }}>Identité</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Nom / Prénom *">
          <input style={inp} value={form.nom||""}
            onChange={e=>setForm({...form,nom:e.target.value})}/>
        </FF>
        <FF label="Société / Raison sociale">
          <input style={inp} value={form.societe||""}
            onChange={e=>setForm({...form,societe:e.target.value})}/>
        </FF>
        <FF label="Type"><select style={sel} value={form.type||""} onChange={e=>setForm({...form,type:e.target.value})}>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Spécialité / Métier">
          <input style={inp} value={form.specialite||""}
            onChange={e=>setForm({...form,specialite:e.target.value})}
            placeholder="Ex: Électricité CFO/CFA, Gros œuvre..."/>
        </FF>
        <FF label="Fonction">
          <input style={inp} value={form.fonction||""}
            onChange={e=>setForm({...form,fonction:e.target.value})}
            placeholder="Ex: Gérant, Conducteur de travaux..."/>
        </FF>
      </div>

      {/* Coordonnées */}
      <div style={{
        fontSize:11,fontWeight:700,color:"#1E3A5F",
        textTransform:"uppercase",marginBottom:8,marginTop:12
      }}>Coordonnées</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Tél. mobile">
          <input style={inp} value={form.tel||""}
            onChange={e=>setForm({...form,tel:e.target.value})}
            placeholder="06 ..."/>
        </FF>
        <FF label="Tél. fixe">
          <input style={inp} value={form.tel_fixe||""}
            onChange={e=>setForm({...form,tel_fixe:e.target.value})}
            placeholder="02 35 ..."/>
        </FF>
        <FF label="Email">
          <input type="email" style={inp} value={form.email||""}
            onChange={e=>setForm({...form,email:e.target.value})}/>
        </FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"2fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Adresse">
          <input style={inp} value={form.adresse||""}
            onChange={e=>setForm({...form,adresse:e.target.value})}/>
        </FF>
        <FF label="Code postal">
          <input style={inp} value={form.code_postal||""}
            onChange={e=>setForm({...form,code_postal:e.target.value})}/>
        </FF>
        <FF label="Ville">
          <input style={inp} value={form.ville||""}
            onChange={e=>setForm({...form,ville:e.target.value})}/>
        </FF>
      </div>
      <FF label="Site web">
        <input style={inp} value={form.site_web||""}
          onChange={e=>setForm({...form,site_web:e.target.value})}
          placeholder="https://..."/>
      </FF>

      {/* Administratif */}
      <div style={{
        fontSize:11,fontWeight:700,color:"#1E3A5F",
        textTransform:"uppercase",marginBottom:8,marginTop:12
      }}>Administratif</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="SIRET">
          <input style={inp} value={form.siret||""}
            onChange={e=>setForm({...form,siret:e.target.value})}
            placeholder="XXX XXX XXX XXXXX"/>
        </FF>
        <FF label="TVA intracommunautaire">
          <input style={inp} value={form.tva_intra||""}
            onChange={e=>setForm({...form,tva_intra:e.target.value})}
            placeholder="FR XX XXXXXXXXX"/>
        </FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Assurance décennale">
          <input style={inp} value={form.assurance_decennale||""}
            onChange={e=>setForm({...form,assurance_decennale:e.target.value})}
            placeholder="N° police + assureur"/>
        </FF>
        <FF label="Validité assurance">
          <input type="date" style={inp} value={form.assurance_validite||""}
            onChange={e=>setForm({...form,assurance_validite:e.target.value})}/>
        </FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="IBAN">
          <input style={inp} value={form.iban||""}
            onChange={e=>setForm({...form,iban:e.target.value})}
            placeholder="FR76 XXXX ..."/>
        </FF>
        <FF label="Qualifications (Qualibat, RGE...)">
          <input style={inp} value={form.qualifications||""}
            onChange={e=>setForm({...form,qualifications:e.target.value})}/>
        </FF>
      </div>

      {/* Évaluation */}
      <div style={{
        fontSize:11,fontWeight:700,color:"#1E3A5F",
        textTransform:"uppercase",marginBottom:8,marginTop:12
      }}>Évaluation</div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Note (étoiles)">
          <div style={{display:"flex",gap:4}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n}
                onClick={()=>setForm({...form,note:form.note===n?0:n})}
                style={{background:"none",border:"none",cursor:"pointer",
                  fontSize:22,
                  color:n<=(form.note||0)?"#F59E0B":"#E2E8F0"}}>★</button>
            ))}
          </div>
        </FF>
        <FF label="Statut">
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
            <input type="checkbox" checked={form.actif!==false}
              onChange={e=>setForm({...form,actif:e.target.checked})}/>
            {form.actif!==false?"Actif":"Inactif"}
          </label>
        </FF>
      </div>
      <FF label="Notes / Remarques">
        <textarea style={{...inp,minHeight:50,resize:"vertical"}}
          value={form.notes||""}
          onChange={e=>setForm({...form,notes:e.target.value})}
          placeholder="Notes internes..."/>
      </FF>

      {formError && (
        <div style={{
          background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,
          padding:"8px 12px",marginTop:10,marginBottom:4,fontSize:12,color:"#DC2626",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{fontSize:14}}>⚠</span>
          <span style={{flex:1}}>{formError}</span>
          <button onClick={()=>setFormError("")} aria-label="Fermer"
            style={{background:"none",border:"none",cursor:"pointer",
              color:"#DC2626",fontSize:14,padding:0,lineHeight:1}}>✕</button>
        </div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <button onClick={closeModal} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer</button>
      </div>
    </Modal>
  </div>);
}

// ─── Composants helpers copy-to-clipboard ───────────────

// Lien cliquable (tel: / mailto:) avec bouton copie à droite.
// Le clic sur le lien ouvre l'app native ; le clic sur 📋 copie la valeur.
function ContactInfoLink({ href, onCopy, onTap, label, maxWidth }) {
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
      <a
        href={href}
        onClick={e => { e.stopPropagation(); onTap?.(); }}
        style={{
          color:"#1D4ED8",textDecoration:"none",fontWeight:500,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          maxWidth: maxWidth || undefined,
        }}
      >{label}</a>
      <CopyIconBtn onClick={onCopy}/>
    </span>
  );
}

// Petit bouton "copier" (icône seulement, 14x14)
function CopyIconBtn({ onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); onClick?.(); }}
      aria-label="Copier"
      title="Copier dans le presse-papier"
      style={{
        background:"none",border:"none",cursor:"pointer",
        padding:0,width:14,height:14,
        display:"inline-flex",alignItems:"center",justifyContent:"center",
        color:"#94A3B8",fontFamily:"inherit",
        opacity:0.7,
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#3B82F6"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = 0.7; e.currentTarget.style.color = "#94A3B8"; }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
  );
}
