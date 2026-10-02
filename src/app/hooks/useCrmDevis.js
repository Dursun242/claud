'use client'
// ═══════════════════════════════════════════════════════════════
// useCrmDevis — devis du CRM : éditeur, Qonto (création, statuts, import,
// suivi), PDF, envoi par mail avec signature, IA de chiffrage.
// ═══════════════════════════════════════════════════════════════
//
// Extrait de pages/CrmV.js. `setSaving` est l'indicateur « enregistrement
// en cours » partagé avec la page ; `changeEtape(o, etape)` fait avancer
// l'affaire (utilisé quand un devis est accepté).

import { useState, useMemo, useEffect, useRef } from 'react'
import { COMPANY } from '../dashboards/shared'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'
import { ETAPES_ACTIVES, isClosed } from '../lib/crm'
import { moveOpportunite, upsertInteraction, upsertDevis, setDevisStatut, deleteDevis } from '../lib/crmDb'
import {
  devisFromOpportunite, duplicateDevis, validateDevis, computeDevisTotals, numeroProvisoire, isNumeroProvisoire, mergeUnites,
  normalizeLignes, devisMailContent, companySignature,
} from '../lib/devis'
import { fmtEur } from '../components/crm/DevisEditor'
import { qontoState } from '../components/crm/DevisList'
import { addDays } from '../components/crm/crmUi'
import { summarizeDevisEvents } from '../lib/devisTracking'
import { buildPriceHistory, checkDevis, buildAiContext } from '../lib/devisAi'
import { apiPost, saveBase64Pdf, openBase64Pdf } from '../lib/crmApi'
import { supabase } from '../supabaseClient'

export function useCrmDevis({ crm, opportunites, interactions, contactsById, reload, setSaving, changeEtape }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const allDevis = useMemo(() => crm.devis || [], [crm.devis])
  const devisMissing = !!crm.devisMissing
  // Devis Qonto { id, number, status } : suivi des statuts
  const [qontoQuotes, setQontoQuotes] = useState([])
  const [qontoUnits, setQontoUnits] = useState([])     // unités des devis Qonto
  const [qontoComplete, setQontoComplete] = useState(false) // liste Qonto complète
  const [devisForm, setDevisForm] = useState(null)   // null | devis en édition
  const [devisError, setDevisError] = useState('')
  const [sendState, setSendState] = useState(null)  // null | { devis, initial, error }
  const [importing, setImporting] = useState(false)

  // Devis liés à Qonto mais absents de la liste Qonto : supprimés dans Qonto.
  // + suivi des ouvertures du mail / consultations en ligne (migration 030)
  const suiviDevis = useMemo(() => summarizeDevisEvents(crm.devisEvents || []), [crm.devisEvents])
  const devisAffiches = useMemo(() => {
    const ids = qontoComplete ? new Set(qontoQuotes.map(q => String(q.id))) : null
    return allDevis.map(d => {
      const deleted = ids && d.qonto_quote_id && !ids.has(String(d.qonto_quote_id))
      const suivi = suiviDevis[d.id]
      return deleted || suivi ? { ...d, ...(deleted ? { _qontoDeleted: true } : {}), ...(suivi ? { _suivi: suivi } : {}) } : d
    })
  }, [allDevis, qontoQuotes, qontoComplete, suiviDevis])

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
        setQontoComplete(!!d?.complete)
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

  // Import des devis déjà présents dans Qonto (absents du CRM)
  const importQonto = async () => {
    const ok = await confirm({
      title: 'Importer les devis Qonto ?',
      message: 'Les devis présents dans Qonto mais pas encore dans le CRM sont ajoutés, avec leurs lignes et leur statut. Une affaire est créée pour chacun (sauf si elle existe déjà).',
      confirmLabel: 'Importer',
    })
    if (!ok) return
    setImporting(true)
    try {
      const { data: r } = await apiPost('/api/devis/qonto', { action: 'import' })
      await reload()
      if (!r.imported && !r.conflicts?.length) addToast('Tous les devis Qonto sont déjà dans le CRM', 'info')
      else if (r.imported) addToast(`${r.imported} devis Qonto importé${r.imported > 1 ? 's' : ''} dans le CRM`, 'success')
      if (r.conflicts?.length) {
        addToast(`Non importés (numéro déjà utilisé dans le CRM) : ${r.conflicts.join(', ')}`, 'error')
      }
    } catch (e) {
      addToast(e?.message || 'Import des devis Qonto impossible', 'error')
    } finally { setImporting(false) }
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
    if (sendState?.pdf) openBase64Pdf(sendState.pdf)
  }

  // Pièces jointes du mail : documents permanents (Kbis, décennale…) + fichiers
  const devisDocsApi = useMemo(() => ({
    list: async () => (await apiPost('/api/devis/documents', { action: 'list' })).data.docs,
    // Dépôt direct dans Storage via une URL signée (pas de limite Vercel)
    upload: async (file, permanent) => {
      const { data: prep } = await apiPost('/api/devis/documents', {
        action: 'prepare', name: file.name, type: file.type, size: file.size, permanent: !!permanent,
      })
      const { error } = await supabase.storage.from('attachments')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: prep.type })
      if (error) throw new Error(`Dépôt de « ${prep.name} » impossible : ${error.message}`)
      return { path: prep.path, name: prep.name, size: prep.size }
    },
    remove: async (doc) => {
      const ok = await confirm({
        title: `Retirer « ${doc.name} » ?`,
        message: 'Il ne sera plus proposé en pièce jointe des prochains devis.',
        confirmLabel: 'Retirer', danger: true,
      })
      if (!ok) return false
      await apiPost('/api/devis/documents', { action: 'remove', path: doc.path })
      return true
    },
  }), [confirm])

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
      let signUrl
      if (form.sign) {
        const { data: sig } = await apiPost('/api/devis/sign', {
          action: 'send', devisId: d.id, pdfBase64: base64, signerEmail: form.to,
        })
        signUrl = `${window.location.origin}/signer/${sig.token}`
      }
      try {
        await apiPost('/api/devis/send', {
          to: form.to, cc: form.cc, subject: form.subject, text: form.body, signUrl, devisId: d.id,
          copyMe: form.copyMe, pdfBase64: base64, filename, attachments: form.attachments || [],
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

  // Statut du CRM reporté dans Qonto (accepté / refusé). Qonto ne permet
  // pas toujours ce changement par l'API : on prévient alors de le faire
  // dans Qonto.
  const pushQontoStatus = async (d, statut) => {
    if (!d.qonto_quote_id) return
    try {
      const { data: r } = await apiPost('/api/devis/qonto', { action: 'status', devisId: d.id, statut })
      if (r?.applied || r?.skipped) return
    } catch { /* message ci-dessous */ }
    addToast(`Pense à marquer le devis ${d.numero} « ${statut === 'Accepté' ? 'accepté' : 'refusé'} » dans Qonto aussi`, 'info')
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
    await pushQontoStatus(d, 'Accepté')
    if (o && o.etape !== 'Gagné') await changeEtape({ ...o, montant_estime: Number(d.total_ht) || o.montant_estime }, 'Gagné')
  }
  const refuseDevis = async (d) => {
    try {
      await setDevisStatut(d, 'Refusé')
      await reload()
      addToast(`Devis ${d.numero} refusé · duplique-le pour une version révisée, ou marque l’affaire perdue`, 'info')
    } catch (e) { addToast(e?.message || 'Mise à jour impossible', 'error'); return }
    await pushQontoStatus(d, 'Refusé')
  }
  const duplicateDevisAction = (d) => {
    setDevisError('')
    setDevisForm(toForm({ ...duplicateDevis(d), numero: numeroProvisoire() }))
  }
  const removeDevis = async (d) => {
    const inQonto = !!d.qonto_quote_id && !d._qontoDeleted
    const ok = await confirm({
      title: `Supprimer le devis ${d.numero} ?`,
      message: inQonto ? 'Il sera aussi supprimé dans Qonto.' : undefined,
      confirmLabel: 'Supprimer', danger: true,
    })
    if (!ok) return
    if (inQonto) {
      try {
        await apiPost('/api/devis/qonto', { action: 'delete', devisId: d.id })
      } catch (e) {
        const crmOnly = await confirm({
          title: 'Suppression dans Qonto impossible',
          message: `${e?.message || 'Erreur Qonto'}\n\nSupprimer le devis seulement dans le CRM ?`,
          confirmLabel: 'Supprimer du CRM', danger: true,
        })
        if (!crmOnly) return
      }
    }
    try {
      await deleteDevis(d); await reload()
      addToast(inQonto ? 'Devis supprimé (CRM et Qonto)' : 'Devis supprimé', 'success')
    } catch (e) { addToast(e?.message || 'Suppression impossible', 'error') }
  }

  return {
    devisMissing, devisAffiches, unites, priceHistory, devisChecks, importing,
    devisForm, setDevisForm, devisError, sendState,
    oppOf, openNewDevis, openDevis, closeDevis, previewDevis, aiGenerate, saveDevis,
    downloadDevisPdf, downloadSignedPdf, qontoDevis, importQonto,
    sendDevis, prepareSend, closeSend, previewQontoPdf, devisDocsApi, draftEmailAi, submitSend,
    acceptDevis, refuseDevis, duplicateDevisAction, removeDevis,
  }
}
