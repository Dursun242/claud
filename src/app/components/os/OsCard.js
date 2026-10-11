'use client'
import { memo } from 'react'
import { SB, fmtDate, fmtMoney, btnChip, Icon, I } from '../../dashboards/shared'
import Badge from '../Badge'
import { osStatusColor } from './osConstants'

// Indicateur de génération (PDF / Excel) dans un bouton
const Spinner = () => (
  <span aria-hidden="true" style={{
    display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
    border: '2px solid #D1D1D6', borderTopColor: '#0066CC', animation: 'spin .8s linear infinite',
  }}/>
)

// Une carte OS memoïsée. Sur une liste de N OS, taper dans la barre de
// recherche ou changer de statut ne re-render QUE les cartes dont les
// props ont changé (en pratique : aucune, tant que la liste filtrée ne
// contient pas de nouveaux OS).
// Les handlers sont passés en props ; le parent les stabilise via
// useCallback.
function OsCardImpl({
  os, ch, overdue, generating, readOnly, m,
  onPdf, onExcel, onEmail, onSignOpen, onSignReset,
  onDuplicate, onEdit, onDelete,
}) {
  const isGeneratingPdf = generating?.id === os.id && generating?.kind === 'pdf'
  const isGeneratingXls = generating?.id === os.id && generating?.kind === 'xls'

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: m ? 14 : 16,
      border: '1px solid #E5E5EA',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E' }}>{os.numero}</span>
            <Badge text={os.statut} color={osStatusColor[os.statut] || '#8E8E93'}/>
            {overdue && (
              <span title={`Échéance dépassée : ${fmtDate(os.date_fin_prevue)}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FFF0EF', color: '#D70015',
                borderRadius: 999,
                padding: '2px 8px', fontSize: 12, fontWeight: 600,
              }}>⚠ En retard</span>
            )}
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1C1C1E' }}>{ch?.nom || '—'}</span>
          </div>
          <div style={{ fontSize: 13, color: '#6E6E73' }}>
            {os.artisan_nom}{os.artisan_specialite ? ` · ${os.artisan_specialite}` : ''}{' '}
            — Client : {os.client_nom}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>
            Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)}{' '}
            • {(os.prestations || []).length} prestation(s)
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1C1E' }}>{fmtMoney(os.montant_ttc || 0)}</div>
          <div style={{ fontSize: 12, color: '#6E6E73' }}>HT : {fmtMoney(os.montant_ht || 0)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={() => onPdf(os)} disabled={!!generating} title="Télécharger le PDF"
          className="u-btn" style={{ ...btnChip, opacity: generating && !isGeneratingPdf ? 0.5 : 1, cursor: generating ? 'wait' : 'pointer' }}>
          {isGeneratingPdf ? <><Spinner/>Génération…</> : <><Icon d={I.download} size={14}/>PDF</>}
        </button>
        <button onClick={() => onExcel(os)} disabled={!!generating} title="Télécharger l'Excel"
          className="u-btn" style={{ ...btnChip, opacity: generating && !isGeneratingXls ? 0.5 : 1, cursor: generating ? 'wait' : 'pointer' }}>
          {isGeneratingXls ? <><Spinner/>Génération…</> : <><Icon d={I.sheet} size={14}/>Excel</>}
        </button>
        <button onClick={() => onEmail(os)} title="Envoyer par email" className="u-btn" style={btnChip}>
          <Icon d={I.send} size={14}/>Email
        </button>

        {!readOnly && (os.odoo_sign_url ? (
          <>
            <a
              href={os.odoo_sign_url}
              target="_blank"
              rel="noreferrer"
              title={`Signature : ${os.statut_signature || 'Envoyé'}`}
              onClick={() => { try {
                SB.log('view_sign_request', 'os', os.id,
                  `OS ${os.numero} — consultation signature`,
                  { statut_signature: os.statut_signature || null })
              } catch (_) {} }}
              className="u-btn"
              style={{ ...btnChip, textDecoration: 'none' }}
            >
              <Icon d={I.link} size={14}/>{os.statut_signature || 'Signé'}
            </a>
            <button
              onClick={() => onSignReset(os)}
              title="Réinitialiser la signature (efface le lien Odoo)"
              aria-label="Réinitialiser la signature"
              className="u-btn" style={{ ...btnChip, color: '#48484A' }}
            >↺</button>
          </>
        ) : (
          <button onClick={() => onSignOpen(os)} title="Envoyer pour signature Odoo"
            className="u-btn" style={btnChip}><Icon d={I.edit} size={14}/>Signature</button>
        ))}

        {!readOnly && (
          <>
            <button onClick={() => onDuplicate(os)} title="Dupliquer cet OS"
              className="u-btn" style={btnChip}><Icon d={I.copy} size={14}/>Dupliquer</button>
            <button onClick={() => onEdit(os)} title="Modifier"
              className="u-btn" style={btnChip}><Icon d={I.edit} size={14}/>Modifier</button>
            <button onClick={() => onDelete(os)} title="Supprimer"
              className="u-btn" style={{ ...btnChip, color: '#D70015', marginLeft: m ? 0 : 'auto' }}>
              <Icon d={I.trash} size={14}/>Supprimer</button>
          </>
        )}
      </div>
    </div>
  )
}

const OsCard = memo(OsCardImpl)
export default OsCard
