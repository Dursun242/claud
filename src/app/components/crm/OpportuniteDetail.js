import { btnP, btnS, fmtMoney, fmtDate } from '../../dashboards/shared'
import { Badge, EmptyState } from '../index'
import { ETAPES_ACTIVES, ETAPE_COLORS, INTERACTION_TYPES, INTERACTION_ICONS, isClosed, nextEtape } from '../../lib/crm'
import DevisList from './DevisList'
import InteractionRow from './InteractionRow'
import { NEXT_STEP, todayISO, iconBtn } from './crmUi'

// Fiche d'une affaire : étapes, prochaine action, infos, devis, échanges
export default function OpportuniteDetail({
  o, m, contact, chantier, interactions, saving,
  onEdit, onDelete, onChangeEtape, onConvert, onGoChantier, onGoContact,
  onAddInteraction, onToggleAction, onDeleteInteraction,
  devis = [], devisMissing = false, onNewDevis, devisActions = {},
}) {
  const color = ETAPE_COLORS[o.etape]
  const closed = isClosed(o.etape)
  const next = nextEtape(o.etape)
  const hint = NEXT_STEP[o.etape]
  const pendingRelance = interactions.find(i => i.prochaine_action_date && !i.action_faite)
  const draft = devis.find(d => d.statut === 'Brouillon')
  return (
    <div>
      {/* Bandeau étape + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge text={o.etape} color={color} />
        {Number(o.montant_estime) > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(o.montant_estime)}</span>}
        {!closed && <span style={{ fontSize: 11, color: '#94A3B8' }} title="Chances de gagner">{o.probabilite} % de chances</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onEdit} style={{ ...btnS, fontSize: 12, padding: '6px 10px' }}>✎ Modifier</button>
        <button onClick={onDelete} aria-label="Supprimer l'affaire" title="Supprimer"
          style={{ ...btnS, fontSize: 12, padding: '6px 10px', color: '#DC2626', background: '#FEF2F2' }}>🗑</button>
      </div>

      {/* Frise des étapes */}
      {!closed && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {ETAPES_ACTIVES.map((e, i) => {
            const idx = ETAPES_ACTIVES.indexOf(o.etape)
            const active = e === o.etape; const done = i < idx
            const c = ETAPE_COLORS[e]
            return (
              <button key={e} onClick={() => onChangeEtape(e)} disabled={active || saving} title={active ? 'Étape actuelle' : `Passer à « ${e} »`}
                style={{
                  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active || done ? c : '#E2E8F0'}`, background: active ? c : done ? c + '22' : '#fff', color: active ? '#fff' : done ? c : '#64748B',
                }}>{done ? '✓ ' : ''}{e}</button>
            )
          })}
        </div>
      )}

      {/* Prochaine étape suggérée + issue */}
      {!closed && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: '#334155' }}>
            {pendingRelance ? (
              <>
                <strong>Relance prévue :</strong> {pendingRelance.prochaine_action}
                <span style={{ color: pendingRelance.prochaine_action_date < todayISO() ? '#DC2626' : '#92400E', fontWeight: 600 }}> le {fmtDate(pendingRelance.prochaine_action_date)}</span>
                {pendingRelance.prochaine_action_date < todayISO() ? ' (en retard)' : ''}
              </>
            ) : (
              <><strong>Et maintenant ?</strong> {hint?.text}</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pendingRelance ? (
              <button onClick={() => onToggleAction(pendingRelance)} style={{ ...btnS, fontSize: 12 }}>✓ Fait</button>
            ) : hint?.action === 'call' ? (
              <button onClick={() => onAddInteraction({ type: 'Appel' })} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : hint?.action === 'devis' && !devisMissing ? (
              <button onClick={onNewDevis} disabled={saving} style={{ ...btnP, fontSize: 12 }}>
                {draft ? '📄 Reprendre le devis' : hint.cta}
              </button>
            ) : hint?.action === 'devis' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>→ {next}</button>
            ) : hint?.action === 'advance' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : null}
            <button onClick={() => onChangeEtape('Gagné')} disabled={saving} title="Marquer comme gagnée"
              style={{ ...btnS, fontSize: 12, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>🎉 Gagnée</button>
            <button onClick={() => onChangeEtape('Perdu')} disabled={saving} title="Marquer comme perdue"
              style={{ ...btnS, fontSize: 12, background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>Perdue</button>
          </div>
        </div>
      )}
      {closed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {chantier ? (
            <button onClick={onGoChantier || undefined} disabled={!onGoChantier}
              style={{ ...btnS, fontSize: 12, background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
              🏗️ Ouvrir le chantier « {chantier.nom} »
            </button>
          ) : o.etape === 'Gagné' ? (
            <button onClick={onConvert} disabled={saving} style={{ ...btnP, fontSize: 12 }}>🏗️ Créer le chantier</button>
          ) : null}
          <button onClick={() => onChangeEtape('Négociation')} disabled={saving} style={{ ...btnS, fontSize: 12 }}>↩ Rouvrir l&apos;affaire</button>
        </div>
      )}

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '6px 16px', fontSize: 12, color: '#334155', marginBottom: 12 }}>
        <Info label="Client / contact" value={contact ? (
          onGoContact ? (
            <button onClick={onGoContact} title="Ouvrir la fiche contact"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1D4ED8', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>
              {contact.nom}{contact.societe ? ` · ${contact.societe}` : ''}
            </button>
          ) : `${contact.nom}${contact.societe ? ` · ${contact.societe}` : ''}`
        ) : (
          <button onClick={onEdit} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#3B82F6', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>+ Rattacher un contact</button>
        )} />
        {(contact?.tel || contact?.tel_fixe) && (
          <Info label="Téléphone" value={<a href={`tel:${(contact.tel || contact.tel_fixe).replace(/\s/g, '')}`} style={{ color: '#1D4ED8' }}>{contact.tel || contact.tel_fixe}</a>} />
        )}
        {contact?.email && <Info label="Email" value={<a href={`mailto:${contact.email}`} style={{ color: '#1D4ED8' }}>{contact.email}</a>} />}
        {o.type_projet && <Info label="Type de projet" value={o.type_projet} />}
        {o.source && <Info label="Source" value={o.source} />}
        {o.adresse && <Info label="Adresse" value={o.adresse} />}
        {o.date_cloture_prevue && <Info label="Décision attendue" value={fmtDate(o.date_cloture_prevue)} />}
        {o.date_cloture && <Info label="Terminée le" value={fmtDate(o.date_cloture)} />}
        {o.etape === 'Perdu' && <Info label="Motif" value={o.motif_perte || '—'} />}
        {o.qonto_quote_number && <Info label="Devis Qonto" value={o.qonto_quote_number} />}
      </div>
      {o.notes && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 10, fontSize: 12, color: '#334155', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{o.notes}</div>
      )}

      {/* Devis : affichés dès qu'il en existe, ou à partir de « Qualifié » */}
      {(devis.length > 0 || (!closed && o.etape !== 'Prospect')) && (
        <DevisList devis={devis} missing={devisMissing} saving={saving} {...devisActions} />
      )}

      {/* Échanges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', flex: 1 }}>
          Échanges <span style={{ color: '#94A3B8', fontWeight: 500 }}>({interactions.length})</span>
        </h3>
        {INTERACTION_TYPES.map(t => (
          <button key={t} onClick={() => onAddInteraction({ type: t })} title={`Noter : ${t}`} aria-label={`Noter ${t}`}
            style={{ ...iconBtn, fontSize: 13, padding: '4px 8px' }}>{INTERACTION_ICONS[t]}</button>
        ))}
      </div>
      {interactions.length === 0 ? (
        <EmptyState compact icon="💬" title="Aucun échange. Clique sur 📞 ✉️ 🤝 🏠 📝 pour en noter un." />
      ) : (
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          {interactions.map(it => <InteractionRow key={it.id} it={it} onToggle={() => onToggleAction(it)} onDelete={() => onDeleteInteraction(it)} />)}
        </div>
      )}
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
