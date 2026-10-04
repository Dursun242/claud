// Assemblage des « priorités du jour » à partir du dataset du tableau de
// bord et du CRM : relances CRM (classifyFollowUps), signaux commerciaux
// (buildCrmInsights), agenda du jour (buildAgenda), puis classement
// (buildPriorities). Logique pure, utilisée à l'identique par le tableau de
// bord (DashboardV) et par le mail du matin (/api/cron/daily-digest) :
// l'écran et le mail donnent la même liste.

import { classifyFollowUps } from './crm'
import { buildCrmInsights } from './crmInsights'
import { buildAgenda } from './today'
import { buildPriorities } from './priorities'
import { activeCompanyIds, conformiteItems } from './conformite'

/**
 * Partie CRM : relances à traiter (en retard + aujourd'hui) au format de
 * l'agenda, et signaux commerciaux.
 * @param {object|null} crm   { opportunites, interactions, devis, devisEvents }
 * @param {object} [opts]
 * @param {Array}  [opts.contacts]  contacts (nom affiché à côté de l'affaire)
 * @param {Date}   [opts.now]       instant de référence (sa date UTC fait foi, comme dans lib/crm.js)
 */
export function buildCrmDaily(crm, { contacts = [], now = new Date() } = {}) {
  const opps = crm?.opportunites || []
  const oppById = new Map(opps.map(o => [o.id, o]))
  const f = classifyFollowUps(crm?.interactions || [], now, { opportunites: opps, devis: crm?.devis || [] })
  const toItem = (late) => (it) => {
    const o = oppById.get(it.opportunite_id)
    return {
      id: it.id, title: it.prochaine_action || 'Relance',
      sub: [o?.titre, it.sujet].filter(Boolean).join(' · '),
      date: it.prochaine_action_date, late,
      tab: 'crm', focus: o?.id || 'relances',
    }
  }
  const contactsById = new Map((contacts || []).map(c => [c.id, c]))
  return {
    crmInsights: buildCrmInsights(crm || {}, { today: now, contactsById }),
    hasCrm: opps.length > 0 || (crm?.devis || []).length > 0,
    relances: [...f.overdue.map(toItem(true)), ...f.today.map(toItem(false))],
    nbOverdue: f.overdue.length,
  }
}

/** Documents des entreprises actives à revoir (Kbis, décennale, fiscale, URSSAF). */
export function buildConformiteItems(data = {}, docs = [], today, legalChecks = []) {
  return conformiteItems({ contacts: data.contacts || [], docs, activeIds: activeCompanyIds(data), today, legalChecks })
}

/**
 * Chaîne complète (utilisée telle quelle côté serveur ; DashboardV enchaîne
 * les mêmes appels en les mémoïsant séparément).
 * @param {object} p
 * @param {object} p.data      dataset du tableau de bord (lib/dashboardData.js)
 * @param {object} [p.crm]     CRM (lib/crmLoad.js)
 * @param {string} p.today     AAAA-MM-JJ
 * @param {string} [p.nowHM]   HH:MM (écarte les rendez-vous passés depuis plus d'1 h)
 * @param {Date}   [p.now]     instant de référence pour le CRM
 * @param {number} [p.limit=3]
 * @param {Array}  [p.conformiteDocs] documents des entreprises (contact_documents) ; null = non suivis
 */
export function buildDailyPriorities({ data = {}, crm = null, today, nowHM = null, now = new Date(), limit = 3, conformiteDocs = null, legalChecks = [] } = {}) {
  const daily = buildCrmDaily(crm, { contacts: data.contacts, now })
  const agenda = buildAgenda(data, { today, relances: daily.relances })
  const extraItems = conformiteDocs ? buildConformiteItems(data, conformiteDocs, today, legalChecks) : []
  const priorities = buildPriorities({ agenda, crmItems: daily.crmInsights.items, today, now: nowHM, limit, extraItems })
  return { ...daily, agenda, priorities }
}
