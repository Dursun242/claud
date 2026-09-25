// Route /api/devis-ia — assistant IA du module Devis (CRM).
//
// Deux actions, réservées au staff (verifyStaff) :
//   - "generate" : à partir d'une description libre du besoin (+ contexte de
//                  l'affaire et prix habituels), propose l'objet, les lignes
//                  chiffrées et des conseils (oublis, points de vigilance).
//   - "email"    : rédige l'objet et le corps du mail d'envoi du devis.
//
// Sortie contrainte par JSON schema (output_config.format) : pas de parsing
// fragile. La route ne touche pas à la base : c'est le front qui décide
// quoi faire du résultat (remplacer / ajouter les lignes, etc.).

import { verifyStaff } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter } from '@/app/lib/rateLimit'
import { AI_DEVIS_SCHEMA, AI_EMAIL_SCHEMA, normalizeAiLignes } from '@/app/lib/devisAi'

export const maxDuration = 60

const log = createLogger('devis-ia')
const checkRate = createRateLimiter({ limit: 10, windowMs: 60_000 })

const MODEL = 'claude-opus-5'

const GENERATE_SYSTEM = `Tu es l'assistant de chiffrage de SARL ID MAÎTRISE, bureau d'ingénierie
de la construction et maîtrise d'œuvre au Havre (Normandie).

À partir de la description du besoin et du contexte de l'affaire, rédige un devis
professionnel en français :
- "objet" : intitulé court et clair du devis.
- "lignes" : titres de section (type "titre", quantite 1, prix_unitaire 0) et lignes
  chiffrées (type "ligne") dans un ordre logique. Désignations précises et
  professionnelles, sans prix ni quantité dans le texte. Prix unitaires HT en euros,
  réalistes pour la Normandie.
- Si "prix_habituels" contient une prestation équivalente, reprends exactement sa
  désignation, son unité et son prix : ce sont les tarifs de la société.
- TVA : 20 % par défaut ; 10 % pour des travaux de rénovation d'un logement de plus
  de 2 ans ; 5,5 % pour la rénovation énergétique. Les honoraires de maîtrise d'œuvre
  sont à 20 %.
- Si un montant estimé est fourni, vise un total HT cohérent avec lui sans le forcer.
- "conseils" : 0 à 5 remarques courtes et utiles (oubli probable, hypothèse de
  chiffrage à confirmer, point réglementaire). Pas de banalités.
Ne mets jamais d'informations inventées sur le client.`

const EMAIL_SYSTEM = `Tu rédiges, au nom de SARL ID MAÎTRISE (ingénierie de la construction,
Le Havre), le mail d'envoi d'un devis à un client. Ton : professionnel, chaleureux,
concis (6 à 10 lignes). Vouvoiement. Rappelle l'objet, le montant HT et TTC, la date de
validité si fournie, et propose d'échanger. Le devis est en pièce jointe. Pas de
formule creuse ni d'emoji. Termine par la signature fournie. "body" est du texte
brut avec des retours à la ligne.`

async function callClaude({ system, user, schema, effort, maxTokens }) {
  const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    timeoutMs: 55_000,
    maxRetries: 1,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Repli automatique sur un autre modèle en cas de refus des classifieurs
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      fallbacks: 'default',
      system,
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    log.error(`Anthropic ${res.status}`, txt.slice(0, 500))
    return { error: 'Erreur du service IA', status: res.status === 429 ? 429 : 502 }
  }
  const data = await res.json()
  if (data?.stop_reason === 'refusal') return { error: 'Demande refusée par l’IA', status: 422 }
  if (data?.stop_reason === 'max_tokens') return { error: 'Réponse IA tronquée — simplifie la description', status: 502 }
  const text = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  try {
    return { json: JSON.parse(text) }
  } catch {
    log.error('JSON invalide', text.slice(0, 500))
    return { error: 'Réponse IA illisible', status: 502 }
  }
}

const str = (v, max) => String(v ?? '').slice(0, max)

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (!checkRate(ip)) {
      return Response.json({ error: 'Trop de requêtes — attendez 1 minute.' }, { status: 429 })
    }
    const { user, status } = await verifyStaff(request)
    if (!user) {
      return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      log.error('ANTHROPIC_API_KEY manquante')
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (action === 'generate') {
      const description = str(body.description, 4000).trim()
      if (description.length < 5) {
        return Response.json({ error: 'Décris le besoin en quelques mots.' }, { status: 400 })
      }
      const context = JSON.stringify(body.context || {}).slice(0, 20_000)
      const r = await callClaude({
        system: GENERATE_SYSTEM,
        user: `Contexte (JSON) :\n${context}\n\nBesoin à chiffrer :\n${description}`,
        schema: AI_DEVIS_SCHEMA,
        effort: 'medium',
        maxTokens: 16000,
      })
      if (r.error) return Response.json({ error: r.error }, { status: r.status })
      const lignes = normalizeAiLignes(r.json.lignes)
      if (!lignes.some(l => l.type === 'ligne')) {
        return Response.json({ error: 'L’IA n’a proposé aucune ligne — précise la description.' }, { status: 422 })
      }
      return Response.json({
        ok: true,
        data: {
          objet: str(r.json.objet, 300).trim(),
          lignes,
          conseils: (Array.isArray(r.json.conseils) ? r.json.conseils : []).map(c => str(c, 400).trim()).filter(Boolean).slice(0, 5),
        },
      })
    }

    if (action === 'email') {
      const devis = body.devis || {}
      const payload = {
        numero: str(devis.numero, 40),
        objet: str(devis.objet, 300),
        total_ht: Number(devis.total_ht) || 0,
        total_ttc: Number(devis.total_ttc) || 0,
        date_validite: str(devis.date_validite, 10),
        client: str(body.clientName, 200),
        affaire: str(body.affaire, 300),
        signature: str(body.signature, 300),
        consigne: str(body.instructions, 1000),
      }
      const r = await callClaude({
        system: EMAIL_SYSTEM,
        user: `Informations (JSON) :\n${JSON.stringify(payload)}`,
        schema: AI_EMAIL_SCHEMA,
        effort: 'low',
        maxTokens: 4000,
      })
      if (r.error) return Response.json({ error: r.error }, { status: r.status })
      return Response.json({ ok: true, data: { subject: str(r.json.subject, 200).trim(), body: str(r.json.body, 5000).trim() } })
    }

    return Response.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (err) {
    log.error('exception', err?.message || err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
