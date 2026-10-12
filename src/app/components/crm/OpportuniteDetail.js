import { btnP, btnS, fmtMoney, fmtDate } from '../../dashboards/shared'
import { Badge, EmptyState } from '../index'
import { ETAPES_ACTIVES, ETAPE_COLORS, INTERACTION_TYPES, INTERACTION_ICONS, isClosed, isAttente, nextEtape, isFollowUpObsolete, followUpContext } from '../../lib/crm'
import DevisList from './DevisList'
import { fmtReprise } from './CrmAttenteList'
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
  const attente = isAttente(o.etape)
  // Le client revient : avec un devis déjà fait, on reprend en négociation
  const repriseEtape = devis.length ? 'Négociation' : 'Qualifié'
  const repriseDue = attente && o.date_reprise && String(o.date_reprise).slice(0, 10) <= todayISO()
  const next = nextEtape(o.etape)
  const hint = NEXT_STEP[o.etape]
  const relanceCtx = followUpContext({ opportunites: [o], devis })
  const pendingRelance = interactions.find(i => i.prochaine_action_date && !i.action_faite && !isFollowUpObsolete(i, relanceCtx))
  const draft = devis.find(d => d.statut === 'Brouillon')
  return (
    <div>
      {/* Bandeau étape + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Badge text={o.etape} color={color} />
        {Number(o.montant_estime) > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--label)' }}>{fmtMoney(o.montant_estime)}</span>}
        {!closed && !attente && <span style={{ fontSize: 11, color: 'var(--label-secondary)' }} title="Chances de gagner">{o.probabilite} % de chances</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onEdit} style={{ ...btnS, fontSize: 12, padding: '6px 10px' }}>Modifier</button>
        <button onClick={onDelete} aria-label="Supprimer l'affaire" title="Supprimer"
          style={{ ...btnS, fontSize: 12, padding: '6px 10px', color: 'var(--red-text)', background: 'var(--red-tint)' }}>🗑</button>
      </div>

      {/* Frise des étapes */}
      {!closed && !attente && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {ETAPES_ACTIVES.map((e, i) => {
            const idx = ETAPES_ACTIVES.indexOf(o.etape)
            const active = e === o.etape; const done = i < idx
            const c = ETAPE_COLORS[e]
            return (
              <button key={e} onClick={() => onChangeEtape(e)} disabled={active || saving} title={active ? 'Étape actuelle' : `Passer à « ${e} »`}
                style={{
                  padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: active ? 'default' : 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active || done ? c : 'var(--separator)'}`, background: active ? c : done ? c + '22' : '#fff', color: active ? '#fff' : done ? c : 'var(--label-secondary)',
                }}>{done ? '✓ ' : ''}{e}</button>
            )
          })}
        </div>
      )}

      {/* Prochaine étape suggérée + issue */}
      {!closed && !attente && (
        <div style={{ background: 'var(--row-fill)', border: '1px solid var(--separator)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--label-2)' }}>
            {pendingRelance ? (
              <>
                <strong>Relance prévue :</strong> {pendingRelance.prochaine_action}
                <span style={{ color: pendingRelance.prochaine_action_date < todayISO() ? 'var(--red-text)' : 'var(--orange-deep)', fontWeight: 600 }}> le {fmtDate(pendingRelance.prochaine_action_date)}</span>
                {pendingRelance.prochaine_action_date < todayISO() ? ' (en retard)' : ''}
              </>
            ) : (
              <><strong>Et maintenant ?</strong> {hint?.text}</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pendingRelance ? (
              <button onClick={() => onToggleAction(pendingRelance)} style={{ ...btnS, fontSize: 12 }}>Fait</button>
            ) : hint?.action === 'call' ? (
              <button onClick={() => onAddInteraction({ type: 'Appel' })} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : hint?.action === 'devis' && !devisMissing ? (
              <button onClick={onNewDevis} disabled={saving} style={{ ...btnP, fontSize: 12 }}>
                {draft ? 'Reprendre le devis' : hint.cta}
              </button>
            ) : hint?.action === 'devis' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>→ {next}</button>
            ) : hint?.action === 'advance' && next ? (
              <button onClick={() => onChangeEtape(next)} disabled={saving} style={{ ...btnP, fontSize: 12 }}>{hint.cta}</button>
            ) : null}
            <button onClick={() => onChangeEtape('En attente')} disabled={saving} title="Le client met son projet en pause : à reprendre plus tard"
              style={{ ...btnS, fontSize: 12, background: 'var(--indigo-tint)', color: 'var(--indigo-text)', border: '1px solid var(--indigo-line)' }}>En attente</button>
            <button onClick={() => onChangeEtape('Gagné')} disabled={saving} title="Marquer comme gagnée"
              style={{ ...btnS, fontSize: 12, background: 'var(--green-tint)', color: 'var(--green-text)', border: '1px solid var(--green-line)' }}>Gagnée</button>
            <button onClick={() => onChangeEtape('Perdu')} disabled={saving} title="Marquer comme perdue"
              style={{ ...btnS, fontSize: 12, background: 'var(--red-tint)', color: 'var(--red-text)', border: '1px solid var(--red-line)' }}>Perdue</button>
          </div>
        </div>
      )}

      {/* En attente : projet du client en pause, à reprendre à la date prévue */}
      {attente && (
        <div style={{ background: 'var(--indigo-tint)', border: '1px solid var(--indigo-line)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--label-2)' }}>
            <strong style={{ color: 'var(--indigo-text)' }}>⏸ Projet en pause{o.motif_attente ? ` : ${o.motif_attente}` : ''}</strong>
            <div style={{ marginTop: 2 }}>
              {o.date_reprise ? (
                <>Reprendre contact <span style={{ fontWeight: 600, color: repriseDue ? 'var(--red-text)' : 'var(--indigo-text)' }}>le {fmtReprise(o.date_reprise)}</span>{repriseDue ? ' (c’est le moment)' : ''}</>
              ) : 'Date de reprise à fixer'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onChangeEtape(repriseEtape)} disabled={saving} title={`Le client revient : l'affaire repasse en « ${repriseEtape} »`}
              style={{ ...btnP, fontSize: 12 }}>Reprendre l&apos;affaire</button>
            <button onClick={onEdit} disabled={saving} style={{ ...btnS, fontSize: 12 }}>Changer la date</button>
            <button onClick={() => onChangeEtape('Gagné')} disabled={saving} title="Marquer comme gagnée"
              style={{ ...btnS, fontSize: 12, background: 'var(--green-tint)', color: 'var(--green-text)', border: '1px solid var(--green-line)' }}>Gagnée</button>
            <button onClick={() => onChangeEtape('Perdu')} disabled={saving} title="Marquer comme perdue"
              style={{ ...btnS, fontSize: 12, background: 'var(--red-tint)', color: 'var(--red-text)', border: '1px solid var(--red-line)' }}>Perdue</button>
          </div>
        </div>
      )}
      {closed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          {chantier ? (
            <button onClick={onGoChantier || undefined} disabled={!onGoChantier}
              style={{ ...btnS, fontSize: 12, background: 'var(--green-tint)', color: 'var(--green-text)', border: '1px solid var(--green-line)' }}>
              Ouvrir le chantier « {chantier.nom} »
            </button>
          ) : o.etape === 'Gagné' ? (
            <button onClick={onConvert} disabled={saving} style={{ ...btnP, fontSize: 12 }}>Créer le chantier</button>
          ) : null}
          <button onClick={() => onChangeEtape('Négociation')} disabled={saving} style={{ ...btnS, fontSize: 12 }}>Rouvrir l&apos;affaire</button>
        </div>
      )}

      {/* Infos */}
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '6px 16px', fontSize: 12, color: 'var(--label-2)', marginBottom: 12 }}>
        <Info label="Client / contact" value={contact ? (
          onGoContact ? (
            <button onClick={onGoContact} title="Ouvrir la fiche contact"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>
              {contact.nom}{contact.societe ? ` · ${contact.societe}` : ''}
            </button>
          ) : `${contact.nom}${contact.societe ? ` · ${contact.societe}` : ''}`
        ) : (
          <button onClick={onEdit} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>+ Rattacher un contact</button>
        )} />
        {(contact?.tel || contact?.tel_fixe) && (
          <Info label="Téléphone" value={<a href={`tel:${(contact.tel || contact.tel_fixe).replace(/\s/g, '')}`} style={{ color: 'var(--accent-text)' }}>{contact.tel || contact.tel_fixe}</a>} />
        )}
        {contact?.email && <Info label="Email" value={<a href={`mailto:${contact.email}`} style={{ color: 'var(--accent-text)' }}>{contact.email}</a>} />}
        {o.type_projet && <Info label="Type de projet" value={o.type_projet} />}
        {o.source && <Info label="Source" value={o.source} />}
        {o.adresse && <Info label="Adresse" value={o.adresse} />}
        {o.date_cloture_prevue && <Info label="Décision attendue" value={fmtDate(o.date_cloture_prevue)} />}
        {o.date_cloture && <Info label="Terminée le" value={fmtDate(o.date_cloture)} />}
        {o.etape === 'Perdu' && <Info label="Motif" value={o.motif_perte || '—'} />}
        {o.qonto_quote_number && <Info label="Devis Qonto" value={o.qonto_quote_number} />}
      </div>
      {o.notes && (
        <div style={{ background: 'var(--orange-tint)', border: '1px solid var(--orange-line)', borderRadius: 8, padding: 10, fontSize: 12, color: 'var(--label-2)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{o.notes}</div>
      )}

      {/* Devis : affichés dès qu'il en existe, ou à partir de « Qualifié » */}
      {(devis.length > 0 || (!closed && o.etape !== 'Prospect')) && (
        <DevisList devis={devis} missing={devisMissing} saving={saving} {...devisActions} />
      )}

      {/* Échanges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--label)', flex: 1 }}>
          Échanges <span style={{ color: 'var(--label-secondary)', fontWeight: 500 }}>({interactions.length})</span>
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
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
