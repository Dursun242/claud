'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { SB, Icon, I, fmtDate, fmtMoney, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { generateOSPdf, generateOSExcel } from '../generators'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

// Ordre canonique des statuts (utilisé dans le filtre et le dropdown de tri)
const OS_STATUSES = ["Brouillon","Émis","Signé","En cours","Terminé","Annulé"]
const osStatusColor = { "Brouillon":"#94A3B8", "Émis":"#3B82F6", "Signé":"#8B5CF6", "En cours":"#F59E0B", "Terminé":"#10B981", "Annulé":"#EF4444" }

// Style "pastille" pour les boutons d'action sur les cartes OS.
// Remplace les boutons saturés (rouge/vert/violet plein) par des versions
// plus douces, plus cohérentes visuellement.
const osBtn = (color, bg, border) => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  color,
  fontFamily: "inherit",
})

export default function OrdresServiceV({data,m,reload,focusId,focusTs}) {
  const { addToast } = useToast();
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [prestations,setPrestations]=useState([]);
  const [searchOS,setSearchOS]=useState("");
  const [statusFilter,setStatusFilter]=useState("all"); // "all" | un des OS_STATUSES
  const [sortBy,setSortBy]=useState("date_desc");       // date_desc | date_asc | amount_desc | amount_asc
  const [formError,setFormError]=useState("");          // erreur de validation affichée dans la modale
  const [saving,setSaving]=useState(false);
  const [signModal,setSignModal]=useState(null);
  const [signSigners,setSignSigners]=useState({ moe:{name:'',email:''}, moa:{name:'',email:''}, entreprise:{name:'',email:''} });
  const [signSending,setSignSending]=useState(false);
  const [signError,setSignError]=useState("");
  // Import devis par photo
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const devisInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const nextNum = () => {
    const nums = (data.ordresService||[]).map(os => {
      const m = String(os.numero||"").match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `OS-${new Date().getFullYear()}-${String(next).padStart(3,"0")}`;
  };

  const openNew = () => {
    const ch = data.chantiers[0];
    setForm({
      numero: nextNum(), chantier_id: ch?.id||"", chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"",
      client_nom: ch?.client||"", client_adresse: "",
      artisan_nom: "", artisan_specialite: "", artisan_adresse: "", artisan_tel: "", artisan_email: "", artisan_siret: "",
      date_emission: new Date().toISOString().split("T")[0], date_intervention: "", date_fin_prevue: "",
      observations: "", conditions: "Paiement à 30 jours à compter de la réception de la facture.",
      statut: "Brouillon",
    });
    setPrestations([{ description:"", unite:"m²", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
    setFormError("");
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
    setFormError("");
    setModal("edit");
  };

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

  // ─── Import devis par photo (Claude Vision) ──────────────────
  //
  // Resize une image via canvas pour rester sous 1600px de largeur
  // (même pattern que ContactsV pour rester < 5 Mo).
  const resizeImageToBase64 = (file) => {
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
        };
        img.onerror = () => reject(new Error("Image illisible"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("Lecture fichier échouée"));
      reader.readAsDataURL(file);
    });
  };

  // Trouve un contact existant qui matche la société, le nom ou le SIRET
  // extraits. Cela permet de préserver l'ID en base (pas de doublon) et
  // de récupérer les infos supplémentaires (spécialité officielle, etc.).
  const findExistingContact = (extracted) => {
    if (!extracted) return null;
    const contacts = data.contacts || [];
    const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    // Priorité 1 : match exact par SIRET (le plus fiable)
    if (extracted.artisan_siret) {
      const siretClean = String(extracted.artisan_siret).replace(/\s/g, '');
      const byS = contacts.find(c => String(c.siret || '').replace(/\s/g, '') === siretClean);
      if (byS) return byS;
    }
    // Priorité 2 : match par société extraite (vs contact.societe ou contact.nom)
    if (extracted.artisan_societe) {
      const nSoc = norm(extracted.artisan_societe);
      const bySoc = contacts.find(c => norm(c.societe) === nSoc || norm(c.nom) === nSoc);
      if (bySoc) return bySoc;
    }
    // Priorité 3 : match par nom d'interlocuteur
    if (extracted.artisan_nom) {
      const nNom = norm(extracted.artisan_nom);
      const byN = contacts.find(c => norm(c.nom) === nNom);
      if (byN) return byN;
    }
    return null;
  };

  const handleImportDevis = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner la même photo
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setImportError("Ce fichier n'est pas une image.");
      return;
    }

    setImporting(true);
    setImportError("");

    try {
      // 1. Resize + base64
      const { base64, mediaType } = await resizeImageToBase64(file);

      // 2. Auth token Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setImportError("Session expirée, reconnectez-vous.");
        return;
      }

      // 3. Appel extraction
      const res = await fetch('/api/extract-os-data', {
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
        setImportError("Aucune information n'a pu être détectée sur cette image. Essaye une photo plus nette.");
        return;
      }

      // 4. Match avec un contact existant (pour réutiliser les infos fiables)
      const existing = findExistingContact(extracted);

      // 5. Chantier par défaut : le premier (l'user peut changer dans le form)
      const ch = data.chantiers?.[0];

      // 6. Construction du form pré-rempli.
      //    Si un contact existe déjà → on utilise son nom (l'enrichOsForPdf
      //    trouvera sa société au moment de générer le PDF).
      //    Sinon → on privilégie la société extraite comme "nom principal"
      //    pour que la société s'affiche en gros sur le PDF (l'interlocuteur
      //    est perdu dans ce cas, l'user peut l'ajouter manuellement à
      //    l'annuaire après).
      const fallbackName = extracted.artisan_societe || extracted.artisan_nom || "";
      const newForm = {
        numero: nextNum(),
        chantier_id: ch?.id || "",
        chantier: ch?.nom || "",
        adresse_chantier: ch?.adresse || "",
        client_nom: extracted.client_nom || ch?.client || "",
        client_adresse: extracted.client_adresse || "",
        artisan_nom: existing?.nom || fallbackName,
        artisan_specialite: existing?.specialite || extracted.artisan_specialite || "",
        artisan_adresse: existing?.adresse || extracted.artisan_adresse || "",
        artisan_tel: existing?.tel || extracted.artisan_tel || "",
        artisan_email: existing?.email || extracted.artisan_email || "",
        artisan_siret: existing?.siret || extracted.artisan_siret || "",
        date_emission: extracted.date_emission || new Date().toISOString().split("T")[0],
        date_intervention: extracted.date_intervention || "",
        date_fin_prevue: "",
        observations: extracted.observations || "",
        conditions: "Paiement à 30 jours à compter de la réception de la facture.",
        statut: "Brouillon",
      };

      // 7. Prestations → conversion en strings pour les inputs controlled
      const newPrestations = Array.isArray(extracted.prestations) && extracted.prestations.length > 0
        ? extracted.prestations.map(p => ({
            description: String(p.description || ""),
            unite: String(p.unite || "u"),
            quantite: String(p.quantite || ""),
            prix_unitaire: String(p.prix_unitaire || ""),
            tva_taux: String(p.tva_taux || "20"),
          }))
        : [{ description: "", unite: "m²", quantite: "", prix_unitaire: "", tva_taux: "20" }];

      setForm(newForm);
      setPrestations(newPrestations);
      setModal("new");
    } catch (err) {
      setImportError("Erreur : " + (err?.message || String(err)));
    } finally {
      setImporting(false);
    }
  };

  const updateChantier = (chId) => {
    const ch = data.chantiers.find(c=>c.id===chId);
    setForm(f=>({...f, chantier_id: chId, chantier: ch?.nom||"", adresse_chantier: ch?.adresse||"", client_nom: ch?.client||""}));
  };

  const updateDestinataire = (name) => {
    const co = data.contacts.find(c=>c.nom===name);
    if (co) setForm(f=>({...f, artisan_nom:co.nom, artisan_specialite:co.specialite||co.type||"", artisan_adresse:co.adresse||"", artisan_tel:co.tel||"", artisan_email:co.email||"", artisan_siret:co.siret||""}));
    else setForm(f=>({...f, artisan_nom:name}));
  };

  const addPrestation = () => setPrestations(p=>[...p,{ description:"", unite:"u", quantite:"", prix_unitaire:"", tva_taux:"20" }]);
  const removePrestation = (i) => setPrestations(p=>p.filter((_,j)=>j!==i));
  const updatePrestation = (i,field,val) => setPrestations(p=>p.map((x,j)=>j===i?{...x,[field]:val}:x));

  // totals memoïsé : recalculé uniquement quand prestations changent
  const totals = useMemo(() => {
    let ht = 0, tva = 0;
    prestations.forEach(p => {
      const l = (parseFloat(p.quantite) || 0) * (parseFloat(p.prix_unitaire) || 0);
      ht += l;
      tva += l * (parseFloat(p.tva_taux) || 20) / 100;
    });
    return { ht, tva, ttc: ht + tva };
  }, [prestations]);

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
  const enrichOsForPdf = (os) => {
    const ch = data.chantiers.find(c => c.id === os.chantier_id);
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
  };

  const handlePdf = (os) => {
    generateOSPdf(enrichOsForPdf(os));
  };

  const handleExcel = (os) => {
    generateOSExcel(enrichOsForPdf(os));
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer cet ordre de service ?")) return;
    try { await SB.deleteOS(id); reload(); addToast("OS supprimé", "success"); }
    catch (err) { addToast("Erreur : " + (err?.message || "suppression impossible"), "error"); }
  };

  const handleDuplicate = async (os) => {
    try {
      const { id: _id, created_at: _created_at, ...rest } = os;
      await SB.upsertOS({ ...rest, numero: nextNum(), statut: "Brouillon", date_emission: new Date().toISOString().split("T")[0] });
      reload();
      addToast("OS dupliqué en brouillon", "success");
    } catch (err) {
      addToast("Erreur : " + (err?.message || "duplication impossible"), "error");
    }
  };

  const openSignModal = (os) => {
    setSignError("");
    const ch = data.chantiers.find(c => c.id === os.chantier_id);
    // Entreprise (artisan)
    const artisanContact = data.contacts.find(c => (c.nom||"").toLowerCase().trim() === (os.artisan_nom||"").toLowerCase().trim());
    const entrepriseEmail = os.artisan_email || artisanContact?.email || "";
    // MOA (client/maître d'ouvrage)
    const moaContact = data.contacts.find(c => (c.nom||"").toLowerCase().trim() === (os.client_nom||"").toLowerCase().trim());
    const moaEmail = moaContact?.email || "";
    setSignSigners({
      moe:        { name: "Id Maîtrise", email: "contact@id-maitrise.com" },
      moa:        { name: os.client_nom || "", email: moaEmail },
      entreprise: { name: os.artisan_nom || "", email: entrepriseEmail },
    });
    setSignModal({ ...os, ch });
  };

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
      const enriched = enrichOsForPdf(signModal);
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
      setSignModal(null);
      reload();
      alert(`Demande de signature envoyée aux 3 signataires via Odoo Sign !`);
    } catch (err) {
      setSignError(err.message);
    } finally {
      setSignSending(false);
    }
  };

  const handleEmail = (os) => {
    const ch = data.chantiers.find(c=>c.id===os.chantier_id);
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
  };

  // Map chantier_id → chantier : évite les .find() O(N*M) dans les listes
  const chantierById = useMemo(
    () => new Map((data.chantiers || []).map(c => [c.id, c])),
    [data.chantiers]
  );

  // Liste filtrée par recherche + statut, puis triée selon sortBy.
  // Mémoïsée ensemble pour éviter qu'un [...filteredOS].sort() dans le JSX
  // ne crée un nouveau tableau à chaque render.
  const filteredSortedOS = useMemo(() => {
    const s = searchOS.toLowerCase().trim();
    const list = data.ordresService || [];
    let filtered = s
      ? list.filter(os => {
          const ch = chantierById.get(os.chantier_id);
          return (
            String(os.numero).toLowerCase().includes(s) ||
            (ch?.nom || "").toLowerCase().includes(s) ||
            (os.artisan_nom || "").toLowerCase().includes(s) ||
            (os.client_nom || "").toLowerCase().includes(s)
          );
        })
      : list;
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
  }, [searchOS, statusFilter, sortBy, data.ordresService, chantierById]);

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

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700,color:"#0F172A"}}>Ordres de Service</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {countByStatus.all} au total
          {statusFilter !== "all" && <> · <strong>{filteredSortedOS.length}</strong> filtré{filteredSortedOS.length>1?"s":""}</>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",opacity:0.5}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher n°, chantier, client… (tape /)"
            value={searchOS}
            onChange={e=>setSearchOS(e.target.value)}
            style={{padding:"7px 10px 7px 28px",borderRadius:7,border:"1px solid #E2E8F0",fontSize:12,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}
          />
        </div>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} title="Trier" style={{padding:"7px 8px",borderRadius:7,border:"1px solid #E2E8F0",fontSize:12,background:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
          <option value="date_desc">📅 Plus récents</option>
          <option value="date_asc">📅 Plus anciens</option>
          <option value="amount_desc">💰 Montant ↓</option>
          <option value="amount_asc">💰 Montant ↑</option>
        </select>
        <button
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
              <span style={{display:"inline-block",width:12,height:12,border:"2px solid #C7D2FE",borderTopColor:"#4F46E5",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
              Extraction…
            </>
          ) : (
            <>📸 Importer devis</>
          )}
        </button>
        <button onClick={openNew} title="Nouvel OS (raccourci : n)" style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
      </div>
    </div>

    {/* PILLS DE FILTRE PAR STATUT */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,overflowX:m?"auto":"visible",paddingBottom:m?4:0}}>
      {[{key:"all",label:"Tous",color:"#64748B"}, ...OS_STATUSES.map(s=>({key:s,label:s,color:osStatusColor[s]}))].map(p => {
        const active = statusFilter === p.key;
        const count = countByStatus[p.key] || 0;
        return (
          <button key={p.key} onClick={()=>setStatusFilter(p.key)} style={{
            display:"inline-flex",alignItems:"center",gap:6,
            padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
            border:`1px solid ${active ? p.color : "#E2E8F0"}`,
            background:active ? p.color : "#fff",
            color:active ? "#fff" : "#334155",
            cursor:"pointer",fontFamily:"inherit",
            transition:"background .15s, color .15s, border-color .15s",
            whiteSpace:"nowrap",
          }}>
            <span style={{width:7,height:7,borderRadius:"50%",background:active?"#fff":p.color,opacity:active?0.8:1}}/>
            {p.label}
            <span style={{fontSize:10,opacity:0.75,fontWeight:500}}>{count}</span>
          </button>
        );
      })}
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
        <button onClick={()=>setImportError("")} style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontSize:16,padding:0}}>✕</button>
      </div>
    )}

    {/* LISTE DES OS */}
    <div style={{display:"grid",gap:10}}>
      {filteredSortedOS.length===0 ? (
        <div style={{background:"#fff",borderRadius:12,padding:"40px 24px",textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>📋</div>
          {searchOS || statusFilter !== "all" ? (
            <>
              <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
              <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>Essaie d'élargir ta recherche ou de changer de statut.</div>
              <button onClick={()=>{setSearchOS("");setStatusFilter("all");}} style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
            </>
          ) : (
            <>
              <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun ordre de service</div>
              <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>Crée-en un ou importe un devis par photo pour démarrer.</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvel OS</button>
                <button onClick={()=>devisInputRef.current?.click()} style={{...btnS,fontSize:12}}>📸 Importer un devis</button>
              </div>
            </>
          )}
        </div>
      ) : filteredSortedOS.map(os=>{
        const ch = chantierById.get(os.chantier_id);
        const overdue = isOverdue(os);
        return (
          <div key={os.id} style={{
            background:"#fff",borderRadius:12,padding:m?14:16,
            boxShadow:"0 1px 3px rgba(15,23,42,0.06)",
            borderLeft:`4px solid ${osStatusColor[os.statut]||"#94A3B8"}`,
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{background:"#1E3A5F",color:"#fff",borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,letterSpacing:"0.02em"}}>{os.numero}</span>
                  <Badge text={os.statut} color={osStatusColor[os.statut]||"#94A3B8"}/>
                  {overdue && (
                    <span title={`Échéance dépassée : ${fmtDate(os.date_fin_prevue)}`} style={{
                      display:"inline-flex",alignItems:"center",gap:4,
                      background:"#FEF2F2",color:"#DC2626",
                      border:"1px solid #FECACA",borderRadius:999,
                      padding:"2px 8px",fontSize:10,fontWeight:700
                    }}>⚠ En retard</span>
                  )}
                  <span style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>{ch?.nom||"—"}</span>
                </div>
                <div style={{fontSize:12,color:"#64748B"}}>{os.artisan_nom}{os.artisan_specialite ? ` · ${os.artisan_specialite}` : ""} — Client : {os.client_nom}</div>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)} • {(os.prestations||[]).length} prestation(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:"#1E3A5F"}}>{fmtMoney(os.montant_ttc||0)}</div>
                <div style={{fontSize:10,color:"#94A3B8"}}>HT: {fmtMoney(os.montant_ht||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
              {/* Groupe Export */}
              <button onClick={()=>handlePdf(os)} title="Télécharger le PDF" style={osBtn("#DC2626","#FEF2F2","#FECACA")}>📄 PDF</button>
              <button onClick={()=>handleExcel(os)} title="Télécharger l'Excel" style={osBtn("#047857","#ECFDF5","#A7F3D0")}>📊 XLS</button>
              <button onClick={()=>handleEmail(os)} title="Envoyer par email" style={osBtn("#4338CA","#EEF2FF","#C7D2FE")}>✉ Email</button>
              {os.odoo_sign_url ? (
                <a href={os.odoo_sign_url} target="_blank" rel="noreferrer" title={`Signature : ${os.statut_signature||"Envoyé"}`}
                  style={{...osBtn("#6D28D9","#F5F3FF","#DDD6FE"), textDecoration:"none", display:"inline-flex", alignItems:"center"}}>
                  ✍ {os.statut_signature||"Signé"}
                </a>
              ) : (
                <button onClick={()=>openSignModal(os)} title="Envoyer pour signature Odoo" style={osBtn("#6D28D9","#F5F3FF","#DDD6FE")}>✍ Signature</button>
              )}
              <span style={{width:1,background:"#E2E8F0",margin:"2px 4px"}}/>
              <button onClick={()=>handleDuplicate(os)} title="Dupliquer cet OS" style={osBtn("#B45309","#FFFBEB","#FDE68A")}>Dupliquer</button>
              <button onClick={()=>openEdit(os)} title="Modifier" style={osBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>Modifier</button>
              <button onClick={()=>handleDelete(os.id)} title="Supprimer" style={{...osBtn("#DC2626","#fff","#FECACA"),marginLeft:"auto"}}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </div>

    {/* MODAL CRÉATION OS */}
    <Modal open={!!modal} onClose={closeModal} title={modal==="edit"?"Modifier l'Ordre de Service":"Nouvel Ordre de Service"} wide>

      {/* ── IMPORT DEVIS PAR PHOTO (visible uniquement en création) ── */}
      {modal==="new" && (
        <div style={{background:"#EEF2FF",border:"1.5px solid #C7D2FE",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15}}>📸</span>
            <span style={{fontSize:12,fontWeight:700,color:"#4338CA"}}>Import devis par photo ou capture</span>
            <span style={{fontSize:10,color:"#818CF8",width:"100%"}}>Photo d'un devis, facture, bon de commande ou screenshot PDF</span>
          </div>
          <button
            onClick={() => devisInputRef.current?.click()}
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
                <span style={{display:"inline-block",width:12,height:12,border:"2px solid #C7D2FE",borderTopColor:"#4F46E5",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                Extraction en cours…
              </>
            ) : (
              <>📷 Choisir une photo ou capture</>
            )}
          </button>
          {importError && (
            <div style={{marginTop:8,fontSize:11,color:"#DC2626"}}>{importError}</div>
          )}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="N° OS"><input style={inp} value={form.numero||""} onChange={e=>setForm({...form,numero:e.target.value})}/></FF>
        <FF label="Chantier"><select style={sel} value={form.chantier_id||""} onChange={e=>updateChantier(e.target.value)}>{data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}</select></FF>
        <FF label="Statut"><select style={sel} value={form.statut||""} onChange={e=>setForm({...form,statut:e.target.value})}><option>Brouillon</option><option>Émis</option><option>Signé</option><option>En cours</option><option>Terminé</option><option>Annulé</option></select></FF>
      </div>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
        <FF label="Client">{form.client_nom && <div style={{fontSize:13,padding:"8px 0",color:"#0F172A",fontWeight:600}}>{form.client_nom}</div>}</FF>
        <FF label="Destinataire"><select style={sel} value={form.artisan_nom||""} onChange={e=>updateDestinataire(e.target.value)}>
          <option value="">— Sélectionner —</option>
          {Object.entries(contactsParType).map(([type, contacts]) => (
            <optgroup key={type} label={type}>
              {contacts.map(c=><option key={c.id} value={c.nom}>{c.nom}{c.specialite ? ` · ${c.specialite}` : ""}</option>)}
            </optgroup>
          ))}
        </select></FF>
      </div>
      <FF label="Adresse du destinataire">
        <input style={inp} value={form.artisan_adresse||""} onChange={e=>setForm({...form,artisan_adresse:e.target.value})} placeholder="Adresse complète du prestataire"/>
      </FF>
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

      {formError && (
        <div style={{
          background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,
          padding:"8px 12px",marginTop:10,marginBottom:4,fontSize:12,color:"#DC2626",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{fontSize:14}}>⚠</span>
          <span style={{flex:1}}>{formError}</span>
          <button onClick={()=>setFormError("")} aria-label="Fermer" style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",fontSize:14,padding:0,lineHeight:1}}>✕</button>
        </div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={closeModal} style={btnS}>Annuler</button>
        <button onClick={handleSave} disabled={saving} style={{...btnP,opacity:saving?0.6:1}}>{saving?"Enregistrement…":"Enregistrer l'OS"}</button>
      </div>
    </Modal>

    {/* MODAL SIGNATURE ODOO — 3 SIGNATAIRES OBLIGATOIRES */}
    <Modal open={!!signModal} onClose={()=>setSignModal(null)} title="Envoyer pour signature Odoo">
      {signModal && (() => {
        const allFilled = signSigners.moe.email && signSigners.moa.email && signSigners.entreprise.email;
        return (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:"#F5F3FF",borderRadius:8,padding:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#1E3A5F",marginBottom:2}}>OS {signModal.numero}</div>
              <div style={{fontSize:11,color:"#64748B"}}>
                Expéditeur : <strong>Id Maîtrise</strong> — Objet : <em>Signature requise – OS {signModal.numero}{signModal.ch?.nom ? ` – ${signModal.ch.nom}` : ""}</em>
              </div>
            </div>

            {[
              { key:"moe",        label:"MOE — Id Maîtrise",    color:"#1E3A5F" },
              { key:"moa",        label:"Maître d'ouvrage",      color:"#0369A1" },
              { key:"entreprise", label:"Entreprise",            color:"#7C3AED" },
            ].map(({ key, label, color }) => {
              const missing = !signSigners[key].email;
              return (
                <div key={key} style={{background:"#F8FAFC",borderRadius:8,padding:10,border:`1px solid ${missing?"#FCA5A5":"#E2E8F0"}`}}>
                  <div style={{fontSize:11,fontWeight:700,color,marginBottom:6,textTransform:"uppercase",display:"flex",justifyContent:"space-between"}}>
                    <span>{label}</span>
                    {missing && <span style={{color:"#EF4444",fontWeight:400,textTransform:"none"}}>Email requis</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <input placeholder="Nom" style={{...inp,fontSize:12}} value={signSigners[key].name}
                      onChange={e=>setSignSigners(s=>({...s,[key]:{...s[key],name:e.target.value}}))}/>
                    <input placeholder="Email *" style={{...inp,fontSize:12,borderColor:missing?"#EF4444":"#E2E8F0"}}
                      value={signSigners[key].email}
                      onChange={e=>setSignSigners(s=>({...s,[key]:{...s[key],email:e.target.value}}))}/>
                  </div>
                </div>
              );
            })}

            <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:10,fontSize:11,color:"#166534"}}>
              Les 3 signataires recevront chacun un email d'Odoo Sign pour signer le PDF de l'OS.
            </div>

            {signError && <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:10,fontSize:12,color:"#EF4444"}}>{signError}</div>}

            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setSignModal(null)} style={btnS}>Annuler</button>
              <button onClick={handleSendSign} disabled={signSending || !allFilled}
                style={{...btnP,background:"#7C3AED",opacity:(signSending||!allFilled)?0.5:1}}>
                {signSending?"Génération et envoi…":"✍ Envoyer pour signature"}
              </button>
            </div>
          </div>
        );
      })()}
    </Modal>
  </div>);
}
