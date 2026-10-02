'use client'
import { useEffect, useMemo, useState } from 'react'
import { btnP, btnS } from '../../dashboards/shared'
import { Modal } from '../index'
import { bestContact, planMerge } from '../../lib/contactDuplicates'

const chip = (text, color = '#475569', bg = '#F1F5F9') => (
  <span key={text} style={{ fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' }}>{text}</span>
)

const line = (c) => [c.societe && c.societe !== c.nom ? c.societe : '', c.type, c.email, c.tel || c.tel_fixe, c.ville].filter(Boolean).join(' · ')

/**
 * Doublons de contacts : liste des groupes détectés, puis écran de fusion
 * (fiche conservée, valeur à garder pour chaque champ en conflit).
 * usage(c) → { affaires, chantiers, os } pour montrer ce qui sera regroupé.
 */
export default function DuplicatesModal({ open, groups, usage, onClose, onIgnore, onMerge, merging }) {
  const [current, setCurrent] = useState(null) // groupe en cours de fusion
  const [keepId, setKeepId] = useState(null)
  const [choices, setChoices] = useState({})

  useEffect(() => { if (!open) setCurrent(null) }, [open])

  const startMerge = (g) => {
    setCurrent(g)
    setKeepId(bestContact(g.contacts).id)
    setChoices({})
  }
  const { keep, others } = useMemo(() => ({
    keep: current?.contacts.find(c => c.id === keepId) || null,
    others: current ? current.contacts.filter(c => c.id !== keepId) : [],
  }), [current, keepId])
  const plan = useMemo(() => (keep ? planMerge(keep, others) : null), [keep, others])
  const fields = plan ? { ...plan.fields, ...choices } : null
  const total = (k) => current.contacts.reduce((s, c) => s + (usage(c)[k] || 0), 0)

  const title = current ? `Fusionner ${current.contacts.length} contacts` : 'Contacts en double'
  return (
    <Modal open={open} onClose={() => !merging && onClose()} title={title} wide>
      {!current && (
        groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748B', fontSize: 14 }}>
            ✅ Aucun doublon détecté.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
              Contacts qui semblent être la même personne ou la même entreprise. Vérifie avant de fusionner : rien n&apos;est fait automatiquement.
            </p>
            {groups.map(g => (
              <div key={g.ids.join('|')} data-testid="dup-group" style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, background: '#fff' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {g.reasons.map(r => chip(r, r === 'même SIRET' ? '#92400E' : '#1D4ED8', r === 'même SIRET' ? '#FEF3C7' : '#EFF6FF'))}
                </div>
                {g.contacts.map(c => {
                  const u = usage(c)
                  return (
                    <div key={c.id} style={{ padding: '6px 0', borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{c.nom}</div>
                      <div style={{ fontSize: 12, color: '#64748B' }}>{line(c) || '—'}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                        {u.affaires > 0 && chip(`${u.affaires} affaire${u.affaires > 1 ? 's' : ''}`)}
                        {u.chantiers > 0 && chip(`${u.chantiers} chantier${u.chantiers > 1 ? 's' : ''}`)}
                        {u.os > 0 && chip(`${u.os} OS`)}
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => onIgnore(g)} style={{ ...btnS, fontSize: 12, padding: '7px 12px' }}>Pas un doublon</button>
                  <button type="button" onClick={() => startMerge(g)} style={{ ...btnP, fontSize: 12, padding: '7px 12px' }}>Fusionner…</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {current && keep && fields && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>Fiche à conserver</div>
          <div role="radiogroup" aria-label="Fiche à conserver" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {current.contacts.map(c => (
              <label key={c.id} style={{
                display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                border: c.id === keepId ? '1.5px solid #1E3A5F' : '1px solid #E2E8F0', background: c.id === keepId ? '#F1F5F9' : '#fff',
              }}>
                <input type="radio" name="keep" checked={c.id === keepId} onChange={() => { setKeepId(c.id); setChoices({}) }} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{c.nom}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#64748B' }}>{line(c) || '—'}</span>
                </span>
              </label>
            ))}
          </div>

          {plan.conflicts.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                Valeurs différentes — choisis celle à garder
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {plan.conflicts.map(cf => (
                  <fieldset key={cf.key} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', margin: 0 }}>
                    <legend style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', padding: '0 4px' }}>{cf.label}</legend>
                    {cf.values.map(v => (
                      <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                        <input type="radio" name={`f-${cf.key}`} checked={fields[cf.key] === v}
                          onChange={() => setChoices(ch => ({ ...ch, [cf.key]: v }))} />
                        <span style={{ wordBreak: 'break-word' }}>{v}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </>
          )}

          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
            <b>{fields.nom}</b> regroupera : {total('affaires')} affaire(s), {total('chantiers')} chantier(s), {total('os')} OS, ainsi que tous les échanges du CRM.
            Les autres fiches ({others.map(c => c.nom).join(', ')}) seront supprimées ; les champs vides de la fiche conservée sont complétés et les notes regroupées.
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setCurrent(null)} disabled={merging} style={btnS}>Retour</button>
            <button type="button" disabled={merging}
              onClick={() => onMerge({ keep, drops: others, fields }).then(ok => { if (ok) setCurrent(null) })}
              style={{ ...btnP, background: '#B45309' }}>
              {merging ? 'Fusion…' : `Fusionner en « ${fields.nom} »`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
