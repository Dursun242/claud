'use client'
import { useMemo, useState } from 'react'
import Modal from '../Modal'
import RelanceControls from './RelanceControls'
import { LEGAL_META } from '../../lib/legalCheck'
import { useToast } from '../../contexts/ToastContext'
import { useConfirm } from '../../contexts/ConfirmContext'
import { conformitePost } from '../../hooks/useConformite'
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
    case 'suspendue': return r.jusquau ? `Suspendues jusqu’au ${fmtD(r.jusquau)}` : 'Suspendues'
    case 'pause_globale': return 'Toutes les relances sont suspendues'
    case 'equipe': return 'Aucune : à vérifier par vous'
    case 'a_jour': return '—'
    default: return 'Aucune : ni chantier en cours, ni demande'
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
export default function ConformiteSuiviModal({ open, onClose, contacts = [], conformite, activeIds, onOpenContact, onChanged }) {
  const { addToast } = useToast()
  const confirm = useConfirm()
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(null)
  const suivi = useMemo(() => buildSuivi({
    contacts, byContact: conformite.byContact, lastRequest: conformite.lastRequest, activeIds, today: conformite.today,
    globalPause: conformite.globalPause,
  }), [contacts, conformite.byContact, conformite.lastRequest, activeIds, conformite.today, conformite.globalPause])

  // Envoi immédiat de la demande (ne change pas la règle : prochaine relance automatique 7 jours après)
  const relancer = async (list, label) => {
    const ok = await confirm({
      title: label,
      message: `Envoyer maintenant le mail de demande de documents à : ${list.map(c => c.nom).join(', ')} ?`,
      confirmLabel: 'Envoyer',
    })
    if (!ok) return
    setBusy('relancer')
    try {
      const r = await conformitePost({ action: 'relancer', contactIds: list.map(c => c.id) })
      if (r.sent.length) addToast(`${r.sent.length} mail${r.sent.length > 1 ? 's' : ''} envoyé${r.sent.length > 1 ? 's' : ''}`, 'success')
      if (r.failed.length) addToast(`Non envoyé : ${r.failed.join(', ')} (email absent ou refusé)`, 'error')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') } finally { setBusy(null) }
  }

  const toggleAll = async () => {
    const paused = !conformite.globalPause
    if (paused) {
      const ok = await confirm({
        title: 'Suspendre toutes les relances ?',
        message: 'Plus aucun mail automatique ne partira aux entreprises jusqu’à ce que vous repreniez. Les envois manuels restent possibles.',
        confirmLabel: 'Suspendre', danger: true,
      })
      if (!ok) return
    }
    setBusy('pause')
    try {
      await conformitePost({ action: 'pause_all', paused })
      addToast(paused ? 'Relances automatiques suspendues' : 'Relances automatiques reprises', 'success')
      onChanged?.()
    } catch (err) { addToast(err.message, 'error') } finally { setBusy(null) }
  }
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
              <div style={small}>Entreprises suivies à jour (chantier en cours ou demande envoyée)</div>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0C4A6E' }}>Aperçu des relances automatiques</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: conformite.globalPause ? '#B45309' : '#047857' }}>
                  {conformite.globalPause ? '⏸ Suspendues' : '● Actives'}
                </span>
                <button type="button" onClick={toggleAll} disabled={!!busy}
                  style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, padding: '4px 10px',
                    background: conformite.globalPause ? '#ECFDF5' : '#fff', color: conformite.globalPause ? '#047857' : '#B45309',
                    border: `1px solid ${conformite.globalPause ? '#A7F3D0' : '#FDE68A'}` }}>
                  {conformite.globalPause ? '▶ Reprendre les relances' : '⏸ Tout suspendre'}
                </button>
              </div>
            </div>
            <div style={{ ...small, marginBottom: 8, lineHeight: 1.5 }}>
              Chaque jour ouvré le matin, au plus {MAX_RELANCES_PAR_PASSAGE} mails ; chaque entreprise est relancée une fois par semaine tant qu’un document manque, est erroné ou expire.
            </div>
            {conformite.globalPause ? (
              <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>Toutes les relances automatiques sont suspendues : aucun mail ne part tant que vous ne les reprenez pas.</div>
            ) : next.length === 0 ? (
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
                <button type="button" disabled={!!busy} onClick={() => relancer(next.map(p => p.contact), `Envoyer maintenant ${next.length} mail${next.length > 1 ? 's' : ''} ?`)}
                  style={{ marginTop: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, padding: '6px 12px', background: '#0369A1', color: '#fff', border: 'none' }}>
                  {busy === 'relancer' ? 'Envoi…' : `Envoyer maintenant (${next.length})`}
                </button>
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
              Inclure les entreprises non suivies (ni chantier en cours, ni demande)
            </label>
          </div>
          {rows.length === 0 ? (
            <div style={{ ...small, padding: '12px 0' }}>Aucune entreprise suivie : ni artisan, sous-traitant ou prestataire sur un chantier en cours, ni demande envoyée.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748B' }}>
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Entreprise</th>
                    <th style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'center' }}>Société</th>
                    {DOC_KINDS.map(k => <th key={k} style={{ padding: '6px 4px', fontWeight: 600, textAlign: 'center' }}>{DOC_META[k].label}</th>)}
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Dernière demande</th>
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Prochaine relance</th>
                    <th style={{ padding: '6px 4px', fontWeight: 600 }}>Actions</th>
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
                        <div style={small}>
                          {r.recus}/{DOC_KINDS.length} reçus
                          {r.origine === 'demande' && <span style={{ marginLeft: 6, color: '#7C3AED', fontWeight: 700 }}>· demande manuelle</span>}
                        </div>
                      </td>
                      {(() => {
                        const l = conformite.legalByContact?.get(r.contact.id)
                        const meta = LEGAL_META[l?.statut] || LEGAL_META.inconnu
                        const sym = !l ? '?' : l.statut === 'ok' ? '✓' : l.statut === 'inconnu' ? '?' : '⚠'
                        const label = l ? `${meta.label} : ${l.libelle || ''}` : 'Situation de l’entreprise non vérifiée'
                        return (
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <span title={label} aria-label={`Société : ${label}`}
                              style={{ display: 'inline-flex', width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, fontWeight: 800 }}>
                              {sym}
                            </span>
                          </td>
                        )
                      })()}
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
                      <td style={{ padding: '6px 4px', ...small, color: ['sans_email', 'suspendue', 'pause_globale'].includes(r.relance.kind) ? '#B45309' : '#64748B' }}>{relanceText(r.relance)}</td>
                      <td style={{ padding: '6px 4px' }}>
                        {r.compliance.status !== 'ok' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                            {r.contact.email && (
                              <button type="button" disabled={!!busy} onClick={() => relancer([r.contact], `Relancer ${r.contact.nom} ?`)}
                                style={{ fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, padding: '3px 8px', background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD', whiteSpace: 'nowrap' }}>
                                ✉ Relancer
                              </button>
                            )}
                            <RelanceControls compact contact={r.contact} pause={r.pause} onChanged={onChanged} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ ...small, marginTop: 8 }}>
            Société : ✓ active · ⚠ fermée, en liquidation ou en procédure collective · ? non vérifiée. Documents : ✓ à jour · ⏳ expire bientôt · ! à vérifier ou à renvoyer · – manquant · ✕ expiré. Cliquez sur une entreprise pour ouvrir ses documents.
          </div>
        </>
      )}
    </Modal>
  )
}
