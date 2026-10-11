'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SB, Icon, I, status, fmtDate, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Badge, Modal } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { parseNewIntent } from '../lib/navIntent'
import { useSaveTask } from '../hooks/useSaveTask'
import { useNavReturn } from '../hooks/useNavReturn'
import SearchField from '../components/SearchField'
import FilterPill, { pillRow } from '../components/FilterPill'
import { EMOJI } from '../lib/emoji'

// Ordre de priorité canonique (pour le tri)
const PRIORITY_ORDER = { Urgent: 0, "En cours": 1, "En attente": 2 }
const TASK_STATUSES = ["Planifié", "En cours", "Terminé"]

export default function TasksV({ data, save: _save, m, reload, focusId, focusTs, active, back = null }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const saveTask = useSaveTask()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [filter, setFilter] = useState("all")
  const [q, setQ] = useState("")
  const [formError, setFormError] = useState("")
  // Tâche ouverte depuis une autre page : la fermer y ramène
  const { markFromNav, returnIfFromNav } = useNavReturn(modal === "edit" ? form.id : null, back)
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
          (t.entreprise || "").toLowerCase().includes(search) ||
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

  const openNew = (chId) => {
    const ch = (typeof chId === 'string' && data.chantiers.find(c => c.id === chId)) || data.chantiers[0]
    setForm({
      chantierId: ch?.id || "", titre: "",
      priorite: "En cours", statut: "Planifié", echeance: "", lot: ""
    })
    setFormError("")
    setModal("new")
  }
  const openEdit = (t) => { setForm(t); setFormError(""); setModal("edit") }
  const closeModal = () => { setModal(null); setFormError(""); returnIfFromNav() }

  // Raccourci clavier « n » pour créer une tâche
  const openNewRef = useRef(null)
  useEffect(() => { openNewRef.current = openNew })
  useEffect(() => {
    const handler = (e) => {
      // Onglet caché (resté monté) : on ignore
      if (active === false) return
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
  }, [modal, active])

  const handleSave = async () => {
    setFormError("")
    if (!form.titre?.trim()) { setFormError("Le titre est requis."); return }
    if (!form.chantierId) { setFormError("Sélectionne un chantier."); return }
    try {
      await SB.upsertTask(form)
      setModal(null)
      returnIfFromNav()
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
    const intent = parseNewIntent(focusId)
    if (intent) { openNew(intent.chantierId); return }
    const task = (data.tasks || []).find(t => t.id === focusId)
    if (task) { setFilter("all"); setForm(task); setFormError(""); setModal("edit"); markFromNav(task.id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs])

  const toggle = async (t) => {
    const cy = ["Planifié", "En cours", "Terminé"]
    const idx = cy.indexOf(t.statut)
    const next = cy[(idx < 0 ? 0 : idx + 1) % 3]
    try {
      const r = await saveTask({ ...t, statut: next }, reload)
      if (r === "queued") addToast("Hors ligne : enregistré sur l'appareil, envoi au retour du réseau", "info")
      else if (next === "Terminé") addToast("Tâche terminée ✓", "success")
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
        <h1 style={{margin:0,fontSize:m?28:32,fontWeight:700,letterSpacing:"-0.02em",color:"#1C1C1E"}}>Tâches</h1>
        <div style={{fontSize:13,color:"#6E6E73",marginTop:2}}>
          {countByStatus.all} au total
          {hasFilters && <> · <strong>{filteredTasks.length}</strong> affichée{filteredTasks.length>1?"s":""}</>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <SearchField inputRef={searchInputRef} value={q} onChange={e=>setQ(e.target.value)} m={m} width={240}
          label="Rechercher une tâche" placeholder={m?"Rechercher titre, lot, chantier…":"Rechercher titre, lot, chantier… (tape /)"}/>
        <button onClick={openNew} title="Nouvelle tâche (raccourci : n)"
          style={{...btnP,display:"inline-flex",alignItems:"center",gap:4}}><Icon d={I.plus} size={16} color="#fff"/>Nouvelle tâche</button>
      </div>
    </div>

    {/* Pastilles de filtre par statut */}
    <div role="group" aria-label="Filtrer par statut" style={pillRow(m)}>
      {[{k:"all",l:"Toutes"},
        {k:"En cours",l:"En cours",c:status["En cours"]||"#007AFF"},
        {k:"Planifié",l:"Planifiées",c:status["Planifié"]||"#AF52DE"},
        {k:"Terminé",l:"Terminées",c:status["Terminé"]||"#34C759"}].map(p => (
        <FilterPill key={p.k} active={filter===p.k} color={p.c} label={p.l}
          count={countByStatus[p.k] || 0} onClick={()=>setFilter(p.k)}/>
      ))}
    </div>

    {filteredTasks.length === 0 ? (
      <div style={{
        background:"#fff",borderRadius:12,padding:"40px 24px",
        textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"
      }}>
        <div style={{fontSize:36,marginBottom:8,opacity:0.5}}>✓</div>
        {hasFilters ? (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#3A3A3C",marginBottom:4}}>Aucun résultat</div>
            <div style={{fontSize:12,color:"#6E6E73",marginBottom:14}}>
              Essaie d&apos;élargir ta recherche ou de changer de filtre.
            </div>
            <button onClick={()=>{setQ("");setFilter("all")}}
              style={btnS}>Réinitialiser les filtres</button>
          </>
        ) : (
          <>
            <div style={{fontSize:14,fontWeight:700,color:"#3A3A3C",marginBottom:4}}>Aucune tâche 🎉</div>
            <div style={{fontSize:12,color:"#6E6E73",marginBottom:14}}>
              Crée ta première tâche pour commencer à suivre le travail.
            </div>
            <button onClick={openNew} style={btnP}>+ Nouvelle tâche</button>
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
            background:"#fff",borderRadius:10,padding:m?"6px 8px 6px 12px":"6px 10px 6px 16px",
            border:"1px solid #E5E5EA",minHeight:56,boxSizing:"border-box",
            minWidth:0,                // important : autorise le shrink des enfants
            overflow:"hidden",         // dernière ligne de défense anti-overflow
          }}>
            <button onClick={()=>toggle(t)} title="Changer le statut"
              aria-label={`Marquer comme ${t.statut==="Terminé"?"à faire":"terminée"}`}
              className="u-hit"
              style={{
              width:24,height:24,minWidth:24,minHeight:24,borderRadius:"50%",
              border:`2px solid ${status[t.statut]||"#D1D1D6"}`,
              background:t.statut==="Terminé"?"#34C759":"transparent",
              display:"flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",flexShrink:0,padding:0,
              boxSizing:"border-box",appearance:"none",WebkitAppearance:"none",
            }}>
              {t.statut==="Terminé" && <Icon d={I.check} size={12} color="#fff"/>}
            </button>
            <div onClick={()=>openEdit(t)}
              role="button" tabIndex={0}
              onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openEdit(t); } }}
              style={{flex:"1 1 0",minWidth:0,alignSelf:"stretch",display:"flex",flexDirection:"column",justifyContent:"center",
                cursor:"pointer",opacity:t.statut==="Terminé"?0.5:1}}>
              <div style={{
                fontSize:15,fontWeight:600,color:"#1C1C1E",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                textDecoration:t.statut==="Terminé"?"line-through":"none"
              }}>{t.titre}</div>
              <div style={{fontSize:12,color:"#6E6E73",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {ch?.nom || "—"}{t.entreprise ? ` · ${t.entreprise}` : ""}{t.lot ? ` · ${t.lot}` : ""}
                {t.nb_rappels > 0 && t.statut !== "Terminé" && (
                  <span style={{color:"#D70015",fontWeight:600}}> · {EMOJI.rappel} {t.nb_rappels} rappel{t.nb_rappels>1?"s":""}</span>
                )}
              </div>
            </div>
            {overdue && (
              <span style={{
                fontSize:12,fontWeight:600,color:"#D70015",
                background:"#FFF0EF",borderRadius:999,
                padding:"2px 8px",whiteSpace:"nowrap",flexShrink:0
              }}>Retard</span>
            )}
            {!m && <Badge text={t.priorite} color={status[t.priorite]||"#6E6E73"}/>}
            {!m && (
              <span style={{
                fontSize:11,color:overdue?"#D70015":"#8E8E93",
                fontWeight:overdue?600:400,whiteSpace:"nowrap"
              }}>{fmtDate(t.echeance)}</span>
            )}
            <button onClick={()=>openEdit(t)} title="Modifier"
              aria-label="Modifier la tâche" className="u-icon-btn"
              style={{width:36,height:36,borderRadius:8,color:"#48484A",flexShrink:0}}>
              <Icon d={I.edit} size={16}/>
            </button>
            <button onClick={()=>handleDelete(t)} title="Supprimer"
              aria-label="Supprimer la tâche" className="u-icon-btn u-icon-btn--danger"
              style={{width:36,height:36,borderRadius:8,color:"#8E8E93",flexShrink:0}}>
              <Icon d={I.trash} size={16}/>
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
      <FF label="Entreprise">
        <input style={inp} value={form.entreprise||""} placeholder="Entreprise chargée de l'action"
          onChange={e=>setForm({...form,entreprise:e.target.value})}/>
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
          background:"#FFF0EF",border:"1px solid #FFC9C6",borderRadius:8,
          padding:"8px 12px",marginTop:10,fontSize:12,color:"#D70015",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{fontSize:14}}>⚠</span>
          <span style={{flex:1}}>{formError}</span>
          <button onClick={()=>setFormError("")} aria-label="Fermer" style={{
            background:"none",border:"none",cursor:"pointer",
            color:"#D70015",fontSize:14,padding:0,lineHeight:1
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
