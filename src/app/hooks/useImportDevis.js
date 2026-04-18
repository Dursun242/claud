'use client'

// ═══════════════════════════════════════════════════════════════
// useImportDevis — import d'un devis par photo (Claude Vision) pour
// pré-remplir un formulaire Ordre de Service.
// ═══════════════════════════════════════════════════════════════
//
// Flux :
//   1. L'utilisateur choisit une photo via <input type="file" ref={devisInputRef}/>
//   2. On resize (1600px max) et on envoie à /api/extract-os-data
//   3. On matche le résultat avec l'annuaire existant (SIRET > société > nom)
//   4. On construit { form, prestations } pré-rempli et on appelle onReady().
//
// Le parent reste maître de la suite : il peut décider de copier dans son
// état + d'ouvrir une modale, ou faire autre chose.
//
// Dépendances :
//   - supabase (auth session)
//   - data.chantiers, data.contacts (pour matching + valeurs par défaut)
//   - nextNum() (génération du numéro OS côté parent)
//
// Retour : { importing, importError, setImportError, devisInputRef, handleImportDevis }

import { useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { SB } from '../dashboards/shared'

async function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX_W = 1600
        let { width, height } = img
        if (width > MAX_W) {
          height = Math.round(height * (MAX_W / width))
          width = MAX_W
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
      }
      img.onerror = () => reject(new Error('Image illisible'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Lecture fichier échouée'))
    reader.readAsDataURL(file)
  })
}

// Trouve un contact existant qui matche la société, le nom ou le SIRET
// extraits (priorité SIRET > société > nom). Permet de réutiliser
// l'identité fiable du contact plutôt que de créer un doublon.
function findExistingContact(contacts, extracted) {
  if (!extracted) return null
  const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')

  if (extracted.artisan_siret) {
    const siretClean = String(extracted.artisan_siret).replace(/\s/g, '')
    const byS = contacts.find(c => String(c.siret || '').replace(/\s/g, '') === siretClean)
    if (byS) return byS
  }
  if (extracted.artisan_societe) {
    const nSoc = norm(extracted.artisan_societe)
    const bySoc = contacts.find(c => norm(c.societe) === nSoc || norm(c.nom) === nSoc)
    if (bySoc) return bySoc
  }
  if (extracted.artisan_nom) {
    const nNom = norm(extracted.artisan_nom)
    const byN = contacts.find(c => norm(c.nom) === nNom)
    if (byN) return byN
  }
  return null
}

export function useImportDevis({ chantiers = [], contacts = [], nextNum, onReady } = {}) {
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const devisInputRef = useRef(null)

  const handleImportDevis = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de re-sélectionner la même photo
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setImportError("Ce fichier n'est pas une image.")
      return
    }

    setImporting(true)
    setImportError('')
    try {
      SB.log('import_photo', 'os', null, `Import devis par photo — ${file.name}`, {
        file_name: file.name,
        file_size: file.size,
      })
    } catch (_) {}

    try {
      const { base64, mediaType } = await resizeImageToBase64(file)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setImportError('Session expirée, reconnectez-vous.')
        return
      }

      const res = await fetch('/api/extract-os-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      })
      const json = await res.json()
      if (!res.ok) {
        setImportError(json.error || 'Extraction échouée')
        return
      }

      const extracted = json.data || {}
      if (!extracted || Object.keys(extracted).length === 0) {
        setImportError("Aucune information n'a pu être détectée sur cette image. Essaye une photo plus nette.")
        return
      }

      const existing = findExistingContact(contacts, extracted)
      const ch = chantiers[0]

      // Si un contact existe déjà → on utilise son nom (l'enrichOsForPdf
      // trouvera sa société au moment de générer le PDF).
      // Sinon → on privilégie la société extraite comme "nom principal".
      const fallbackName = extracted.artisan_societe || extracted.artisan_nom || ''
      const newForm = {
        numero: typeof nextNum === 'function' ? nextNum() : '',
        chantier_id: ch?.id || '',
        chantier: ch?.nom || '',
        adresse_chantier: ch?.adresse || '',
        client_nom: extracted.client_nom || ch?.client || '',
        client_adresse: extracted.client_adresse || '',
        artisan_nom: existing?.nom || fallbackName,
        artisan_specialite: existing?.specialite || extracted.artisan_specialite || '',
        artisan_adresse: existing?.adresse || extracted.artisan_adresse || '',
        artisan_tel: existing?.tel || extracted.artisan_tel || '',
        artisan_email: existing?.email || extracted.artisan_email || '',
        artisan_siret: existing?.siret || extracted.artisan_siret || '',
        date_emission: extracted.date_emission || new Date().toISOString().split('T')[0],
        date_intervention: extracted.date_intervention || '',
        date_fin_prevue: '',
        observations: extracted.observations || '',
        conditions: 'Paiement à 30 jours à compter de la réception de la facture.',
        statut: 'Brouillon',
      }

      const newPrestations = Array.isArray(extracted.prestations) && extracted.prestations.length > 0
        ? extracted.prestations.map(p => ({
            description: String(p.description || ''),
            unite: String(p.unite || 'u'),
            quantite: String(p.quantite || ''),
            prix_unitaire: String(p.prix_unitaire || ''),
            tva_taux: String(p.tva_taux || '20'),
          }))
        : [{ description: '', unite: 'm²', quantite: '', prix_unitaire: '', tva_taux: '20' }]

      onReady?.({ form: newForm, prestations: newPrestations })
    } catch (err) {
      setImportError('Erreur : ' + (err?.message || String(err)))
    } finally {
      setImporting(false)
    }
  }, [chantiers, contacts, nextNum, onReady])

  return { importing, importError, setImportError, devisInputRef, handleImportDevis }
}
