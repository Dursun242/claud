'use client'
import { DEVIS_STATUT_COLORS, isDevisExpired, isDevisStale, numeroAffiche } from '../../lib/devis'
import { fmtEur } from './DevisEditor'
import { qontoFingerprint } from '../../lib/qontoDevis'
import { raisonOf, TON_COLORS } from '../../lib/devisRelance'

const act = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
  padding: '4px 8px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', color: '#334155', whiteSpace: 'nowrap',
}
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

// État du lien Qonto : null (jamais envoyé), 'ok', 'stale' (modifié depuis)
export function qontoState(d = {}) {
  if (!d.qonto_quote_id) return null
  return d.qonto_hash && d.qonto_hash !== qontoFingerprint(d) ? 'stale' : 'ok'
}

/**
 * Liste des devis d'une affaire (fiche opportunité).
 * Les actions proposées dépendent du statut : Brouillon → Envoyer,
 * Envoyé → Relancer / Renvoyer (tant que non signé) / Accepté / Refusé,
 * toujours : PDF, Qonto, Dupliquer, Supprimer.
 */
const fmtDT = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const EVENT_LABEL = {
  ouverture: 'mail ouvert', consultation: 'devis consulté en ligne', pdf: 'PDF consulté en ligne',
  relance: 'relance envoyée', reponse: 'réponse du client',
}

/** Suivi du devis envoyé : ouvertures du mail, consultations en ligne, relances. */
function SuiviLine({ suivi }) {
  const detail = suivi.events.slice(0, 15).map(e => `${fmtDT(e.created_at)} — ${e.relance ? 'relance ouverte' : (EVENT_LABEL[e.kind] || e.kind)}`).join('\n')
  const parts = [
    suivi.ouvertures > 0 && `👁 ouvert ${suivi.ouvertures}× · dernier le ${fmtDT(suivi.derniereOuverture)}`,
    suivi.consultations > 0 && `🔗 consulté en ligne ${suivi.consultations}× · dernier le ${fmtDT(suivi.derniereConsultation)}`,
    suivi.relances > 0 && `✉ relancé ${suivi.relances}× · dernière le ${fmtDT(suivi.derniereRelance)}`,
    suivi.relanceOuvertures > 0 && `📬 relance ouverte ${suivi.relanceOuvertures}× · dernière le ${fmtDT(suivi.derniereRelanceOuverture)}`,
    // Relances envoyées avant le marquage : une ouverture après la relance peut être la sienne
    suivi.relances > 0 && !suivi.relanceOuvertures && !(suivi.derniereOuverture > suivi.derniereRelance) && '📭 relance pas encore ouverte',
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <div title={detail} style={{ fontSize: 11, color: '#0369A1', marginTop: 3, fontWeight: 600 }}>
      {parts.map((p, i) => <span key={i}>{i > 0 && <span style={{ color: '#64748B' }}> · </span>}{p}</span>)}
    </div>
  )
}

/** Dernière réponse du client à une relance (raison choisie + précision). */
function ReponseLine({ reponse }) {
  const r = raisonOf(reponse.raison)
  if (!r) return null
  const t = TON_COLORS[r.ton] || TON_COLORS.chaud
  return (
    <div style={{ fontSize: 11, marginTop: 4, padding: '4px 8px', borderRadius: 6, background: t.bg, border: `1px solid ${t.border}`, color: t.color }}>
      <strong>💬 Réponse du client le {fmtDT(reponse.created_at)} : {r.court}</strong>
      {reponse.commentaire && <span style={{ color: '#334155' }}> — « {reponse.commentaire} »</span>}
    </div>
  )
}

export default function DevisList({ devis = [], missing, saving, onNew, onOpen, onPdf, onSend, onRelance, onAccept, onRefuse, onDuplicate, onDelete, onQonto, onSignedPdf }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
          Devis <span style={{ color: '#64748B', fontWeight: 500 }}>({devis.length})</span>
        </h3>
        {!missing && (
          <button onClick={onNew} disabled={saving} style={{ ...act, background: '#F1F5F9' }}>📄 Nouveau devis</button>
        )}
      </div>
      {missing ? (
        <div role="status" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          Appliquer la migration <code>027_crm_devis.sql</code> pour rédiger les devis ici.
        </div>
      ) : devis.length === 0 ? (
        <div style={{ border: '1px dashed #CBD5E1', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#64748B' }}>
          Aucun devis pour l&apos;instant.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {devis.map(d => {
            const c = DEVIS_STATUT_COLORS[d.statut] || '#64748B'
            const expired = isDevisExpired(d)
            const stale = isDevisStale(d)
            const qs = qontoState(d)
            return (
              <div key={d.id} style={{
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff',
                border: '1px solid #E2E8F0', borderLeft: `3px solid ${c}`, borderRadius: 10, padding: '8px 12px', minWidth: 0,
              }}>
                <button onClick={() => onOpen(d)} title="Ouvrir le devis" style={{
                  flex: 1, minWidth: 160, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                    {numeroAffiche(d.numero)}
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: c, background: c + '1A', borderRadius: 999, padding: '1px 7px' }}>{d.statut}</span>
                    {expired && <span style={{ marginLeft: 6, fontSize: 10, color: '#DC2626', fontWeight: 700 }}>expiré</span>}
                    {!expired && stale && <span style={{ marginLeft: 6, fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>sans réponse</span>}
                    {d._qontoDeleted
                      ? <span style={{ marginLeft: 6, fontSize: 10, color: '#B91C1C', fontWeight: 700 }} title="Clique sur « ↻ Qonto » pour le recréer">⚠ supprimé dans Qonto</span>
                      : qs === 'ok' && <span style={{ marginLeft: 6, fontSize: 10, color: '#047857', fontWeight: 700 }}>✓ Qonto</span>}
                    {d.statut_signature && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: d.statut_signature === 'Signé' ? '#047857' : ['Refusé', 'Expiré', 'Annulé'].includes(d.statut_signature) ? '#B91C1C' : '#7C3AED' }}>
                        ✍️ {d.statut_signature === 'Envoyé' ? 'signature en attente' : d.statut_signature === 'Signé' ? 'signé' : d.statut_signature.toLowerCase()}
                      </span>
                    )}
                    {!d._qontoDeleted && qs === 'stale' && <span style={{ marginLeft: 6, fontSize: 10, color: '#B45309', fontWeight: 700 }}>Qonto à mettre à jour</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {fmtEur(d.total_ht)} HT · {fmtEur(d.total_ttc)} TTC
                    {d.date_envoi ? ` · envoyé le ${fmtD(d.date_envoi)}` : ` · du ${fmtD(d.date_emission)}`}
                  </div>
                  {d._suivi && <SuiviLine suivi={d._suivi} />}
                  {d._suivi?.reponses?.[0] && <ReponseLine reponse={d._suivi.reponses[0]} />}
                </button>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => onPdf(d)} style={act} aria-label={`Télécharger le PDF ${d.numero}`}>PDF</button>
                  {d.statut === 'Brouillon' && (
                    <button onClick={() => onSend(d)} disabled={saving} style={{ ...act, background: '#1E3A5F', color: '#fff', borderColor: '#1E3A5F' }}>📤 Envoyer</button>
                  )}
                  {d.statut === 'Envoyé' && (<>
                    {d.statut_signature !== 'Signé' && onRelance && (
                      <button onClick={() => onRelance(d)} disabled={saving} style={{ ...act, background: '#F0F9FF', color: '#0369A1', borderColor: '#BAE6FD' }}
                        title="Mail de relance : le client indique en un clic pourquoi il n’a pas donné suite">✉ Relancer</button>
                    )}
                    {d.statut_signature !== 'Signé' && (
                      // Mauvaise adresse, mail perdu… : même fenêtre d'envoi. Une nouvelle
                      // demande de signature remplace le lien précédent (ancien lien invalide).
                      <button onClick={() => onSend(d)} disabled={saving} style={act}
                        title="Renvoyer le devis (adresse corrigée, relance) — l'ancien lien de signature ne fonctionnera plus">↻ Renvoyer</button>
                    )}
                    <button onClick={() => onAccept(d)} disabled={saving} style={{ ...act, background: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' }}>✓ Accepté</button>
                    <button onClick={() => onRefuse(d)} disabled={saving} style={{ ...act, background: '#FEF2F2', color: '#B91C1C', borderColor: '#FECACA' }}>Refusé</button>
                  </>)}
                  {onQonto && (
                    <button onClick={() => onQonto(d)} disabled={saving} style={act}
                      title={qs ? 'Mettre à jour le devis dans Qonto' : 'Créer ce devis dans Qonto (même numéro)'}>
                      {qs === 'ok' ? '↻ Qonto' : qs === 'stale' ? '↻ Mettre à jour Qonto' : '↗ Qonto'}
                    </button>
                  )}
                  {d.statut_signature === 'Signé' && onSignedPdf && (
                    <button onClick={() => onSignedPdf(d)} style={{ ...act, background: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' }}>✍️ PDF signé</button>
                  )}
                  {d.qonto_url && (
                    <a href={d.qonto_url} target="_blank" rel="noopener noreferrer" style={{ ...act, textDecoration: 'none' }}>Voir Qonto</a>
                  )}
                  <button onClick={() => onDuplicate(d)} disabled={saving} style={act} title="Créer une nouvelle version">Dupliquer</button>
                  <button onClick={() => onDelete(d)} disabled={saving} style={{ ...act, color: '#DC2626' }} aria-label={`Supprimer le devis ${d.numero}`}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
