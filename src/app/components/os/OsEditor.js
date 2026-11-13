'use client'

// ═══════════════════════════════════════════════════════════════
// OsEditor — création / modification d'un ordre de service.
// ═══════════════════════════════════════════════════════════════
//
// Seul formulaire d'OS de l'application : page Ordres de service et fiche
// chantier passent par lui, avec les mêmes champs, les mêmes contrôles
// (lib/osRules.validateOs) et le même calcul des montants.
//
// Props :
//   os            : OS existant (modification) — sinon création
//   draft         : { form, prestations } de départ pour une création
//                   (nouvel OS, import d'un devis, duplication, modèle)
//   data          : { chantiers, contacts, ordresService }
//   lockChantier  : chantier imposé (ouvert depuis la fiche chantier)
//   onClose()     : fermeture sans enregistrer
//   onSaved(os)   : après enregistrement
//   importing, importError, onImportClick : import d'un devis par photo
//                   (création depuis la page Ordres de service)
//
// Le parent remonte le composant à chaque ouverture (prop key) : l'état
// part toujours de `os` / `draft`.

import { useState, useMemo, useCallback } from 'react'
import { SB, Icon, I, fmtMoney, FF, inp, sel, btnP, btnS } from '../../dashboards/shared'
import OSFormModal from '../OSFormModal'
import { useToast } from '../../contexts/ToastContext'
import { usePrestationManager } from '../../hooks/usePrestationManager'
import { useChiffrage } from '../../hooks/useChiffrage'
import { lotOptions as getLotOptions, suggestLot } from '../../lib/chiffrage'
import { isNetworkError } from '../../lib/offlineStore'
import {
  validateOs, osLockReason, statutsPossibles, cleanPrestations, computeOsTotals,
  editablePrestations, BLANK_LINE,
} from '../../lib/osRules'

const EMPTY = []

export default function OsEditor({
  os = null, draft = null, data = {}, m = false, lockChantier = false,
  onClose, onSaved, importing = false, importError = '', onImportClick,
}) {
  const { addToast } = useToast()
  const isEdit = !!os?.id
  const lockReason = isEdit ? osLockReason(os) : null

  const [form, setForm] = useState(() => (isEdit
    ? { ...os, tva_non_applicable: !!os.tva_non_applicable, lot: os.lot || '' }
    : { ...(draft?.form || {}) }))
  const tvaNA = !!form.tva_non_applicable
  const {
    prestations, setPrestations, addPrestation, removePrestation, updatePrestation, totals,
  } = usePrestationManager(
    isEdit ? editablePrestations(os) : (draft?.prestations?.length ? draft.prestations : [{ ...BLANK_LINE }]),
    { tvaNonApplicable: tvaNA },
  )
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const chantiers = data.chantiers || EMPTY
  const contacts = data.contacts || EMPTY

  // Lots du chantier de l'OS (chiffrage estimatif, sinon lots du chantier)
  const { chiffrage } = useChiffrage(form.chantier_id, { enabled: !!form.chantier_id })
  const chantier = chantiers.find(c => c.id === form.chantier_id)
  const lotOpts = useMemo(() => getLotOptions(chiffrage, chantier), [chiffrage, chantier])
  const suggestedLot = useMemo(() => suggestLot(form.artisan_specialite, lotOpts), [form.artisan_specialite, lotOpts])

  const contactsParType = useMemo(() => contacts.reduce((acc, c) => {
    const type = c.type || 'Autre'
    if (!acc[type]) acc[type] = []
    acc[type].push(c)
    return acc
  }, {}), [contacts])

  const updateChantier = useCallback((chId) => {
    const ch = chantiers.find(c => c.id === chId)
    setForm(f => ({ ...f, chantier_id: chId, client_nom: ch?.client || '', lot: '' }))
  }, [chantiers])

  // Choisir l'entreprise reprend ses coordonnées de l'annuaire
  const updateDestinataire = useCallback((name) => {
    const co = contacts.find(c => c.nom === name)
    if (!co) { setForm(f => ({ ...f, artisan_nom: name })); return }
    setForm(f => {
      const lot = !f.lot ? suggestLot(co.specialite, lotOpts) : null
      return {
        ...f,
        artisan_nom: co.nom,
        artisan_specialite: co.specialite || co.type || '',
        artisan_adresse: co.adresse || '',
        artisan_tel: co.tel || '',
        artisan_email: co.email_travaux || co.email || '',
        artisan_siret: co.siret || '',
        ...(lot ? { lot } : {}),
      }
    })
  }, [contacts, lotOpts])

  // TVA non applicable : toutes les lignes passent à 0 %
  const setTvaNonApplicable = useCallback((checked) => {
    setForm(f => ({ ...f, tva_non_applicable: checked }))
    if (checked) setPrestations(p => p.map(x => ({ ...x, tva_taux: '0' })))
    else setPrestations(p => p.map(x => (String(x.tva_taux) === '0' ? { ...x, tva_taux: '20' } : x)))
  }, [setPrestations])

  const handleSave = async () => {
    if (saving) return
    setFormError('')
    const err = validateOs(form, prestations, { allOs: data.ordresService || [], previous: isEdit ? os : null })
    if (err) { setFormError(err); return }
    setSaving(true)
    try {
      let saved
      if (lockReason) {
        // OS figé : seul le statut change
        saved = form.statut === os.statut ? os : await SB.updateOsStatut(os.id, form.statut, os.numero)
      } else {
        const lignes = cleanPrestations(prestations, tvaNA)
        const t = computeOsTotals(lignes, tvaNA)
        saved = await SB.upsertOS({
          ...form,
          numero: String(form.numero || '').trim(),
          prestations: lignes,
          montant_ht: t.ht,
          montant_tva: t.tva,
          montant_ttc: t.ttc,
        })
      }
      addToast(isEdit ? `OS ${saved?.numero || form.numero} enregistré` : `OS ${saved?.numero || form.numero} créé`, 'success')
      onSaved?.(saved)
    } catch (e) {
      setFormError(isNetworkError(e)
        ? "Pas de réseau : l'OS n'a pas été enregistré. Réessayez au retour de la connexion."
        : (e?.message || "Erreur lors de l'enregistrement."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <OSFormModal
      modal={isEdit ? 'edit' : 'new'}
      onClose={onClose}
      form={form}
      setForm={setForm}
      updateChantier={updateChantier}
      updateDestinataire={updateDestinataire}
      setTvaNonApplicable={setTvaNonApplicable}
      prestations={prestations}
      addPrestation={addPrestation}
      removePrestation={removePrestation}
      updatePrestation={updatePrestation}
      totals={totals}
      formError={formError}
      setFormError={setFormError}
      saving={saving}
      handleSave={handleSave}
      chantiers={chantiers}
      contactsParType={contactsParType}
      importing={importing}
      importError={importError}
      onImportClick={onImportClick}
      m={m}
      FF={FF}
      inp={inp}
      sel={sel}
      btnP={btnP}
      btnS={btnS}
      Icon={Icon}
      I={I}
      fmtMoney={fmtMoney}
      lotOptions={lotOpts}
      suggestedLot={suggestedLot}
      lockReason={lockReason}
      lockChantier={lockChantier}
      statutOptions={statutsPossibles(isEdit ? os.statut : 'Brouillon')}
    />
  )
}
