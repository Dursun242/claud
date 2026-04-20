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
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
      borderLeft: `4px solid ${osStatusColor[os.statut] || '#94A3B8'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              background: '#1E3A5F', color: '#fff', borderRadius: 6,
              padding: '3px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            }}>{os.numero}</span>
            <Badge text={os.statut} color={osStatusColor[os.statut] || '#94A3B8'}/>
            {overdue && (
              <span title={`Échéance dépassée : ${fmtDate(os.date_fin_prevue)}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#FEF2F2', color: '#DC2626',
                border: '1px solid #FECACA', borderRadius: 999,
                padding: '2px 8px', fontSize: 10, fontWeight: 700,
              }}>⚠ En retard</span>
            )}
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{ch?.nom || '—'}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>
            {os.artisan_nom}{os.artisan_specialite ? ` · ${os.artisan_specialite}` : ''}{' '}
            — Client : {os.client_nom}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            Émis {fmtDate(os.date_emission)} • Intervention {fmtDate(os.date_intervention)}{' '}
            • {(os.prestations || []).length} prestation(s)
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(os.montant_ttc || 0)}</div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>HT: {fmtMoney(os.montant_ht || 0)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {/* Groupe Export */}
        <button
          onClick={() => onPdf(os)}
          disabled={!!generating}
          title="Télécharger le PDF"
          style={{
            ...osBtn('#DC2626', '#FEF2F2', '#FECACA'),
            opacity: isGeneratingPdf ? 0.7 : (generating ? 0.5 : 1),
            cursor: generating ? 'wait' : 'pointer',
          }}
        >
          {isGeneratingPdf ? (
            <>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '2px solid #FECACA', borderTopColor: '#DC2626',
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
            ...osBtn('#047857', '#ECFDF5', '#A7F3D0'),
            opacity: isGeneratingXls ? 0.7 : (generating ? 0.5 : 1),
            cursor: generating ? 'wait' : 'pointer',
          }}
        >
          {isGeneratingXls ? (
            <>
              <span style={{
                display: 'inline-block', width: 10, height: 10,
                border: '2px solid #A7F3D0', borderTopColor: '#047857',
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
          style={osBtn('#4338CA', '#EEF2FF', '#C7D2FE')}
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
                ...osBtn('#6D28D9', '#F5F3FF', '#DDD6FE'),
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              }}
            >
              ✍ {os.statut_signature || 'Signé'}
            </a>
            <button
              onClick={() => onSignReset(os)}
              title="Réinitialiser la signature (efface le lien Odoo)"
              style={osBtn('#64748B', '#F8FAFC', '#E2E8F0')}
            >↺</button>
          </>
        ) : (
          <button
            onClick={() => onSignOpen(os)}
            title="Envoyer pour signature Odoo"
            style={osBtn('#6D28D9', '#F5F3FF', '#DDD6FE')}
          >✍ Signature</button>
        ))}

        {!readOnly && (
          <>
            <span style={{ width: 1, background: '#E2E8F0', margin: '2px 4px' }}/>
            <button onClick={() => onDuplicate(os)} title="Dupliquer cet OS"
              style={osBtn('#B45309', '#FFFBEB', '#FDE68A')}>Dupliquer</button>
            <button onClick={() => onEdit(os)} title="Modifier"
              style={osBtn('#1D4ED8', '#EFF6FF', '#BFDBFE')}>Modifier</button>
            <button onClick={() => onDelete(os)} title="Supprimer"
              style={{ ...osBtn('#DC2626', '#fff', '#FECACA'), marginLeft: 'auto' }}>Supprimer</button>
          </>
        )}
      </div>
    </div>
  )
}

const OsCard = memo(OsCardImpl)
export default OsCard
