'use client'
import { fmtDate, Icon, I } from '../../dashboards/shared'

const card = (m) => ({
  background: '#fff', borderRadius: 12, padding: m ? 14 : 18,
  border: '1px solid #E2E8F0',
  boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 18,
})
const h2 = { margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: '#0F172A' }
const label = { fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748B', marginBottom: 6 }
const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

/**
 * Vue d'accueil du maître d'ouvrage : où en est mon chantier, quelle est
 * la prochaine étape, qu'est-ce qui attend ma signature.
 *
 * @param overview  résultat de buildClientOverview (lib/today.js)
 * @param onOpen    (tab, focusId?) => void
 */
export default function ClientOverview({ overview, onOpen, m }) {
  const { enCours, aVenir, dernierCR, osToSign } = overview

  return (<>
    {osToSign.length > 0 && (
      <button onClick={() => onOpen('os')} style={{
        ...card(m), width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }} className="u-press">
        <span aria-hidden style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: '#F1F5F9', color: '#1E3A5F',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon d={I.os} size={18}/></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
            {osToSign.length} ordre{osToSign.length > 1 ? 's' : ''} de service en cours de signature
          </span>
          <span style={{ display: 'block', fontSize: 13, color: '#64748B', ...ellipsis }}>
            Voir le détail et l&apos;état des signatures
          </span>
        </span>
        <span aria-hidden style={{ color: '#94A3B8', fontSize: 16 }}>›</span>
      </button>
    )}

    <section style={card(m)} aria-labelledby="client-progress">
      <h2 id="client-progress" style={h2}>Où en sont les travaux ?</h2>
      {enCours.length === 0 && aVenir.length === 0 ? (
        <div style={{ fontSize: 13, color: '#64748B', padding: '6px 0' }}>
          Le planning détaillé n&apos;est pas encore disponible. Votre maître d&apos;œuvre le complétera prochainement.
        </div>
      ) : (<>
        {enCours.length > 0 && (
          <div style={{ marginBottom: aVenir.length ? 14 : 0 }}>
            <div style={label}>En cours</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {enCours.slice(0, 5).map(p => (
                <div key={p.id} style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#0F172A', ...ellipsis }}>{p.title}</span>
                    <span style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{p.avancement} %</span>
                  </div>
                  <div role="progressbar" aria-valuenow={p.avancement} aria-valuemin={0} aria-valuemax={100} aria-label={p.title}
                    style={{ height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${p.avancement}%`, height: '100%', background: '#1E3A5F' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, ...ellipsis }}>
                    {p.chantier ? `${p.chantier} · ` : ''}fin prévue {fmtDate(p.fin)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {aVenir.length > 0 && (
          <div>
            <div style={label}>Prochaines étapes</div>
            {aVenir.slice(0, 4).map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 10, fontSize: 13, padding: '4px 0', minWidth: 0 }}>
                <span style={{ fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', minWidth: 52 }}>{fmtDate(p.debut)}</span>
                <span style={{ color: '#334155', ...ellipsis }}>{p.title}{p.chantier ? ` · ${p.chantier}` : ''}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => onOpen('planning')} style={linkBtn}>Voir le planning complet →</button>
      </>)}
    </section>

    {dernierCR && (
      <section style={card(m)} aria-labelledby="client-last-cr">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 id="client-last-cr" style={{ ...h2, margin: 0 }}>Dernier compte rendu</h2>
          <span style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>n°{dernierCR.numero} · {fmtDate(dernierCR.date)}</span>
        </div>
        {dernierCR.chantier && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>{dernierCR.chantier}</div>}
        <p style={{
          margin: 0, fontSize: 13, color: '#334155', lineHeight: 1.55,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{dernierCR.resume || 'Pas de résumé.'}</p>
        <button onClick={() => onOpen('reports', dernierCR.id)} style={linkBtn}>Lire le compte rendu →</button>
      </section>
    )}
  </>)
}

const linkBtn = {
  marginTop: 10, fontSize: 13, color: '#1D4ED8', background: 'none', border: 'none', minHeight: 36,
  cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0,
}
