'use client'
// Création d'un chiffrage estimatif :
//   - depuis les plans du permis (PCMI, PDF ou photos) : l'IA relève le
//     métré, qu'on vérifie et corrige, puis chiffre avec les prix des OS ;
//   - par l'IA depuis une description du projet ;
//   - par import d'un texte ou tableau collé (DPGF existant, export tableur,
//     échange avec une IA) ;
//   - à la main.
// Le résultat s'ouvre dans l'éditeur : rien n'est enregistré avant validation.
import { useEffect, useState } from 'react'
import Modal from '../Modal'
import { inp, btnP, btnS, FF } from '../../dashboards/shared'
import { apiPost } from '../../lib/crmApi'
import { newId, osPriceRefs, observationsText } from '../../lib/chiffrage'
import { prepareFile } from '../../lib/conformiteClient'
import { genererDpgf } from '../../lib/chiffrageGen'
import { supabase } from '../../supabaseClient'
import { useToast } from '../../contexts/ToastContext'

const TABS = [['plans', '📐 Depuis les plans'], ['ia', '✨ Depuis une description'], ['import', '📋 Importer'], ['manuel', '✏️ À la main']]
const small = { minHeight: 38, padding: '7px 9px', fontSize: 14 }
const xBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 14, padding: '4px 6px', fontFamily: 'inherit' }

const post = async (body) => (await apiPost('/api/chiffrage/ia', body)).data

export default function ChiffrageCreateModal({ open, chantier, allOs = [], hasExisting, onClose, onResult }) {
  const { addToast } = useToast()
  const [tab, setTab] = useState('plans')
  // Plans : fichiers choisis, chemins déposés (gardés pour réessayer), métré relevé
  const [files, setFiles] = useState([])
  const [paths, setPaths] = useState([])
  const [notes, setNotes] = useState('')
  const [metre, setMetre] = useState(null)
  const [step, setStep] = useState('')
  const [description, setDescription] = useState('')
  const [surface, setSurface] = useState('')
  const [useLots, setUseLots] = useState(true)
  const [texte, setTexte] = useState('')
  const [busy, setBusy] = useState(false)
  const chantierLots = chantier?.lots || []

  useEffect(() => { if (open) { setBusy(false); setStep('') } }, [open])

  const run = async (body, source, desc) => {
    setBusy(true)
    setStep(source === 'import' ? 'Lecture en cours…' : 'Chiffrage en cours…')
    try {
      // Génération en deux temps (trame puis lots en parallèle) ; import : un appel
      const data = body.action === 'generer'
        ? await genererDpgf(post, body, {
          onProgress: (p) => setStep(p.etape === 'trame' ? 'Trame du DPGF (lots, métré clé)…' : `Chiffrage des lots ${p.fait}/${p.total}…`),
        })
        : await post(body)
      const obs = data.observations || observationsText(data)
      onResult({
        lots: data.lots,
        surface_m2: data.surface_m2 || (Number(String(body.surface_m2 ?? surface).replace(',', '.')) || null),
        ...(data.surface_annexes ? { surface_annexes: data.surface_annexes } : {}),
        ...(data.reference ? { reference: data.reference } : {}),
        ...(data.indice ? { indice: data.indice } : {}),
        ...(obs ? { observations: obs } : {}),
        ...(desc ? { description: desc } : {}),
        source,
        hypotheses: data.hypotheses,
        conseils: data.conseils,
      })
      if (data.echecs?.length) addToast(`Lots à compléter à la main (IA indisponible) : ${data.echecs.join(', ')}`, 'warning')
      else if (data.ia) addToast(`DPGF chiffré par ${data.ia} : ${data.lots.length} lots, ${data.lots.reduce((n, l) => n + l.postes.length, 0)} postes`, 'success')
      if (data.direct) addToast(`DPGF importé tel quel : ${data.lots.length} lots, ${data.lots.reduce((n, l) => n + l.postes.length, 0)} postes`, 'success')
    } catch (e) {
      addToast(e?.message || 'Erreur IA', 'error')
    } finally {
      setBusy(false)
      setStep('')
    }
  }

  // Plans : dépôt direct dans le stockage (URL signée), puis lecture par l'IA
  const lirePlans = async () => {
    setBusy(true)
    try {
      let done = paths
      if (!done.length) {
        done = []
        for (const [i, f] of files.entries()) {
          setStep(`Envoi des plans (${i + 1}/${files.length})…`)
          const ready = await prepareFile(f)
          const prep = await post({ action: 'prepare_plan', chantierId: chantier.id, name: ready.name, size: ready.size })
          const { error } = await supabase.storage.from('attachments')
            .uploadToSignedUrl(prep.path, prep.token, ready, { contentType: prep.type })
          if (error) throw new Error(`Envoi de « ${f.name} » impossible : ${error.message}`)
          done.push(prep.path)
        }
        setPaths(done)
      }
      setStep('Lecture des plans par l’IA (jusqu’à une minute)…')
      const data = await post({ action: 'metre', chantierId: chantier.id, paths: done, notes })
      setPaths([]) // fichiers lus puis effacés côté serveur
      setMetre({
        ...data,
        surface: data.surface_m2 ? String(data.surface_m2) : '',
        metre: data.metre.map(r => ({ ...r, quantite: String(r.quantite).replace('.', ',') })),
      })
    } catch (e) {
      addToast(e?.message || 'Lecture des plans impossible', 'error')
    } finally {
      setBusy(false)
      setStep('')
    }
  }
  const setRow = (i, patch) => setMetre(m => ({ ...m, metre: m.metre.map((r, j) => j === i ? { ...r, ...patch } : r) }))
  const chiffrerPlans = () => {
    const desc = [metre.projet.trim(), notes.trim()].filter(Boolean).join('\n\n')
    run({
      action: 'generer',
      chantierId: chantier?.id,
      description: desc,
      surface_m2: Number(String(metre.surface).replace(',', '.')) || null,
      metre: metre.metre.map(r => ({ ...r, quantite: String(r.quantite).replace(',', '.') })),
      chantier: chantier?.nom,
      adresse: chantier?.adresse,
      lots: useLots ? chantierLots : [],
      refs: osPriceRefs(allOs),
    }, 'plans', desc)
  }

  const generer = () => run({
    action: 'generer',
    chantierId: chantier?.id,
    description,
    surface_m2: Number(String(surface).replace(',', '.')) || null,
    chantier: chantier?.nom,
    adresse: chantier?.adresse,
    lots: useLots ? chantierLots : [],
    refs: osPriceRefs(allOs),
  }, 'ia', description.trim())
  const importer = () => run({ action: 'importer', texte }, 'import')
  const manuel = () => onResult({
    lots: (chantierLots.length ? chantierLots : ['Gros œuvre']).map(nom => ({ id: newId('l'), nom, postes: [] })),
    surface_m2: Number(String(surface).replace(',', '.')) || null,
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

      {tab === 'plans' && !metre && <>
        <FF label="Plans du permis (PCMI)" hint="PDF ou photos : plan de masse, plans des niveaux, coupes, façades, notice. 20 Mo par PDF, 22 Mo au total.">
          <input type="file" multiple accept="application/pdf,image/*" disabled={busy}
            onChange={e => { setFiles([...(e.target.files || [])].slice(0, 8)); setPaths([]) }} style={{ fontSize: 13 }} />
        </FF>
        {files.length > 0 && <div style={{ fontSize: 12, color: '#475569', marginTop: -6, marginBottom: 10 }}>
          {files.map(f => `${f.name} (${(f.size / 1048576).toFixed(1).replace('.', ',')} Mo)`).join(' · ')}
        </div>}
        <FF label="Précisions (facultatif)" hint="Ce que les plans ne disent pas : niveau de finition, chauffage, sol, options, exclusions…">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }}
            placeholder="Ex. : finitions standard, PAC air/eau + plancher chauffant, terrain plat, cuisine hors lot." />
        </FF>
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>
          1. L’IA relève le métré sur les plans (surfaces, murs, toiture, menuiseries…). 2. Vous le vérifiez. 3. Elle chiffre avec les prix de vos ordres de service.
        </div>
        <button onClick={lirePlans} disabled={busy || !files.length} style={{ ...btnP, opacity: busy || !files.length ? 0.6 : 1 }}>
          {busy ? step : paths.length ? 'Réessayer la lecture' : 'Lire les plans'}</button>
      </>}

      {tab === 'plans' && metre && <>
        {metre.alertes?.length > 0 && <ul style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px 8px 26px', margin: '0 0 12px' }}>
          {metre.alertes.map(a => <li key={a}>{a}</li>)}
        </ul>}
        <FF label="Projet (relevé sur les plans)">
          <textarea value={metre.projet} onChange={e => setMetre(m => ({ ...m, projet: e.target.value }))} rows={4} style={{ ...inp, resize: 'vertical', fontSize: 14 }} />
        </FF>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 160 }}><FF label="Surface de plancher (m²)"><input inputMode="decimal" value={metre.surface} onChange={e => setMetre(m => ({ ...m, surface: e.target.value }))} style={inp} /></FF></div>
          {chantierLots.length > 0 && <label style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 16 }}>
            <input type="checkbox" checked={useLots} onChange={e => setUseLots(e.target.checked)} />
            Reprendre les lots du chantier ({chantierLots.length})
          </label>}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>Métré à vérifier</div>
        {metre.metre.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            <input aria-label="Élément" value={r.element} onChange={e => setRow(i, { element: e.target.value })} style={{ ...inp, ...small, flex: '1 1 220px' }} />
            <input aria-label="Quantité" inputMode="decimal" value={r.quantite} onChange={e => setRow(i, { quantite: e.target.value })} style={{ ...inp, ...small, width: 84, textAlign: 'right' }} />
            <input aria-label="Unité" value={r.unite} onChange={e => setRow(i, { unite: e.target.value })} style={{ ...inp, ...small, width: 64 }} />
            <span title={r.source} style={{ fontSize: 11, width: 110, color: /estim/i.test(r.source) ? '#B45309' : '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.source}</span>
            <button aria-label="Retirer la ligne" onClick={() => setMetre(m => ({ ...m, metre: m.metre.filter((_, j) => j !== i) }))} style={xBtn}>✕</button>
          </div>
        ))}
        <button onClick={() => setMetre(m => ({ ...m, metre: [...m.metre, { element: '', quantite: '', unite: 'm²', source: 'saisi' }] }))}
          style={{ ...xBtn, color: '#0284C7', fontWeight: 700, fontSize: 12, marginBottom: 12 }}>+ Ligne</button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={chiffrerPlans} disabled={busy} style={{ ...btnP, opacity: busy ? 0.6 : 1 }}>{busy ? step : 'Chiffrer avec les prix des OS'}</button>
          <button onClick={() => setMetre(null)} disabled={busy} style={btnS}>Recommencer</button>
        </div>
      </>}

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
          L’IA s’appuie sur les prix de vos ordres de service passés quand un poste équivalent existe. Compter 30 secondes à 1 minute 30 : la trame, puis les lots en parallèle.
        </div>
        <button onClick={generer} disabled={busy || description.trim().length < 10} style={{ ...btnP, opacity: busy || description.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? step : 'Générer le DPGF'}</button>
      </>}

      {tab === 'import' && <>
        <div style={{ marginBottom: 10, fontSize: 12, color: '#475569' }}>
          <label style={{ fontWeight: 600 }}>Fichier (.json, .csv, .txt) :{' '}
            <input type="file" accept=".json,.csv,.txt,application/json,text/plain,text/csv" disabled={busy}
              onChange={async e => { const f = e.target.files?.[0]; if (f) setTexte(await f.text()) }} style={{ fontSize: 12 }} />
          </label>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Un DPGF au format JSON (export d’une conversation Claude, par exemple) est repris tel quel, sans IA.</div>
        </div>
        <FF label="Texte ou tableau à importer" hint="Coller un DPGF (copié d’Excel, d’un PDF, d’une conversation avec une IA…). Les prix sont repris tels quels, rien n’est inventé.">
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={12} style={{ ...inp, resize: 'vertical', fontSize: 13, fontFamily: 'ui-monospace, monospace' }} />
        </FF>
        <button onClick={importer} disabled={busy || texte.trim().length < 10} style={{ ...btnP, opacity: busy || texte.trim().length < 10 ? 0.6 : 1 }}>
          {busy ? step : 'Importer'}</button>
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
