'use client'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { SB, btnP, btnS, inp, fmtMoney, fmtDate } from '../dashboards/shared'
import { Modal, EmptyState } from '../components'
import { PageSkeleton } from '../components/Skeleton'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { useCrmData } from '../hooks/useCrmData'
import { useCrmDevis } from '../hooks/useCrmDevis'
import {
  ETAPES_ACTIVES, ETAPE_PROBA, isClosed, groupByEtape,
  pipelineStats, classifyFollowUps, validateOpportunite, validateInteraction, opportuniteToChantier,
} from '../lib/crm'
import {
  upsertOpportunite, moveOpportunite, deleteOpportunite,
  upsertInteraction, setActionFaite, deleteInteraction, linkOpportuniteToChantier,
} from '../lib/crmDb'
import { isNumeroProvisoire } from '../lib/devis'
import { upsertById, removeById, patchById } from '../lib/cacheList'
import DevisEditor from '../components/crm/DevisEditor'
import DevisSendModal from '../components/crm/DevisSendModal'
import Kpi from '../components/crm/Kpi'
import CrmFirstUseGuide from '../components/crm/CrmFirstUseGuide'
import CrmPipeline from '../components/crm/CrmPipeline'
import CrmClosedList from '../components/crm/CrmClosedList'
import FollowUpList from '../components/crm/FollowUpList'
import OpportuniteDetail from '../components/crm/OpportuniteDetail'
import OpportuniteFormModal from '../components/crm/OpportuniteFormModal'
import InteractionFormModal from '../components/crm/InteractionFormModal'
import { defaultSujet } from '../components/crm/crmUi'

// ═══════════════════════════════════════════════════════════════
// Page CRM — suivi commercial
// ═══════════════════════════════════════════════════════════════
//
// La page orchestre l'état (affaires, échanges, fenêtres ouvertes). Les
// devis vivent dans hooks/useCrmDevis.js ; l'affichage dans components/crm/.
export default function CrmV({ data, m, reload: reloadDashboard, setTab, focusId, focusTs }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const { crm, loading, error, reload, patch } = useCrmData()
  // Après une écriture dont on connaît le résultat : mise à jour locale du
  // cache au lieu de recharger toutes les tables du CRM.
  const applyOpp = async (saved) => {
    if (saved?.id) patch(c => ({ ...c, opportunites: upsertById(c.opportunites, saved) }))
    else await reload()
  }
  const applyInteraction = async (saved) => {
    if (saved?.id) patch(c => ({ ...c, interactions: upsertById(c.interactions, saved) }))
    else await reload()
  }
  const { opportunites, interactions, missingMigration } = crm

  const [view, setView] = useState('pipeline')       // pipeline | relances | won | lost
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('')              // ajout rapide (barre en haut)
  const [mobileStage, setMobileStage] = useState(null)
  const [oppModal, setOppModal] = useState(null)      // null | 'new' | 'edit'
  const [oppForm, setOppForm] = useState({})
  const [oppError, setOppError] = useState('')
  const [moreOptions, setMoreOptions] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [intModal, setIntModal] = useState(false)
  const [intForm, setIntForm] = useState({})
  const [intError, setIntError] = useState('')
  const [saving, setSaving] = useState(false)
  const quickRef = useRef(null)

  const contactsById = useMemo(() => {
    const map = new Map()
    for (const c of data?.contacts || []) map.set(c.id, c)
    return map
  }, [data?.contacts])

  // Devis : `changeEtape` est défini plus bas (appelé seulement à l'usage)
  const dv = useCrmDevis({
    crm, opportunites, interactions, contactsById, reload, setSaving,
    changeEtape: (o, etape) => changeEtape(o, etape),
  })

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
  // Relances sans objet (devis accepté / refusé / signé, affaire close) masquées
  const followUps = useMemo(
    () => classifyFollowUps(interactions, new Date(), { opportunites, devis: crm.devis || [] }),
    [interactions, opportunites, crm.devis],
  )
  const nbRelances = followUps.overdue.length + followUps.today.length
  const nbActifsFiltres = filtered.filter(o => !isClosed(o.etape)).length
  const isFirstUse = opportunites.length === 0 && !q

  // Mobile : une colonne à la fois. Par défaut, la première non vide.
  const stage = m ? (mobileStage || ETAPES_ACTIVES.find(e => grouped[e].length) || 'Prospect') : null

  // ─── Affaire : création / édition ───
  const openNew = useCallback((preset = {}) => {
    setOppForm({
      titre: '', etape: 'Prospect', probabilite: ETAPE_PROBA.Prospect,
      montant_estime: '', contact_id: '', source: '', type_projet: '',
      adresse: '', date_cloture_prevue: '', notes: '', ...preset,
    })
    setOppError(''); setMoreOptions(false)
    setOppModal('new')
  }, [])
  const openEdit = (o) => {
    setOppForm({ ...o, montant_estime: o.montant_estime ?? '', contact_id: o.contact_id || '' })
    setOppError(''); setMoreOptions(true)
    setOppModal('edit')
  }
  const closeOppModal = () => { setOppModal(null); setOppError('') }

  // Raccourci « n » = nouvelle affaire
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      if (oppModal || intModal || selectedId || dv.devisForm) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); quickRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [oppModal, intModal, selectedId, dv.devisForm])

  // Navigation entrante (recherche globale, Contacts, Qonto, Dashboard)
  useEffect(() => {
    if (!focusId || loading) return
    const f = String(focusId)
    if (f.startsWith('contact:')) {
      const c = contactsById.get(f.slice(8))
      setView('pipeline'); setQ(c?.nom || '')
    } else if (f === 'new') {
      openNew()
    } else if (f.startsWith('new:')) {
      openNew({ contact_id: f.slice(4) })
    } else if (f === 'relances') {
      setView('relances')
    } else if (opportunites.some(o => o.id === f)) {
      setSelectedId(f)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusTs, loading])

  // Ajout rapide : un titre + Entrée = une affaire en « Prospect ».
  // Les détails (contact, montant…) se complètent ensuite dans la fiche.
  const quickAdd = async () => {
    const titre = quick.trim()
    if (!titre) return
    setSaving(true)
    try {
      const saved = await upsertOpportunite({ titre, etape: 'Prospect' })
      setQuick('')
      await applyOpp(saved)
      addToast(`Affaire « ${titre} » ajoutée`, 'success')
      setSelectedId(saved.id)
    } catch (e) { addToast(e?.message || 'Ajout impossible', 'error') }
    finally { setSaving(false) }
  }

  // Création d'un contact à la volée depuis le sélecteur (type Client).
  // Les coordonnées se complètent ensuite dans l'onglet Contacts.
  const createContactInline = async (nom) => {
    try {
      const c = await SB.upsertContact({ nom, type: 'Client', actif: true })
      await reloadDashboard?.()
      addToast(`Contact « ${nom} » créé — complète ses coordonnées dans Contacts`, 'success')
      return c
    } catch (e) { addToast(e?.message || 'Création du contact impossible', 'error'); return null }
  }

  const saveOpp = async () => {
    const err = validateOpportunite(oppForm)
    if (err) { setOppError(err); return }
    setSaving(true)
    try {
      const saved = await upsertOpportunite(oppForm)
      await applyOpp(saved)
      closeOppModal()
      addToast(oppModal === 'edit' ? 'Affaire mise à jour' : 'Affaire créée', 'success')
      if (oppModal === 'new') setSelectedId(saved.id)
    } catch (e) {
      setOppError(e?.message || "Erreur lors de l'enregistrement.")
    } finally { setSaving(false) }
  }

  const handleDelete = async (o) => {
    const ok = await confirm({
      title: `Supprimer « ${o.titre} » ?`,
      message: "L'historique des échanges sera supprimé avec l'affaire.",
      confirmLabel: 'Supprimer', danger: true,
    })
    if (!ok) return
    try {
      await deleteOpportunite(o.id)
      if (selectedId === o.id) setSelectedId(null)
      await reload()
      addToast('Affaire supprimée', 'success')
    } catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  // Changement d'étape. Perdu demande un motif ; Gagné propose le chantier.
  const changeEtape = async (o, etape) => {
    if (o.etape === etape) return
    if (etape === 'Perdu') {
      setOppForm({ ...o, etape: 'Perdu', motif_perte: o.motif_perte || '', contact_id: o.contact_id || '' })
      setOppError(''); setMoreOptions(false)
      setOppModal('edit')
      return
    }
    try {
      await applyOpp(await moveOpportunite(o, etape))
      addToast(`« ${o.titre} » → ${etape}`, 'success')
      if (etape === 'Gagné' && !o.chantier_id) {
        const ok = await confirm({
          title: 'Affaire gagnée 🎉',
          message: 'Créer le chantier correspondant maintenant ? Le budget et le client seront repris.',
          confirmLabel: 'Créer le chantier', cancelLabel: 'Plus tard',
        })
        if (ok) await convertToChantier({ ...o, etape: 'Gagné' })
      }
    } catch (e) { addToast(e?.message || 'Changement impossible', 'error') }
  }

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

  // ─── Échanges (interactions) ───
  const openNewInteraction = (o, preset = {}) => {
    const c = contactsById.get(o?.contact_id)
    const type = preset.type || 'Appel'
    setIntForm({
      opportunite_id: o?.id || null, contact_id: o?.contact_id || null,
      type, sujet: defaultSujet(type, c), contenu: '',
      date: new Date().toISOString().slice(0, 16),
      prochaine_action: '', prochaine_action_date: '', ...preset,
    })
    setIntError('')
    setIntModal(true)
  }
  const saveInteraction = async () => {
    const form = { ...intForm }
    // Une date de relance sans libellé → « Rappeler » par défaut
    if (form.prochaine_action_date && !(form.prochaine_action || '').trim()) form.prochaine_action = 'Rappeler'
    const err = validateInteraction(form)
    if (err) { setIntError(err); return }
    setSaving(true)
    try {
      await applyInteraction(await upsertInteraction({ ...form, date: form.date ? new Date(form.date).toISOString() : undefined }))
      setIntModal(false)
      addToast(form.prochaine_action_date ? `Noté · relance le ${fmtDate(form.prochaine_action_date)}` : 'Échange noté', 'success')
    } catch (e) { setIntError(e?.message || "Erreur lors de l'enregistrement.") }
    finally { setSaving(false) }
  }
  const toggleAction = async (it) => {
    // Optimiste : la case se coche tout de suite, annulée si l'écriture échoue
    const setFaite = (v) => patch(c => ({ ...c, interactions: patchById(c.interactions, it.id, () => ({ action_faite: v })) }))
    setFaite(!it.action_faite)
    try { await setActionFaite(it.id, !it.action_faite) }
    catch (e) { setFaite(!!it.action_faite); addToast(e?.message || 'Mise à jour impossible', 'error') }
  }
  const removeInteraction = async (it) => {
    const ok = await confirm({ title: 'Supprimer cet échange ?', confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try { await deleteInteraction(it.id); patch(c => ({ ...c, interactions: removeById(c.interactions, it.id) })) }
    catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      {/* ─── En-tête ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>CRM</h1>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            {stats.actives === 0 ? 'Tes affaires en cours, du premier appel au chantier.' :
              `${stats.actives} affaire${stats.actives > 1 ? 's' : ''} en cours · ${fmtMoney(stats.montantPipeline)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isFirstUse && (
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Rechercher…" aria-label="Rechercher une affaire"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, width: m ? '100%' : 200, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          )}
          {!dv.devisMissing && (
            <button onClick={dv.importQonto} disabled={dv.importing} title="Importer dans le CRM les devis déjà présents dans Qonto"
              style={{ ...btnS, fontSize: 12, padding: '8px 12px', opacity: dv.importing ? 0.6 : 1 }}>
              {dv.importing ? 'Import…' : '↓ Devis Qonto'}
            </button>
          )}
          <button onClick={() => openNew()} title="Nouvelle affaire avec tous les détails"
            style={{ ...btnP, fontSize: 12, padding: '8px 14px' }}>+ Nouvelle affaire</button>
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

      {/* ─── Ajout rapide : un nom + Entrée ─── */}
      <form onSubmit={(e) => { e.preventDefault(); quickAdd() }}
        style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🎯</span>
          <input ref={quickRef} value={quick} onChange={e => setQuick(e.target.value)}
            aria-label="Ajouter une affaire rapidement"
            placeholder={m ? 'Nouvelle affaire… puis Entrée' : 'Ajouter une affaire : ex. « Rénovation maison Dupont » puis Entrée  (raccourci : n)'}
            style={{ ...inp, paddingLeft: 38, fontSize: 14, background: '#fff', borderColor: '#CBD5E1' }} />
        </div>
        {quick.trim() && (
          <button type="submit" disabled={saving} style={{ ...btnP, fontSize: 12, whiteSpace: 'nowrap' }}>Ajouter</button>
        )}
      </form>


      {/* ─── Première utilisation : guide en 3 étapes ─── */}
      {isFirstUse && !missingMigration && <CrmFirstUseGuide m={m} />}

      {!isFirstUse && (<>
        {/* ─── KPI ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <Kpi label="En cours" value={fmtMoney(stats.montantPipeline)} sub={`${stats.actives} affaire${stats.actives > 1 ? 's' : ''}`} color="#3B82F6" onClick={() => setView('pipeline')} />
          <Kpi label="Prévision" value={fmtMoney(stats.montantPondere)} sub="selon les chances de chaque affaire" color="#8B5CF6" />
          <Kpi label="Gagné ce mois" value={fmtMoney(stats.montantGagneMois)} sub={`${stats.gagneesMois} affaire${stats.gagneesMois > 1 ? 's' : ''}`} color="#10B981" onClick={() => setView('won')} />
          <Kpi label="À relancer" value={String(nbRelances)} sub={followUps.overdue.length ? `${followUps.overdue.length} en retard` : nbRelances ? "aujourd'hui" : 'rien en attente'}
            color={followUps.overdue.length ? '#EF4444' : '#F59E0B'} onClick={() => setView('relances')} />
        </div>

        {/* ─── Vues ─── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { k: 'pipeline', l: 'Pipeline', c: '#3B82F6', n: stats.actives },
            { k: 'relances', l: 'Relances', c: '#F59E0B', n: nbRelances },
            { k: 'won',      l: 'Gagnées',  c: '#10B981', n: grouped['Gagné'].length },
            { k: 'lost',     l: 'Perdues',  c: '#EF4444', n: grouped['Perdu'].length },
          ].map(p => {
            const active = view === p.k
            return (
              <button key={p.k} onClick={() => setView(p.k)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                fontSize: 12, fontWeight: 600, border: `1px solid ${active ? p.c : '#E2E8F0'}`,
                background: active ? p.c : '#fff', color: active ? '#fff' : '#334155', cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {p.l} <span style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{p.n}</span>
              </button>
            )
          })}
        </div>
      </>)}

      {/* ─── PIPELINE ─── */}
      {view === 'pipeline' && !isFirstUse && (
        nbActifsFiltres === 0 ? (
          <EmptyState icon="🎯" title={q ? 'Aucun résultat' : 'Aucune affaire en cours'}
            description={q ? 'Essaie un autre mot-clé.' : 'Ajoute une affaire dans la barre ci-dessus.'}
            action={q ? { label: 'Effacer la recherche', onClick: () => setQ('') } : { label: '+ Nouvelle affaire', onClick: () => openNew() }} />
        ) : (
          <CrmPipeline m={m} grouped={grouped} stage={stage} onSelectStage={setMobileStage}
            contactsById={contactsById} interactions={interactions}
            onOpen={(o) => setSelectedId(o.id)}
            onCall={(o) => openNewInteraction(o, { type: 'Appel' })}
            onMove={changeEtape}
            onNew={(etape) => openNew({ etape })} />
        )
      )}

      {/* ─── RELANCES ─── */}
      {view === 'relances' && (
        <FollowUpList followUps={followUps} opportunites={opportunites} contactsById={contactsById}
          onToggle={toggleAction} onOpen={(id) => setSelectedId(id)} />
      )}

      {/* ─── GAGNÉES / PERDUES ─── */}
      {(view === 'won' || view === 'lost') && (
        <CrmClosedList kind={view} list={view === 'won' ? grouped['Gagné'] : grouped['Perdu']}
          contactsById={contactsById} chantiers={data?.chantiers || []} onOpen={setSelectedId} />
      )}

      {/* ─── FICHE AFFAIRE ─── */}
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
            onGoContact={selected.contact_id && setTab ? () => { setSelectedId(null); setTab('contacts', selected.contact_id) } : null}
            onAddInteraction={(preset) => openNewInteraction(selected, preset)}
            onToggleAction={toggleAction}
            onDeleteInteraction={removeInteraction}
            devis={dv.devisAffiches.filter(d => d.opportunite_id === selected.id)}
            devisMissing={dv.devisMissing}
            onNewDevis={() => dv.openNewDevis(selected)}
            devisActions={{
              onNew: () => dv.openNewDevis(selected, { resume: false }),
              onOpen: dv.openDevis, onPdf: (d) => dv.downloadDevisPdf(d).catch(e => addToast(e?.message || 'PDF impossible', 'error')),
              onSend: dv.sendDevis, onAccept: dv.acceptDevis, onRefuse: dv.refuseDevis,
              onDuplicate: dv.duplicateDevisAction, onDelete: dv.removeDevis, onQonto: dv.qontoDevis, onSignedPdf: dv.downloadSignedPdf,
            }}
          />
        )}
      </Modal>

      {/* ─── ÉDITEUR DE DEVIS ─── */}
      <Modal open={!!dv.devisForm} onClose={dv.closeDevis} wide="xl"
        title={dv.devisForm ? `${isNumeroProvisoire(dv.devisForm.numero) ? 'Nouveau devis' : `Devis ${dv.devisForm.numero}`}${dv.oppOf(dv.devisForm) ? ` · ${dv.oppOf(dv.devisForm).titre}` : ''}` : ''}>
        {dv.devisForm && (
          <DevisEditor form={dv.devisForm} setForm={dv.setDevisForm} m={m} error={dv.devisError} saving={saving} unites={dv.unites}
            onCancel={dv.closeDevis} onPreview={dv.previewDevis}
            onSave={() => dv.saveDevis()} onSend={() => dv.saveDevis({ send: true })}
            history={dv.priceHistory} checks={dv.devisChecks} onAiGenerate={dv.aiGenerate} />
        )}
      </Modal>

      {/* ─── ENVOI DU DEVIS PAR MAIL ─── */}
      <DevisSendModal sendState={dv.sendState} saving={saving} docsApi={dv.devisDocsApi}
        onRetry={() => dv.prepareSend(dv.sendState.devis)} onPreviewPdf={dv.previewQontoPdf}
        onDraftAi={dv.draftEmailAi} onSubmit={dv.submitSend} onClose={dv.closeSend} />

      {/* ─── FORMULAIRE AFFAIRE ─── */}
      <OpportuniteFormModal mode={oppModal} form={oppForm} setForm={setOppForm} error={oppError} saving={saving}
        moreOptions={moreOptions} setMoreOptions={setMoreOptions} m={m}
        contacts={data?.contacts || []} onCreateContact={createContactInline}
        onSave={saveOpp} onClose={closeOppModal} />

      {/* ─── FORMULAIRE ÉCHANGE ─── */}
      <InteractionFormModal open={intModal} form={intForm} setForm={setIntForm} error={intError} saving={saving}
        contactsById={contactsById} onSave={saveInteraction} onClose={() => setIntModal(false)} />
    </div>
  )
}
