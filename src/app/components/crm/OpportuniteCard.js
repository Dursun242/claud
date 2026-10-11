import { fmtMoney } from '../../dashboards/shared'
import { nextEtape } from '../../lib/crm'
import { todayISO, iconBtn } from './crmUi'

// Carte d'une affaire dans le pipeline (Kanban desktop / liste mobile)
// Couleur du texte d'aperçu selon ce qu'il signale (lib/oppPreview.js)
const TONE = {
  chaud: 'var(--green-text)', retard: 'var(--red-text)', aujourdhui: 'var(--orange-text)',
  attente: 'var(--label-secondary)', neutre: 'var(--label-secondary)',
}

function PreviewLine({ emoji, line }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4, fontSize: 12, lineHeight: 1.35, color: TONE[line.tone] || TONE.neutre }}>
      <span aria-hidden="true" style={{ flexShrink: 0 }}>{emoji}</span>
      <span style={{ minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{line.text}</span>
    </div>
  )
}

// `preview` : { mail, rappel } — dernier mail de devis (ouvert, consulté,
// relancé, réponse) et prochain rappel (buildOppPreviews)
export default function OpportuniteCard({ o, contact, dormant, preview, draggable, onDragStart, onDragEnd, onOpen, onCall, onAdvance }) {
  const late = o.date_cloture_prevue && o.date_cloture_prevue < todayISO()
  const isDormant = dormant != null && dormant >= 14
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.() }
  return (
    <div draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }}
      aria-label={`Ouvrir ${o.titre}`}
      style={{
        background: '#fff', borderRadius: 10, padding: '10px 12px', cursor: draggable ? 'grab' : 'pointer',
        border: '1px solid var(--separator)', minWidth: 0,
      }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.titre}</div>
      <div style={{ fontSize: 11, color: 'var(--label-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {contact ? (contact.societe || contact.nom) : <span style={{ color: 'var(--label-secondary)', fontStyle: 'italic' }}>Sans contact</span>}
        {o.type_projet ? ` · ${o.type_projet}` : ''}
      </div>
      {preview?.mail && <PreviewLine emoji="📨" line={preview.mail} />}
      {preview?.rappel && <PreviewLine emoji="🔔" line={preview.rappel} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {Number(o.montant_estime) > 0
          ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--label)' }}>{fmtMoney(o.montant_estime)}</span>
          : <span style={{ fontSize: 11, color: 'var(--label-secondary)' }}>Montant ?</span>}
        <span style={{ flex: 1 }} />
        {late && <span title="Décision attendue dépassée" style={{ fontSize: 11, color: 'var(--red-text)', fontWeight: 700 }}>⚠</span>}
        {isDormant && <span title={`Aucun échange depuis ${dormant} j`} style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 700 }}>💤 {dormant} j</span>}
        {onCall && (
          <button onClick={stop(onCall)} title="Noter un appel" aria-label={`Noter un appel pour ${o.titre}`} style={iconBtn}>📞</button>
        )}
        {onAdvance && (
          <button onClick={stop(onAdvance)} title={`Passer à « ${nextEtape(o.etape)} »`}
            aria-label={`Passer à ${nextEtape(o.etape)}`} style={iconBtn}>→</button>
        )}
      </div>
    </div>
  )
}
