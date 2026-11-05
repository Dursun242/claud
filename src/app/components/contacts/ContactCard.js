'use client'
import { Icon, I, SB } from '../../dashboards/shared'
import { CopyIconBtn } from '../ContactInfoLink'
import ScoreBadge from './ScoreBadge'
import LegalBadge from '../conformite/LegalBadge'
import ConformiteBadge from '../conformite/ConformiteBadge'

// Fiche d'un contact dans l'annuaire (pages/ContactsV.js). Chrome neutre :
// seul l'état de l'entreprise (score, situation légale, documents) porte de
// la couleur. Coordonnées en lignes alignées (icône, valeur, copier), actions
// en bas de la fiche.

const muted = 'var(--label-tertiary)'
const secondary = 'var(--label-secondary)'

const log = (c, field, label, value) => {
  try { SB.log('contact_tap', 'contact', c.id, `${label} → ${c.nom}`, { field, value }) } catch (_) { /* journal facultatif */ }
}

function InfoRow({ icon, href, value, suffix, onTap, onCopy }) {
  const text = { fontSize: 14, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
      <span style={{ width: 16, display: 'inline-flex', flexShrink: 0, color: muted }}><Icon d={icon} size={16} stroke={1.5} /></span>
      {href
        ? <a href={href} onClick={(e) => { e.stopPropagation(); onTap?.() }} style={{ ...text, textDecoration: 'none' }}>{value}</a>
        : <span style={{ ...text, color: secondary, fontSize: 13 }}>{value}</span>}
      {suffix && <span style={{ fontSize: 12, color: muted, flexShrink: 0 }}>{suffix}</span>}
      <CopyIconBtn onClick={onCopy} />
    </li>
  )
}

export default function ContactCard({
  c, m, score, showDocs, legal, compliance, deals, onDeals, onNewDeal,
  onScore, onDocs, onEdit, onDelete, onSaveToPhone, onCopy,
}) {
  const inactive = c.actif === false
  const meta = [
    c.societe && c.societe !== c.nom ? c.societe : null,
    c.type,
    c.specialite ? `${c.specialite}${c.fonction ? ` — ${c.fonction}` : ''}` : c.fonction,
    inactive ? 'Inactif' : null,
  ].filter(Boolean).join(' · ')
  const adresse = [c.adresse, c.code_postal, c.ville].filter(Boolean).join(', ')
  const hasInfo = c.tel || c.tel_fixe || c.email || c.email_travaux || adresse
  const showState = showDocs || score?.score != null
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`
  const dealsText = !deals || (!deals.actives && !deals.gagnees) ? null
    : !deals.actives ? `${plural(deals.gagnees, 'affaire')} gagnée${deals.gagnees > 1 ? 's' : ''}`
      : [`${plural(deals.actives, 'affaire')} en cours`, deals.gagnees && `${deals.gagnees} gagnée${deals.gagnees > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
  const btnH = m ? 36 : 32
  const footBtn = {
    display: 'inline-flex', alignItems: 'center', gap: 8, height: btnH, padding: '0 12px', borderRadius: 8,
    border: '1px solid var(--separator)', background: '#fff', color: 'var(--label)', fontSize: 13, fontWeight: 500,
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  }
  const iconBtn = { width: btnH, height: btnH, borderRadius: 8, color: secondary }
  const linkBtn = {
    background: 'none', border: 'none', padding: 0, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
  }

  return (
    <article style={{
      background: '#fff', border: '1px solid var(--separator)', borderRadius: 12, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12, opacity: inactive ? 0.6 : 1, minWidth: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--label)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</h3>
          {c.note > 0 && (
            <span title={`Avis de l’équipe : ${c.note}/5`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              <Icon d={I.star} size={12} stroke={1.5} />{c.note}/5
            </span>
          )}
        </div>
        {meta && <div style={{ fontSize: 13, color: secondary, marginTop: 4 }}>{meta}</div>}
      </div>

      {hasInfo && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {c.tel && <InfoRow icon={I.phone} href={`tel:${c.tel.replace(/\s/g, '')}`} value={c.tel}
            onTap={() => log(c, 'tel', 'Appel', c.tel)} onCopy={() => onCopy(c.tel, 'Téléphone')} />}
          {c.tel_fixe && <InfoRow icon={I.phone} href={`tel:${c.tel_fixe.replace(/\s/g, '')}`} value={c.tel_fixe} suffix="fixe"
            onTap={() => log(c, 'tel_fixe', 'Appel fixe', c.tel_fixe)} onCopy={() => onCopy(c.tel_fixe, 'Téléphone fixe')} />}
          {c.email && <InfoRow icon={I.mail} href={`mailto:${c.email}`} value={c.email}
            onTap={() => log(c, 'email', 'Email', c.email)} onCopy={() => onCopy(c.email, 'Email')} />}
          {c.email_travaux && c.email_travaux !== c.email && <InfoRow icon={I.mail} href={`mailto:${c.email_travaux}`} value={c.email_travaux} suffix="travaux"
            onTap={() => log(c, 'email_travaux', 'Email travaux', c.email_travaux)} onCopy={() => onCopy(c.email_travaux, 'Email travaux')} />}
          {adresse && <InfoRow icon={I.mappin} value={adresse} onCopy={() => onCopy(adresse, 'Adresse')} />}
        </ul>
      )}

      {(c.siret || c.qualifications) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
          {c.siret && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontVariantNumeric: 'tabular-nums' }}>
              SIRET {c.siret}<CopyIconBtn onClick={() => onCopy(c.siret, 'SIRET')} />
            </span>
          )}
          {c.qualifications && <span style={{ fontSize: 13, color: secondary }}>Qualifications : {c.qualifications}</span>}
        </div>
      )}

      {showState && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <ScoreBadge score={score} onClick={onScore} />
          {showDocs && <>
            <LegalBadge check={legal} onClick={onDocs} />
            <ConformiteBadge compliance={compliance} onClick={onDocs} />
          </>}
        </div>
      )}

      {(onDeals || onNewDeal) && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {dealsText && (
            <button type="button" onClick={onDeals} title="Voir les affaires de ce contact dans le CRM"
              style={{ ...linkBtn, color: 'var(--accent-text)', fontWeight: 500 }}>{dealsText}</button>
          )}
          {onNewDeal && (
            <button type="button" onClick={onNewDeal} title="Créer une opportunité CRM pour ce contact"
              style={{ ...linkBtn, color: secondary }}>Nouvelle affaire</button>
          )}
        </div>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        borderTop: '1px solid var(--separator)', paddingTop: 12, marginTop: 'auto',
      }}>
        <button type="button" onClick={onSaveToPhone} className="u-press"
          title="Enregistrer dans les contacts du téléphone"
          aria-label={`Enregistrer ${c.nom} dans les contacts du téléphone`} style={footBtn}>
          <Icon d={I.userPlus} size={16} stroke={1.5} color={secondary} />
          Ajouter au téléphone
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={onEdit} className="u-icon-btn" title="Modifier" aria-label={`Modifier ${c.nom}`} style={iconBtn}>
            <Icon d={I.edit} size={16} stroke={1.5} />
          </button>
          <button type="button" onClick={onDelete} className="u-icon-btn u-icon-btn--danger" title="Supprimer" aria-label={`Supprimer ${c.nom}`} style={iconBtn}>
            <Icon d={I.trash} size={16} stroke={1.5} />
          </button>
        </div>
      </div>
    </article>
  )
}
