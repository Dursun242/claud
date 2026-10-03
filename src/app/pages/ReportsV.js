'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SB, fmtDate, btnP } from '../dashboards/shared'
import { EmptyState } from '../components'
import CREditor from '../components/cr/CREditor'
import CRSendModal from '../components/cr/CRSendModal'
import { crTaskStats, globalProgress } from '../lib/crSuivi'
import { markDiffused } from '../lib/crDb'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { parseNewIntent } from '../lib/navIntent'

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

export default function ReportsV({ data, save: _save, m, reload, focusId, focusTs, readOnly, active }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  // Fenêtre CR : { initial } (nouveau : { chantierId } ; modification : le CR)
  const [modal, setModal] = useState(null)
  const [sendCr, setSendCr] = useState(null)
  const [searchCR, setSearchCR] = useState("")
  const [chantierFilter, setChantierFilter] = useState("") // "" = tous
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
    try {
      const [{ generateCRPdf }, { loadCrImages }] = await Promise.all([import('../generators'), import('../lib/crPhotos')])
      await generateCRPdf(cr, ch, { images: await loadCrImages(cr) })
      addToast(`PDF CR n°${cr.numero} généré`, 'success')
    }
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

  const openNew = (chId) => {
    const id = (typeof chId === 'string' && chId) || chantierFilter || data.chantiers[0]?.id || ""
    setModal({ initial: { chantierId: id } })
  }
  const openEdit = (cr) => setModal({ initial: { ...cr, chantierId: cr.chantierId || cr.chantier_id } })
  const closeModal = () => setModal(null)
  const handleSaved = async (cr, { send }) => {
    setModal(null)
    await reload()
    if (send) setSendCr(cr)
  }
  const chantierOf = (cr) => data.chantiers.find(c => c.id === (cr?.chantierId || cr?.chantier_id)) || null

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
      // Onglet caché (resté monté) ou client en lecture seule : on ignore
      if (readOnly || active === false) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      if (modal || sendCr) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNewRef.current?.() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, sendCr, readOnly, active])

  // Focus depuis la recherche globale : pré-remplit la recherche locale
  // avec le numéro du CR pour filtrer la liste et afficher la carte
  // correspondante.
  useEffect(() => {
    if (!focusId) return
    const intent = parseNewIntent(focusId)
    if (intent) { if (!readOnly) openNew(intent.chantierId); return }
    const cr = (data.compteRendus || []).find(c => c.id === focusId)
    if (cr) setSearchCR(String(cr.numero || ""))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs])

  // Liste filtrée + triée par date desc, mémoïsée.
  // Exclut les CR en cours de suppression (fenêtre d'undo ouverte).
  const filteredSortedCRs = useMemo(() => {
    const s = searchCR.toLowerCase().trim()
    // Le maître d'ouvrage ne voit pas les brouillons (filtré aussi par la RLS, migration 033)
    let list = (data.compteRendus || []).filter(cr => !pendingDeleteIds.has(cr.id) && !(readOnly && cr.statut === 'Brouillon'))
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
  }, [searchCR, chantierFilter, data.compteRendus, data.chantiers, pendingDeleteIds, readOnly])

  const hasFilters = !!(searchCR || chantierFilter)
  const total = (data.compteRendus || []).length

  return (<div>
    <div style={{
      display:"flex",justifyContent:"space-between",
      alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8
    }}>
      <div>
        <h1 style={{margin:0,fontSize:m?18:24,fontWeight:700}}>Comptes Rendus</h1>
        <div style={{fontSize:11,color:"#64748B",marginTop:2}}>
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
                <span style={{fontSize:11,color:"#64748B"}}>{fmtDate(cr.date)}</span>
                {cr.statut === 'Brouillon' && (
                  <span style={{fontSize:10,fontWeight:700,color:"#92400E",background:"#FEF3C7",borderRadius:5,padding:"2px 7px"}}>Brouillon — non diffusé</span>
                )}
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
                  <button onClick={()=>setSendCr(cr)} title="Envoyer le CR et la convocation par mail"
                    style={crBtn("#1E3A5F","#F1F5F9","#CBD5E1")}>✉ {cr.statut === 'Brouillon' ? 'Diffuser' : 'Renvoyer'}</button>
                )}
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
            <CRCardSummary cr={cr} />
            {cr.participants && (
              <div style={{fontSize:11}}>
                <span style={{fontWeight:600,color:"#64748B"}}>Présents :</span>{" "}
                <span style={{color:"#64748B"}}>{cr.participants}</span>
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

    <CREditor open={!!modal} initial={modal?.initial} data={data} m={m}
      onClose={closeModal} onSaved={handleSaved} />
    <CRSendModal cr={sendCr} chantier={chantierOf(sendCr)} onClose={() => setSendCr(null)}
      onSent={async (cr) => {
        if (cr?.id && cr.statut !== 'Diffusé') {
          const ok = await markDiffused(cr.id)
          if (!ok) addToast('CR envoyé, mais son statut n\'a pas pu passer à « Diffusé »', 'warning')
          reload()
        }
      }} />
  </div>)
}

// Bilan des actions + prochaine réunion sur la carte d'un CR
function CRCardSummary({ cr }) {
  const st = crTaskStats(cr.taches_suivi)
  const next = cr.prochaine_reunion
  const progress = globalProgress(cr.sections || [])
  if (!st.total && !next?.date && progress == null) return null
  const chip = (text, color, bg) => (
    <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 5, padding: "2px 7px" }}>{text}</span>
  )
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
      {st.nouveau > 0 && chip(`${st.nouveau} nouveau${st.nouveau > 1 ? "x" : ""}`, "#7C3AED", "#F5F3FF")}
      {st.fait > 0 && chip(`${st.fait} soldé${st.fait > 1 ? "s" : ""}`, "#047857", "#ECFDF5")}
      {st.en_cours > 0 && chip(`${st.en_cours} en cours`, "#1D4ED8", "#EFF6FF")}
      {st.relance > 0 && chip(`🔔 ${st.relance} relancé${st.relance > 1 ? "s" : ""}`, "#B91C1C", "#FEF2F2")}
      {progress != null && chip(`Avancement ${progress} %`, "#0F172A", "#F1F5F9")}
      {next?.date && chip(`Prochaine réunion : ${fmtDate(next.date)}${next.heure ? ` ${String(next.heure).slice(0, 5)}` : ""}`, "#1E3A5F", "#F1F5F9")}
    </div>
  )
}
