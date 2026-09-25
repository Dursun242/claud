/**
 * « Intelligence » du module Devis — logique pure (sans React / réseau).
 *
 * - Mémoire des prix : lignes déjà chiffrées dans les devis précédents,
 *   proposées en autocomplétion (désignation → unité, PU, TVA).
 * - Vérifications avant envoi (oublis, incohérences de montants, TVA…).
 * - Normalisation de la réponse de l'IA (route /api/devis-ia).
 *
 * Testé dans __tests__/devisAi.test.js.
 */
import { computeDevisTotals, TVA_TAUX, UNITES } from './devis'

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? n : 0
}
const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

/**
 * Historique des prix : une entrée par désignation (la plus récente gagne),
 * avec le nombre d'utilisations. Les devis refusés sont ignorés (prix
 * probablement non retenus par le client).
 * @returns {Array<{designation, unite, prix_unitaire, tva_taux, count, last}>}
 */
export function buildPriceHistory(allDevis = []) {
  const map = new Map()
  const sorted = [...allDevis]
    .filter(d => d && d.statut !== 'Refusé')
    .sort((a, b) => String(a.date_emission || a.created_at || '').localeCompare(String(b.date_emission || b.created_at || '')))
  for (const d of sorted) {
    for (const l of d.lignes || []) {
      if (l.type === 'titre') continue
      const designation = String(l.designation || '').trim()
      const pu = num(l.prix_unitaire)
      if (!designation || pu <= 0) continue
      const key = norm(designation)
      const prev = map.get(key)
      map.set(key, {
        designation,
        unite: l.unite || 'u',
        prix_unitaire: pu,
        tva_taux: num(l.tva_taux),
        count: (prev?.count || 0) + 1,
        last: d.date_emission || null,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.designation.localeCompare(b.designation))
}

/**
 * Suggestions pour une désignation en cours de saisie : tous les mots
 * tapés doivent apparaître (ordre libre, accents ignorés).
 */
export function suggestLignes(query, history = [], limit = 6) {
  const words = norm(query).split(' ').filter(w => w.length >= 2)
  if (!words.length) return []
  return history
    .filter(h => { const n = norm(h.designation); return words.every(w => n.includes(w)) })
    .slice(0, limit)
}

/** Entrée d'historique correspondant exactement à une désignation. */
export function findInHistory(designation, history = []) {
  const key = norm(designation)
  return key ? history.find(h => norm(h.designation) === key) || null : null
}

/**
 * Points à vérifier avant d'envoyer le devis. Chaque entrée :
 * { level: 'error' | 'warn' | 'info', text }.
 */
export function checkDevis(form = {}, { opportunite = null, contact = null, history = [] } = {}) {
  const out = []
  const lignes = (form.lignes || []).filter(l => l.type !== 'titre')
  const totals = computeDevisTotals(form.lignes || [], form)

  if (!contact) out.push({ level: 'warn', text: 'Aucun client rattaché à l’affaire : le devis sera adressé à « — ».' })
  else if (!contact.email) out.push({ level: 'warn', text: `${contact.nom || 'Le contact'} n’a pas d’email : l’envoi direct sera impossible.` })

  const sansPrix = lignes.filter(l => String(l.designation || '').trim() && num(l.prix_unitaire) <= 0)
  if (sansPrix.length) out.push({ level: 'error', text: `${sansPrix.length} ligne${sansPrix.length > 1 ? 's' : ''} sans prix unitaire.` })

  const vues = new Set(); let doublons = 0
  for (const l of lignes) {
    const k = norm(l.designation)
    if (!k) continue
    if (vues.has(k)) doublons++
    vues.add(k)
  }
  if (doublons) out.push({ level: 'warn', text: `${doublons} désignation${doublons > 1 ? 's' : ''} en double.` })

  // Écart important avec le prix habituel
  for (const l of lignes) {
    const h = findInHistory(l.designation, history)
    const pu = num(l.prix_unitaire)
    if (h && pu > 0 && h.prix_unitaire > 0) {
      const ecart = (pu - h.prix_unitaire) / h.prix_unitaire
      if (Math.abs(ecart) >= 0.25) {
        out.push({ level: 'info', text: `« ${l.designation} » : ${pu.toLocaleString('fr-FR')} € au lieu de ${h.prix_unitaire.toLocaleString('fr-FR')} € d’habitude (${ecart > 0 ? '+' : ''}${Math.round(ecart * 100)} %).` })
      }
    }
  }

  // Écart avec le montant estimé de l'affaire
  const estime = num(opportunite?.montant_estime)
  if (estime > 0 && totals.ht > 0) {
    const ecart = (totals.ht - estime) / estime
    if (Math.abs(ecart) >= 0.3) {
      out.push({ level: 'info', text: `Total HT ${ecart > 0 ? 'supérieur' : 'inférieur'} de ${Math.abs(Math.round(ecart * 100))} % au montant estimé de l’affaire.` })
    }
  }

  // TVA réduite : attestation client requise (art. 279-0 bis / 278-0 bis A du CGI)
  if (lignes.some(l => num(l.tva_taux) === 10 || num(l.tva_taux) === 5.5)) {
    const cond = String(form.conditions || '').toLowerCase()
    if (!cond.includes('attestation')) {
      out.push({ level: 'info', text: 'TVA réduite (10 % / 5,5 %) : pense à mentionner l’attestation à faire signer par le client (logement de plus de 2 ans).' })
    }
  }

  if (form.date_validite && form.date_emission && form.date_validite < form.date_emission) {
    out.push({ level: 'error', text: 'La date de validité précède la date du devis.' })
  }
  if (num(form.acompte_pct) > 50) out.push({ level: 'info', text: `Acompte de ${num(form.acompte_pct)} % : inhabituellement élevé.` })
  return out
}

// ─── IA : format attendu et normalisation ───

/** Schéma JSON demandé à l'IA pour la génération de lignes. */
export const AI_DEVIS_SCHEMA = {
  type: 'object',
  properties: {
    objet: { type: 'string' },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['ligne', 'titre'] },
          designation: { type: 'string' },
          unite: { type: 'string', enum: UNITES },
          quantite: { type: 'number' },
          prix_unitaire: { type: 'number' },
          tva_taux: { type: 'number', enum: TVA_TAUX },
        },
        required: ['type', 'designation', 'unite', 'quantite', 'prix_unitaire', 'tva_taux'],
        additionalProperties: false,
      },
    },
    conseils: { type: 'array', items: { type: 'string' } },
  },
  required: ['objet', 'lignes', 'conseils'],
  additionalProperties: false,
}

/** Schéma JSON demandé à l'IA pour la rédaction du mail. */
export const AI_EMAIL_SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
}

/**
 * Nettoie les lignes renvoyées par l'IA et les convertit au format du
 * formulaire (valeurs string pour les inputs). Bornes de sécurité :
 * 60 lignes max, montants positifs, unité / TVA connues.
 */
export function normalizeAiLignes(lignes = []) {
  if (!Array.isArray(lignes)) return []
  return lignes
    .filter(l => l && typeof l === 'object' && String(l.designation || '').trim())
    .slice(0, 60)
    .map(l => {
      const designation = String(l.designation).trim().slice(0, 500)
      if (l.type === 'titre') return { type: 'titre', designation }
      const tva = TVA_TAUX.includes(num(l.tva_taux)) ? num(l.tva_taux) : 20
      return {
        type: 'ligne',
        designation,
        unite: UNITES.includes(l.unite) ? l.unite : 'u',
        quantite: String(Math.max(0, num(l.quantite)) || 1),
        prix_unitaire: String(Math.max(0, Math.round(num(l.prix_unitaire) * 100) / 100)),
        tva_taux: String(tva),
      }
    })
}

/** Contexte compact envoyé à l'IA (pas de données inutiles). */
export function buildAiContext({ opportunite = null, contact = null, interactions = [], history = [] } = {}) {
  return {
    affaire: opportunite ? {
      titre: opportunite.titre || '',
      type_projet: opportunite.type_projet || '',
      adresse: opportunite.adresse || '',
      montant_estime: num(opportunite.montant_estime) || null,
      notes: String(opportunite.notes || '').slice(0, 2000),
    } : null,
    client: contact ? { nom: contact.nom || '', societe: contact.societe || '', type: contact.type || '' } : null,
    echanges: interactions.slice(0, 10).map(i => ({
      type: i.type, sujet: i.sujet, contenu: String(i.contenu || '').slice(0, 500),
    })),
    prix_habituels: history.slice(0, 80).map(h => ({
      designation: h.designation, unite: h.unite, prix_unitaire: h.prix_unitaire, tva_taux: h.tva_taux,
    })),
  }
}

// ─── Envoi par mail ───

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/

/** Découpe une liste d'emails (virgule / point-virgule / espace) et valide. */
export function parseEmails(value) {
  const list = String(value || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
  return { list, invalid: list.filter(e => !EMAIL_RE.test(e)) }
}
