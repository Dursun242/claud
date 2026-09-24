'use client'
import { DEVIS_STATUT_COLORS, isDevisExpired, isDevisStale } from '../../lib/devis'
import { fmtEur } from './DevisEditor'

const act = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 6, cursor: 'pointer',
  padding: '4px 8px', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', color: '#334155', whiteSpace: 'nowrap',
}
const fmtD = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

/**
 * Liste des devis d'une affaire (fiche opportunité).
 * Les actions proposées dépendent du statut : Brouillon → Envoyer,
 * Envoyé → Accepté / Refusé, toujours : PDF, Dupliquer, Supprimer.
 */
export default function DevisList({ devis = [], missing, saving, onNew, onOpen, onPdf, onSend, onAccept, onRefuse, onDuplicate, onDelete }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
          Devis <span style={{ color: '#94A3B8', fontWeight: 500 }}>({devis.length})</span>
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
            return (
              <div key={d.id} style={{
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff',
                border: '1px solid #E2E8F0', borderLeft: `3px solid ${c}`, borderRadius: 10, padding: '8px 12px', minWidth: 0,
              }}>
                <button onClick={() => onOpen(d)} title="Ouvrir le devis" style={{
                  flex: 1, minWidth: 160, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                    {d.numero}
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: c, background: c + '1A', borderRadius: 999, padding: '1px 7px' }}>{d.statut}</span>
                    {expired && <span style={{ marginLeft: 6, fontSize: 10, color: '#DC2626', fontWeight: 700 }}>expiré</span>}
                    {!expired && stale && <span style={{ marginLeft: 6, fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>sans réponse</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {fmtEur(d.total_ht)} HT · {fmtEur(d.total_ttc)} TTC
                    {d.date_envoi ? ` · envoyé le ${fmtD(d.date_envoi)}` : ` · du ${fmtD(d.date_emission)}`}
                  </div>
                </button>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => onPdf(d)} style={act} aria-label={`Télécharger le PDF ${d.numero}`}>PDF</button>
                  {d.statut === 'Brouillon' && (
                    <button onClick={() => onSend(d)} disabled={saving} style={{ ...act, background: '#1E3A5F', color: '#fff', borderColor: '#1E3A5F' }}>📤 Envoyer</button>
                  )}
                  {d.statut === 'Envoyé' && (<>
                    <button onClick={() => onAccept(d)} disabled={saving} style={{ ...act, background: '#ECFDF5', color: '#047857', borderColor: '#A7F3D0' }}>✓ Accepté</button>
                    <button onClick={() => onRefuse(d)} disabled={saving} style={{ ...act, background: '#FEF2F2', color: '#B91C1C', borderColor: '#FECACA' }}>Refusé</button>
                  </>)}
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
