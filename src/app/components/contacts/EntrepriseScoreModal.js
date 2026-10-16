'use client'
import { useEffect, useMemo, useState } from 'react'
import Modal from '../Modal'
import { CRITERIA, GRADES, LEGAL_CAP, ranking, specialites } from '../../lib/entrepriseScore'

const small = { fontSize: 11, color: 'var(--label-secondary)' }
const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const euros = (n) => `${Number(n || 0).toLocaleString('fr-FR')} € HT`
const chip = {
  background: '#fff', border: '1px solid var(--separator)', borderRadius: 8, padding: '6px 12px',
  fontSize: 12, fontWeight: 600, color: 'var(--label-2)', cursor: 'pointer', fontFamily: 'inherit',
}
const field = {
  border: '1px solid var(--separator)', borderRadius: 8, padding: '7px 10px', fontSize: 13,
  fontFamily: 'inherit', background: '#fff', color: 'var(--label)', minWidth: 0,
}

function GradeBox({ s, size = 34 }) {
  const g = s?.grade
  return (
    <span aria-hidden="true" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      width: size, height: size, borderRadius: size / 4,
      background: g ? g.color : 'var(--grouped-bg)', color: g ? '#fff' : 'var(--label-secondary)',
      fontSize: size * 0.48, fontWeight: 800,
    }}>{g ? g.grade : '–'}</span>
  )
}

function CriterionRow({ c }) {
  const pct = c.known ? Math.round((c.points / c.max) * 100) : 0
  const color = pct >= 80 ? '#1E7B34' : pct >= 55 ? '#A05A00' : '#D70015'
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--separator)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)' }}>{c.label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.known ? 'var(--label)' : 'var(--label-secondary)' }}>
          {c.known ? `${Math.round(c.points)} / ${c.max}` : `– / ${c.max}`}
        </span>
      </div>
      <div aria-hidden="true" style={{ height: 6, background: 'var(--separator)', borderRadius: 999, overflow: 'hidden', margin: '6px 0 4px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
      </div>
      <div style={{ ...small, color: c.known ? 'var(--label-2)' : 'var(--label-secondary)' }}>{c.detail}</div>
      <div style={{ ...small, marginTop: 1 }}>{c.aide}</div>
    </div>
  )
}

function Detail({ contact, s, onBack, onOpenDocs, onEdit }) {
  const h = s?.historique
  return (
    <div>
      {onBack && <button type="button" onClick={onBack} style={{ ...chip, marginBottom: 12 }}>← Classement</button>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <GradeBox s={s} size={52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--label)' }}>{contact.nom}</div>
          {(contact.societe || contact.specialite) && (
            <div style={small}>{[contact.societe !== contact.nom && contact.societe, contact.specialite].filter(Boolean).join(' · ')}</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: s?.grade?.color || 'var(--label-secondary)', marginTop: 3 }}>
            {s?.score != null ? `${s.score}/100 — ${s.grade.label}` : 'Pas encore de score'}
          </div>
        </div>
      </div>
      {s?.cap != null && (
        <div role="alert" style={{
          background: 'var(--red-tint)', border: '1px solid var(--red-line)', borderRadius: 8,
          padding: '8px 10px', fontSize: 12, color: 'var(--red-text)', marginBottom: 10,
        }}>
          {s.legal?.libelle || 'Situation légale à risque'} : score limité à {s.cap}/100.
        </div>
      )}
      {s?.peuDeDonnees && (
        <div style={{ ...small, background: 'var(--grouped-bg)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          Peu de données pour l’instant ({s.known} points sur 100 mesurables) : le score s’affinera avec les comptes rendus, les documents et votre avis.
        </div>
      )}
      <div>{(s?.criteria || CRITERIA.map(c => ({ ...c, known: false, points: 0, detail: 'Pas encore de donnée' }))).map(c => <CriterionRow key={c.key} c={c} />)}</div>
      {h && (
        <div style={{ borderTop: '1px solid var(--separator)', paddingTop: 10, ...small }}>
          <strong style={{ color: 'var(--label-2)' }}>Avec ID Maîtrise : </strong>
          {h.os
            ? [`${h.chantiers} chantier${h.chantiers > 1 ? 's' : ''}`, `${h.os} OS`, euros(h.montantHt), h.derniere && `dernier OS le ${fmtD(h.derniere)}`].filter(Boolean).join(' · ')
            : 'aucun ordre de service pour l’instant'}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {onOpenDocs && <button type="button" onClick={() => onOpenDocs(contact.id)} style={chip}>📄 Documents</button>}
        {onEdit && <button type="button" onClick={() => onEdit(contact)} style={chip}>★ Donner mon avis (étoiles)</button>}
      </div>
    </div>
  )
}

function Explication() {
  return (
    <details style={{ marginTop: 14, ...small }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--label-2)' }}>Comment le score est calculé</summary>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.5 }}>
        {CRITERIA.map(c => <li key={c.key}><strong>{c.label}</strong> ({c.max} points) : {c.aide.toLowerCase()}.</li>)}
        <li>Un critère sans donnée n’est pas compté : la note est ramenée sur les critères connus.</li>
        <li>Entreprise en procédure collective : {LEGAL_CAP.alerte}/100 au plus ; fermée ou en liquidation : {LEGAL_CAP.critique}/100 au plus.</li>
        <li>{GRADES.map(g => `${g.grade} ${g.label.toLowerCase()} (${g.min}+)`).join(' · ')}</li>
      </ul>
    </details>
  )
}

/**
 * Score des entreprises : classement (meilleures en tête, filtre par
 * spécialité) et détail d'une entreprise (critères, historique).
 * `focusId` ouvre directement le détail d'une entreprise.
 */
export default function EntrepriseScoreModal({ open, onClose, contacts = [], scores, focusId = null, onOpenDocs, onEdit }) {
  const [selected, setSelected] = useState(null)
  const [q, setQ] = useState('')
  const [spec, setSpec] = useState('')
  useEffect(() => { if (open) setSelected(focusId || null) }, [open, focusId])

  const specs = useMemo(() => specialites(contacts), [contacts])
  const rows = useMemo(() => ranking(contacts, scores, { specialite: spec, q }), [contacts, scores, spec, q])
  const current = selected ? contacts.find(c => c.id === selected) : null

  return (
    <Modal open={open} onClose={onClose} title={current ? 'Score de l’entreprise' : 'Classement des entreprises'} wide>
      {current ? (
        <Detail contact={current} s={scores?.get(current.id)}
          onBack={() => setSelected(null)} onOpenDocs={onOpenDocs} onEdit={onEdit} />
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une entreprise"
              aria-label="Rechercher une entreprise" style={{ ...field, flex: '1 1 180px' }} />
            {specs.length > 0 && (
              <select value={spec} onChange={e => setSpec(e.target.value)} aria-label="Spécialité" style={{ ...field, flex: '0 1 200px' }}>
                <option value="">Toutes les spécialités</option>
                {specs.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
          {rows.length === 0 ? (
            <div style={{ ...small, padding: '24px 0', textAlign: 'center' }}>Aucune entreprise (artisan, sous-traitant ou prestataire) ne correspond.</div>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((r, i) => (
                <li key={r.contact.id}>
                  <button type="button" onClick={() => setSelected(r.contact.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', borderTop: i ? '1px solid var(--separator)' : 'none',
                    padding: '9px 2px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <span style={{ ...small, width: 22, textAlign: 'right', flexShrink: 0 }}>{r.score != null ? i + 1 : ''}</span>
                    <GradeBox s={r} size={30} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.contact.nom}</span>
                      <span style={{ display: 'block', ...small, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[r.contact.specialite, r.historique?.os ? `${r.historique.os} OS` : null, r.peuDeDonnees ? 'peu de données' : null].filter(Boolean).join(' · ') || r.contact.type}
                      </span>
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: r.grade?.color || 'var(--label-secondary)', flexShrink: 0 }}>
                      {r.score != null ? r.score : '–'}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <Explication />
    </Modal>
  )
}
