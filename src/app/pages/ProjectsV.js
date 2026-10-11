'use client'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {
  SB, Icon, I, status, fmtDate, fmtMoney,
  FF, inp, sel, btnP, btnS, btnAdd, btnChip
} from '../dashboards/shared'
import {
  Badge, Modal, AttachmentsSection, CommentsSection, TemplateSelector,
  ProcesVerbalReception, ChantierIntervenants, ChantierPlanning, ChantierBudgetCard, AddressPicker,
} from '../components'
import ChantierCard from '../components/projects/ChantierCard'
import Section from '../components/Section'
import { EMOJI } from '../lib/emoji'
import ProjectsFilterPills from '../components/projects/ProjectsFilterPills'
import ClientAccountField from '../components/projects/ClientAccountField'
import { useAttachments } from '../hooks/useAttachments'
import { useComments } from '../hooks/useComments'
import { useSignaturesSync } from '../hooks/useSignaturesSync'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { computeChantierFinances } from '../lib/chantierFinances'
import { parseNewIntent } from '../lib/navIntent'
import { useSaveTask } from '../hooks/useSaveTask'
import { markDiffused } from '../lib/crDb'
import { loadCrImages } from '../lib/crPhotos'
import { useConformite } from '../hooks/useConformite'
import ChiffrageSection from '../components/chiffrage/ChiffrageSection'
import { useChiffrage } from '../hooks/useChiffrage'
import { lotOptions, suggestLot } from '../lib/chiffrage'
import { nextOsNumero } from '../lib/osNumero'
import { localISO } from '../lib/today'
import { isNetworkError } from '../lib/offlineStore'
// Éditeur de CR et envoi : chargés à l'ouverture seulement
const CREditor = dynamic(() => import('../components/cr/CREditor'), { ssr: false })
const CRSendModal = dynamic(() => import('../components/cr/CRSendModal'), { ssr: false })
// PDF / Excel : générateurs chargés au premier clic (préchargés en arrière-
// plan par la coque, cf. AdminDashboard) — hors du paquet de la page.
const generators = () => import('../generators')

// Libellé d'une action de ligne : icône + texte
const ChipLabel = ({ icon, children }) => (<><Icon d={icon} size={14}/>{children}</>)

export default function ProjectsV({ data, save: _save, m, reload, user, profile, focusId, focusTs, readOnly, active }) {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const saveTask = useSaveTask();
  // Documents des entreprises (équipe uniquement) : pastille dans les intervenants
  const conformite = useConformite({ enabled: !readOnly && active !== false });
  const [modal,setModal]=useState(null);const [form,setForm]=useState({});
  const [selected,setSelected]=useState(null);
  const [detailModal,setDetailModal]=useState(null);
  const [detailForm,setDetailForm]=useState({});
  const [detailSaving,setDetailSaving]=useState(false);
  // Notes internes en cours de saisie : état propre (null = rien de modifié),
  // pour qu'ouvrir une fenêtre OS ou tâche ne les efface pas.
  const [notesDraft,setNotesDraft]=useState(null);
  const [notesSaving,setNotesSaving]=useState(false);
  useEffect(() => { setNotesDraft(null); }, [selected]);
  const [q,setQ]=useState("");
  const [filterStatut,setFilterStatut]=useState("");
  const [filterPhase,setFilterPhase]=useState("");
  const searchInputRef = useRef(null);
  const [taskBusy,setTaskBusy]=useState(null);
  const [duplicating,setDuplicating]=useState(false);
  const [crModal,setCrModal]=useState(null);
  const [sendCr,setSendCr]=useState(null);
  // Chiffrage du chantier ouvert : lots proposés pour un OS
  const { chiffrage: selChiffrage } = useChiffrage(selected, { enabled: !readOnly && !!selected });

  const toggleTask = async (t) => {
    if (taskBusy) return;
    setTaskBusy(t.id);
    try {
      const r = await saveTask({...t,statut:t.statut==="Terminé"?"En attente":"Terminé"}, reload);
      if (r === "queued") addToast("Hors ligne : enregistré sur l'appareil, envoi au retour du réseau", "info");
    } catch (err) {
      addToast(err?.message || "Erreur mise à jour tâche", "error");
    } finally {
      setTaskBusy(null);
    }
  };

  const duplicate = async (ch) => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      await SB.duplicateChantier(ch);
      await reload();
      addToast(`Chantier « ${ch.nom} » dupliqué`, "success");
    } catch (err) {
      addToast(err?.message || "Erreur lors de la duplication", "error");
    } finally {
      setDuplicating(false);
    }
  };

  // Phase 3 Hooks - Replaces 9 useState calls + useEffect
  const { attachments, uploadAttachment, deleteAttachment } = useAttachments('chantier', selected);
  const { comments, addComment, deleteComment } = useComments('chantier', selected, user?.email);

  // Sync silencieuse Odoo → Supabase via le hook partagé (throttle 2 min
  // + coalescence avec OrdresServiceV : une seule requête Odoo si
  // l'utilisateur navigue entre les deux onglets).
  const { sync: syncSignatures } = useSignaturesSync();
  useEffect(() => {
    syncSignatures({ silent: true }).then(updated => {
      if (updated > 0) reload()
    })
  }, [syncSignatures, reload]);

  // Dérivées memoizées : évite de recalculer à chaque frappe dans un input.
  // Recalculées uniquement si data ou selected change.
  const selectedChantier = useMemo(
    () => (selected ? data.chantiers.find(c => c.id === selected) : null),
    [data.chantiers, selected]
  );

  const selectedRelated = useMemo(() => {
    if (!selectedChantier) return null;
    const ch = selectedChantier;
    const chTasks = (data.tasks || []).filter(t => (t.chantierId || t.chantier_id) === ch.id);
    const chOS = (data.ordresService || []).filter(o => o.chantier_id === ch.id);
    const chCR = (data.compteRendus || []).filter(c => (c.chantierId || c.chantier_id) === ch.id && !(readOnly && c.statut === 'Brouillon'));
    const chPlanning = (data.planning || []).filter(p => (p.chantierId || p.chantier_id) === ch.id);
    const artisanNames = [...new Set(chOS.map(o => o.artisan_nom).filter(Boolean))];
    const contactMap = new Map((data.contacts || []).map(c => [c.nom, c]));
    const contactById = new Map((data.contacts || []).map(c => [c.id, c]));
    const clientContact = contactMap.get(ch.client);

    // Intervenants = déduits des OS (artisan_nom) + rattachés manuellement
    // via contact_chantiers (bouton "Ajouter un intervenant"). Les deux
    // sources sont fusionnées et dédupliquées par id de contact ; seuls
    // les rattachements manuels portent un _linkId (permet de les retirer,
    // contrairement aux intervenants auto-déduits des OS).
    const osContacts = artisanNames.map(name => contactMap.get(name)).filter(Boolean);
    const manualLinks = (data.contactChantiers || []).filter(cc => cc.chantier_id === ch.id);
    const seenIntervenantIds = new Set();
    const intervenants = [];
    osContacts.forEach(c => {
      if (seenIntervenantIds.has(c.id)) return;
      seenIntervenantIds.add(c.id);
      intervenants.push({ ...c, _source: 'os' });
    });
    manualLinks.forEach(link => {
      if (seenIntervenantIds.has(link.contact_id)) return;
      const c = contactById.get(link.contact_id);
      if (!c) return;
      seenIntervenantIds.add(c.id);
      intervenants.push({ ...c, _source: 'manuel', _linkId: link.id });
    });

    // Calculs budget ↔ OS : logique métier centralisée dans
    // lib/chantierFinances.js pour que tous les écrans partagent
    // la même définition de "engagé / réalisé / brouillon".
    const finances = computeChantierFinances(ch.budget, chOS);

    return { chTasks, chOS, chCR, chPlanning, intervenants, clientContact, finances };
  }, [selectedChantier, data.tasks, data.ordresService, data.compteRendus, data.planning, data.contacts, data.contactChantiers, readOnly]);

  const chantiersFiltered = useMemo(() => {
    const search = q.toLowerCase().trim();
    return data.chantiers.filter(ch => {
      if (filterStatut && ch.statut !== filterStatut) return false;
      if (filterPhase && ch.phase !== filterPhase) return false;
      if (!search) return true;
      return (
        (ch.nom || "").toLowerCase().includes(search) ||
        (ch.client || "").toLowerCase().includes(search) ||
        (ch.adresse || "").toLowerCase().includes(search)
      );
    });
  }, [data.chantiers, filterStatut, filterPhase, q]);

  // Compteurs (OS/CR/tâches/PJ) pré-calculés par chantier.
  // Avant, chaque carte faisait 4 .filter() O(N) → O(N²) au total.
  // Un seul passage permet de calculer la Map chantier_id → counts.
  // Les PJ proviennent de data.attachmentCountsByChantier (Map remplie
  // par SB.loadSecondary via la RPC `chantier_attachment_counts` — plus
  // aucun transfert des lignes attachments elles-mêmes pour ce compteur).
  const countsByChantier = useMemo(() => {
    const map = new Map()
    const bump = (id, key) => {
      if (!id) return
      const cur = map.get(id) || { os: 0, cr: 0, tasks: 0, attachments: 0 }
      cur[key]++
      map.set(id, cur)
    };
    (data.ordresService || []).forEach(o => bump(o.chantier_id, 'os'));
    (data.compteRendus || []).forEach(c => bump(c.chantierId || c.chantier_id, 'cr'));
    (data.tasks || []).forEach(t => bump(t.chantierId || t.chantier_id, 'tasks'));
    // Counts PJ : Map côté serveur.
    const attCounts = data.attachmentCountsByChantier
    if (attCounts instanceof Map) {
      attCounts.forEach((n, chId) => {
        const cur = map.get(chId) || { os: 0, cr: 0, tasks: 0, attachments: 0 }
        cur.attachments = n
        map.set(chId, cur)
      })
    }
    return map
  }, [data.ordresService, data.compteRendus, data.tasks, data.attachmentCountsByChantier]);

  // Focus depuis la recherche globale : ouvre directement la vue détail
  // du chantier correspondant.
  useEffect(() => {
    if (!focusId) return;
    if (parseNewIntent(focusId)) { if (!readOnly) { setSelected(null); openNew(); } return; }
    const exists = (data.chantiers || []).some(c => c.id === focusId);
    if (exists) setSelected(focusId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs]);

  const openNew=()=>{
    setForm({nom:"",client:"",adresse:"",phase:"Hors d'air",
      statut:"Planifié",budget:"",dateDebut:"",dateFin:"",
      lots:"",photo_couverture:"",notes_internes:"",client_user_id:null});
    setModal("new");
  };
  const [saving,setSaving]=useState(false);
  // Liste « Compte client » choisie à la main pendant cette saisie : sinon,
  // changer le nom du client la remet sur « Automatique ».
  const accountTouchedRef = useRef(false);
  useEffect(() => { if (modal) accountTouchedRef.current = false; }, [modal]);

  // Raccourci clavier « n » pour créer un chantier (hors saisie, hors modale,
  // hors vue détail qui a ses propres actions)
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
      if (modal || detailModal || selected) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, detailModal, selected, readOnly, active]);
  const handleSave=async()=>{
    if(saving) return;
    setSaving(true);
    try {
      const lots = typeof form.lots === "string"
        ? (form.lots||"").split(",").map(l=>l.trim()).filter(Boolean)
        : form.lots||[];
      const e = {...form, budget:Number(form.budget)||0, lots};
      await SB.upsertChantier(e);
      setModal(null);
      reload();
      addToast("Chantier enregistré","success");
    } catch(err) {
      addToast("Erreur : "+err.message,"error");
    } finally { setSaving(false); }
  };
  const handleDelete = useCallback(async (ch) => {
    const ok = await confirm({
      title: `Supprimer le chantier « ${ch.nom} » ?`,
      message: "Le chantier sera supprimé, mais les OS, CR et tâches associés"
        +" ne seront pas effacés. Cette action est irréversible.",
      confirmLabel: "Supprimer le chantier",
      danger: true,
    });
    if (!ok) return;
    try { await SB.deleteChantier(ch.id); setSelected(null); reload(); addToast("Chantier supprimé", "success"); }
    catch (err) { addToast("Erreur : " + (err?.message || "suppression impossible"), "error"); }
  }, [confirm, reload, addToast]);

  // Ouvrir le détail d'un chantier : stable via useCallback pour que
  // ChantierCard (memo) ne re-render pas à chaque frappe dans la recherche.
  const handleOpenChantier = useCallback((ch) => {
    setSelected(ch.id);
    try {
      SB.log('view', 'chantier', ch.id, `Ouverture chantier — ${ch.nom}`,
        { phase: ch.phase || null, statut: ch.statut || null })
    } catch (_) {}
  }, []);

  const handleEditChantier = useCallback((ch) => {
    setForm({
      ...ch,
      lots: ch.lots?.join(", ") || "",
      budget: String(ch.budget || ""),
      dateDebut: ch.date_debut || ch.dateDebut || "",
      dateFin: ch.date_fin || ch.dateFin || "",
      photo_couverture: ch.photo_couverture || "",
      notes_internes: ch.notes_internes || "",
    });
    setModal("edit");
  }, []);

  // Phase 3 Hooks handle loading data automatically - no useEffect needed!

  // If a chantier is selected, show detail view
  if (selected) {
    const ch = selectedChantier;
    if (!ch) { setSelected(null); return null; }

    // Données dérivées memoizées (voir useMemo plus haut)
    const { chTasks, chOS, chCR, chPlanning, intervenants, clientContact, finances } = selectedRelated;

    return (<div>
      {/* Back button + Header */}
      <button onClick={async()=>{
        if (notesDraft !== null && notesDraft !== (ch.notes_internes || "")) {
          const ok = await confirm({
            title: "Notes internes non enregistrées",
            message: "Les modifications des notes internes seront perdues.",
            confirmLabel: "Quitter sans enregistrer",
            danger: true,
          });
          if (!ok) return;
        }
        setSelected(null);
      }} style={{
        background:"none",border:"none",cursor:"pointer",
        display:"flex",alignItems:"center",gap:6,
        color:"#0066CC",fontSize:13,fontWeight:600,
        marginBottom:16,fontFamily:"inherit",padding:0
      }}>
        ← Retour aux chantiers
      </button>

      {/* Photo de couverture */}
      {ch.photo_couverture && (
        <div style={{borderRadius:12,overflow:"hidden",marginBottom:16,height:180,position:"relative"}}>
          <Image src={ch.photo_couverture} alt={ch.nom}
            fill sizes="(max-width: 768px) 100vw, 960px" priority
            style={{objectFit:"cover"}}/>
          <div style={{
            position:"absolute",inset:0,
            background:"linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)"
          }}/>
          <div aria-hidden="true" style={{
            position:"absolute",bottom:16,left:20,margin:0,
            fontSize:m?20:26,fontWeight:700,color:"#fff",
            textShadow:"0 2px 8px rgba(0,0,0,0.4)"
          }}>{ch.nom}</div>
        </div>
      )}

      {/* Chantier Header Card */}
      <div style={{
        background:"#fff",borderRadius:12,padding:m?16:24,
        border:"1px solid #E5E5EA",
        boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
        marginBottom:24
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              <h1 style={{margin:0,fontSize:m?20:26,fontWeight:700,color:"#1C1C1E"}}>{ch.nom}</h1>
              <Badge text={ch.phase} color="#6E6E73"/>
              <Badge text={ch.statut} color={status[ch.statut]||"#6E6E73"}/>
            </div>
            <div style={{fontSize:14,color:"#6E6E73",marginBottom:2}}>{ch.client}</div>
            <div style={{fontSize:13,color:"#6E6E73"}}>{ch.adresse}</div>
            <div style={{fontSize:12,color:"#6E6E73",marginTop:4}}>
              Du {fmtDate(ch.date_debut||ch.dateDebut)} au {fmtDate(ch.date_fin||ch.dateFin)}
            </div>
            {ch.lots?.length>0 && (
              <div style={{fontSize:12,color:"#6E6E73",marginTop:4}}>
                Lots : {ch.lots.join(", ")}
              </div>
            )}
          </div>
          {!readOnly && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button
              onClick={()=>duplicate(ch)} disabled={duplicating}
              className="u-btn" style={{...btnChip,opacity:duplicating?0.6:1}}>
              {duplicating?"Duplication…":"Dupliquer"}</button>
            <button onClick={()=>{
              setForm({...ch,
                lots:ch.lots?.join(", ")||"",
                budget:String(ch.budget||""),
                dateDebut:ch.date_debut||ch.dateDebut||"",
                dateFin:ch.date_fin||ch.dateFin||""
              });setModal("edit");
            }} className="u-btn" style={btnChip}><ChipLabel icon={I.edit}>Modifier</ChipLabel></button>
          </div>}
        </div>
        {/* Budget + gauge — composant dédié, consomme `finances` calculé via lib/chantierFinances */}
        <ChantierBudgetCard finances={finances} m={m} />
      </div>

      {/* Chiffrage estimatif (DPGF) ↔ OS par lot — équipe uniquement */}
      {!readOnly && <ChiffrageSection
        chantier={ch} os={chOS} allOs={data.ordresService || []} user={user} m={m}
        onApplyToChantier={async ({ budget, lots }) => { await SB.upsertChantier({ ...ch, budget, lots }); await reload(); }}
      />}

      {/* ATTACHMENTS - Using Phase 3 Hook */}
      <AttachmentsSection
        attachments={attachments}
        onUpload={uploadAttachment}
        onDelete={deleteAttachment}
      />

      {/* ORDRES DE SERVICE */}
      <Section title="Ordres de service" count={chOS.length} emoji={EMOJI.os}>
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <button onClick={()=>{
            setDetailForm({
              numero:nextOsNumero(data.ordresService),chantier_id:ch.id,
              date_emission:localISO(),
              statut:"Brouillon",montant_ttc:0
            });setDetailModal("newOS");
          }} className="u-btn" style={btnAdd}><Icon d={I.plus} size={16}/>Nouvel OS</button>
          <button onClick={()=>setDetailModal("useTemplate")} className="u-btn" style={btnAdd}>
            <Icon d={I.copy} size={16}/>Depuis un modèle</button>
        </div>}
        {chOS.length===0 ? <p style={{color:"#6E6E73",fontSize:12}}>Aucun OS pour ce chantier</p> :
          chOS.map(os=>(
            // Sur mobile : colonne (titre au-dessus, boutons en dessous)
            // Sur desktop : ligne (titre à gauche, boutons à droite)
            <div key={os.id} style={{
              background:"#fff",borderRadius:10,padding:12,marginBottom:8,
              border:"1px solid #E5E5EA",
              display:"flex",flexDirection:m?"column":"row",
              justifyContent:"space-between",
              alignItems:m?"stretch":"flex-start",
              gap:8,minWidth:0,overflow:"hidden"
            }}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#1C1C1E",whiteSpace:"nowrap"}}>{os.numero}</span>
                  <Badge text={os.statut||"Brouillon"} color={{
                    "Brouillon":"#8E8E93","Émis":"#007AFF","Signé":"#AF52DE",
                    "En cours":"#FF9500","Terminé":"#34C759","Annulé":"#FF3B30"
                  }[os.statut]||"#8E8E93"}/>
                </div>
                <div style={{
                  fontSize:12,color:"#6E6E73",overflow:"hidden",
                  textOverflow:"ellipsis",whiteSpace:"nowrap"
                }}>
                  {os.artisan_nom} • {(os.prestations||[]).length} prestation(s) • {fmtDate(os.date_emission)}
                </div>
                <div style={{
                  fontSize:16,fontWeight:700,color:"#1C1C1E",marginTop:4
                }}>{fmtMoney(os.montant_ttc||0)}</div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button title="Télécharger le PDF" className="u-btn" style={btnChip}
                  onClick={async()=>(await generators()).generateOSPdf({...os,chantier:ch.nom,adresse_chantier:ch.adresse})}><ChipLabel icon={I.download}>PDF</ChipLabel></button>
                <button title="Télécharger le fichier Excel" className="u-btn" style={btnChip}
                  onClick={async()=>(await generators()).generateOSExcel({...os,chantier:ch.nom,adresse_chantier:ch.adresse})}><ChipLabel icon={I.sheet}>Excel</ChipLabel></button>
                {!readOnly && <>
                  <button onClick={async()=>{
                    try{
                      await SB.saveTemplate('os',
                        `Template ${os.artisan_nom}`,
                        `Template d'OS pour ${os.artisan_nom}`,{...os});
                      addToast("Modèle créé","success");
                    }catch(err){
                      addToast("Erreur : "+(err?.message||"template"),"error");
                    }
                  }} title="Créer un modèle d'OS à partir de celui-ci"
                  className="u-btn" style={btnChip}><ChipLabel icon={I.copy}>Modèle</ChipLabel></button>
                  <button onClick={()=>{setDetailForm(os);setDetailModal("editOS");}}
                    title="Modifier l'OS"
                    className="u-btn" style={btnChip}><ChipLabel icon={I.edit}>Modifier</ChipLabel></button>
                </>}
              </div>
            </div>
          ))
        }
      </Section>

      {/* COMPTES RENDUS */}
      <Section title="Comptes rendus" count={chCR.length} emoji={EMOJI.cr}>
        {!readOnly && <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>setCrModal({ initial: { chantierId: ch.id } })} className="u-btn" style={btnAdd}>
            <Icon d={I.plus} size={16}/>Nouveau CR</button>
        </div>}
        {chCR.length===0 ? <p style={{color:"#6E6E73",fontSize:12}}>Aucun CR pour ce chantier</p> :
          chCR.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(cr=>(
            <div key={cr.id} style={{
              background:"#fff",borderRadius:10,padding:12,marginBottom:8,
              border:"1px solid #E5E5EA",
              display:"flex",flexDirection:m?"column":"row",
              justifyContent:"space-between",
              alignItems:m?"stretch":"flex-start",
              gap:8,minWidth:0,overflow:"hidden"
            }}>
              <div style={{flex:"1 1 0",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#1C1C1E",whiteSpace:"nowrap"}}>CR n°{cr.numero}</span>
                  <span style={{fontSize:12,color:"#6E6E73"}}>{fmtDate(cr.date)}</span>
                  {cr.statut === 'Brouillon' && <Badge text="Brouillon" color="#FF9500"/>}
                </div>
                <div style={{fontSize:12,color:"#3A3A3C",lineHeight:1.5}}>
                  {(cr.resume||"").substring(0,100)}{(cr.resume||"").length>100?"...":""}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0,flexWrap:"wrap",justifyContent:m?"flex-start":"flex-end"}}>
                <button onClick={async()=>(await generators()).generateCRPdf(cr,ch,{ images: await loadCrImages(cr) })} title="Télécharger le PDF"
                  className="u-btn" style={btnChip}><ChipLabel icon={I.download}>PDF</ChipLabel></button>
                <button onClick={async()=>(await generators()).generateCRExcel(cr,ch)} title="Télécharger le fichier Excel"
                  className="u-btn" style={btnChip}><ChipLabel icon={I.sheet}>Excel</ChipLabel></button>
                {!readOnly && (
                  <button onClick={()=>setSendCr(cr)} title="Envoyer le CR et la convocation par mail"
                    className="u-btn" style={btnChip}><ChipLabel icon={I.send}>Envoyer</ChipLabel></button>
                )}
                {!readOnly && (
                  <button onClick={()=>setCrModal({ initial: { ...cr, chantierId: ch.id } })}
                    title="Modifier le CR" className="u-btn" style={btnChip}>
                    <ChipLabel icon={I.edit}>Modifier</ChipLabel>
                  </button>
                )}
              </div>
            </div>
          ))
        }
      </Section>

      {/* PROCÈS-VERBAUX DE RÉCEPTION — juste avant les tâches, comme OS/CR */}
      {selectedChantier && selectedRelated && (
        <ProcesVerbalReception
          chantierId={selectedChantier.id}
          chantier={selectedChantier}
          ordresService={selectedRelated.chOS || []}
          intervenants={selectedRelated.intervenants || []}
          clientContact={selectedRelated.clientContact}
          onRefresh={reload}
          readOnly={readOnly}
        />
      )}

      {/* TÂCHES — clients autorisés à créer/modifier leurs tâches */}
      <Section title="Tâches" count={chTasks.length} emoji={EMOJI.taches}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <button onClick={()=>{
            setDetailForm({chantierId:ch.id,titre:"",lot:"",
              statut:"En attente",priorite:"En attente",
              echeance:localISO()
            });setDetailModal("newTask");
          }} className="u-btn" style={btnAdd}><Icon d={I.plus} size={16}/>Nouvelle tâche</button>
        </div>
        {chTasks.length===0 ? <p style={{color:"#6E6E73",fontSize:12}}>Aucune tâche pour ce chantier</p> :
          chTasks.map(t=>(
            <div key={t.id} style={{
              display:"flex",alignItems:"center",gap:10,
              background:"#fff",borderRadius:10,padding:"10px 12px",
              marginBottom:6,border:"1px solid #E5E5EA"
            }}>
              <button
                onClick={()=>toggleTask(t)} disabled={taskBusy===t.id}
                aria-label={t.statut==="Terminé"?`Marquer « ${t.titre} » comme non terminée`:`Marquer « ${t.titre} » comme terminée`}
                aria-pressed={t.statut==="Terminé"}
                style={{
                  width:20,height:20,minWidth:20,minHeight:20,
                  borderRadius:"50%",
                  border:`2px solid ${t.statut==="Terminé"?"#34C759":"#8E8E93"}`,
                  background:t.statut==="Terminé"?"#34C759":"transparent",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,cursor:"pointer",padding:0,
                  boxSizing:"border-box",appearance:"none",WebkitAppearance:"none"
                }}>
                {t.statut==="Terminé" && <Icon d={I.check} size={10} color="#fff"/>}
              </button>
              <div style={{flex:1,opacity:t.statut==="Terminé"?0.5:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#1C1C1E"}}>{t.titre}</div>
                <div style={{fontSize:12,color:"#6E6E73"}}>
                  {[t.entreprise, t.lot, fmtDate(t.echeance)].filter(Boolean).join(" • ")}
                  {t.nb_rappels > 0 && t.statut !== "Terminé" && (
                    <span style={{color:"#D70015",fontWeight:600}}> • {EMOJI.rappel} {t.nb_rappels} rappel{t.nb_rappels>1?"s":""}</span>
                  )}
                </div>
              </div>
              <Badge text={t.priorite} color={status[t.priorite]||"#6E6E73"}/>
              <button onClick={()=>{setDetailForm(t);setDetailModal("editTask");}}
                aria-label={`Modifier la tâche « ${t.titre} »`}
                className="u-icon-btn"
                style={{width:36,height:36,borderRadius:8,color:"#48484A",flexShrink:0}}>
                <Icon d={I.edit} size={16}/></button>
            </div>
          ))
        }
      </Section>

      {/* INTERVENANTS + PLANNING — composants dédiés */}
      <ChantierIntervenants
        intervenants={intervenants}
        clientContact={clientContact}
        chantierId={ch.id}
        allContacts={data.contacts || []}
        onChange={reload}
        readOnly={readOnly}
        conformite={readOnly || conformite.missingMigration ? null : conformite}
      />
      <ChantierPlanning items={chPlanning} />

      {/* NOTES INTERNES — cachées pour les clients (comme le placeholder l'indique) */}
      {!readOnly && <Section title="Notes internes" emoji={EMOJI.notes}>
        <div style={{background:"#fff",border:"1px solid #E5E5EA",borderRadius:10,padding:14}}>
          <textarea
            value={notesDraft ?? ch.notes_internes ?? ""}
            onChange={e=>setNotesDraft(e.target.value)}
            aria-label="Notes internes"
            placeholder="Notes internes (non visibles par le client)..."
            style={{
              width:"100%",minHeight:80,border:"none",
              background:"transparent",fontSize:13,fontFamily:"inherit",
              resize:"vertical",outline:"none",
              color:"#3A3A3C",boxSizing:"border-box"
            }}
          />
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <button disabled={notesDraft===null||notesSaving} onClick={async()=>{
              if (notesDraft===null||notesSaving) return;
              setNotesSaving(true);
              try {
                await SB.upsertChantier({...ch,notes_internes:notesDraft});
                setNotesDraft(null);
                reload();
                addToast("Notes enregistrées","success");
              } catch (err) {
                addToast(isNetworkError(err)
                  ? "Pas de réseau : notes non enregistrées. Elles restent dans le champ, réessayez au retour de la connexion."
                  : "Notes non enregistrées : "+(err?.message||"erreur inconnue"),"error");
              } finally { setNotesSaving(false); }
            }} style={{...btnP,
              cursor:notesDraft===null||notesSaving?"default":"pointer",
              opacity:notesDraft===null||notesSaving?0.5:1}}>{notesSaving?"Enregistrement…":"Enregistrer"}</button>
          </div>
        </div>
      </Section>}

      {/* COMMENTAIRES - Using Phase 2 Component + Phase 3 Hook */}
      <CommentsSection
        comments={comments}
        onAddComment={addComment}
        onDeleteComment={deleteComment}
        currentUser={user}
        userRole={profile?.role}
      />

      {/* MODALES POUR OS/CR/TÂCHES */}
      <Modal
        open={detailModal==="newOS"||detailModal==="editOS"}
        onClose={()=>setDetailModal(null)}
        title={detailModal==="newOS"?"Nouvel Ordre de Service":"Modifier l'OS"}
      >
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="N° OS">
            <input style={inp} value={detailForm.numero||""}
              onChange={e=>setDetailForm({...detailForm,numero:e.target.value})}/>
          </FF>
          <FF label="Artisan">
            <select style={sel} value={detailForm.artisan_nom||""}
              onChange={e=>{
                const a=data.contacts.find(c=>c.nom===e.target.value);
                const lot=!detailForm.lot&&a?suggestLot(a.specialite,lotOptions(selChiffrage,ch)):null;
                setDetailForm({...detailForm,artisan_nom:e.target.value,
                  ...(a?{artisan_specialite:a.specialite||detailForm.artisan_specialite||""}:{}),
                  ...(lot?{lot}:{})});
              }}>
              <option value="">— Sélectionner —</option>
              {data.contacts.filter(c=>c.type==="Artisan").map(a=>(
                <option key={a.id} value={a.nom}>{a.nom}</option>
              ))}
            </select>
          </FF>
          {lotOptions(selChiffrage,ch).length>0 && <FF label="Lot">
            <select style={sel} value={detailForm.lot||""}
              onChange={e=>setDetailForm({...detailForm,lot:e.target.value})}>
              <option value="">— Aucun —</option>
              {[...new Set([detailForm.lot,...lotOptions(selChiffrage,ch)].filter(Boolean))].map(l=>(
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </FF>}
          <FF label="Date émission">
            <input type="date" style={inp} value={detailForm.date_emission||""}
              onChange={e=>setDetailForm({...detailForm,date_emission:e.target.value})}/>
          </FF>
          <FF label="Montant TTC €">
            <input type="number" style={inp} value={detailForm.montant_ttc||""}
              onChange={e=>setDetailForm({...detailForm,montant_ttc:Number(e.target.value)})}/>
          </FF>
          <FF label="Statut">
            <select style={sel} value={detailForm.statut||"Brouillon"}
              onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}>
              <option>Brouillon</option><option>Émis</option>
              <option>Signé</option><option>En cours</option><option>Terminé</option>
            </select>
          </FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button>
          <button disabled={detailSaving} onClick={async()=>{
            if (detailSaving) return;
            setDetailSaving(true);
            try {
              await SB.upsertOS({...detailForm,chantier_id:ch.id});
              setDetailModal(null);reload();
              addToast(detailModal==="newOS"?"OS créé":"OS enregistré","success");
            } catch (err) {
              addToast(isNetworkError(err)
                ? "Pas de réseau : l'OS n'a pas été enregistré. Réessayez au retour de la connexion."
                : "OS non enregistré : "+(err?.message||"erreur inconnue"),"error");
            } finally { setDetailSaving(false); }
          }} style={{...btnP,opacity:detailSaving?0.6:1}}>{detailSaving?"Enregistrement…":"Enregistrer"}</button>
        </div>
      </Modal>

      {crModal && <CREditor open={!!crModal} initial={crModal?.initial} data={data} m={m} lockChantier
        onClose={()=>setCrModal(null)}
        onSaved={async (cr, { send }) => { setCrModal(null); await reload(); if (send) setSendCr(cr); }} />}
      {sendCr && <CRSendModal cr={sendCr} chantier={ch} onClose={()=>setSendCr(null)}
        onSent={async (cr) => {
          if (cr?.id && cr.statut !== 'Diffusé') {
            const ok = await markDiffused(cr.id);
            if (!ok) addToast("CR envoyé, mais son statut n'a pas pu passer à « Diffusé »", "warning");
            reload();
          }
        }} />}

      <Modal
        open={detailModal==="newTask"||detailModal==="editTask"}
        onClose={()=>setDetailModal(null)}
        title={detailModal==="newTask"?"Nouvelle tâche":"Modifier la tâche"}
      >
        <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 12px"}}>
          <FF label="Titre">
            <input style={inp} value={detailForm.titre||""}
              onChange={e=>setDetailForm({...detailForm,titre:e.target.value})}/>
          </FF>
          <FF label="Lot">
            <input style={inp} value={detailForm.lot||""}
              onChange={e=>setDetailForm({...detailForm,lot:e.target.value})}/>
          </FF>
          <FF label="Échéance">
            <input type="date" style={inp} value={detailForm.echeance||""}
              onChange={e=>setDetailForm({...detailForm,echeance:e.target.value})}/>
          </FF>
          <FF label="Priorité">
            <select style={sel} value={detailForm.priorite||"En attente"}
              onChange={e=>setDetailForm({...detailForm,priorite:e.target.value})}>
              <option>Urgent</option><option>En cours</option><option>En attente</option>
            </select>
          </FF>
          <FF label="Statut">
            <select style={sel} value={detailForm.statut||"En attente"}
              onChange={e=>setDetailForm({...detailForm,statut:e.target.value})}>
              <option>En attente</option><option>En cours</option><option>Terminé</option>
            </select>
          </FF>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <button onClick={()=>setDetailModal(null)} style={btnS}>Annuler</button>
          <button disabled={detailSaving} onClick={async()=>{
            if (detailSaving) return;
            setDetailSaving(true);
            try {
              const r = await saveTask({...detailForm,chantierId:ch.id}, reload);
              setDetailModal(null);
              addToast(r==="queued"
                ? "Hors ligne : enregistré sur l'appareil, envoi au retour du réseau"
                : detailModal==="newTask"?"Tâche créée":"Tâche enregistrée", r==="queued"?"info":"success");
            } catch (err) {
              addToast(isNetworkError(err)
                ? "Pas de réseau : la tâche n'a pas été enregistrée. Réessayez au retour de la connexion."
                : "Tâche non enregistrée : "+(err?.message||"erreur inconnue"),"error");
            } finally { setDetailSaving(false); }
          }} style={{...btnP,opacity:detailSaving?0.6:1}}>{detailSaving?"Enregistrement…":"Enregistrer"}</button>
        </div>
      </Modal>

      <Modal open={detailModal==="useTemplate"} onClose={()=>setDetailModal(null)} title="Utiliser un template d'OS">
        <TemplateSelector chOS={chOS} setDetailForm={setDetailForm} setDetailModal={setDetailModal} ch={ch} />
      </Modal>
    </div>);
  }

  // ─── LIST VIEW (default) ───
  // chantiersFiltered est memoizé en haut du composant

  const hasFilters = !!(q || filterStatut || filterPhase);
  return (<div>
    <div style={{
      display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?28:32,fontWeight:700,letterSpacing:"-0.02em",color:"#1C1C1E"}}>Chantiers</h1>
        <div style={{fontSize:11,color:"#6E6E73",marginTop:2}}>
          {data.chantiers.length} au total
          {hasFilters && <>
            {" "}· <strong>{chantiersFiltered.length}</strong>{" "}
            affiché{chantiersFiltered.length>1?"s":""}
          </>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{
            position:"absolute",left:9,top:"50%",
            transform:"translateY(-50%)",opacity:0.5
          }} width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="#6E6E73" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher nom, client, adresse… (tape /)"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{
              padding:"7px 10px 7px 28px",borderRadius:7,
              border:"1px solid #E5E5EA",fontSize:12,
              width:"100%",boxSizing:"border-box",fontFamily:"inherit"
            }}
          />
        </div>
        {!readOnly && <button onClick={openNew}
          title="Nouveau chantier (raccourci : n)"
          style={{...btnP,fontSize:12,display:"inline-flex",alignItems:"center",gap:4}}>
          <Icon d={I.plus} size={14} color="#fff"/> Nouveau
        </button>}
      </div>
    </div>
    {/* Pills de filtre (statut + phase). Masqué en vue client. */}
    {!readOnly && (
      <ProjectsFilterPills
        filterStatut={filterStatut}
        filterPhase={filterPhase}
        onStatut={setFilterStatut}
        onPhase={setFilterPhase}
        m={m}
      />
    )}
    {chantiersFiltered.length === 0 ? (
      <div style={{
        background:"#fff",borderRadius:12,padding:"40px 24px",
        textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
      }}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>🏗️</div>
        {hasFilters ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#3A3A3C",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#6E6E73",marginBottom:14}}>
              Essaie d'élargir ta recherche ou de changer les filtres.
            </div>
            <button
              onClick={()=>{setQ("");setFilterStatut("");setFilterPhase("");}}
              style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
          </>
        ) : (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#3A3A3C",marginBottom:4}}>Aucun chantier</div>
            <div style={{fontSize:12,color:"#6E6E73",marginBottom:14}}>Démarre en créant ton premier chantier.</div>
            <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouveau chantier</button>
          </>
        )}
      </div>
    ) : (
    <div style={{display:"grid",gap:12}}>
      {chantiersFiltered.map(ch => (
        <ChantierCard
          key={ch.id}
          ch={ch}
          counts={countsByChantier.get(ch.id) || { os: 0, cr: 0, tasks: 0, attachments: 0 }}
          m={m}
          readOnly={readOnly}
          onOpen={handleOpenChantier}
          onEdit={handleEditChantier}
          onDelete={handleDelete}
        />
      ))}
    </div>
    )}
    <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==="new"?"Nouveau chantier":"Modifier"}>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr",gap:"0 14px"}}>
        <FF label="Nom">
          <input style={inp} value={form.nom||""}
            onChange={e=>setForm({...form,nom:e.target.value})}/>
        </FF>
        <FF label="Client">
          <input style={inp} value={form.client||""}
            onChange={e=>setForm({...form,client:e.target.value,
              ...(accountTouchedRef.current ? {} : {client_user_id:null})})}/>
        </FF>
        {!readOnly && <ClientAccountField value={form.client_user_id}
          onChange={v=>{accountTouchedRef.current=true;setForm(f=>({...f,client_user_id:v}));}}/>}
        <FF label="Adresse">
          <AddressPicker value={form.adresse||""}
            onChange={v=>setForm(f=>({...f,adresse:v}))}/>
        </FF>
        <FF label="Phase">
          <select style={sel} value={form.phase||""}
            onChange={e=>setForm({...form,phase:e.target.value})}>
            <option>Hors d'air</option><option>Technique</option>
            <option>Finitions</option><option>Avant-projet</option>
            <option>Études</option><option>Gros œuvre</option>
          </select>
        </FF>
        <FF label="Statut">
          <select style={sel} value={form.statut||""}
            onChange={e=>setForm({...form,statut:e.target.value})}>
            <option>Planifié</option><option>En cours</option>
            <option>En attente</option><option>Terminé</option>
          </select>
        </FF>
        <FF label="Budget €"
          hint="Les dépenses sont calculées automatiquement depuis les OS du chantier">
          <input type="number" style={inp} value={form.budget||""}
            onChange={e=>setForm({...form,budget:e.target.value})}/>
        </FF>
        <FF label="Début">
          <input type="date" style={inp} value={form.dateDebut||""}
            onChange={e=>setForm({...form,dateDebut:e.target.value})}/>
        </FF>
        <FF label="Fin">
          <input type="date" style={inp} value={form.dateFin||""}
            onChange={e=>setForm({...form,dateFin:e.target.value})}/>
        </FF>
        <FF label="Lots (virgules)">
          <input style={inp} value={form.lots||""}
            onChange={e=>setForm({...form,lots:e.target.value})}/>
        </FF>
        <FF label="Photo de couverture (URL)" style={{gridColumn:"1 / -1"}}>
          <input style={inp} value={form.photo_couverture||""}
            onChange={e=>setForm({...form,photo_couverture:e.target.value})}
            placeholder="https://... ou laisser vide"/>
        </FF>
      </div>
      <FF label="Notes internes">
        <textarea style={{...inp,minHeight:60,resize:"vertical"}}
          value={form.notes_internes||""}
          onChange={e=>setForm({...form,notes_internes:e.target.value})}
          placeholder="Remarques internes (non visibles par le client)..."/>
      </FF>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
        <button onClick={()=>setModal(null)} style={btnS}>Annuler</button>
        <button onClick={handleSave} disabled={saving}
          style={{...btnP,opacity:saving?0.7:1}}>
          {saving?"⏳ Enregistrement…":"Enregistrer"}
        </button>
      </div>
    </Modal>
  </div>);
}

// Style partagé pour les pills de filtre (statut / phase)
