// Dictée de réunion → compte rendu structuré : schéma de la réponse IA et
// nettoyage (ids connus, valeurs bornées). Utilisé par /api/cr/ia.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ETATS = ['fait', 'en_cours', 'relance']
const PRIORITES = ['En attente', 'En cours', 'Urgent']

export const CR_AI_SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string' },
    decisions: { type: 'string' },
    lots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lot: { type: 'string' },
          observations: { type: 'string' },
          avancement: { type: ['integer', 'null'] },
        },
        required: ['lot', 'observations', 'avancement'],
        additionalProperties: false,
      },
    },
    points_existants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          etat: { type: 'string', enum: ETATS },
          echeance: { type: ['string', 'null'] },
        },
        required: ['id', 'etat', 'echeance'],
        additionalProperties: false,
      },
    },
    nouveaux_points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lot: { type: 'string' },
          titre: { type: 'string' },
          entreprise: { type: 'string' },
          echeance: { type: ['string', 'null'] },
          priorite: { type: 'string', enum: PRIORITES },
        },
        required: ['lot', 'titre', 'entreprise', 'echeance', 'priorite'],
        additionalProperties: false,
      },
    },
  },
  required: ['resume', 'decisions', 'lots', 'points_existants', 'nouveaux_points'],
  additionalProperties: false,
}

export const str = (v, max) => String(v ?? '').trim().slice(0, max)
export const isoDateOrNull = (v) => (DATE_RE.test(String(v || '')) ? String(v) : null)

/** Nettoie la réponse de l'IA (ids connus, valeurs bornées). */
export function normalizeCrAi(json, ids) {
  const known = new Set(ids)
  return {
    resume: str(json?.resume, 3000),
    decisions: str(json?.decisions, 3000),
    lots: (Array.isArray(json?.lots) ? json.lots : []).slice(0, 40)
      .map(l => {
        const av = Number(l?.avancement)
        return {
          lot: str(l?.lot, 120),
          observations: str(l?.observations, 3000),
          avancement: l?.avancement == null || !Number.isFinite(av) ? null : Math.max(0, Math.min(100, Math.round(av))),
        }
      })
      .filter(l => l.lot && (l.observations || l.avancement != null)),
    points_existants: (Array.isArray(json?.points_existants) ? json.points_existants : []).slice(0, 200)
      .filter(p => p && known.has(p.id) && ETATS.includes(p.etat))
      .map(p => ({ id: p.id, etat: p.etat, echeance: isoDateOrNull(p.echeance) })),
    nouveaux_points: (Array.isArray(json?.nouveaux_points) ? json.nouveaux_points : []).slice(0, 60)
      .map(p => ({
        lot: str(p?.lot, 120), titre: str(p?.titre, 300), entreprise: str(p?.entreprise, 120),
        echeance: isoDateOrNull(p?.echeance), priorite: PRIORITES.includes(p?.priorite) ? p.priorite : 'En cours',
      }))
      .filter(p => p.titre),
  }
}
