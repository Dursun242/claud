'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SB, Icon, I, status, fmtDate, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'

// Ordre de priorité canonique (pour le tri)
const PRIORITY_ORDER = { Urgent: 0, "En cours": 1, "En attente": 2 }
const TASK_STATUSES = ["Planifié", "En cours", "Terminé"]

export default function TasksV({ data, save: _save, m, reload, focusId, focusTs }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")
  const [formError, setFormError] = useState("")
  const searchInputRef = useRef(null)

  // Delete avec undo : cache l'item pendant 5s puis commit si pas d'annulation
  const { pendingIds: pendingDeleteIds, scheduleDelete } = useUndoableDelete({
    label: 'Tâche',
    onConfirmDelete: async (task) => {
      await SB.deleteTask(task.id)
      reload()
    },
  })

  // Liste filtrée + triée par priorité puis échéance, mémoïsée.
  // Exclut les tâches en cours de suppression (undo window ouverte).
  const todayISO = new Date().toISOString().split("T")[0]
  const filteredTasks = useMemo(() => {
    const search = q.toLowerCase().trim()
    let list = (data.tasks || []).filter(t => !pendingDeleteIds.has(t.id))
    if (filter !== "all") list = list.filter(t => t.statut === filter)
    if (search) {
      list = list.filter(t => {
        const ch = data.chantiers.find(c => c.id === t.chantierId)
        return (
          (t.titre || "").toLowerCase().includes(search) ||
          (t.lot || "").toLowerCase().includes(search) ||
          (ch?.nom || "").toLowerCase().includes(search)
        )
      })
    }
    return [...list].sort((a, b) => {
      // Les tâches terminées toujours en bas
      if ((a.statut === "Terminé") !== (b.statut === "Terminé"))
        return a.statut === "Terminé" ? 1 : -1
      const pa = PRIORITY_ORDER[a.priorite] ?? 9
      const pb = PRIORITY_ORDER[b.priorite] ?? 9
      if (pa !== pb) return pa - pb
      return new Date(a.echeance || "9999") - new Date(b.echeance || "9999")
    })
  }, [data.tasks, data.chantiers, filter, q, pendingDeleteIds])

  // Compteurs par statut (pour les pills)
  const countByStatus = useMemo(() => {
    const acc = { all: (data.tasks || []).length }
    TASK_STATUSES.forEach(s => { acc[s] = 0 })
    ;(data.tasks || []).forEach(t => { if (acc[t.statut] != null) acc[t.statut]++ })
    return acc
  }, [data.tasks])

  const openNew = () => {
    setForm({
      chantierId: data.chantiers[0]?.id || "", titre: "",
      priorite: "En cours", statut: "Planifié", echeance: "", lot: ""
    })
    setFormError("")
    setModal("new")
  }
  const openEdit = (t) => { setForm(t); setFormError(""); setModal("edit") }
  const closeModal = () => { setModal(null); setFormError("") }

  // Raccourci clavier « n » pour créer une tâche
  const openNewRef = useRef(null)
  useEffect(() => { openNewRef.current = openNew })
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      if (modal) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal])

  const handleSave = async () => {
    setFormError("")
    if (!form.titre?.trim()) { setFormError("Le titre est requis."); return }
    if (!form.chantierId) { setFormError("Sélectionne un chantier."); return }
    try {
      await SB.upsertTask(form)
      setModal(null)
      reload()
      addToast(modal === "edit" ? "Tâche mise à jour" : "Tâche créée", "success")
    } catch (err) {
      setFormError(err?.message || "Erreur lors de l'enregistrement.")
    }
  }

  // Focus depuis la recherche globale : ouvre la modale d'édition de la
  // tâche correspondante, et retire le filtre pour qu'elle soit visible
  // en fond derrière la modale.
  useEffect(() => {
    if (!focusId) return
    const task = (data.tasks || []).find(t => t.id === focusId)
    if (task) { setFilter("all"); setForm(task); setFormError(""); setModal("edit") }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs])

  const toggle = async (t) => {
    const cy = ["Planifié", "En cours", "Terminé"]
    const idx = cy.indexOf(t.statut)
    const next = cy[(idx < 0 ? 0 : idx + 1) % 3]
    try {
      await SB.upsertTask({ ...t, statut: next })
      reload()
      if (next === "Terminé") addToast("Tâche terminée ✓", "success")
    } catch (err) {
      addToast("Erreur : " + (err?.message || "mise à jour impossible"), "error")
    }
  }
  const handleDelete = async (t) => {
    const ok = await confirm({
      title: `Supprimer la tâche « ${t.titre} » ?`,
      message: "Tu pourras annuler cette suppression pendant 5 secondes.",
      confirmLabel: "Supprimer",
      danger: true,
    })
    if (!ok) return
    scheduleDelete(t, { itemLabel: `Tâche « ${t.titre} »` })
  }

  const hasFilters = !!(q || filter !== "all")
  const isOverdue = (t) => t.echeance && t.echeance < todayISO && t.statut !== "Terminé"

  return (<div>
    <div style={{
      display:"flex",justifyContent:"space-between",alignItems:"center",
      marginBottom:12,flexWrap:"wrap",gap:8
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Tâches</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {countByStatus.all} au total
          {hasFilters && <> · <strong>{filteredTasks.length}</strong> affichée{filteredTasks.length>1?"s":""}</>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":240}}>
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
            placeholder="Rechercher titre, lot, chantier… (tape /)"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{
              padding:"7px 10px 7px 28px",borderRadius:7,
              border:"1px solid #E2E8F0",fontSize:12,width:"100%",
              boxSizing:"border-box",fontFamily:"inherit"
            }}
          />
        </div>
        <button onClick={openNew} title="Nouvelle tâche (raccourci : n)"
          style={{...btnP,fontSize:12,padding:"8px 14px"}}>+ Tâche</button>
      </div>
    </div>

    {/* Pills de filtre par statut */}
    <div style={{
      display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",
      overflowX:m?"auto":"visible",paddingBottom:m?4:0
    }}>
      {[{k:"all",l:"Toutes",c:"#64748B"},
        {k:"En cours",l:"En cours",c:status["En cours"]||"#3B82F6"},
        {k:"Planifié",l:"Planifiées",c:status["Planifié"]||"#8B5CF6"},
        {k:"Terminé",l:"Terminées",c:status["Terminé"]||"#10B981"}].map(p => {
        const active = filter === p.k
        const count = countByStatus[p.k] || 0
        return (
          <button key={p.k} onClick={()=>setFilter(p.k)} style={{
            display:"inline-flex",alignItems:"center",gap:6,
            padding:"5px 11px",borderRadius:999,fontSize:11,fontWeight:600,
            border:`1px solid ${active ? p.c : "#E2E8F0"}`,
            background:active ? p.c : "#fff",
            color:active ? "#fff" : "#334155",
            cursor:"pointer",fontFamily:"inherit",
            transition:"background .15s, color .15s, border-color .15s",whiteSpace:"nowrap",
          }}>
            <span style={{width:7,height:7,borderRadius:"50%",background:active?"#fff":p.c,opacity:active?0.8:1}}/>
            {p.l} <span style={{fontSize:10,opacity:0.75,fontWeight:500}}>{count}</span>
          </button>
        )
      })}
    </div>

    {filteredTasks.length === 0 ? (
      <div style={{
        background:"#fff",borderRadius:12,padding:"40px 24px",
        textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>✓</div>
        {hasFilters ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
              Essaie d&apos;élargir ta recherche ou de changer de filtre.
            </div>
            <button onClick={()=>{setQ("");setFilter("all")}}
              style={{...btnS,fontSize:12}}>Réinitialiser les filtres</button>
          </>
        ) : (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#334155",marginBottom:4}}>Aucune tâche 🎉</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:14}}>
              Crée ta première tâche pour commencer à suivre le travail.
            </div>
            <button onClick={openNew} style={{...btnP,fontSize:12}}>+ Nouvelle tâche</button>
          </>
        )}
      </div>
    ) : (
    // gridTemplateColumns:"minmax(0,1fr)" empêche les enfants de dépasser
    // la largeur du container (fix overflow horizontal sur mobile)
    <div style={{display:"grid",gap:6,gridTemplateColumns:"minmax(0,1fr)"}}>
      {filteredTasks.map(t => {
        const ch = data.chantiers.find(c => c.id === t.chantierId)
        const overdue = isOverdue(t)
        return (
          <div key={t.id} style={{
            display:"flex",alignItems:"center",gap:m?8:10,
            background:"#fff",borderRadius:10,padding:m?"10px 12px":"11px 16px",
            boxShadow:"0 1px 2px rgba(15,23,42,0.05)",
            borderLeft:overdue ? "3px solid #EF4444" : "3px solid transparent",
            minWidth:0,                // important : autorise le shrink des enfants
            overflow:"hidden",         // dernière ligne de défense anti-overflow
          }}>
            <button onClick={()=>toggle(t)} title="Changer le statut"
              aria-label={`Marquer comme ${t.statut==="Terminé"?"à faire":"terminée"}`}
              style={{
              width:24,height:24,minWidth:24,minHeight:24,borderRadius:"50%",
              border:`2px solid ${status[t.statut]||"#CBD5E1"}`,
              background:t.statut==="Terminé"?"#10B981":"transparent",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",flexShrink:0,padding:0,
              boxSizing:"border-box",appearance:"none",WebkitAppearance:"none",
            }}>
              {t.statut==="Terminé" && <Icon d={I.check} size={12} color="#fff"/>}
            </button>
            <div onClick={()=>openEdit(t)}
              style={{flex:"1 1 0",minWidth:0,cursor:"pointer",opacity:t.statut==="Terminé"?0.5:1}}>
              <div style={{
                fontSize:13,fontWeight:600,color:"#0F172A",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                textDecoration:t.statut==="Terminé"?"line-through":"none"
              }}>{t.titre}</div>
              <div style={{fontSize:10,color:"#94A3B8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {ch?.nom || "—"}{t.lot ? ` · ${t.lot}` : ""}
              </div>
            </div>
            {/* Sur mobile, on n'affiche que le pictogramme pour économiser la largeur */}
            {overdue && (
              <span title="En retard" style={{
                fontSize:10,fontWeight:700,color:"#DC2626",
                background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:999,
                padding:m?"2px 5px":"2px 7px",whiteSpace:"nowrap",flexShrink:0
              }}>
                {m ? "⚠" : "⚠ Retard"}
              </span>
            )}
            {!m && <Badge text={t.priorite} color={status[t.priorite]||"#64748B"}/>}
            {!m && (
              <span style={{
                fontSize:11,color:overdue?"#DC2626":"#94A3B8",
                fontWeight:overdue?600:400,whiteSpace:"nowrap"
              }}>{fmtDate(t.echeance)}</span>
            )}
            <button onClick={()=>openEdit(t)} title="Modifier"
              aria-label="Modifier la tâche" style={{
              background:"#F1F5F9",border:"1px solid #E2E8F0",
              borderRadius:6,cursor:"pointer",padding:"4px 6px",
              display:"flex",flexShrink:0
            }}>
              <Icon d={I.edit} size={12} color="#475569"/>
            </button>
            <button onClick={()=>handleDelete(t)} title="Supprimer"
              aria-label="Supprimer la tâche" style={{
              background:"#fff",border:"1px solid #FECACA",
              borderRadius:6,cursor:"pointer",padding:"4px 6px",
              display:"flex",flexShrink:0
            }}>
              <Icon d={I.trash} size={12} color="#DC2626"/>
            </button>
          </div>
        )
      })}
    </div>
    )}

    <Modal open={!!modal} onClose={closeModal} title={modal==="new"?"Nouvelle tâche":"Modifier la tâche"}>
      <FF label="Chantier *">
        <select style={sel} value={form.chantierId||""}
          onChange={e=>setForm({...form,chantierId:e.target.value})}>
        <option value="">— Sélectionner —</option>
        {data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
      </select></FF>
      <FF label="Titre *">
        <input style={inp} value={form.titre||""}
          onChange={e=>setForm({...form,titre:e.target.value})}/>
      </FF>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
        <FF label="Lot">
          <input style={inp} value={form.lot||""}
            onChange={e=>setForm({...form,lot:e.target.value})}/>
        </FF>
        <FF label="Échéance">
          <input type="date" style={inp} value={form.echeance||""}
            onChange={e=>setForm({...form,echeance:e.target.value})}/>
        </FF>
        <FF label="Priorité">
          <select style={sel} value={form.priorite||""}
            onChange={e=>setForm({...form,priorite:e.target.value})}>
            <option>Urgent</option><option>En cours</option><option>En attente</option>
          </select>
        </FF>
        <FF label="Statut">
          <select style={sel} value={form.statut||""}
            onChange={e=>setForm({...form,statut:e.target.value})}>
            <option>Planifié</option><option>En cours</option><option>Terminé</option>
          </select>
        </FF>
      </div>
      {formError && (
        <div style={{
          background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,
          padding:"8px 12px",marginTop:10,fontSize:12,color:"#DC2626",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{fontSize:14}}>⚠</span>
          <span style={{flex:1}}>{formError}</span>
          <button onClick={()=>setFormError("")} aria-label="Fermer" style={{
            background:"none",border:"none",cursor:"pointer",
            color:"#DC2626",fontSize:14,padding:0,lineHeight:1
          }}>✕</button>
        </div>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <button onClick={closeModal} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer</button>
      </div>
    </Modal>
  </div>)
}
