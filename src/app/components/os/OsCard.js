'use client'
import { memo } from 'react'
import { SB, fmtDate, fmtMoney } from '../../dashboards/shared'
import Badge from '../Badge'
import { osStatusColor, osBtn } from './osConstants'

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
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      borderLeft: `4px solid ${osStatusColor[os.statut] || '#8E8E93'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              background: '#0071E3', color: '#fff', borderRadius: 6,
              padding: '3px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            }}>{os.numero}</span>
            <Badge text={os.statut} color={osStatusColor[os.statut] || '#8E8E93'}/>
            {overdue && (
              <span title={`Échéance dépassée : ${fmtDate(os.date_fin_prevue)}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FFF0EF', color: '#D70015',
                border: '1px solid #FFC9C6', borderRadius: 999,
                padding: '2px 8px', fontSize: 10, fontWeight: 700,
              }}>⚠ En retard</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1C1C1E' }}>{ch?.nom || '—'}</span>
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73' }}>
            {os.artisan_nom}{os.artisan_specialite ? ` · ${os.artisan_specialite}` : ''}{' '}
            — Client : {os.client_nom}
          </div>
          <div style={{ fontSize: 11, color: '#6E6E73', marginTop: 2 }}>
            Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)}{' '}
            • {(os.prestations || []).length} prestation(s)
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1C1C1E' }}>{fmtMoney(os.montant_ttc || 0)}</div>
          <div style={{ fontSize: 10, color: '#6E6E73' }}>HT: {fmtMoney(os.montant_ht || 0)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {/* Groupe Export */}
        <button
          onClick={() => onPdf(os)}
          disabled={!!generating}
          title="Télécharger le PDF"
          style={{
            ...osBtn('#D70015', '#FFF0EF', '#FFC9C6'),
            opacity: isGeneratingPdf ? 0.7 : (generating ? 0.5 : 1),
            cursor: generating ? 'wait' : 'pointer',
          }}
        >
          {isGeneratingPdf ? (
            <>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '2px solid #FFC9C6', borderTopColor: '#D70015',
                borderRadius: '50%', animation: 'spin .8s linear infinite',
                marginRight: 4, verticalAlign: 'middle',
              }}/>
              Génération…
            </>
          ) : '📄 PDF'}
        </button>
        <button
          onClick={() => onExcel(os)}
          disabled={!!generating}
          title="Télécharger l'Excel"
          style={{
            ...osBtn('#1E7B34', '#EAF8EE', '#BFE9CA'),
            opacity: isGeneratingXls ? 0.7 : (generating ? 0.5 : 1),
            cursor: generating ? 'wait' : 'pointer',
          }}
        >
          {isGeneratingXls ? (
            <>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '2px solid #BFE9CA', borderTopColor: '#1E7B34',
                borderRadius: '50%', animation: 'spin .8s linear infinite',
                marginRight: 4, verticalAlign: 'middle',
              }}/>
              Génération…
            </>
          ) : '📊 XLS'}
        </button>
        <button
          onClick={() => onEmail(os)}
          title="Envoyer par email"
          style={osBtn('#4744B8', '#EFEFFC', '#D3D2F7')}
        >✉ Email</button>

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
              style={{
                ...osBtn('#8944AB', '#F7F0FC', '#E7D4F5'),
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              }}
            >
              ✍ {os.statut_signature || 'Signé'}
            </a>
            <button
              onClick={() => onSignReset(os)}
              title="Réinitialiser la signature (efface le lien Odoo)"
              style={osBtn('#6E6E73', '#F5F5F7', '#E5E5EA')}
            >↺</button>
          </>
        ) : (
          <button
            onClick={() => onSignOpen(os)}
            title="Envoyer pour signature Odoo"
            style={osBtn('#8944AB', '#F7F0FC', '#E7D4F5')}
          >✍ Signature</button>
        ))}

        {!readOnly && (
          <>
            <span style={{ width: 1, background: '#E5E5EA', margin: '2px 4px' }}/>
            <button onClick={() => onDuplicate(os)} title="Dupliquer cet OS"
              style={osBtn('#C93400', '#FFF7E8', '#FFDDA6')}>Dupliquer</button>
            <button onClick={() => onEdit(os)} title="Modifier"
              style={osBtn('#0066CC', '#EAF3FF', '#C6DDF7')}>Modifier</button>
            <button onClick={() => onDelete(os)} title="Supprimer"
              style={{ ...osBtn('#D70015', '#fff', '#FFC9C6'), marginLeft: 'auto' }}>Supprimer</button>
          </>
        )}
      </div>
    </div>
  )
}

const OsCard = memo(OsCardImpl)
export default OsCard
