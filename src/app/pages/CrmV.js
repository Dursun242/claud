'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { SB, Icon, I, FF, inp, sel, btnP, btnS, fmtMoney, fmtDate } from '../dashboards/shared'
import { Badge, Modal, EmptyState } from '../components'
import { PageSkeleton } from '../components/Skeleton'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useCrmData } from '../hooks/useCrmData'
import {
  ETAPES, ETAPES_ACTIVES, ETAPE_COLORS, ETAPE_PROBA, INTERACTION_TYPES,
  INTERACTION_ICONS, SOURCES, isClosed, nextEtape, groupByEtape,
  pipelineStats, classifyFollowUps, daysSinceLastInteraction,
  validateOpportunite, validateInteraction, opportuniteToChantier,
} from '../lib/crm'
import {
  upsertOpportunite, moveOpportunite, deleteOpportunite,
  upsertInteraction, setActionFaite, deleteInteraction,
  linkOpportuniteToChantier,
} from '../lib/crmDb'

const TYPES_PROJET = ['Rénovation', 'Construction neuve', 'Extension', 'Réhabilitation', 'Aménagement', 'Autre']
const todayISO = () => new Date().toISOString().slice(0, 10)

// ═══════════════════════════════════════════════════════════════
// Page CRM — pipeline commercial
// ═══════════════════════════════════════════════════════════════
export default function CrmV({ data, m, reload: reloadDashboard, setTab }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const { crm, loading, error, reload } = useCrmData()
  const { opportunites, interactions, missingMigration } = crm

  const [view, setView] = useState('pipeline')       // pipeline | relances | closed
  const [q, setQ] = useState('')
  const [oppModal, setOppModal] = useState(null)      // null | 'new' | 'edit'
  const [oppForm, setOppForm] = useState({})
  const [oppError, setOppError] = useState('')
  const [selectedId, setSelectedId] = useState(null)  // opportunité ouverte en détail
  const [intModal, setIntModal] = useState(false)
  const [intForm, setIntForm] = useState({})
  const [intError, setIntError] = useState('')
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [saving, setSaving] = useState(false)

  const contactsById = useMemo(() => {
    const map = new Map()
    for (const c of data?.contacts || []) map.set(c.id, c)
    return map
  }, [data?.contacts])

  const selected = useMemo(
    () => opportunites.find(o => o.id === selectedId) || null,
    [opportunites, selectedId],
  )

  // ─── Filtrage / regroupement ───
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim()
    if (!s) return opportunites
    return opportunites.filter(o => {
      const c = contactsById.get(o.contact_id)
      return (o.titre || '').toLowerCase().includes(s)
        || (o.adresse || '').toLowerCase().includes(s)
        || (o.type_projet || '').toLowerCase().includes(s)
        || (c?.nom || '').toLowerCase().includes(s)
        || (c?.societe || '').toLowerCase().includes(s)
    })
  }, [opportunites, q, contactsById])

  const grouped = useMemo(() => groupByEtape(filtered), [filtered])
  const stats = useMemo(() => pipelineStats(opportunites), [opportunites])
  const followUps = useMemo(() => classifyFollowUps(interactions), [interactions])
  const nbRelances = followUps.overdue.length + followUps.today.length

  // ─── Opportunité : création / édition ───
  const openNew = useCallback(() => {
    setOppForm({
      titre: '', etape: 'Prospect', probabilite: ETAPE_PROBA.Prospect,
      montant_estime: '', contact_id: '', source: '', type_projet: '',
      adresse: '', date_cloture_prevue: '', notes: '',
    })
    setOppError('')
    setOppModal('new')
  }, [])
  const openEdit = (o) => {
    setOppForm({ ...o, montant_estime: o.montant_estime ?? '', contact_id: o.contact_id || '' })
    setOppError('')
    setOppModal('edit')
  }
  const closeOppModal = () => { setOppModal(null); setOppError('') }

  // Raccourci « n » = nouvelle opportunité (comme sur Tâches / Contacts)
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      if (oppModal || intModal) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [oppModal, intModal, openNew])

  const saveOpp = async () => {
    const err = validateOpportunite(oppForm)
    if (err) { setOppError(err); return }
    setSaving(true)
    try {
      const saved = await upsertOpportunite(oppForm)
      await reload()
      closeOppModal()
      addToast(oppModal === 'edit' ? 'Opportunité mise à jour' : 'Opportunité créée', 'success')
      if (oppModal === 'new') setSelectedId(saved.id)
    } catch (e) {
      setOppError(e?.message || "Erreur lors de l'enregistrement.")
    } finally { setSaving(false) }
  }

  const handleDelete = async (o) => {
    const ok = await confirm({
      title: `Supprimer « ${o.titre} » ?`,
      message: "L'historique des interactions sera supprimé avec l'opportunité.",
      confirmLabel: 'Supprimer', danger: true,
    })
    if (!ok) return
    try {
      await deleteOpportunite(o.id)
      if (selectedId === o.id) setSelectedId(null)
      await reload()
      addToast('Opportunité supprimée', 'success')
    } catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  // Changement d'étape (drag & drop, bouton « avancer », sélecteur).
  // Perdu demande un motif ; Gagné propose la conversion en chantier.
  const changeEtape = async (o, etape) => {
    if (o.etape === etape) return
    if (etape === 'Perdu') {
      setOppForm({ ...o, etape: 'Perdu', motif_perte: o.motif_perte || '', contact_id: o.contact_id || '' })
      setOppError('')
      setOppModal('edit')
      return
    }
    try {
      await moveOpportunite(o, etape)
      await reload()
      addToast(`→ ${etape}`, 'success')
      if (etape === 'Gagné' && !o.chantier_id) {
        const ok = await confirm({
          title: 'Affaire gagnée 🎉',
          message: 'Créer le chantier correspondant maintenant ?',
          confirmLabel: 'Créer le chantier', cancelLabel: 'Plus tard',
        })
        if (ok) await convertToChantier({ ...o, etape: 'Gagné' })
      }
    } catch (e) { addToast(e?.message || 'Changement impossible', 'error') }
  }

  // ─── Conversion Gagné → Chantier ───
  const convertToChantier = async (o) => {
    if (o.chantier_id) { addToast('Un chantier est déjà rattaché.', 'info'); return }
    setSaving(true)
    try {
      const contact = contactsById.get(o.contact_id) || null
      const ch = await SB.upsertChantier(opportuniteToChantier(o, contact))
      if (contact) {
        try { await SB.addContactChantier(contact.id, ch.id) } catch { /* lien optionnel */ }
      }
      await linkOpportuniteToChantier(o.id, ch.id)
      await Promise.all([reload(), reloadDashboard?.()])
      addToast(`Chantier « ${ch.nom} » créé`, 'success')
    } catch (e) { addToast(e?.message || 'Conversion impossible', 'error') }
    finally { setSaving(false) }
  }

  // ─── Interactions ───
  const openNewInteraction = (o, preset = {}) => {
    setIntForm({
      opportunite_id: o?.id || null, contact_id: o?.contact_id || null,
      type: 'Appel', sujet: '', contenu: '',
      date: new Date().toISOString().slice(0, 16),
      prochaine_action: '', prochaine_action_date: '', ...preset,
    })
    setIntError('')
    setIntModal(true)
  }
  const saveInteraction = async () => {
    const err = validateInteraction(intForm)
    if (err) { setIntError(err); return }
    setSaving(true)
    try {
      await upsertInteraction({
        ...intForm,
        date: intForm.date ? new Date(intForm.date).toISOString() : undefined,
      })
      await reload()
      setIntModal(false)
      addToast('Interaction enregistrée', 'success')
    } catch (e) { setIntError(e?.message || "Erreur lors de l'enregistrement.") }
    finally { setSaving(false) }
  }
  const toggleAction = async (it) => {
    try { await setActionFaite(it.id, !it.action_faite); await reload() }
    catch (e) { addToast(e?.message || 'Mise à jour impossible', 'error') }
  }
  const removeInteraction = async (it) => {
    const ok = await confirm({ title: 'Supprimer cette interaction ?', confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try { await deleteInteraction(it.id); await reload() }
    catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  // ─── Drag & drop (desktop uniquement) ───
  const onDrop = async (etape) => {
    const o = opportunites.find(x => x.id === dragId)
    setDragId(null); setDragOver(null)
    if (o) await changeEtape(o, etape)
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      {/* ─── En-tête ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>CRM</h1>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            {stats.actives} affaire{stats.actives > 1 ? 's' : ''} en cours · pipeline {fmtMoney(stats.montantPipeline)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: m ? '100%' : 240 }}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Rechercher affaire, contact, adresse…"
              aria-label="Rechercher une opportunité"
              style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #E2E8F0', fontSize: 12, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <button onClick={openNew} title="Nouvelle opportunité (raccourci : n)"
            style={{ ...btnP, fontSize: 12, padding: '8px 14px' }}>+ Opportunité</button>
        </div>
      </div>

      {missingMigration && (
        <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 10, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
          La migration <code>025_crm.sql</code> n&apos;est pas encore appliquée sur la base : le pipeline restera vide
          et les enregistrements échoueront. Voir <code>migrations/025_README.md</code>.
        </div>
      )}
      {error && !missingMigration && (
        <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
          {error.message}
        </div>
      )}

      {/* ─── KPI ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Kpi label="Pipeline actif" value={fmtMoney(stats.montantPipeline)} sub={`${stats.actives} affaire${stats.actives > 1 ? 's' : ''}`} color="#3B82F6" />
        <Kpi label="Pondéré" value={fmtMoney(stats.montantPondere)} sub="montant × probabilité" color="#8B5CF6" />
        <Kpi label="Gagné ce mois" value={fmtMoney(stats.montantGagneMois)} sub={`${stats.gagneesMois} affaire${stats.gagneesMois > 1 ? 's' : ''}`} color="#10B981" />
        <Kpi label="Relances" value={String(nbRelances)} sub={followUps.overdue.length ? `${followUps.overdue.length} en retard` : 'à jour'}
          color={followUps.overdue.length ? '#EF4444' : '#F59E0B'} onClick={() => setView('relances')} />
      </div>

      {/* ─── Vues ─── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { k: 'pipeline', l: 'Pipeline', c: '#3B82F6', n: stats.actives },
          { k: 'relances', l: 'Relances', c: '#F59E0B', n: nbRelances },
          { k: 'closed',   l: 'Clôturées', c: '#64748B', n: grouped['Gagné'].length + grouped['Perdu'].length },
        ].map(p => {
          const active = view === p.k
          return (
            <button key={p.k} onClick={() => setView(p.k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
              fontSize: 11, fontWeight: 600, border: `1px solid ${active ? p.c : '#E2E8F0'}`,
              background: active ? p.c : '#fff', color: active ? '#fff' : '#334155', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {p.l} <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{p.n}</span>
            </button>
          )
        })}
      </div>

      {/* ─── PIPELINE (Kanban) ─── */}
      {view === 'pipeline' && (
        filtered.filter(o => !isClosed(o.etape)).length === 0 ? (
          <EmptyState icon="🎯" title={q ? 'Aucun résultat' : 'Aucune affaire en cours'}
            description={q ? 'Essaie un autre mot-clé.' : 'Ajoute ton premier prospect pour démarrer le pipeline.'}
            action={q ? { label: 'Effacer la recherche', onClick: () => setQ('') } : { label: '+ Nouvelle opportunité', onClick: openNew }} />
        ) : (
          <div style={{
            display: m ? 'grid' : 'flex', gap: 10,
            gridTemplateColumns: 'minmax(0,1fr)',
            overflowX: m ? 'visible' : 'auto', paddingBottom: 6, alignItems: 'flex-start',
          }}>
            {ETAPES_ACTIVES.map(etape => {
              const list = grouped[etape]
              const total = list.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
              const color = ETAPE_COLORS[etape]
              return (
                <div key={etape}
                  onDragOver={m ? undefined : (e) => { e.preventDefault(); setDragOver(etape) }}
                  onDragLeave={m ? undefined : () => setDragOver(null)}
                  onDrop={m ? undefined : (e) => { e.preventDefault(); onDrop(etape) }}
                  style={{
                    flex: '1 0 250px', minWidth: m ? 0 : 250, maxWidth: m ? 'none' : 320,
                    background: dragOver === etape ? color + '12' : '#F8FAFC',
                    border: `1px solid ${dragOver === etape ? color : '#E2E8F0'}`,
                    borderRadius: 12, padding: 10, transition: 'background .15s, border-color .15s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', flex: 1 }}>{etape}</span>
                    <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{list.length} · {fmtMoney(total)}</span>
                  </div>
                  {list.length === 0 && (
                    <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '14px 0', fontStyle: 'italic' }}>—</div>
                  )}
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
                    {list.map(o => (
                      <OpportuniteCard key={o.id} o={o} m={m}
                        contact={contactsById.get(o.contact_id)}
                        dormant={daysSinceLastInteraction(o, interactions)}
                        draggable={!m}
                        onDragStart={() => setDragId(o.id)}
                        onDragEnd={() => { setDragId(null); setDragOver(null) }}
                        onOpen={() => setSelectedId(o.id)}
                        onAdvance={nextEtape(o.etape) ? () => changeEtape(o, nextEtape(o.etape)) : null}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ─── RELANCES ─── */}
      {view === 'relances' && (
        <FollowUpList followUps={followUps} opportunites={opportunites} contactsById={contactsById}
          onToggle={toggleAction} onOpen={(id) => setSelectedId(id)} />
      )}

      {/* ─── CLÔTURÉES ─── */}
      {view === 'closed' && (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {[...grouped['Gagné'], ...grouped['Perdu']].length === 0 && (
            <EmptyState icon="🏁" title="Aucune affaire clôturée" description="Les affaires gagnées et perdues apparaîtront ici." />
          )}
          {[...grouped['Gagné'], ...grouped['Perdu']].map(o => {
            const c = contactsById.get(o.contact_id)
            const ch = (data?.chantiers || []).find(x => x.id === o.chantier_id)
            return (
              <div key={o.id} onClick={() => setSelectedId(o.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10,
                padding: '10px 14px', boxShadow: '0 1px 2px rgba(15,23,42,0.05)', cursor: 'pointer',
                borderLeft: `3px solid ${ETAPE_COLORS[o.etape]}`, minWidth: 0,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>
                    {c?.nom || '—'}{o.date_cloture ? ` · clôturé le ${fmtDate(o.date_cloture)}` : ''}
                    {o.etape === 'Perdu' && o.motif_perte ? ` · ${o.motif_perte}` : ''}
                    {ch ? ` · chantier ${ch.nom}` : ''}
                  </div>
                </div>
                {!m && <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{fmtMoney(o.montant_estime)}</span>}
                <Badge text={o.etape} color={ETAPE_COLORS[o.etape]} />
              </div>
            )
          })}
        </div>
      )}

      {/* ─── DÉTAIL OPPORTUNITÉ ─── */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={selected?.titre || ''} wide>
        {selected && (
          <OpportuniteDetail o={selected} m={m}
            contact={contactsById.get(selected.contact_id)}
            chantier={(data?.chantiers || []).find(x => x.id === selected.chantier_id)}
            interactions={interactions.filter(i => i.opportunite_id === selected.id)}
            saving={saving}
            onEdit={() => openEdit(selected)}
            onDelete={() => handleDelete(selected)}
            onChangeEtape={(e) => changeEtape(selected, e)}
            onConvert={() => convertToChantier(selected)}
            onGoChantier={selected.chantier_id && setTab ? () => { setSelectedId(null); setTab('projects', selected.chantier_id) } : null}
            onAddInteraction={(preset) => openNewInteraction(selected, preset)}
            onToggleAction={toggleAction}
            onDeleteInteraction={removeInteraction}
          />
        )}
      </Modal>

      {/* ─── FORMULAIRE OPPORTUNITÉ ─── */}
      <Modal open={!!oppModal} onClose={closeOppModal} title={oppModal === 'new' ? 'Nouvelle opportunité' : "Modifier l'opportunité"}>
        <FF label="Titre de l'affaire" required>
          <input style={inp} value={oppForm.titre || ''} autoFocus
            onChange={e => setOppForm({ ...oppForm, titre: e.target.value })}
            placeholder="Ex : Rénovation maison Dupont" />
        </FF>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
          <FF label="Étape">
            <select style={sel} value={oppForm.etape || 'Prospect'}
              onChange={e => {
                const etape = e.target.value
                setOppForm({ ...oppForm, etape, probabilite: isClosed(etape) ? ETAPE_PROBA[etape] : (oppForm.probabilite || ETAPE_PROBA[etape]) })
              }}>
              {ETAPES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </FF>
          <FF label="Probabilité (%)" hint={isClosed(oppForm.etape) ? 'Fixée par l’étape' : `Défaut ${ETAPE_PROBA[oppForm.etape] ?? 20} % pour cette étape`}>
            <input style={inp} type="number" min={0} max={100} inputMode="numeric"
              disabled={isClosed(oppForm.etape)}
              value={oppForm.probabilite ?? ''}
              onChange={e => setOppForm({ ...oppForm, probabilite: e.target.value })} />
          </FF>
          <FF label="Montant estimé (€ HT)">
            <input style={inp} type="number" min={0} step={100} inputMode="decimal"
              value={oppForm.montant_estime ?? ''}
              onChange={e => setOppForm({ ...oppForm, montant_estime: e.target.value })} />
          </FF>
          <FF label="Contact">
            <select style={sel} value={oppForm.contact_id || ''}
              onChange={e => setOppForm({ ...oppForm, contact_id: e.target.value })}>
              <option value="">— Aucun —</option>
              {(data?.contacts || []).map(c => (
                <option key={c.id} value={c.id}>{c.nom}{c.societe ? ` (${c.societe})` : ''}{c.type ? ` · ${c.type}` : ''}</option>
              ))}
            </select>
          </FF>
          <FF label="Type de projet">
            <select style={sel} value={oppForm.type_projet || ''}
              onChange={e => setOppForm({ ...oppForm, type_projet: e.target.value })}>
              <option value="">—</option>
              {TYPES_PROJET.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </FF>
          <FF label="Source">
            <select style={sel} value={oppForm.source || ''}
              onChange={e => setOppForm({ ...oppForm, source: e.target.value })}>
              <option value="">—</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </FF>
          <FF label="Adresse du projet">
            <input style={inp} value={oppForm.adresse || ''}
              onChange={e => setOppForm({ ...oppForm, adresse: e.target.value })} />
          </FF>
          <FF label="Clôture prévue">
            <input style={inp} type="date" value={oppForm.date_cloture_prevue || ''}
              onChange={e => setOppForm({ ...oppForm, date_cloture_prevue: e.target.value })} />
          </FF>
        </div>
        {oppForm.etape === 'Perdu' && (
          <FF label="Motif de la perte" required>
            <input style={inp} value={oppForm.motif_perte || ''} placeholder="Prix, délai, concurrent, projet abandonné…"
              onChange={e => setOppForm({ ...oppForm, motif_perte: e.target.value })} />
          </FF>
        )}
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={oppForm.notes || ''}
            onChange={e => setOppForm({ ...oppForm, notes: e.target.value })} />
        </FF>
        {oppError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {oppError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={closeOppModal} style={btnS}>Annuler</button>
          <button onClick={saveOpp} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </Modal>

      {/* ─── FORMULAIRE INTERACTION ─── */}
      <Modal open={intModal} onClose={() => setIntModal(false)} title="Nouvelle interaction">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {INTERACTION_TYPES.map(t => {
            const active = intForm.type === t
            return (
              <button key={t} type="button" onClick={() => setIntForm({ ...intForm, type: t })} style={{
                padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${active ? '#1E3A5F' : '#E2E8F0'}`, background: active ? '#1E3A5F' : '#fff', color: active ? '#fff' : '#334155',
              }}>{INTERACTION_ICONS[t]} {t}</button>
            )
          })}
        </div>
        <FF label="Sujet" required>
          <input style={inp} value={intForm.sujet || ''} autoFocus
            onChange={e => setIntForm({ ...intForm, sujet: e.target.value })}
            placeholder="Ex : Appel de qualification, visite sur site…" />
        </FF>
        <FF label="Date">
          <input style={inp} type="datetime-local" value={intForm.date || ''}
            onChange={e => setIntForm({ ...intForm, date: e.target.value })} />
        </FF>
        <FF label="Compte rendu">
          <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={intForm.contenu || ''}
            onChange={e => setIntForm({ ...intForm, contenu: e.target.value })} />
        </FF>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr', gap: '0 12px' }}>
          <FF label="Prochaine action" hint="Ex : envoyer le devis, rappeler, planifier une visite">
            <input style={inp} value={intForm.prochaine_action || ''}
              onChange={e => setIntForm({ ...intForm, prochaine_action: e.target.value })} />
          </FF>
          <FF label="Pour le">
            <input style={inp} type="date" value={intForm.prochaine_action_date || ''}
              onChange={e => setIntForm({ ...intForm, prochaine_action_date: e.target.value })} />
          </FF>
        </div>
        {intError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {intError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setIntModal(false)} style={btnS}>Annuler</button>
          <button onClick={saveInteraction} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════

function Kpi({ label, value, sub, color, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
      borderTop: `3px solid ${color}`, textAlign: 'left', border: 'none', borderTopStyle: 'solid',
      cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit', minWidth: 0,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{sub}</div>
    </Tag>
  )
}

export function OpportuniteCard({ o, contact, dormant, m, draggable, onDragStart, onDragEnd, onOpen, onAdvance }) {
  const color = ETAPE_COLORS[o.etape] || '#64748B'
  const late = o.date_cloture_prevue && o.date_cloture_prevue < todayISO()
  const isDormant = dormant != null && dormant >= 14
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      aria-label={`Ouvrir ${o.titre}`}
      style={{
        background: '#fff', borderRadius: 10, padding: '10px 12px', cursor: draggable ? 'grab' : 'pointer',
        boxShadow: '0 1px 2px rgba(15,23,42,0.06)', borderLeft: `3px solid ${color}`, minWidth: 0,
      }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
      <div style={{ fontSize: 10, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {contact ? (contact.societe || contact.nom) : 'Sans contact'}{o.type_projet ? ` · ${o.type_projet}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(o.montant_estime)}</span>
        <span style={{ fontSize: 10, color: '#94A3B8' }}>{o.probabilite} %</span>
        <span style={{ flex: 1 }} />
        {late && <span title="Clôture prévue dépassée" style={{ fontSize: 10, color: '#DC2626', fontWeight: 700 }}>⚠</span>}
        {isDormant && <span title={`Aucune interaction depuis ${dormant} j`} style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>💤 {dormant} j</span>}
        {onAdvance && !m && (
          <button onClick={(e) => { e.stopPropagation(); onAdvance() }} title={`Passer à « ${nextEtape(o.etape)} »`}
            aria-label={`Passer à ${nextEtape(o.etape)}`}
            style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer', padding: '2px 6px', fontSize: 11, fontFamily: 'inherit', color: '#475569' }}>→</button>
        )}
      </div>
    </div>
  )
}

function OpportuniteDetail({
  o, m, contact, chantier, interactions, saving,
  onEdit, onDelete, onChangeEtape, onConvert, onGoChantier,
  onAddInteraction, onToggleAction, onDeleteInteraction,
}) {
  const color = ETAPE_COLORS[o.etape]
  const closed = isClosed(o.etape)
  const next = nextEtape(o.etape)
  return (
    <div>
      {/* Bandeau étape + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Badge text={o.etape} color={color} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(o.montant_estime)}</span>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>{o.probabilite} %</span>
        <span style={{ flex: 1 }} />
        <button onClick={onEdit} style={{ ...btnS, fontSize: 12, padding: '6px 10px' }}>✎ Modifier</button>
        <button onClick={onDelete} aria-label="Supprimer l'opportunité"
          style={{ ...btnS, fontSize: 12, padding: '6px 10px', color: '#DC2626', background: '#FEF2F2' }}>Supprimer</button>
      </div>

      {/* Étapes cliquables */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {ETAPES.map(e => {
          const active = e === o.etape
          const c = ETAPE_COLORS[e]
          return (
            <button key={e} onClick={() => onChangeEtape(e)} disabled={active || saving}
              style={{
                padding: '5px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
                border: `1px solid ${active ? c : '#E2E8F0'}`, background: active ? c : '#fff', color: active ? '#fff' : '#334155',
              }}>{e}</button>
          )
        })}
      </div>

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '6px 16px', fontSize: 12, color: '#334155', marginBottom: 14 }}>
        <Info label="Contact" value={contact ? `${contact.nom}${contact.societe ? ` · ${contact.societe}` : ''}` : '—'} />
        <Info label="Téléphone" value={contact?.tel || contact?.tel_fixe || '—'} />
        <Info label="Email" value={contact?.email || '—'} />
        <Info label="Type de projet" value={o.type_projet || '—'} />
        <Info label="Source" value={o.source || '—'} />
        <Info label="Adresse" value={o.adresse || '—'} />
        <Info label="Clôture prévue" value={o.date_cloture_prevue ? fmtDate(o.date_cloture_prevue) : '—'} />
        {o.date_cloture && <Info label="Clôturée le" value={fmtDate(o.date_cloture)} />}
        {o.etape === 'Perdu' && <Info label="Motif" value={o.motif_perte || '—'} />}
        {o.created_by && <Info label="Créée par" value={o.created_by} />}
      </div>
      {o.notes && (
        <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 10, fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', marginBottom: 14 }}>{o.notes}</div>
      )}

      {/* Chantier */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {chantier ? (
          <button onClick={onGoChantier || undefined} disabled={!onGoChantier}
            style={{ ...btnS, fontSize: 12, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
            🏗️ Chantier : {chantier.nom}
          </button>
        ) : o.etape === 'Gagné' ? (
          <button onClick={onConvert} disabled={saving} style={{ ...btnP, fontSize: 12 }}>
            🏗️ Créer le chantier
          </button>
        ) : !closed && next ? (
          <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnS, fontSize: 12 }}>
            → Passer à « {next} »
          </button>
        ) : null}
      </div>

      {/* Interactions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
          Historique <span style={{ color: '#94A3B8', fontWeight: 500 }}>({interactions.length})</span>
        </h3>
        <button onClick={() => onAddInteraction()} style={{ ...btnP, fontSize: 12, padding: '6px 12px' }}>+ Interaction</button>
      </div>
      {interactions.length === 0 ? (
        <EmptyState compact icon="💬" title="Aucune interaction — note ton premier appel ou rendez-vous." />
      ) : (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {interactions.map(it => <InteractionRow key={it.id} it={it} onToggle={() => onToggleAction(it)} onDelete={() => onDeleteInteraction(it)} />)}
        </div>
      )}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

function InteractionRow({ it, onToggle, onDelete, context }) {
  const td = todayISO()
  const pending = it.prochaine_action_date && !it.action_faite
  const overdue = pending && it.prochaine_action_date < td
  const dateStr = it.date ? new Date(it.date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div style={{
      display: 'flex', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', minWidth: 0,
      borderLeft: `3px solid ${overdue ? '#EF4444' : pending ? '#F59E0B' : '#E2E8F0'}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden="true">{INTERACTION_ICONS[it.type] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
          {it.sujet}
          <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400, marginLeft: 6 }}>{it.type} · {dateStr}{it.created_by ? ` · ${it.created_by}` : ''}</span>
        </div>
        {context && <div style={{ fontSize: 10, color: '#64748B' }}>{context}</div>}
        {it.contenu && <div style={{ fontSize: 12, color: '#475569', whiteSpace: 'pre-wrap', marginTop: 2 }}>{it.contenu}</div>}
        {it.prochaine_action && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, cursor: 'pointer',
            color: it.action_faite ? '#94A3B8' : overdue ? '#DC2626' : '#92400E', textDecoration: it.action_faite ? 'line-through' : 'none' }}>
            <input type="checkbox" checked={!!it.action_faite} onChange={onToggle} aria-label="Marquer la relance comme faite" />
            {it.prochaine_action}{it.prochaine_action_date ? ` — ${fmtDate(it.prochaine_action_date)}` : ''}{overdue ? ' (en retard)' : ''}
          </label>
        )}
      </div>
      {onDelete && (
        <button onClick={onDelete} title="Supprimer" aria-label="Supprimer l'interaction"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, alignSelf: 'flex-start', display: 'flex' }}>
          <Icon d={I.trash} size={12} color="#94A3B8" />
        </button>
      )}
    </div>
  )
}

function FollowUpList({ followUps, opportunites, contactsById, onToggle, onOpen }) {
  const oppById = useMemo(() => new Map(opportunites.map(o => [o.id, o])), [opportunites])
  const groups = [
    { k: 'overdue', l: 'En retard', c: '#EF4444', list: followUps.overdue },
    { k: 'today',   l: "Aujourd'hui", c: '#F59E0B', list: followUps.today },
    { k: 'upcoming', l: 'À venir', c: '#3B82F6', list: followUps.upcoming },
  ]
  const total = groups.reduce((s, g) => s + g.list.length, 0)
  if (total === 0) {
    return <EmptyState icon="✅" title="Aucune relance en attente" description="Ajoute une « prochaine action » sur une interaction pour la retrouver ici." />
  }
  return (
    <div>
      {groups.map(g => g.list.length > 0 && (
        <div key={g.k} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.c }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{g.l}</h3>
            <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{g.list.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
            {g.list.map(it => {
              const o = oppById.get(it.opportunite_id)
              const c = contactsById.get(it.contact_id || o?.contact_id)
              const ctx = [o?.titre, c?.nom].filter(Boolean).join(' · ')
              return (
                <div key={it.id} onClick={() => o && onOpen(o.id)} style={{ cursor: o ? 'pointer' : 'default' }}>
                  <InteractionRow it={it} context={ctx} onToggle={(e) => { e?.stopPropagation?.(); onToggle(it) }} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
