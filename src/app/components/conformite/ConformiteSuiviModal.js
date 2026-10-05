'use client'
import { useEffect, useMemo, useState } from 'react'
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

// Filtres rapides au-dessus de la liste (masqués quand ils ne trouvent rien)
const hasStatus = (r, st) => DOC_KINDS.some(k => r.compliance.kinds[k].status === st)
const FILTERS = [
  { key: 'tous', label: 'Toutes', test: () => true },
  { key: 'a_completer', label: 'À compléter', test: r => r.compliance.status !== 'ok' },
  { key: 'a_verifier', label: 'À vérifier', test: r => hasStatus(r, 'a_verifier') },
  { key: 'expire', label: 'Expiré ou bientôt', test: r => hasStatus(r, 'expire') || hasStatus(r, 'bientot') },
  { key: 'non_ouvert', label: 'Lien pas ouvert', test: r => !!r.lastRequest && !r.lastRequest.derniere_visite },
  { key: 'sans_email', label: 'Sans email', test: r => r.relance.kind === 'sans_email' },
  { key: 'a_jour', label: 'À jour', test: r => r.compliance.status === 'ok' },
]

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return mobile
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
  const [filter, setFilter] = useState('tous')
  const isMobile = useIsMobile()
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
  const base = all ? suivi.rows : suivi.rows.filter(r => r.active)
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, base.filter(f.test).length]))
  const current = FILTERS.find(f => f.key === filter && (f.key === 'tous' || counts[f.key] > 0)) || FILTERS[0]
  const rows = base.filter(current.test)
  const next = plan.filter(p => p.passage === 0)
  const later = plan.length - next.length
  const demandes = base.filter(r => r.active && r.lastRequest)
  const ouverts = demandes.filter(r => r.lastRequest.derniere_visite).length
  const rowProps = { busy, relancer, onOpenContact, onChanged, legalByContact: conformite.legalByContact }

  return (
    <Modal open={open} onClose={onClose} title="Suivi des documents des entreprises" wide="xl">
      {conformite.missingMigration ? (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: 12, fontSize: 12, color: '#9A3412' }}>
          Fonction non activée : appliquer les migrations 036 et 037 dans Supabase.
        </div>
      ) : (
        <>
          {/* ── Avancement ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
            <Stat label="Entreprises à jour" hint="chantier en cours ou demande envoyée" value={stats.aJour} total={stats.actives} color="#059669" />
            <Stat label="Documents reçus et valables" value={stats.docsRecus} total={stats.docsTotal} color="#2563EB" />
            {demandes.length > 0 && <Stat label="Liens de dépôt ouverts" hint="parmi les demandes envoyées" value={ouverts} total={demandes.length} color="#7C3AED" />}
          </div>

          {/* ── Aperçu des relances ── */}
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0C4A6E' }}>Relances automatiques</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: conformite.globalPause ? '#B45309' : '#047857' }}>
                  {conformite.globalPause ? '⏸ Suspendues' : '● Actives'}
                </span>
              </div>
              <button type="button" onClick={toggleAll} disabled={!!busy}
                style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, padding: '4px 10px',
                  background: conformite.globalPause ? '#ECFDF5' : '#fff', color: conformite.globalPause ? '#047857' : '#B45309',
                  border: `1px solid ${conformite.globalPause ? '#A7F3D0' : '#FDE68A'}` }}>
                {conformite.globalPause ? '▶ Reprendre les relances' : '⏸ Tout suspendre'}
              </button>
            </div>
            <div style={{ ...small, margin: '2px 0 8px', lineHeight: 1.5 }}>
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
                ⚠ {stats.sansEmail} entreprise{stats.sansEmail > 1 ? 's' : ''} sans email ne {stats.sansEmail > 1 ? 'peuvent' : 'peut'} pas être relancée{stats.sansEmail > 1 ? 's' : ''} : complétez leur fiche
                {counts.sans_email > 0 && filter !== 'sans_email' && (
                  <> · <button type="button" onClick={() => setFilter('sans_email')}
                    style={{ background: 'none', border: 'none', padding: 0, color: '#B45309', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
                    les voir
                  </button></>
                )}
                .
              </div>
            )}
          </div>

          {/* ── Détail par entreprise ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Détail par entreprise</div>
            <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />
              Inclure les entreprises non suivies
            </label>
          </div>
          {base.length > 0 && (
            <div role="group" aria-label="Filtrer les entreprises" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {FILTERS.filter(f => f.key === 'tous' || counts[f.key] > 0).map(f => {
                const on = current.key === f.key
                return (
                  <button key={f.key} type="button" aria-pressed={on} onClick={() => setFilter(f.key)}
                    style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 999, padding: '4px 10px',
                      background: on ? '#0F172A' : '#fff', color: on ? '#fff' : '#334155', border: `1px solid ${on ? '#0F172A' : '#CBD5E1'}` }}>
                    {f.label} <span style={{ opacity: 0.7 }}>{counts[f.key]}</span>
                  </button>
                )
              })}
            </div>
          )}
          {base.length === 0 ? (
            <div style={{ ...small, padding: '12px 0' }}>Aucune entreprise suivie : ni artisan, sous-traitant ou prestataire sur un chantier en cours, ni demande envoyée.</div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(r => <RowCard key={r.contact.id} r={r} {...rowProps} />)}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748B' }}>
                  <th style={th}>Entreprise</th>
                  <th style={{ ...th, textAlign: 'center' }}>Société</th>
                  {DOC_KINDS.map(k => <th key={k} style={{ ...th, textAlign: 'center' }}>{DOC_META[k].label}</th>)}
                  <th style={th}>Dernière demande</th>
                  <th style={th}>Prochaine relance</th>
                  <th style={th}><span style={srOnly}>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.contact.id} style={{ opacity: r.active ? 1 : 0.6 }}>
                    <td style={{ ...td, minWidth: 170 }}><NameCell r={r} onOpenContact={onOpenContact} /></td>
                    <td style={{ ...td, textAlign: 'center' }}><LegalDot l={conformite.legalByContact?.get(r.contact.id)} /></td>
                    {DOC_KINDS.map(k => <td key={k} style={{ ...td, textAlign: 'center' }}><DocDot kind={k} status={r.compliance.kinds[k].status} /></td>)}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><DemandeCell req={r.lastRequest} /></td>
                    <td style={{ ...td, ...small, color: relanceColor(r.relance) }}>{relanceText(r.relance)}</td>
                    <td style={{ ...td, textAlign: 'right' }}><Actions r={r} {...rowProps} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ ...small, marginTop: 10, lineHeight: 1.6 }}>
            Société : ✓ active · ⚠ fermée, en liquidation ou en procédure collective · ? non vérifiée. Documents : ✓ à jour · ⏳ expire bientôt · ! à vérifier ou à renvoyer · – manquant · ✕ expiré. Cliquez sur une entreprise pour ouvrir ses documents.
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Briques de la vue ───

const th = { padding: '8px 6px', fontWeight: 600, fontSize: 11, position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid #E2E8F0', zIndex: 1, whiteSpace: 'nowrap' }
const td = { padding: '8px 6px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' }
const dot = { display: 'inline-flex', width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 999, fontWeight: 800, fontSize: 12 }
// Document manquant : pastille neutre, pour que les vrais problèmes (expiré, à vérifier) ressortent
const MANQUANT = { color: '#94A3B8', bg: '#F8FAFC', border: '#CBD5E1', dashed: true }

const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

const relanceColor = (r) => (['sans_email', 'suspendue', 'pause_globale'].includes(r.kind) ? '#B45309' : r.kind === 'prevue' ? '#0369A1' : '#64748B')

function Stat({ label, hint, value, total, color }) {
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{label}</div>
      {hint && <div style={small}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0 6px' }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>{value} / {total}</span>
        {total > 0 && <span style={small}>{Math.round((value / total) * 100)} %</span>}
      </div>
      <Bar value={value} total={total} color={color} />
    </div>
  )
}

function DocDot({ kind, status }) {
  const meta = status === 'manquant' ? MANQUANT : STATUS_META[status]
  return (
    <span title={`${DOC_META[kind].long} : ${CELL[status].label}`} aria-label={`${DOC_META[kind].label} : ${CELL[status].label}`}
      style={{ ...dot, background: meta.bg, color: meta.color, border: `1px ${meta.dashed ? 'dashed' : 'solid'} ${meta.border}` }}>
      {CELL[status].sym}
    </span>
  )
}

function LegalDot({ l }) {
  const meta = LEGAL_META[l?.statut] || LEGAL_META.inconnu
  const sym = !l ? '?' : l.statut === 'ok' ? '✓' : l.statut === 'inconnu' ? '?' : '⚠'
  const label = l ? `${meta.label} : ${l.libelle || ''}` : 'Situation de l’entreprise non vérifiée'
  return (
    <span title={label} aria-label={`Société : ${label}`}
      style={{ ...dot, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
      {sym}
    </span>
  )
}

// Nom + avancement (5 segments, un par document reçu et valable)
function NameCell({ r, onOpenContact }) {
  return (
    <>
      <button type="button" onClick={() => onOpenContact(r.contact.id)}
        style={{ background: 'none', border: 'none', padding: 0, color: '#0F172A', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left' }}>
        {r.contact.nom}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2 }}>
          {DOC_KINDS.map((k, i) => (
            <span key={k} style={{ width: 10, height: 4, borderRadius: 2, background: i < r.recus ? '#059669' : '#E2E8F0' }} />
          ))}
        </span>
        <span style={small}>{r.recus}/{DOC_KINDS.length} reçus</span>
        {r.origine === 'demande' && <span style={{ ...small, color: '#7C3AED', fontWeight: 700 }}>· demande manuelle</span>}
      </div>
    </>
  )
}

function DemandeCell({ req }) {
  if (!req) return <span style={small}>Jamais</span>
  return (
    <div style={small}>
      <span style={{ color: '#334155', fontWeight: 600 }}>{fmtD(req.dernier_envoi)}</span>
      {req.envois > 1 ? ` · ${req.envois} envois` : ''}
      <div style={{ color: req.derniere_visite ? '#047857' : '#94A3B8' }}>
        {req.derniere_visite ? `✓ lien ouvert le ${fmtD(req.derniere_visite)}` : 'lien pas ouvert'}
      </div>
    </div>
  )
}

function Actions({ r, busy, relancer, onChanged }) {
  if (r.compliance.status === 'ok') return null
  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {r.contact.email && (
        <button type="button" disabled={!!busy} onClick={() => relancer([r.contact], `Relancer ${r.contact.nom} ?`)}
          style={{ fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 6, padding: '4px 8px', background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD', whiteSpace: 'nowrap' }}>
          ✉ Relancer
        </button>
      )}
      <RelanceControls compact contact={r.contact} pause={r.pause} onChanged={onChanged} />
    </div>
  )
}

// Téléphone : une carte par entreprise
function RowCard({ r, legalByContact, onOpenContact, ...rest }) {
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 10, opacity: r.active ? 1 : 0.6 }}>
      <NameCell r={r} onOpenContact={onOpenContact} />
      <div style={{ display: 'flex', gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}><LegalDot l={legalByContact?.get(r.contact.id)} /><div style={{ fontSize: 9, color: '#94A3B8' }}>Société</div></div>
        {DOC_KINDS.map(k => (
          <div key={k} style={{ textAlign: 'center' }}><DocDot kind={k} status={r.compliance.kinds[k].status} /><div style={{ fontSize: 9, color: '#94A3B8' }}>{DOC_META[k].label}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <DemandeCell req={r.lastRequest} />
        <div style={{ ...small, color: relanceColor(r.relance), textAlign: 'right' }}>
          {r.relance.kind !== 'a_jour' && <>Relance : {relanceText(r.relance)}</>}
        </div>
      </div>
      {r.compliance.status !== 'ok' && <div style={{ marginTop: 8 }}><Actions r={r} {...rest} /></div>}
    </div>
  )
}
