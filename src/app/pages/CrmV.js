'use client'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { SB, COMPANY, Icon, I, FF, inp, sel, btnP, btnS, fmtMoney, fmtDate } from '../dashboards/shared'
import { Badge, Modal, EmptyState, ContactPicker, AddressPicker } from '../components'
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
  linkOpportuniteToChantier, upsertDevis, setDevisStatut, deleteDevis,
} from '../lib/crmDb'
import {
  devisFromOpportunite, duplicateDevis, validateDevis, computeDevisTotals, numeroProvisoire, isNumeroProvisoire, mergeUnites,
  normalizeLignes, devisMailContent, companySignature,
} from '../lib/devis'
import DevisEditor, { fmtEur } from '../components/crm/DevisEditor'
import DevisList, { qontoState } from '../components/crm/DevisList'
import DevisSendForm from '../components/crm/DevisSendForm'
import { buildPriceHistory, checkDevis, buildAiContext } from '../lib/devisAi'
import { supabase } from '../supabaseClient'

// Appel d'une route /api/* avec le JWT de la session. Lève une Error avec
// le message serveur ; `code` est propagé (ex. EMAIL_NOT_CONFIGURED).
async function apiPost(path, body) {
  const { data: { session } = {} } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) {
    const err = new Error(json.error || `Erreur ${res.status}`)
    err.code = json.code
    throw err
  }
  return json
}

const TYPES_PROJET = ['Rénovation', 'Construction neuve', 'Extension', 'Réhabilitation', 'Aménagement', 'Autre']
const todayISO = () => new Date().toISOString().slice(0, 10)
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const nextWeekday = (dow) => { // 1 = lundi … 5 = vendredi
  const d = new Date(); const diff = (dow - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10)
}

// Ce que l'app suggère de faire ensuite, par étape. Une seule phrase,
// un seul bouton : l'utilisateur n'a pas à réfléchir à « quoi faire ».
const NEXT_STEP = {
  'Prospect':     { text: 'Appelle le client pour comprendre son projet.', cta: '📞 Noter un appel', action: 'call' },
  'Qualifié':     { text: 'Le besoin est clair : prépare et envoie le devis.', cta: '📄 Créer le devis', action: 'devis' },
  'Devis envoyé': { text: 'Relance le client si tu n’as pas de réponse.', cta: '📞 Noter une relance', action: 'call' },
  'Négociation':  { text: 'Conclus : gagné ou perdu ?',                   cta: null },
}

// Étiquettes de relance rapide (un clic = une date)
const RELANCE_CHIPS = [
  { l: 'Demain',            d: () => addDays(1) },
  { l: 'Dans 3 jours',      d: () => addDays(3) },
  { l: 'Vendredi',          d: () => nextWeekday(5) },
  { l: 'Semaine prochaine', d: () => addDays(7) },
]

// ═══════════════════════════════════════════════════════════════
// Page CRM — suivi commercial
// ═══════════════════════════════════════════════════════════════
export default function CrmV({ data, m, reload: reloadDashboard, setTab, focusId, focusTs }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const { crm, loading, error, reload } = useCrmData()
  const { opportunites, interactions, missingMigration } = crm
  const allDevis = useMemo(() => crm.devis || [], [crm.devis])
  const devisMissing = !!crm.devisMissing
  // Devis Qonto { id, number, status } : suivi des statuts
  const [qontoQuotes, setQontoQuotes] = useState([])
  const [qontoUnits, setQontoUnits] = useState([])     // unités des devis Qonto

  const [view, setView] = useState('pipeline')       // pipeline | relances | closed
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
  const [dragId, setDragId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [saving, setSaving] = useState(false)
  const [devisForm, setDevisForm] = useState(null)   // null | devis en édition
  const [devisError, setDevisError] = useState('')
  const [sendState, setSendState] = useState(null)  // null | { devis, initial, error }
  const quickRef = useRef(null)

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

  // Unités proposées : base + celles des devis Qonto et du CRM
  const unites = useMemo(
    () => mergeUnites(qontoUnits, allDevis.flatMap(d => (d.lignes || []).map(l => l.unite))),
    [qontoUnits, allDevis],
  )

  // Devis Qonto chargés une fois (silencieux si Qonto n'est pas connecté)
  useEffect(() => {
    if (devisMissing) return
    let alive = true
    apiPost('/api/devis/qonto', { action: 'numbers' })
      .then(({ data: d }) => {
        if (!alive) return
        setQontoQuotes(d?.quotes || [])
        setQontoUnits(d?.units || [])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [devisMissing])

  // Suivi : un devis accepté / annulé dans Qonto l'est aussi dans le CRM
  const reconciled = useRef(new Set())
  useEffect(() => {
    if (!qontoQuotes.length || !allDevis.length) return
    const byId = new Map(qontoQuotes.map(q => [q.id, q]))
    const todo = allDevis.filter(d => {
      const q = d.qonto_quote_id && byId.get(d.qonto_quote_id)
      if (!q || reconciled.current.has(d.id)) return false
      return (q.status === 'approved' && d.statut !== 'Accepté') || (q.status === 'canceled' && d.statut !== 'Refusé' && d.statut !== 'Accepté')
    })
    if (!todo.length) return
    todo.forEach(d => reconciled.current.add(d.id))
    ;(async () => {
      for (const d of todo) {
        const accepted = byId.get(d.qonto_quote_id).status === 'approved'
        try {
          await setDevisStatut(d, accepted ? 'Accepté' : 'Refusé')
          const o = opportunites.find(x => x.id === d.opportunite_id)
          if (accepted && o && !isClosed(o.etape)) await moveOpportunite(o, 'Gagné', { montant_estime: Number(d.total_ht) || o.montant_estime })
          addToast(`Devis ${d.numero} ${accepted ? 'accepté' : 'annulé'} dans Qonto : mis à jour dans le CRM`, accepted ? 'success' : 'info')
        } catch { /* nouvel essai au prochain chargement */ reconciled.current.delete(d.id) }
      }
      await reload()
    })()
  }, [qontoQuotes, allDevis, opportunites, reload, addToast])

  // Raccourci « n » = nouvelle affaire
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return
      if (oppModal || intModal || selectedId || devisForm) return
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); quickRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [oppModal, intModal, selectedId, devisForm])

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
      await reload()
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
      await reload()
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
      await moveOpportunite(o, etape)
      await reload()
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
      await upsertInteraction({ ...form, date: form.date ? new Date(form.date).toISOString() : undefined })
      await reload()
      setIntModal(false)
      addToast(form.prochaine_action_date ? `Noté · relance le ${fmtDate(form.prochaine_action_date)}` : 'Échange noté', 'success')
    } catch (e) { setIntError(e?.message || "Erreur lors de l'enregistrement.") }
    finally { setSaving(false) }
  }
  const toggleAction = async (it) => {
    try { await setActionFaite(it.id, !it.action_faite); await reload() }
    catch (e) { addToast(e?.message || 'Mise à jour impossible', 'error') }
  }
  const removeInteraction = async (it) => {
    const ok = await confirm({ title: 'Supprimer cet échange ?', confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try { await deleteInteraction(it.id); await reload() }
    catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  // ─── Devis (migration 027) ───
  const oppOf = (d) => opportunites.find(o => o.id === d?.opportunite_id) || null
  // Les inputs manipulent des chaînes : on convertit les nombres persistés.
  const toForm = (d) => ({
    ...d,
    remise_pct: Number(d.remise_pct) ? String(d.remise_pct) : '',
    acompte_pct: Number(d.acompte_pct) ? String(d.acompte_pct) : '',
    lignes: (d.lignes || []).map(l => (l.type === 'titre' ? { ...l } : {
      ...l, quantite: String(l.quantite ?? ''), prix_unitaire: String(l.prix_unitaire ?? ''), tva_taux: String(l.tva_taux ?? '20'),
    })),
  })
  const openNewDevis = (o, { resume = true } = {}) => {
    // Depuis « Et maintenant ? » : un brouillon existant est repris plutôt
    // que d'en créer un second.
    const draft = resume && allDevis.find(d => d.opportunite_id === o.id && d.statut === 'Brouillon')
    setDevisError('')
    setDevisForm(draft ? toForm(draft) : { ...devisFromOpportunite(o), numero: numeroProvisoire() })
  }
  const openDevis = (d) => { setDevisError(''); setDevisForm(toForm(d)) }
  const closeDevis = () => { setDevisForm(null); setDevisError('') }

  // PDF officiel : celui généré par Qonto (Qonto le produit parfois avec
  // quelques secondes de retard après la création : un second essai).
  const qontoPdf = async (d) => {
    try {
      return (await apiPost('/api/devis/qonto', { action: 'pdf', devisId: d.id })).data
    } catch (e) {
      if (e.code !== 'PDF_UNAVAILABLE') throw e
      await new Promise(r => setTimeout(r, 2500))
      return (await apiPost('/api/devis/qonto', { action: 'pdf', devisId: d.id })).data
    }
  }
  const saveBase64Pdf = ({ base64, filename }) => {
    if (typeof window === 'undefined' || !window.URL?.createObjectURL) return
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  const downloadDevisPdf = async (d) => {
    if (d.qonto_quote_id && qontoState(d) === 'ok') {
      try { saveBase64Pdf(await qontoPdf(d)); return }
      catch (e) { addToast(`PDF Qonto indisponible (${e?.message || 'erreur'}) : PDF de l’application à la place`, 'info') }
    }
    await appDevisPdf(d)
  }
  const downloadSignedPdf = async (d) => {
    try { saveBase64Pdf((await apiPost('/api/devis/sign', { action: 'signed-pdf', devisId: d.id })).data) }
    catch (e) { addToast(`PDF signé indisponible : ${e?.message || 'erreur'}`, 'error') }
  }
  const appDevisPdf = async (d) => {
    const o = oppOf(d)
    const lignes = normalizeLignes(d.lignes)
    const { generateDevisPdf } = await import('../generators')
    await generateDevisPdf({ ...d, lignes }, {
      contact: contactsById.get(o?.contact_id) || null,
      opportunite: o,
      totals: computeDevisTotals(lignes, d),
    })
  }
  const previewDevis = async () => {
    try { await appDevisPdf(devisForm) }
    catch (e) { addToast(e?.message || 'Génération du PDF impossible', 'error') }
  }

  // ─── Intelligence : prix habituels, vérifications, IA ───
  const priceHistory = useMemo(() => buildPriceHistory(allDevis), [allDevis])
  const devisOpp = devisForm ? oppOf(devisForm) : null
  const devisChecks = useMemo(() => (devisForm ? checkDevis(devisForm, {
    opportunite: devisOpp, contact: contactsById.get(devisOpp?.contact_id) || null, history: priceHistory,
  }) : []), [devisForm, devisOpp, contactsById, priceHistory])

  const aiGenerate = async (description) => {
    const o = oppOf(devisForm)
    const { data } = await apiPost('/api/devis-ia', {
      action: 'generate',
      description,
      context: buildAiContext({
        opportunite: o,
        contact: contactsById.get(o?.contact_id) || null,
        interactions: interactions.filter(i => i.opportunite_id === o?.id),
        history: priceHistory,
      }),
    })
    return data
  }

  // Le devis passe « Envoyé », l'affaire en « Devis envoyé » (montant =
  // total HT) et une relance est programmée à J+7.
  const markDevisSent = async (d, note) => {
    const o = oppOf(d)
    const sent = await setDevisStatut(d, 'Envoyé')
    const ht = Number(sent?.total_ht ?? d.total_ht) || 0
    if (o && !isClosed(o.etape)) {
      const behind = ETAPES_ACTIVES.indexOf(o.etape) < ETAPES_ACTIVES.indexOf('Devis envoyé')
      await moveOpportunite(o, behind ? 'Devis envoyé' : o.etape, { montant_estime: ht })
    }
    try {
      await upsertInteraction({
        opportunite_id: o?.id || d.opportunite_id, contact_id: o?.contact_id || null, type: 'Email',
        sujet: `Devis ${d.numero} envoyé`, contenu: [note, `${fmtEur(ht)} HT`].filter(Boolean).join(' — '),
        prochaine_action: 'Relancer le devis', prochaine_action_date: addDays(7),
      })
    } catch { /* l'historique est un bonus : ne bloque pas l'envoi */ }
    await reload()
  }

  // Enregistre (ou met à jour) le devis dans Qonto, même numéro.
  // Retourne le devis à jour (numéro éventuellement repris de Qonto).
  const syncQonto = async (d) => {
    const { data: r } = await apiPost('/api/devis/qonto', { action: 'sync', devisId: d.id })
    if (r.mismatch) {
      addToast(`Qonto affiche ${fmtEur(r.mismatch.qonto)} TTC contre ${fmtEur(r.mismatch.app)} ici : vérifie le devis dans Qonto`, 'error')
    }
    if (r.numberConflict) {
      addToast(`Qonto a numéroté ce devis ${r.numberConflict}, mais ce numéro est déjà pris par un autre devis de l’application`, 'error')
    } else if (r.renumbered && !isNumeroProvisoire(d.numero)) {
      addToast(`Numéro Qonto repris dans l’application : ${r.renumbered}`, 'info')
    }
    return { ...d, ...r.devis, created: r.created }
  }
  const qontoDevis = async (d) => {
    setSaving(true)
    try {
      const r = await syncQonto(d)
      await reload()
      addToast(`Devis ${r.numero} ${r.created ? 'enregistré' : 'mis à jour'} dans Qonto`, 'success')
    } catch (e) {
      addToast(e?.message || 'Enregistrement dans Qonto impossible', 'error')
    } finally { setSaving(false) }
  }

  // Fenêtre d'envoi : le devis est d'abord mis à jour dans Qonto, puis son
  // PDF Qonto est récupéré pour vérification. On n'envoie que ce PDF-là.
  const sendToken = useRef(0)
  const prepareSend = async (d) => {
    const token = ++sendToken.current
    setSendState({ devis: d, status: 'loading', initial: null, pdf: null, error: '' })
    try {
      if (qontoState(d) !== 'ok') d = await syncQonto(d)
      const pdf = await qontoPdf(d)
      if (token !== sendToken.current) return
      const contact = contactsById.get(oppOf(d)?.contact_id) || null
      setSendState({ devis: d, status: 'ready', initial: devisMailContent(d, contact, COMPANY), pdf, error: '' })
    } catch (e) {
      if (token !== sendToken.current) return
      setSendState({ devis: d, status: 'error', initial: null, pdf: null, error: e?.message || 'Devis Qonto indisponible' })
    }
  }
  const sendDevis = (d) => { if (oppOf(d)) prepareSend(d) }
  const closeSend = () => { sendToken.current++; setSendState(null) }
  const previewQontoPdf = () => {
    const { pdf } = sendState || {}
    if (!pdf || typeof window === 'undefined' || !window.URL?.createObjectURL) return
    const bytes = Uint8Array.from(atob(pdf.base64), c => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const draftEmailAi = async () => {
    const d = sendState.devis
    const o = oppOf(d)
    const contact = contactsById.get(o?.contact_id) || null
    const totals = computeDevisTotals(normalizeLignes(d.lignes), d)
    const { data } = await apiPost('/api/devis-ia', {
      action: 'email',
      devis: { numero: d.numero, objet: d.objet, total_ht: totals.ht, total_ttc: totals.ttc, date_validite: d.date_validite },
      clientName: contact ? (contact.nom || contact.societe) : '',
      affaire: o?.titre || '',
      signature: companySignature(COMPANY),
    })
    return data
  }

  const submitSend = async (form) => {
    const { devis: d, pdf } = sendState
    if (!pdf) return
    setSaving(true)
    setSendState(st => ({ ...st, error: '' }))
    try {
      // Pièce jointe : uniquement le PDF Qonto vérifié dans la fenêtre
      const { base64, filename } = pdf
      // Signature électronique intégrée : le PDF Qonto est conservé et un
      // lien de signature sécurisé est ajouté au mail. Préparée avant le
      // mail : en cas d'échec, rien ne part.
      let text = form.body
      if (form.sign) {
        const { data: sig } = await apiPost('/api/devis/sign', {
          action: 'send', devisId: d.id, pdfBase64: base64, signerEmail: form.to,
        })
        const link = `${window.location.origin}/signer/${sig.token}`
        text = `${form.body}\n\nPour signer ce devis en ligne (bon pour accord) :\n${link}`
      }
      try {
        await apiPost('/api/devis/send', {
          to: form.to, cc: form.cc, subject: form.subject, text,
          copyMe: form.copyMe, pdfBase64: base64, filename,
        })
      } catch (e) {
        if (e.code !== 'EMAIL_NOT_CONFIGURED') throw e
        // Repli : PDF Qonto téléchargé + mail pré-rempli dans la messagerie
        saveBase64Pdf(pdf)
        await markDevisSent(d, `Préparé pour ${form.to}`)
        setSendState(null)
        if (typeof window !== 'undefined') {
          window.location.href = `mailto:${encodeURIComponent(form.to)}?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(form.body)}`
        }
        addToast('Envoi direct non configuré : joins le PDF téléchargé au mail qui s’ouvre · relance dans 7 jours', 'info')
        return
      }
      await markDevisSent(d, `Envoyé par mail à ${form.to}${form.sign ? ' · signature électronique demandée' : ''}`)
      setSendState(null)
      addToast(form.sign
        ? `Devis ${d.numero} envoyé à ${form.to} pour signature électronique`
        : `Devis ${d.numero} envoyé à ${form.to} · relance dans 7 jours`, 'success')
    } catch (e) {
      setSendState(st => (st ? { ...st, error: e?.message || 'Envoi impossible' } : st))
    } finally { setSaving(false) }
  }

  const saveDevis = async ({ send = false } = {}) => {
    const err = validateDevis(devisForm)
    if (err) { setDevisError(err); return }
    setSaving(true)
    let saved
    try {
      saved = await upsertDevis(devisForm)
    } catch (e) {
      setDevisError(e?.message || "Erreur lors de l'enregistrement.")
      setSaving(false)
      return
    }
    // Chaque devis enregistré est créé (ou mis à jour) dans Qonto
    let qontoError = ''
    try {
      saved = await syncQonto(saved)
    } catch (e) {
      if (e.code === 'NUMBER_TAKEN') {
        // Numéro déjà utilisé dans Qonto : on reste dans l'éditeur pour le changer
        setDevisForm(toForm(saved))
        setDevisError(e.message)
        await reload()
        setSaving(false)
        return
      }
      qontoError = e?.message || 'erreur inconnue'
    }
    await reload()
    setSaving(false)
    closeDevis()
    if (qontoError) addToast(`Devis enregistré dans l’application mais PAS dans Qonto (pas de numéro Qonto) : ${qontoError}`, 'error')
    if (send) sendDevis(saved)
    else if (!qontoError) addToast(`Devis ${saved.numero} enregistré dans l’application et dans Qonto`, 'success')
  }

  const acceptDevis = async (d) => {
    const o = oppOf(d)
    setSaving(true)
    try {
      await setDevisStatut(d, 'Accepté')
      await reload()
    } catch (e) { addToast(e?.message || 'Mise à jour impossible', 'error'); setSaving(false); return }
    setSaving(false)
    addToast(`Devis ${d.numero} accepté 🎉`, 'success')
    if (o && o.etape !== 'Gagné') await changeEtape({ ...o, montant_estime: Number(d.total_ht) || o.montant_estime }, 'Gagné')
  }
  const refuseDevis = async (d) => {
    try {
      await setDevisStatut(d, 'Refusé')
      await reload()
      addToast(`Devis ${d.numero} refusé · duplique-le pour une version révisée, ou marque l’affaire perdue`, 'info')
    } catch (e) { addToast(e?.message || 'Mise à jour impossible', 'error') }
  }
  const duplicateDevisAction = (d) => {
    setDevisError('')
    setDevisForm(toForm({ ...duplicateDevis(d), numero: numeroProvisoire() }))
  }
  const removeDevis = async (d) => {
    const ok = await confirm({ title: `Supprimer le devis ${d.numero} ?`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    try { await deleteDevis(d); await reload(); addToast('Devis supprimé', 'success') }
    catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

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
      {isFirstUse && !missingMigration && (
        <div style={{ background: 'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border: '1px solid #DBEAFE', borderRadius: 14, padding: m ? 16 : 22, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Bienvenue dans ton suivi commercial 👋</div>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>Trois gestes suffisent. Tout le reste est optionnel.</div>
          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { n: '1', t: 'Ajoute une affaire', d: 'Tape son nom dans la barre ci-dessus et appuie sur Entrée.' },
              { n: '2', t: 'Note tes échanges', d: 'Un appel, une visite… avec une date de relance en un clic.' },
              { n: '3', t: 'Fais-la avancer', d: 'Glisse la carte d’étape en étape. Gagnée ? Le chantier se crée tout seul.' },
            ].map(s => (
              <div key={s.n} style={{ background: '#fff', borderRadius: 10, padding: 12, display: 'flex', gap: 10 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#1E3A5F', color: '#fff', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.n}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{s.t}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 12 }}>
            💡 Tu peux aussi dicter à l&apos;Assistant IA (« j&apos;ai appelé Dupont, relance vendredi ») ou importer un devis depuis l&apos;onglet Qonto.
          </div>
        </div>
      )}

      {!isFirstUse && (<>
        {/* ─── KPI ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          <Kpi label="En cours" value={fmtMoney(stats.montantPipeline)} sub={`${stats.actives} affaire${stats.actives > 1 ? 's' : ''}`} color="#3B82F6" onClick={() => setView('pipeline')} />
          <Kpi label="Prévision" value={fmtMoney(stats.montantPondere)} sub="selon les chances de chaque affaire" color="#8B5CF6" />
          <Kpi label="Gagné ce mois" value={fmtMoney(stats.montantGagneMois)} sub={`${stats.gagneesMois} affaire${stats.gagneesMois > 1 ? 's' : ''}`} color="#10B981" onClick={() => setView('closed')} />
          <Kpi label="À relancer" value={String(nbRelances)} sub={followUps.overdue.length ? `${followUps.overdue.length} en retard` : nbRelances ? "aujourd'hui" : 'rien en attente'}
            color={followUps.overdue.length ? '#EF4444' : '#F59E0B'} onClick={() => setView('relances')} />
        </div>

        {/* ─── Vues ─── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { k: 'pipeline', l: 'Pipeline', c: '#3B82F6', n: stats.actives },
            { k: 'relances', l: 'Relances', c: '#F59E0B', n: nbRelances },
            { k: 'closed',   l: 'Terminées', c: '#64748B', n: grouped['Gagné'].length + grouped['Perdu'].length },
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
        ) : m ? (
          /* Mobile : une étape à la fois */
          <div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
              {ETAPES_ACTIVES.map(e => {
                const active = stage === e
                const c = ETAPE_COLORS[e]
                return (
                  <button key={e} onClick={() => setMobileStage(e)} style={{
                    flexShrink: 0, padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                    border: `1px solid ${active ? c : '#E2E8F0'}`, background: active ? c : '#fff', color: active ? '#fff' : '#334155',
                  }}>{e} <span style={{ opacity: 0.75, fontSize: 10 }}>{grouped[e].length}</span></button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
              {grouped[stage].length === 0 && (
                <EmptyState compact icon="—" title={`Rien en « ${stage} » pour l’instant.`} />
              )}
              {grouped[stage].map(o => (
                <OpportuniteCard key={o.id} o={o} contact={contactsById.get(o.contact_id)}
                  dormant={daysSinceLastInteraction(o, interactions)}
                  onOpen={() => setSelectedId(o.id)}
                  onCall={() => openNewInteraction(o, { type: 'Appel' })}
                  onAdvance={nextEtape(o.etape) ? () => changeEtape(o, nextEtape(o.etape)) : null} />
              ))}
              <button onClick={() => openNew({ etape: stage })} style={{ ...btnS, fontSize: 12, border: '1px dashed #CBD5E1', background: '#fff' }}>
                + Ajouter en « {stage} »
              </button>
            </div>
          </div>
        ) : (
          /* Desktop : Kanban */
          <div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, alignItems: 'flex-start' }}>
              {ETAPES_ACTIVES.map(etape => {
                const list = grouped[etape]
                const total = list.reduce((s, o) => s + (Number(o.montant_estime) || 0), 0)
                const color = ETAPE_COLORS[etape]
                return (
                  <div key={etape}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(etape) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => { e.preventDefault(); onDrop(etape) }}
                    style={{
                      flex: '1 0 250px', minWidth: 250, maxWidth: 320,
                      background: dragOver === etape ? color + '12' : '#F8FAFC',
                      border: `1px solid ${dragOver === etape ? color : '#E2E8F0'}`,
                      borderRadius: 12, padding: 10, transition: 'background .15s, border-color .15s',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', flex: 1 }}>{etape}</span>
                      <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{list.length}{total ? ` · ${fmtMoney(total)}` : ''}</span>
                    </div>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0,1fr)' }}>
                      {list.map(o => (
                        <OpportuniteCard key={o.id} o={o} contact={contactsById.get(o.contact_id)}
                          dormant={daysSinceLastInteraction(o, interactions)}
                          draggable
                          onDragStart={() => setDragId(o.id)}
                          onDragEnd={() => { setDragId(null); setDragOver(null) }}
                          onOpen={() => setSelectedId(o.id)}
                          onCall={() => openNewInteraction(o, { type: 'Appel' })}
                          onAdvance={nextEtape(o.etape) ? () => changeEtape(o, nextEtape(o.etape)) : null} />
                      ))}
                      <button onClick={() => openNew({ etape })} title={`Nouvelle affaire directement en « ${etape} »`} style={{
                        background: 'transparent', border: '1px dashed #CBD5E1', borderRadius: 10, padding: '8px', fontSize: 11,
                        color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      }}>+ Ajouter ici</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
              💡 Glisse une carte vers une autre colonne pour la faire avancer. Clique dessus pour voir la fiche.
            </div>
          </div>
        )
      )}

      {/* ─── RELANCES ─── */}
      {view === 'relances' && (
        <FollowUpList followUps={followUps} opportunites={opportunites} contactsById={contactsById}
          onToggle={toggleAction} onOpen={(id) => setSelectedId(id)} />
      )}

      {/* ─── TERMINÉES ─── */}
      {view === 'closed' && (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {[...grouped['Gagné'], ...grouped['Perdu']].length === 0 && (
            <EmptyState icon="🏁" title="Aucune affaire terminée" description="Les affaires gagnées et perdues apparaîtront ici." />
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
                    {c?.nom || '—'}{o.date_cloture ? ` · le ${fmtDate(o.date_cloture)}` : ''}
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
            devis={allDevis.filter(d => d.opportunite_id === selected.id)}
            devisMissing={devisMissing}
            onNewDevis={() => openNewDevis(selected)}
            devisActions={{
              onNew: () => openNewDevis(selected, { resume: false }),
              onOpen: openDevis, onPdf: (d) => downloadDevisPdf(d).catch(e => addToast(e?.message || 'PDF impossible', 'error')),
              onSend: sendDevis, onAccept: acceptDevis, onRefuse: refuseDevis,
              onDuplicate: duplicateDevisAction, onDelete: removeDevis, onQonto: qontoDevis, onSignedPdf: downloadSignedPdf,
            }}
          />
        )}
      </Modal>

      {/* ─── ÉDITEUR DE DEVIS ─── */}
      <Modal open={!!devisForm} onClose={closeDevis} wide
        title={devisForm ? `${isNumeroProvisoire(devisForm.numero) ? 'Nouveau devis' : `Devis ${devisForm.numero}`}${oppOf(devisForm) ? ` · ${oppOf(devisForm).titre}` : ''}` : ''}>
        {devisForm && (
          <DevisEditor form={devisForm} setForm={setDevisForm} m={m} error={devisError} saving={saving} unites={unites}
            onCancel={closeDevis} onPreview={previewDevis}
            onSave={() => saveDevis()} onSend={() => saveDevis({ send: true })}
            history={priceHistory} checks={devisChecks} onAiGenerate={aiGenerate} />
        )}
      </Modal>

      {/* ─── ENVOI DU DEVIS PAR MAIL ─── */}
      <Modal open={!!sendState} onClose={() => !saving && closeSend()}
        title={sendState ? `Envoyer le devis ${sendState.devis.numero}` : ''}>
        {sendState?.status === 'loading' && (
          <div role="status" style={{ padding: '24px 4px', fontSize: 13, color: '#475569' }}>
            Récupération du devis dans Qonto…
          </div>
        )}
        {sendState?.status === 'error' && (
          <div>
            <div role="alert" style={{ color: '#DC2626', fontSize: 13, marginBottom: 12, fontWeight: 500 }}>
              ⚠ Devis Qonto indisponible : {sendState.error}
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
              Seul le devis édité par Qonto peut être envoyé.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={closeSend} style={btnS}>Fermer</button>
              <button onClick={() => prepareSend(sendState.devis)} style={btnP}>Réessayer</button>
            </div>
          </div>
        )}
        {sendState?.status === 'ready' && (
          <DevisSendForm initial={sendState.initial} filename={sendState.pdf.filename}
            sending={saving} error={sendState.error} onPreviewPdf={previewQontoPdf} canSign
            onDraftAi={draftEmailAi} onSubmit={submitSend} onCancel={closeSend} />
        )}
      </Modal>

      {/* ─── FORMULAIRE AFFAIRE ─── */}
      <Modal open={!!oppModal} onClose={closeOppModal}
        title={oppModal === 'new' ? 'Nouvelle affaire' : oppForm.etape === 'Perdu' && !oppForm.motif_perte ? 'Affaire perdue' : "Modifier l'affaire"}>
        <FF label="Nom de l'affaire" required>
          <input style={inp} value={oppForm.titre || ''} autoFocus
            onChange={e => setOppForm({ ...oppForm, titre: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveOpp() } }}
            placeholder="Ex : Rénovation maison Dupont" />
        </FF>
        <FF label="Étape">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ETAPES.map(e => {
              const active = (oppForm.etape || 'Prospect') === e
              const c = ETAPE_COLORS[e]
              return (
                <button key={e} type="button" aria-pressed={active}
                  onClick={() => setOppForm({ ...oppForm, etape: e, probabilite: isClosed(e) ? ETAPE_PROBA[e] : (oppForm.probabilite || ETAPE_PROBA[e]) })}
                  style={{
                    padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${active ? c : '#E2E8F0'}`, background: active ? c : '#fff', color: active ? '#fff' : '#334155',
                  }}>{e}</button>
              )
            })}
          </div>
        </FF>
        <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
          <FF label="Client / contact" hint={!oppForm.contact_id ? 'Tape un nom ; s’il n’existe pas, tu peux le créer ici.' : undefined}>
            <ContactPicker contacts={data?.contacts || []} value={oppForm.contact_id || ''}
              onChange={(id) => setOppForm(f => ({ ...f, contact_id: id }))}
              onCreate={createContactInline} />
          </FF>
          <FF label="Montant estimé (€ HT)">
            <input style={inp} type="number" min={0} step={100} inputMode="decimal" placeholder="0"
              value={oppForm.montant_estime ?? ''}
              onChange={e => setOppForm({ ...oppForm, montant_estime: e.target.value })} />
          </FF>
        </div>
        {oppForm.etape === 'Perdu' && (
          <FF label="Pourquoi est-elle perdue ?" required>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {['Prix', 'Délai', 'Concurrent', 'Projet abandonné', 'Sans réponse'].map(mtf => (
                <button key={mtf} type="button" onClick={() => setOppForm({ ...oppForm, motif_perte: mtf })} style={{
                  padding: '4px 9px', borderRadius: 999, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1px solid ${oppForm.motif_perte === mtf ? '#EF4444' : '#E2E8F0'}`, background: oppForm.motif_perte === mtf ? '#FEF2F2' : '#fff', color: '#334155',
                }}>{mtf}</button>
              ))}
            </div>
            <input style={inp} value={oppForm.motif_perte || ''} placeholder="Ou précise…"
              onChange={e => setOppForm({ ...oppForm, motif_perte: e.target.value })} />
          </FF>
        )}

        <button type="button" onClick={() => setMoreOptions(v => !v)} aria-expanded={moreOptions}
          style={{ background: 'none', border: 'none', padding: '4px 0', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#3B82F6', fontWeight: 600 }}>
          {moreOptions ? '▾ Moins d’options' : '▸ Plus d’options (chances, type, source, adresse, date, notes)'}
        </button>
        {moreOptions && (
          <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
            <FF label="Chances de gagner (%)" hint={isClosed(oppForm.etape) ? 'Fixé par l’étape' : `Par défaut ${ETAPE_PROBA[oppForm.etape] ?? 20} % à cette étape`}>
              <input style={inp} type="number" min={0} max={100} inputMode="numeric"
                disabled={isClosed(oppForm.etape)}
                value={oppForm.probabilite ?? ''}
                onChange={e => setOppForm({ ...oppForm, probabilite: e.target.value })} />
            </FF>
            <FF label="Type de projet">
              <select style={sel} value={oppForm.type_projet || ''}
                onChange={e => setOppForm({ ...oppForm, type_projet: e.target.value })}>
                <option value="">—</option>
                {TYPES_PROJET.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FF>
            <FF label="D'où vient ce contact ?">
              <select style={sel} value={oppForm.source || ''}
                onChange={e => setOppForm({ ...oppForm, source: e.target.value })}>
                <option value="">—</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FF>
            <FF label="Adresse du projet">
              <AddressPicker value={oppForm.adresse || ''}
                onChange={v => setOppForm(f => ({ ...f, adresse: v }))} />
            </FF>
            <FF label="Décision attendue le">
              <input style={inp} type="date" value={oppForm.date_cloture_prevue || ''}
                onChange={e => setOppForm({ ...oppForm, date_cloture_prevue: e.target.value })} />
            </FF>
            <div style={{ gridColumn: '1 / -1' }}>
              <FF label="Notes">
                <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={oppForm.notes || ''}
                  onChange={e => setOppForm({ ...oppForm, notes: e.target.value })} />
              </FF>
            </div>
          </div>
        )}
        {oppError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {oppError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={closeOppModal} style={btnS}>Annuler</button>
          <button onClick={saveOpp} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </Modal>

      {/* ─── FORMULAIRE ÉCHANGE ─── */}
      <Modal open={intModal} onClose={() => setIntModal(false)} title="Noter un échange">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {INTERACTION_TYPES.map(t => {
            const active = intForm.type === t
            return (
              <button key={t} type="button" aria-pressed={active}
                onClick={() => setIntForm(f => ({ ...f, type: t, sujet: isAutoSujet(f.sujet) ? defaultSujet(t, contactsById.get(f.contact_id)) : f.sujet }))}
                style={{
                  padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? '#1E3A5F' : '#E2E8F0'}`, background: active ? '#1E3A5F' : '#fff', color: active ? '#fff' : '#334155',
                }}>{INTERACTION_ICONS[t]} {t}</button>
            )
          })}
        </div>
        <FF label="Sujet" required>
          <input style={inp} value={intForm.sujet || ''} autoFocus
            onChange={e => setIntForm({ ...intForm, sujet: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInteraction() } }} />
        </FF>
        <FF label="Ce qui s'est dit" hint="Optionnel">
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={intForm.contenu || ''}
            placeholder="Ex : il attend le devis avant fin de mois, budget max 40 k€…"
            onChange={e => setIntForm({ ...intForm, contenu: e.target.value })} />
        </FF>
        <FF label="Relancer">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => setIntForm({ ...intForm, prochaine_action_date: '', prochaine_action: '' })}
              aria-pressed={!intForm.prochaine_action_date}
              style={chip(!intForm.prochaine_action_date, '#64748B')}>Pas de relance</button>
            {RELANCE_CHIPS.map(c => {
              const d = c.d(); const active = intForm.prochaine_action_date === d
              return (
                <button key={c.l} type="button" aria-pressed={active}
                  onClick={() => setIntForm({ ...intForm, prochaine_action_date: d, prochaine_action: intForm.prochaine_action || 'Rappeler' })}
                  style={chip(active, '#F59E0B')}>{c.l}</button>
              )
            })}
            <input type="date" aria-label="Autre date de relance" value={intForm.prochaine_action_date || ''}
              onChange={e => setIntForm({ ...intForm, prochaine_action_date: e.target.value, prochaine_action: intForm.prochaine_action || (e.target.value ? 'Rappeler' : '') })}
              style={{ ...inp, width: 'auto', minHeight: 34, padding: '4px 8px', fontSize: 12 }} />
          </div>
        </FF>
        {intForm.prochaine_action_date && (
          <FF label="Quoi faire ce jour-là ?">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {['Rappeler', 'Envoyer le devis', 'Relancer par email', 'Planifier une visite'].map(a => (
                <button key={a} type="button" onClick={() => setIntForm({ ...intForm, prochaine_action: a })}
                  style={chip(intForm.prochaine_action === a, '#3B82F6')}>{a}</button>
              ))}
            </div>
            <input style={inp} value={intForm.prochaine_action || ''}
              onChange={e => setIntForm({ ...intForm, prochaine_action: e.target.value })} />
          </FF>
        )}
        {intError && <div role="alert" style={{ color: '#DC2626', fontSize: 12, marginBottom: 10, fontWeight: 500 }}>⚠ {intError}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setIntModal(false)} style={btnS}>Annuler</button>
          <button onClick={saveInteraction} disabled={saving} style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Noter'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Helpers & sous-composants
// ═══════════════════════════════════════════════════════════════

const AUTO_SUJETS = /^(Appel|Email|Réunion|Visite|Note)( avec .+| chez .+| sur .+)?$/
const isAutoSujet = (s) => !s || AUTO_SUJETS.test(s)
function defaultSujet(type, contact) {
  const who = contact ? (contact.societe || contact.nom) : null
  if (!who) return type
  if (type === 'Visite') return `Visite chez ${who}`
  if (type === 'Note') return `Note sur ${who}`
  return `${type} avec ${who}`
}

const chip = (active, color) => ({
  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  border: `1px solid ${active ? color : '#E2E8F0'}`, background: active ? color : '#fff', color: active ? '#fff' : '#334155',
})

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

const iconBtn = {
  background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
  padding: '3px 7px', fontSize: 12, fontFamily: 'inherit', color: '#475569', lineHeight: 1.2,
}

export function OpportuniteCard({ o, contact, dormant, draggable, onDragStart, onDragEnd, onOpen, onCall, onAdvance }) {
  const color = ETAPE_COLORS[o.etape] || '#64748B'
  const late = o.date_cloture_prevue && o.date_cloture_prevue < todayISO()
  const isDormant = dormant != null && dormant >= 14
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.() }
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
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {contact ? (contact.societe || contact.nom) : <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Sans contact</span>}
        {o.type_projet ? ` · ${o.type_projet}` : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {Number(o.montant_estime) > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(o.montant_estime)}</span>
          : <span style={{ fontSize: 11, color: '#94A3B8' }}>Montant ?</span>}
        <span style={{ flex: 1 }} />
        {late && <span title="Décision attendue dépassée" style={{ fontSize: 10, color: '#DC2626', fontWeight: 700 }}>⚠</span>}
        {isDormant && <span title={`Aucun échange depuis ${dormant} j`} style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>💤 {dormant} j</span>}
        {onCall && (
          <button onClick={stop(onCall)} title="Noter un appel" aria-label={`Noter un appel pour ${o.titre}`} style={iconBtn}>📞</button>
        )}
        {onAdvance && (
          <button onClick={stop(onAdvance)} title={`Passer à « ${nextEtape(o.etape)} »`}
            aria-label={`Passer à ${nextEtape(o.etape)}`} style={iconBtn}>→</button>
        )}
      </div>
    </div>
  )
}

function OpportuniteDetail({
  o, m, contact, chantier, interactions, saving,
  onEdit, onDelete, onChangeEtape, onConvert, onGoChantier, onGoContact,
  onAddInteraction, onToggleAction, onDeleteInteraction,
  devis = [], devisMissing = false, onNewDevis, devisActions = {},
}) {
  const color = ETAPE_COLORS[o.etape]
  const closed = isClosed(o.etape)
  const next = nextEtape(o.etape)
  const hint = NEXT_STEP[o.etape]
  const pendingRelance = interactions.find(i => i.prochaine_action_date && !i.action_faite)
  const draft = devis.find(d => d.statut === 'Brouillon')
  return (
    <div>
      {/* Bandeau étape + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge text={o.etape} color={color} />
        {Number(o.montant_estime) > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(o.montant_estime)}</span>}
        {!closed && <span style={{ fontSize: 11, color: '#94A3B8' }} title="Chances de gagner">{o.probabilite} % de chances</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onEdit} style={{ ...btnS, fontSize: 12, padding: '6px 10px' }}>✎ Modifier</button>
        <button onClick={onDelete} aria-label="Supprimer l'affaire" title="Supprimer"
          style={{ ...btnS, fontSize: 12, padding: '6px 10px', color: '#DC2626', background: '#FEF2F2' }}>🗑</button>
      </div>

      {/* Frise des étapes */}
      {!closed && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {ETAPES_ACTIVES.map((e, i) => {
            const idx = ETAPES_ACTIVES.indexOf(o.etape)
            const active = e === o.etape; const done = i < idx
            const c = ETAPE_COLORS[e]
            return (
              <button key={e} onClick={() => onChangeEtape(e)} disabled={active || saving} title={active ? 'Étape actuelle' : `Passer à « ${e} »`}
                style={{
                  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active || done ? c : '#E2E8F0'}`, background: active ? c : done ? c + '22' : '#fff', color: active ? '#fff' : done ? c : '#64748B',
                }}>{done ? '✓ ' : ''}{e}</button>
            )
          })}
        </div>
      )}

      {/* Prochaine étape suggérée + issue */}
      {!closed && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: '#334155' }}>
            {pendingRelance ? (
              <>
                <strong>Relance prévue :</strong> {pendingRelance.prochaine_action}
                <span style={{ color: pendingRelance.prochaine_action_date < todayISO() ? '#DC2626' : '#92400E', fontWeight: 600 }}> le {fmtDate(pendingRelance.prochaine_action_date)}</span>
                {pendingRelance.prochaine_action_date < todayISO() ? ' (en retard)' : ''}
              </>
            ) : (
              <><strong>Et maintenant ?</strong> {hint?.text}</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pendingRelance ? (
              <button onClick={() => onToggleAction(pendingRelance)} style={{ ...btnS, fontSize: 12 }}>✓ Fait</button>
            ) : hint?.action === 'call' ? (
              <button onClick={() => onAddInteraction({ type: 'Appel' })} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : hint?.action === 'devis' && !devisMissing ? (
              <button onClick={onNewDevis} disabled={saving} style={{ ...btnP, fontSize: 12 }}>
                {draft ? '📄 Reprendre le devis' : hint.cta}
              </button>
            ) : hint?.action === 'devis' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>→ {next}</button>
            ) : hint?.action === 'advance' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : null}
            <button onClick={() => onChangeEtape('Gagné')} disabled={saving} title="Marquer comme gagnée"
              style={{ ...btnS, fontSize: 12, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>🎉 Gagnée</button>
            <button onClick={() => onChangeEtape('Perdu')} disabled={saving} title="Marquer comme perdue"
              style={{ ...btnS, fontSize: 12, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Perdue</button>
          </div>
        </div>
      )}
      {closed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {chantier ? (
            <button onClick={onGoChantier || undefined} disabled={!onGoChantier}
              style={{ ...btnS, fontSize: 12, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
              🏗️ Ouvrir le chantier « {chantier.nom} »
            </button>
          ) : o.etape === 'Gagné' ? (
            <button onClick={onConvert} disabled={saving} style={{ ...btnP, fontSize: 12 }}>🏗️ Créer le chantier</button>
          ) : null}
          <button onClick={() => onChangeEtape('Négociation')} disabled={saving} style={{ ...btnS, fontSize: 12 }}>↩ Rouvrir l&apos;affaire</button>
        </div>
      )}

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '6px 16px', fontSize: 12, color: '#334155', marginBottom: 12 }}>
        <Info label="Client / contact" value={contact ? (
          onGoContact ? (
            <button onClick={onGoContact} title="Ouvrir la fiche contact"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1D4ED8', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>
              {contact.nom}{contact.societe ? ` · ${contact.societe}` : ''}
            </button>
          ) : `${contact.nom}${contact.societe ? ` · ${contact.societe}` : ''}`
        ) : (
          <button onClick={onEdit} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#3B82F6', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>+ Rattacher un contact</button>
        )} />
        {(contact?.tel || contact?.tel_fixe) && (
          <Info label="Téléphone" value={<a href={`tel:${(contact.tel || contact.tel_fixe).replace(/\s/g, '')}`} style={{ color: '#1D4ED8' }}>{contact.tel || contact.tel_fixe}</a>} />
        )}
        {contact?.email && <Info label="Email" value={<a href={`mailto:${contact.email}`} style={{ color: '#1D4ED8' }}>{contact.email}</a>} />}
        {o.type_projet && <Info label="Type de projet" value={o.type_projet} />}
        {o.source && <Info label="Source" value={o.source} />}
        {o.adresse && <Info label="Adresse" value={o.adresse} />}
        {o.date_cloture_prevue && <Info label="Décision attendue" value={fmtDate(o.date_cloture_prevue)} />}
        {o.date_cloture && <Info label="Terminée le" value={fmtDate(o.date_cloture)} />}
        {o.etape === 'Perdu' && <Info label="Motif" value={o.motif_perte || '—'} />}
        {o.qonto_quote_number && <Info label="Devis Qonto" value={o.qonto_quote_number} />}
      </div>
      {o.notes && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 10, fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{o.notes}</div>
      )}

      {/* Devis : affichés dès qu'il en existe, ou à partir de « Qualifié » */}
      {(devis.length > 0 || (!closed && o.etape !== 'Prospect')) && (
        <DevisList devis={devis} missing={devisMissing} saving={saving} {...devisActions} />
      )}

      {/* Échanges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
          Échanges <span style={{ color: '#94A3B8', fontWeight: 500 }}>({interactions.length})</span>
        </h3>
        {INTERACTION_TYPES.map(t => (
          <button key={t} onClick={() => onAddInteraction({ type: t })} title={`Noter : ${t}`} aria-label={`Noter ${t}`}
            style={{ ...iconBtn, fontSize: 13, padding: '4px 8px' }}>{INTERACTION_ICONS[t]}</button>
        ))}
      </div>
      {interactions.length === 0 ? (
        <EmptyState compact icon="💬" title="Aucun échange. Clique sur 📞 ✉️ 🤝 🏠 📝 pour en noter un." />
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
  const dateStr = it.date ? new Date(it.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''
  return (
    <div style={{
      display: 'flex', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', minWidth: 0,
      borderLeft: `3px solid ${overdue ? '#EF4444' : pending ? '#F59E0B' : '#E2E8F0'}`,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.2 }} aria-hidden="true">{INTERACTION_ICONS[it.type] || '📝'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
          {it.sujet}
          <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400, marginLeft: 6 }}>{dateStr}</span>
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
        <button onClick={onDelete} title="Supprimer" aria-label="Supprimer l'échange"
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
    return <EmptyState icon="✅" title="Rien à relancer" description="Quand tu notes un échange, choisis « Demain », « Vendredi »… et la relance apparaîtra ici." />
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
