'use client'
import { rappelsApres } from '../../lib/crSuivi'
import { needsMiseEnDemeure } from '../../lib/miseEnDemeure'
import { reponseText } from '../../lib/crReponse'

const fmt = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/')
const smallBtn = { border: '1px solid var(--separator-opaque)', background: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

/**
 * Bandeaux sous un point du CR : réponse de l'entreprise par son lien
 * (à valider en un clic) et mise en demeure après trois relances sans effet.
 */
export default function CRPointNotices({ row, crId, disabled, onChange, onMiseEnDemeure }) {
  const rappels = rappelsApres(row, crId)
  const med = onMiseEnDemeure && needsMiseEnDemeure({ ...row, rappels })
  return (
    <>
      {row.reponseRecente && row.reponse && (
        <div role="note" style={{ marginTop: 8, fontSize: 12, borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          background: '#fff', border: `1px solid ${row.reponse.type === 'desaccord' ? 'var(--red-line)' : 'var(--separator)'}`,
          color: row.reponse.type === 'desaccord' ? 'var(--red-text)' : 'var(--label-2)' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>Réponse de l&apos;entreprise</b> le {fmt(row.reponse.le)} : {reponseText(row.reponse)}
          </span>
          {row.reponse.type === 'fait' && row.suivi !== 'fait' && !disabled && (
            <button type="button" onClick={() => onChange({ suivi: 'fait' })} style={smallBtn}>Marquer fait</button>
          )}
          {row.reponse.type === 'delai' && row.reponse.date && row.echeance !== row.reponse.date && !disabled && (
            <button type="button" onClick={() => onChange({ echeance: row.reponse.date, suivi: 'en_cours' })} style={smallBtn}>Accepter la nouvelle date</button>
          )}
        </div>
      )}
      {med && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red-text)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {row.orig?.mise_en_demeure_le
              ? `Mise en demeure préparée le ${fmt(row.orig.mise_en_demeure_le)}.`
              : `Relancé ${rappels} fois sans effet : place à la mise en demeure.`}
          </span>
          <button type="button" onClick={() => onMiseEnDemeure(row.entreprise)}
            style={{ ...smallBtn, border: '1px solid var(--red-line)', color: 'var(--red-text)', fontWeight: 700 }}>
            {row.orig?.mise_en_demeure_le ? 'Refaire le courrier' : 'Préparer la mise en demeure'}
          </button>
        </div>
      )}
    </>
  )
}
