'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SB, fmtDate, FF, inp, sel, btnP, btnS } from '../dashboards/shared'
import { Modal, EmptyState } from '../components'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'

// Style doux pour les boutons d'action sur les cartes CR
const crBtn = (color, bg, border) => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 5,
  padding: "4px 9px",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 700,
  color,
  fontFamily: "inherit",
})

export default function ReportsV({ data, save: _save, m, reload, focusId, focusTs, readOnly }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [searchCR, setSearchCR] = useState("")
  const [chantierFilter, setChantierFilter] = useState("") // "" = tous
  const [formError, setFormError] = useState("")
  const searchInputRef = useRef(null)

  // Delete avec undo (5s pour annuler)
  const { pendingIds: pendingDeleteIds, scheduleDelete } = useUndoableDelete({
    label: 'CR',
    onConfirmDelete: async (cr) => { await SB.deleteCR(cr.id); reload(); },
  })

  // Loading state pour la génération de PDF / Excel
  const [generating, setGenerating] = useState(null)

  const handlePdf = async (cr, ch) => {
    if (generating) return
    setGenerating({ id: cr.id, kind: 'pdf' })
    try { const { generateCRPdf } = await import('../generators'); await generateCRPdf(cr, ch); addToast(`PDF CR n°${cr.numero} généré`, 'success') }
    catch (err) { addToast('Erreur PDF : ' + (err?.message || 'génération impossible'), 'error') }
    finally { setGenerating(null) }
  }
  const handleExcel = async (cr, ch) => {
    if (generating) return
    setGenerating({ id: cr.id, kind: 'xls' })
    try { const { generateCRExcel } = await import('../generators'); await generateCRExcel(cr, ch); addToast(`Excel CR n°${cr.numero} généré`, 'success') }
    catch (err) { addToast('Erreur Excel : ' + (err?.message || 'génération impossible'), 'error') }
    finally { setGenerating(null) }
  }

  const openNew = () => {
    setForm({
      chantierId: data.chantiers[0]?.id || "",
      date: new Date().toISOString().split("T")[0],
      numero: (data.compteRendus || []).length + 1,
      resume: "", participants: "", decisions: "", intervenants: []
    })
    setFormError("")
    setModal("new")
  }
  const openEdit = (cr) => { setForm(cr); setFormError(""); setModal("edit") }
  const closeModal = () => { setModal(null); setFormError("") }

  // Intervenants disponibles pour le chantier actuellement sélectionné dans
  // la modale (déduits des OS + rattachés manuellement via contact_chantiers,
  // même logique que la fiche chantier / ChantierIntervenants).
  const modalIntervenants = useMemo(() => {
    const chId = form.chantierId
    if (!chId) return []
    const contactMap = new Map((data.contacts || []).map(c => [c.nom, c]))
    const contactById = new Map((data.contacts || []).map(c => [c.id, c]))
    const artisanNames = [...new Set((data.ordresService || [])
      .filter(o => o.chantier_id === chId)
      .map(o => o.artisan_nom).filter(Boolean))]
    const seen = new Set()
    const list = []
    artisanNames.map(n => contactMap.get(n)).filter(Boolean).forEach(c => {
      if (seen.has(c.id)) return
      seen.add(c.id); list.push(c)
    })
    ;(data.contactChantiers || []).filter(cc => cc.chantier_id === chId).forEach(link => {
      if (seen.has(link.contact_id)) return
      const c = contactById.get(link.contact_id)
      if (!c) return
      seen.add(c.id); list.push(c)
    })
    return list
  }, [form.chantierId, data.contacts, data.ordresService, data.contactChantiers])

  const handleSave = async () => {
    setFormError("")
    if (!form.chantierId) { setFormError("Sélectionne un chantier."); return }
    if (!form.date) { setFormError("La date est requise."); return }
    try {
      await SB.upsertCR(form)
      setModal(null)
      reload()
      addToast(modal === "edit" ? "CR mis à jour" : "CR créé", "success")
    } catch (err) {
      setFormError(err?.message || "Erreur lors de l'enregistrement.")
    }
  }
  const handleDelete = async (cr) => {
    const ok = await confirm({
      title: `Supprimer le CR n°${cr.numero} ?`,
      message: "Tu pourras annuler cette suppression pendant 5 secondes.",
      confirmLabel: "Supprimer",
      danger: true,
    })
    if (!ok) return
    scheduleDelete(cr, { itemLabel: `CR n°${cr.numero}` })
  }

  // Raccourci clavier « n » pour créer un CR
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

  // Focus depuis la recherche globale : pré-remplit la recherche locale
  // avec le numéro du CR pour filtrer la liste et afficher la carte
  // correspondante.
  useEffect(() => {
    if (!focusId) return
    const cr = (data.compteRendus || []).find(c => c.id === focusId)
    if (cr) setSearchCR(String(cr.numero || ""))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs])

  // Liste filtrée + triée par date desc, mémoïsée.
  // Exclut les CR en cours de suppression (fenêtre d'undo ouverte).
  const filteredSortedCRs = useMemo(() => {
    const s = searchCR.toLowerCase().trim()
    let list = (data.compteRendus || []).filter(cr => !pendingDeleteIds.has(cr.id))
    if (chantierFilter) list = list.filter(cr => (cr.chantierId || cr.chantier_id) === chantierFilter)
    if (s) {
      list = list.filter(cr => {
        const ch = data.chantiers.find(c => c.id === (cr.chantierId || cr.chantier_id))
        return (
          String(cr.numero).toLowerCase().includes(s) ||
          (ch?.nom || "").toLowerCase().includes(s) ||
          (ch?.client || "").toLowerCase().includes(s) ||
          (ch?.adresse || "").toLowerCase().includes(s) ||
          (cr.resume || "").toLowerCase().includes(s) ||
          (cr.participants || "").toLowerCase().includes(s)
        )
      })
    }
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [searchCR, chantierFilter, data.compteRendus, data.chantiers, pendingDeleteIds])

  const hasFilters = !!(searchCR || chantierFilter)
  const total = (data.compteRendus || []).length

  return (<div>
    <div style={{
      display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Comptes Rendus</h1>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
          {total} au total
          {hasFilters && <>
            {" "}· <strong>{filteredSortedCRs.length}</strong>{" "}
            affiché{filteredSortedCRs.length>1?"s":""}
          </>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{position:"relative",width:m?"100%":260}}>
          <svg style={{
            position:"absolute",left:9,top:"50%",
            transform:"translateY(-50%)",opacity:0.5
          }} width="13" height="13" viewBox="0 0 24 24"
            fill="none" stroke="#64748B" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Rechercher n°, chantier, résumé… (tape /)"
            value={searchCR}
            onChange={e=>setSearchCR(e.target.value)}
            style={{
              padding:"7px 10px 7px 28px",borderRadius:7,
              border:"1px solid #E2E8F0",fontSize:12,
              width:"100%",boxSizing:"border-box",fontFamily:"inherit"
            }}
          />
        </div>
        <select value={chantierFilter}
          onChange={e=>setChantierFilter(e.target.value)}
          title="Filtrer par chantier"
          style={{
            padding:"7px 8px",borderRadius:7,
            border:"1px solid #E2E8F0",fontSize:12,
            background:"#fff",cursor:"pointer",
            fontFamily:"inherit",maxWidth:180
          }}>
          <option value="">🏗️ Tous les chantiers</option>
          {data.chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        {!readOnly && (
          <button onClick={openNew} title="Nouveau CR (raccourci : n)"
            style={{...btnP,fontSize:12}}>+ CR</button>
        )}
      </div>
    </div>

    {filteredSortedCRs.length === 0 ? (
      hasFilters ? (
        <EmptyState
          icon="📝"
          title="Aucun résultat"
          description="Essaie d'élargir ta recherche ou de changer de chantier."
          action={{
            label: 'Réinitialiser les filtres',
            onClick: () => { setSearchCR(''); setChantierFilter('') },
          }}
        />
      ) : (
        <EmptyState
          icon="📝"
          title="Aucun compte rendu"
          description="Crée ton premier CR de chantier pour commencer."
          action={{ label: '+ Nouveau CR', onClick: openNew }}
        />
      )
    ) : (
      filteredSortedCRs.map(cr => {
        const ch = data.chantiers.find(c => c.id === (cr.chantierId || cr.chantier_id))
        return (
          <div key={cr.id} style={{
            background:"#fff",borderRadius:12,padding:m?14:18,
            boxShadow:"0 1px 3px rgba(15,23,42,0.05)",
            marginBottom:10,borderLeft:"4px solid #3B82F6"
          }}>
            <div style={{
              display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6
            }}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{
                  background:"#1E3A5F",color:"#fff",borderRadius:6,
                  padding:"3px 9px",fontSize:11,fontWeight:700
                }}>CR n°{cr.numero}</span>
                <span style={{fontWeight:700,fontSize:14,color:"#0F172A"}}>{ch?.nom || "—"}</span>
                <span style={{fontSize:11,color:"#94A3B8"}}>{fmtDate(cr.date)}</span>
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <button onClick={()=>handlePdf(cr,ch)} disabled={!!generating} title="Télécharger le PDF"
                  style={{
                    ...crBtn("#DC2626","#FEF2F2","#FECACA"),
                    opacity:generating?.id===cr.id&&generating?.kind==='pdf'
                      ?0.7:(generating?0.5:1),
                    cursor:generating?'wait':'pointer'
                  }}>
                  {generating?.id===cr.id && generating?.kind==='pdf' ? (
                    <><span style={{
                      display:"inline-block",width:10,height:10,
                      border:"2px solid #FECACA",borderTopColor:"#DC2626",
                      borderRadius:"50%",
                      animation:"spin .8s linear infinite",
                      marginRight:4,verticalAlign:"middle"
                    }}/>Génération…</>
                  ) : '📄 PDF'}
                </button>
                <button onClick={()=>handleExcel(cr,ch)} disabled={!!generating} title="Télécharger l'Excel"
                  style={{
                    ...crBtn("#047857","#ECFDF5","#A7F3D0"),
                    opacity:generating?.id===cr.id&&generating?.kind==='xls'
                      ?0.7:(generating?0.5:1),
                    cursor:generating?'wait':'pointer'
                  }}>
                  {generating?.id===cr.id && generating?.kind==='xls' ? (
                    <><span style={{
                      display:"inline-block",width:10,height:10,
                      border:"2px solid #A7F3D0",borderTopColor:"#047857",
                      borderRadius:"50%",
                      animation:"spin .8s linear infinite",
                      marginRight:4,verticalAlign:"middle"
                    }}/>Génération…</>
                  ) : '📊 XLS'}
                </button>
                {!readOnly && (
                  <button onClick={()=>openEdit(cr)} title="Modifier"
                    style={crBtn("#1D4ED8","#EFF6FF","#BFDBFE")}>✎ Modifier</button>
                )}
                {!readOnly && (
                  <button onClick={()=>handleDelete(cr)} title="Supprimer"
                    style={crBtn("#DC2626","#fff","#FECACA")}>Supprimer</button>
                )}
              </div>
            </div>
            {cr.resume && <div style={{fontSize:13,color:"#334155",lineHeight:1.6,marginBottom:8}}>{cr.resume}</div>}
            {cr.participants && (
              <div style={{fontSize:11}}>
                <span style={{fontWeight:600,color:"#64748B"}}>Présents :</span>{" "}
                <span style={{color:"#94A3B8"}}>{cr.participants}</span>
              </div>
            )}
            {cr.decisions && (
              <div style={{
                marginTop:8,background:"#FEF3C7",
                border:"1px solid #FDE68A",borderRadius:6,
                padding:"8px 12px",fontSize:11,color:"#92400E"
              }}><b>Décisions :</b> {cr.decisions}</div>
            )}
          </div>
        )
      })
    )}

    <Modal open={!!modal} onClose={closeModal} title={modal==="new"?"Nouveau compte rendu":"Modifier le CR"} wide>
      <div style={{display:"grid",gridTemplateColumns:m?"1fr":"1fr 1fr 1fr",gap:"0 12px"}}>
        <FF label="Chantier *">
          <select style={sel} value={form.chantierId||""}
            onChange={e=>setForm({...form,chantierId:e.target.value,intervenants:[]})}>
            <option value="">— Sélectionner —</option>
            {data.chantiers.map(c=><option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FF>
        <FF label="Date *">
          <input type="date" style={inp} value={form.date||""}
            onChange={e=>setForm({...form,date:e.target.value})}/>
        </FF>
        <FF label="N°">
          <input type="number" style={inp} value={form.numero||""}
            onChange={e=>setForm({...form,numero:e.target.value})}/>
        </FF>
      </div>
      <FF label="Résumé">
        <textarea style={{...inp,minHeight:80,resize:"vertical"}}
          value={form.resume||""}
          onChange={e=>setForm({...form,resume:e.target.value})}
          placeholder="Points abordés pendant la réunion…"/>
      </FF>
      <FF label="Intervenants">
        {!form.chantierId ? (
          <div style={{
            background:"#F8FAFC",border:"1px dashed #CBD5E1",borderRadius:8,
            padding:"12px 14px",marginBottom:8
          }}>
            <p style={{color:"#64748B",fontSize:11,margin:0}}>
              Sélectionne d&apos;abord un chantier pour voir ses intervenants.
            </p>
          </div>
        ) : modalIntervenants.length === 0 ? (
          <div style={{
            background:"#F8FAFC",border:"1px dashed #CBD5E1",borderRadius:8,
            padding:"12px 14px",marginBottom:8
          }}>
            <p style={{color:"#64748B",fontSize:11,margin:0}}>
              Aucun intervenant sur ce chantier — ajoutez-en depuis sa fiche (onglet Chantiers), puis revenez ici.
            </p>
          </div>
        ) : (
          <div style={{
            background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:8,
            padding:10,marginBottom:8
          }}>
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              marginBottom:8
            }}>
              <span style={{fontSize:11,fontWeight:700,color:"#0F172A"}}>
                {(form.intervenants||[]).length === 0
                  ? "Aucun sélectionné"
                  : `${(form.intervenants||[]).length} sélectionné${(form.intervenants||[]).length>1?"s":""}`}
              </span>
              <div style={{display:"flex",gap:10}}>
                <button type="button" onClick={()=>{
                  setForm({...form,intervenants:modalIntervenants.map(it=>({
                    nom: it.nom, email: it.email||"", societe: it.societe||it.nom||"",
                    tel: it.tel||"", siret: it.siret||""
                  }))});
                }} style={{
                  background:"none",border:"none",color:"#3B82F6",
                  fontSize:10,fontWeight:700,cursor:"pointer",padding:0
                }}>Tout cocher</button>
                <button type="button" onClick={()=>setForm({...form,intervenants:[]})}
                  style={{
                    background:"none",border:"none",color:"#94A3B8",
                    fontSize:10,fontWeight:700,cursor:"pointer",padding:0
                  }}>Tout décocher</button>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {modalIntervenants.map(it=>{
                const selectedList = form.intervenants||[];
                const isSel = selectedList.some(s=>s.nom===it.nom);
                const toggle = ()=>{
                  const next = isSel
                    ? selectedList.filter(s=>s.nom!==it.nom)
                    : [...selectedList,{
                        nom: it.nom, email: it.email||"",
                        societe: it.societe||it.nom||"",
                        tel: it.tel||"", siret: it.siret||""
                      }];
                  setForm({...form,intervenants:next});
                };
                return (
                  <div key={it.id||it.nom} role="checkbox" aria-checked={isSel} tabIndex={0}
                    onClick={toggle}
                    onKeyDown={(e)=>{ if (e.key===" "||e.key==="Enter") { e.preventDefault(); toggle(); } }}
                    style={{
                      display:"flex",alignItems:"center",gap:8,
                      padding:"9px 12px",borderRadius:6,cursor:"pointer",
                      border:isSel?"1.5px solid #3B82F6":"1px solid #E2E8F0",
                      background:isSel?"#EFF6FF":"#fff",
                      transition:"background 0.1s, border-color 0.1s"
                    }}>
                    <span aria-hidden="true" style={{
                      width:18,height:18,minWidth:18,borderRadius:5,
                      border:isSel?"none":"1.5px solid #CBD5E1",
                      background:isSel?"#3B82F6":"#fff",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12,color:"#fff",fontWeight:700
                    }}>
                      {isSel && "✓"}
                    </span>
                    <span style={{fontSize:12,fontWeight:600,color:isSel?"#1D4ED8":"#0F172A"}}>
                      {it.nom}
                    </span>
                    {it.societe && it.societe !== it.nom && (
                      <span style={{fontSize:10,color:"#94A3B8"}}>({it.societe})</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </FF>
      <FF label="Participants (notes libres, optionnel)">
        <input style={inp} value={form.participants||""}
          onChange={e=>setForm({...form,participants:e.target.value})}
          placeholder="Ex: et 2 riverains présents"/>
      </FF>
      <FF label="Décisions">
        <textarea style={{...inp,minHeight:50,resize:"vertical"}}
          value={form.decisions||""}
          onChange={e=>setForm({...form,decisions:e.target.value})}
          placeholder="Décisions prises pendant la réunion…"/>
      </FF>
      {formError && (
        <div style={{
          background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,
          padding:"8px 12px",marginTop:10,fontSize:12,color:"#DC2626",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{fontSize:14}}>⚠</span>
          <span style={{flex:1}}>{formError}</span>
          <button onClick={()=>setFormError("")} aria-label="Fermer"
            style={{
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
