'use client'
import Emoji from '../Emoji'
import { EMOJI } from '../../lib/emoji'
import { addDaysISO } from '../../lib/today'

// Bandeau « en un coup d'œil » de la fiche chantier (lib/chantierGlance.js) :
// prochaine réunion, points de CR ouverts, tâches en retard, budget engagé.
// Chaque tuile mène à l'onglet qui détaille. Couleur seulement quand il y a
// quelque chose à signaler (retard, budget presque ou entièrement engagé).

const meetingLabel = (date, today) => {
  if (date === today) return "Aujourd'hui"
  if (date === addDaysISO(today, 1)) return 'Demain'
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Tile({ emoji, label, value, detail, tone, onClick, m }) {
  return (
    <button type="button" onClick={onClick} className="u-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        background: '#fff', border: '1px solid var(--separator)', borderRadius: 12,
        padding: m ? '10px' : '10px 12px', minHeight: 56, minWidth: 0, cursor: 'pointer',
        fontFamily: 'inherit', color: 'var(--label)',
      }}>
      <Emoji e={emoji} size={m ? 28 : 32} />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{label}</span>
        <span style={{
          fontSize: 16, fontWeight: 600, color: tone || 'var(--label)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{value}</span>
        {detail && <span style={{
          fontSize: 12, color: 'var(--label-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{detail}</span>}
      </span>
    </button>
  )
}

export default function ChantierGlance({ glance, today, m, onOpen }) {
  const { nextMeeting, openPoints, lateTasks, budget } = glance
  const budgetTone = !budget ? null
    : budget.over > 0 ? '#D70015'
    : budget.ratio >= 95 ? '#C93400'
    : null
  return (
    <div role="group" aria-label="En un coup d'œil" style={{
      display: 'grid', gridTemplateColumns: m ? 'repeat(2,minmax(0,1fr))' : 'repeat(4,minmax(0,1fr))',
      gap: 8, marginBottom: 16,
    }}>
      <Tile m={m} emoji={EMOJI.rdv} label={m ? 'Réunion' : 'Prochaine réunion'}
        value={nextMeeting ? meetingLabel(nextMeeting.date, today) : 'Non prévue'}
        detail={nextMeeting ? [nextMeeting.heure, nextMeeting.lieu].filter(Boolean).join(' · ') : null}
        tone={nextMeeting ? null : '#6E6E73'}
        onClick={() => onOpen('suivi')} />
      <Tile m={m} emoji={EMOJI.cr} label="Points ouverts"
        value={openPoints === 0 ? 'Aucun' : `${openPoints} point${openPoints > 1 ? 's' : ''}`}
        onClick={() => onOpen('suivi')} />
      <Tile m={m} emoji={EMOJI.taches} label="Tâches en retard"
        value={lateTasks === 0 ? 'Aucune' : `${lateTasks} en retard`}
        tone={lateTasks > 0 ? '#D70015' : null}
        onClick={() => onOpen('suivi')} />
      <Tile m={m} emoji={EMOJI.budget} label="Budget engagé"
        value={budget ? `${budget.ratio} %` : 'Non défini'}
        detail={budget?.over > 0 ? 'Dépassement' : null}
        tone={budget ? budgetTone : '#6E6E73'}
        onClick={() => onOpen('finances')} />
    </div>
  )
}
