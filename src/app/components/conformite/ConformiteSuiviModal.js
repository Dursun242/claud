'use client'
import { useMemo, useState } from 'react'
import Modal from '../Modal'
import { DOC_KINDS, DOC_META, STATUS_META, MAX_RELANCES_PAR_PASSAGE, buildSuivi } from '../../lib/conformite'

const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const small = { fontSize: 11, color: '#64748B' }

// Pastille d'un document dans la grille
const CELL = {
  ok: { sym: '✓', label: 'à jour' },
  bientot: { sym: '⏳', label: 'expire bientôt' },
  a_verifier: { sym: '!', label: 'à vérifier' },
  manquant: { sym: '–', label: 'manquant' },
  expire: { sym: '✕', label: 'expiré' },
}

function relanceText(r) {
  switch (r.kind) {
    case 'prevue': return r.passage === 0 ? 'Au prochain passage' : `Dans ${r.passage + 1} passages`
    case 'date': return `Le ${fmtD(r.date)}`
    case 'sans_email': return 'Aucune : pas d’email sur la fiche'
    case 'equipe': return 'Aucune : à vérifier par vous'
    case 'a_jour': return '—'
    default: return 'Aucune : pas de chantier en cours'
  }
}

function Bar({ value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div aria-hidden="true" style={{ height: 8, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color }} />
    </div>
  )
}

/**
 * Suivi des documents des entreprises : avancement (entreprises à jour,
 * documents reçus), grille entreprise × document, aperçu des relances
 * automatiques (ordre et date d'envoi, comme le cron).
 */
export default function ConformiteSuiviModal({ open, onClose, contacts = [], conformite, activeIds, onOpenContact }) {
  const [all, setAll] = useState(false)
  const suivi = useMemo(() => buildSuivi({
    contacts, byContact: conformite.byContact, lastRequest: conformite.lastRequest, activeIds, today: conformite.today,
  }), [contacts, conformite.byContact, conformite.lastRequest, activeIds, conformite.today])
  const { stats, plan } = suivi
  const rows = all ? suivi.rows : suivi.rows.filter(r => r.active)
  const next = plan.filter(p => p.passage === 0)
  const later = plan.length - next.length

  return (
    <Modal open={open} onClose={onClose} title="Suivi des documents des entreprises" wide>
      {conformite.missingMigration ? (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, fontSize: 12, color: '#9A3412' }}>
          Fonction non activée : appliquer les migrations 036 et 037 dans Supabase.
        </div>
      ) : (
        <>
          {/* ── Avancement ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
              <div style={small}>Entreprises sur un chantier en cours, à jour</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '2px 0 6px' }}>{stats.aJour} / {stats.actives}</div>
              <Bar value={stats.aJour} total={stats.actives} color="#059669" />
            </div>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12 }}>
              <div style={small}>Documents reçus et valables</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '2px 0 6px' }}>{stats.docsRecus} / {stats.docsTotal}</div>
              <Bar value={stats.docsRecus} total={stats.docsTotal} color="#2563EB" />
            </div>
          </div>

          {/* ── Aperçu des relances ── */}
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0C4A6E', marginBottom: 4 }}>Aperçu des relances automatiques</div>
            <div style={{ ...small, marginBottom: 8, lineHeight: 1.5 }}>
              Chaque jour ouvré le matin, au plus {MAX_RELANCES_PAR_PASSAGE} mails ; chaque entreprise est relancée une fois par semaine tant qu’un document manque, est erroné ou expire.
            </div>
            {next.length === 0 ? (
              <div style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>Aucune relance au prochain passage.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                  Prochain passage : {next.length} mail{next.length > 1 ? 's' : ''}
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#334155' }}>
                  {next.map(p => (
                    <li key={p.contact.id} style={{ marginBottom: 2 }}>
                      <button type="button" onClick={() => onOpenContact(p.contact.id)}
                        style={{ background: 'none', border: 'none', padding: 0, color: '#0369A1', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                        {p.contact.nom}
                      </button>
                      {' '}({p.contact.email}) : {p.kinds.map(k => DOC_META[k].label).join(', ')}
                      {p.lastRequest ? ' · rappel' : ' · 1re demande'}
                    </li>
                  ))}
                </ol>
                {later > 0 && <div style={{ ...small, marginTop: 6 }}>Puis {later} autre{later > 1 ? 's' : ''} aux passages suivants (limite de {MAX_RELANCES_PAR_PASSAGE} par jour).</div>}
              </>
            )}
            {stats.sansEmail > 0 && (
              <div style={{ fontSize: 12, color: '#B45309', marginTop: 8 }}>
                ⚠ {stats.sansEmail} entreprise{stats.sansEmail > 1 ? 's' : ''} sans email ne {stats.sansEmail > 1 ? 'peuvent' : 'peut'} pas être relancée{stats.sansEmail > 1 ? 's' : ''} : complétez leur fiche.
              </div>
            )}
          </div>

          {/* ── Grille ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Détail par entreprise</div>
            <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
              Inclure les entreprises sans chantier en cours
            </label>
          </div>
          {rows.length === 0 ? (
            <div style={{ ...small, padding: '12px 0' }}>Aucune entreprise (artisan, sous-traitant, prestataire) sur un chantier en cours.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748B' }}>
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Entreprise</th>
                    {DOC_KINDS.map(k => <th key={k} style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'center' }}>{DOC_META[k].label}</th>)}
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Dernière demande</th>
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Prochaine relance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.contact.id} style={{ borderTop: '1px solid #E2E8F0', opacity: r.active ? 1 : 0.6 }}>
                      <td style={{ padding: '6px 4px' }}>
                        <button type="button" onClick={() => onOpenContact(r.contact.id)}
                          style={{ background: 'none', border: 'none', padding: 0, color: '#0F172A', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, textAlign: 'left' }}>
                          {r.contact.nom}
                        </button>
                        <div style={small}>{r.recus}/{DOC_KINDS.length} reçus</div>
                      </td>
                      {DOC_KINDS.map(k => {
                        const st = r.compliance.kinds[k].status
                        const meta = STATUS_META[st]
                        return (
                          <td key={k} style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <span title={`${DOC_META[k].long} : ${CELL[st].label}`} aria-label={`${DOC_META[k].label} : ${CELL[st].label}`}
                              style={{ display: 'inline-flex', width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 800 }}>
                              {CELL[st].sym}
                            </span>
                          </td>
                        )
                      })}
                      <td style={{ padding: '6px 4px', ...small }}>
                        {r.lastRequest ? <>
                          {fmtD(r.lastRequest.dernier_envoi)}{r.lastRequest.envois > 1 ? ` (${r.lastRequest.envois} envois)` : ''}
                          <div>{r.lastRequest.derniere_visite ? `lien ouvert le ${fmtD(r.lastRequest.derniere_visite)}` : 'lien pas ouvert'}</div>
                        </> : 'Jamais'}
                      </td>
                      <td style={{ padding: '6px 4px', ...small, color: r.relance.kind === 'sans_email' ? '#B45309' : '#64748B' }}>{relanceText(r.relance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ ...small, marginTop: 8 }}>
            ✓ à jour · ⏳ expire bientôt · ! à vérifier ou à renvoyer · – manquant · ✕ expiré. Cliquez sur une entreprise pour ouvrir ses documents.
          </div>
        </>
      )}
    </Modal>
  )
}
