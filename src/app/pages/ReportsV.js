'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { SB, fmtDate, btnP, btnChip, Icon, I } from '../dashboards/shared'
import { EmptyState } from '../components'
import CREditor from '../components/cr/CREditor'
import CRSendModal from '../components/cr/CRSendModal'
import { crTaskStats, globalProgress } from '../lib/crSuivi'
import { markDiffused } from '../lib/crDb'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useUndoableDelete } from '../hooks/useUndoableDelete'
import { parseNewIntent } from '../lib/navIntent'
import SearchField, { toolbarSelect } from '../components/SearchField'

// Petit indicateur de génération (PDF / Excel) dans un bouton
const Spinner = () => (
  <span aria-hidden="true" style={{
    display:"inline-block",width:12,height:12,borderRadius:"50%",
    border:"2px solid var(--separator-opaque)",borderTopColor:"var(--accent-text)",animation:"spin .8s linear infinite",
  }}/>
)

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
  const busy = (cr, kind) => generating?.id === cr.id && generating?.kind === kind

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
        <h1 style={{margin:0,fontSize:m?28:32,fontWeight:700,letterSpacing:"-0.02em",color:"var(--label)"}}>Comptes rendus</h1>
        <div style={{fontSize:13,color:"var(--label-secondary)",marginTop:2}}>
          {total} au total
          {hasFilters && <>
            {" "}· <strong>{filteredSortedCRs.length}</strong>{" "}
            affiché{filteredSortedCRs.length>1?"s":""}
          </>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <SearchField inputRef={searchInputRef} value={searchCR} onChange={e=>setSearchCR(e.target.value)} m={m} width={260}
          label="Rechercher un compte rendu" placeholder={m?"Rechercher n°, chantier, résumé…":"Rechercher n°, chantier, résumé… (tape /)"}/>
        <select value={chantierFilter}
          onChange={e=>setChantierFilter(e.target.value)}
          aria-label="Filtrer par chantier" title="Filtrer par chantier"
          style={toolbarSelect(m)}>
          <option value="">Tous les chantiers</option>
          {data.chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        {!readOnly && (
          <button onClick={openNew} title="Nouveau CR (raccourci : n)"
            style={btnP}>+ CR</button>
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
            border:"1px solid var(--separator)",marginBottom:10
          }}>
            <div style={{
              display:"flex",justifyContent:"space-between",
              alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6
            }}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:700,fontSize:15,color:"var(--label)"}}>CR n°{cr.numero}</span>
                <span style={{fontWeight:600,fontSize:15,color:"var(--label)"}}>{ch?.nom || "—"}</span>
                <span style={{fontSize:13,color:"var(--label-secondary)"}}>{fmtDate(cr.date)}</span>
                {cr.statut === 'Brouillon' && (
                  <span style={{fontSize:12,fontWeight:600,color:"var(--orange-deep)",background:"var(--orange-tint)",borderRadius:999,padding:"2px 8px"}}>Brouillon — non diffusé</span>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>handlePdf(cr,ch)} disabled={!!generating} title="Télécharger le PDF"
                  className="u-btn" style={{...btnChip,opacity:generating&&!busy(cr,'pdf')?0.5:1,cursor:generating?'wait':'pointer'}}>
                  {busy(cr,'pdf') ? <><Spinner/>Génération…</> : <><Icon d={I.download} size={14}/>PDF</>}
                </button>
                <button onClick={()=>handleExcel(cr,ch)} disabled={!!generating} title="Télécharger l'Excel"
                  className="u-btn" style={{...btnChip,opacity:generating&&!busy(cr,'xls')?0.5:1,cursor:generating?'wait':'pointer'}}>
                  {busy(cr,'xls') ? <><Spinner/>Génération…</> : <><Icon d={I.sheet} size={14}/>Excel</>}
                </button>
                {!readOnly && (
                  <button onClick={()=>setSendCr(cr)} title="Envoyer le CR et la convocation par mail"
                    className="u-btn" style={btnChip}><Icon d={I.send} size={14}/>{cr.statut === 'Brouillon' ? 'Diffuser' : 'Renvoyer'}</button>
                )}
                {!readOnly && (
                  <button onClick={()=>openEdit(cr)} title="Modifier"
                    className="u-btn" style={btnChip}><Icon d={I.edit} size={14}/>Modifier</button>
                )}
                {!readOnly && (
                  <button onClick={()=>handleDelete(cr)} title="Supprimer"
                    className="u-btn" style={{...btnChip,color:"var(--red-text)"}}><Icon d={I.trash} size={14}/>Supprimer</button>
                )}
              </div>
            </div>
            {cr.resume && <div style={{fontSize:13,color:"var(--label-2)",lineHeight:1.6,marginBottom:8}}>{cr.resume}</div>}
            <CRCardSummary cr={cr} />
            {cr.participants && (
              <div style={{fontSize:12}}>
                <span style={{fontWeight:600,color:"var(--label-secondary)"}}>Présents :</span>{" "}
                <span style={{color:"var(--label-secondary)"}}>{cr.participants}</span>
              </div>
            )}
            {cr.decisions && (
              <div style={{
                marginTop:8,background:"var(--orange-tint)",
                border:"1px solid var(--orange-line)",borderRadius:10,
                padding:"8px 12px",fontSize:13,color:"var(--orange-deep)"
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
    <span style={{ fontSize: 12, fontWeight: 600, color, background: bg, borderRadius: 999, padding: "2px 8px" }}>{text}</span>
  )
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
      {st.nouveau > 0 && chip(`${st.nouveau} nouveau${st.nouveau > 1 ? "x" : ""}`, "#8944AB", "#F7F0FC")}
      {st.fait > 0 && chip(`${st.fait} soldé${st.fait > 1 ? "s" : ""}`, "#1E7B34", "#EAF8EE")}
      {st.en_cours > 0 && chip(`${st.en_cours} en cours`, "#0066CC", "#EAF3FF")}
      {st.relance > 0 && chip(`🔔 ${st.relance} relancé${st.relance > 1 ? "s" : ""}`, "#D70015", "#FFF0EF")}
      {progress != null && chip(`Avancement ${progress} %`, "#1C1C1E", "#F2F2F7")}
      {next?.date && chip(`Prochaine réunion : ${fmtDate(next.date)}${next.heure ? ` ${String(next.heure).slice(0, 5)}` : ""}`, "#0071E3", "#F2F2F7")}
    </div>
  )
}
