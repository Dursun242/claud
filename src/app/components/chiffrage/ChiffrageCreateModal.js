'use client'
// Création d'un chiffrage estimatif : par l'IA depuis une description du
// projet, par import d'un texte ou tableau collé (DPGF existant, export
// tableur, échange avec une IA), ou à la main. Le résultat s'ouvre dans
// l'éditeur : rien n'est enregistré avant validation.
import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { inp, btnP, btnS, FF } from '../../dashboards/shared'
import { apiPost } from '../../lib/crmApi'
import { newId, osPriceRefs } from '../../lib/chiffrage'
import { useToast } from '../../contexts/ToastContext'

const TABS = [['ia', '✨ Générer avec l’IA'], ['import', '📋 Importer'], ['manuel', '✏️ À la main']]

export default function ChiffrageCreateModal({ open, chantier, allOs = [], hasExisting, onClose, onResult }) {
  const { addToast } = useToast()
  const [tab, setTab] = useState('ia')
  const [description, setDescription] = useState('')
  const [surface, setSurface] = useState('')
  const [useLots, setUseLots] = useState(true)
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const chantierLots = chantier?.lots || []

  useEffect(() => { if (open) setBusy(false) }, [open])

  const run = async (body, source) => {
    setBusy(true)
    try {
      const { data } = await apiPost('/api/chiffrage/ia', body)
      onResult({
        lots: data.lots,
        surface_m2: data.surface_m2 || (Number(surface) || null),
        ...(source === 'ia' ? { description: description.trim() } : {}),
        source,
        hypotheses: data.hypotheses,
        conseils: data.conseils,
      })
    } catch (e) {
      addToast(e?.message || 'Erreur IA', 'error')
    } finally {
      setBusy(false)
    }
  }

  const generer = () => run({
    action: 'generer',
    description,
    surface_m2: Number(String(surface).replace(',', '.')) || null,
    chantier: chantier?.nom,
    adresse: chantier?.adresse,
    lots: useLots ? chantierLots : [],
    refs: osPriceRefs(allOs),
  }, 'ia')
  const importer = () => run({ action: 'importer', texte }, 'import')
  const manuel = () => onResult({
    lots: (chantierLots.length ? chantierLots : ['Gros œuvre']).map(nom => ({ id: newId('l'), nom, postes: [] })),
    surface_m2: Number(surface) || null,
    source: 'manuel',
  })

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title="Chiffrage estimatif" wide>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} disabled={busy} style={{
            ...btnS, padding: '7px 12px', fontSize: 12,
            background: tab === k ? '#0284C7' : '#F1F5F9', color: tab === k ? '#fff' : '#475569',
          }}>{label}</button>
        ))}
      </div>
      {hasExisting && <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
        Le résultat remplacera les lots du chiffrage actuel, une fois enregistré dans l’éditeur.
      </div>}

      {tab === 'ia' && <>
        <FF label="Description du projet" hint="Type de construction, surface, niveaux, pièces, matériaux, mode de chauffage, finitions, contraintes du terrain…">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={7} style={{ ...inp, resize: 'vertical' }}
            placeholder="Ex. : maison individuelle plain-pied de 110 m², 3 chambres, garage accolé 20 m², fondations superficielles, murs parpaing + ITI, charpente fermettes, tuiles, menuiseries PVC, PAC air/eau + plancher chauffant, VMC simple flux, finitions standard." />
        </FF>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 160 }}><FF label="Surface (m²)"><input inputMode="decimal" value={surface} onChange={e => setSurface(e.target.value)} style={inp} /></FF></div>
          {chantierLots.length > 0 && <label style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <input type="checkbox" checked={useLots} onChange={e => setUseLots(e.target.checked)} />
            Reprendre les lots du chantier ({chantierLots.length})
          </label>}
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>
          L’IA s’appuie sur les prix de vos ordres de service passés quand un poste équivalent existe. Compter 20 à 50 secondes.
        </div>
        <button onClick={generer} disabled={busy || description.trim().length < 10} style={{ ...btnP, opacity: busy || description.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? 'Chiffrage en cours…' : 'Générer le DPGF'}</button>
      </>}

      {tab === 'import' && <>
        <FF label="Texte ou tableau à importer" hint="Coller un DPGF (copié d’Excel, d’un PDF, d’une conversation avec une IA…). Les prix sont repris tels quels, rien n’est inventé.">
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={12} style={{ ...inp, resize: 'vertical', fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
        </FF>
        <button onClick={importer} disabled={busy || texte.trim().length < 10} style={{ ...btnP, opacity: busy || texte.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? 'Lecture en cours…' : 'Importer'}</button>
      </>}

      {tab === 'manuel' && <>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 12 }}>
          {chantierLots.length
            ? `Le DPGF démarre avec les lots du chantier (${chantierLots.join(', ')}) ; postes à saisir dans l’éditeur.`
            : 'Le DPGF démarre avec un lot vide ; lots et postes à saisir dans l’éditeur.'}
        </div>
        <button onClick={manuel} style={btnP}>Ouvrir l’éditeur</button>
      </>}
    </Modal>
  )
}
