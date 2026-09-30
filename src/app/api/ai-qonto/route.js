// Route /api/ai-qonto — analyse IA des factures Qonto (Claude ou Mistral, lib/ai.js).
//
// Sécurité : même pattern que /api/qonto
// - Auth JWT Supabase obligatoire
// - Token Qonto récupéré côté serveur depuis la table settings
//   (service role key), jamais passé dans le body HTTP.
// - Rate limit par IP : la route appelle Claude (coût direct), même
//   logique que /api/claude et /api/extract-*.
import { verifyStaff } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { adminClient } from '@/app/lib/supabaseClients'
import { createLogger } from '@/app/lib/logger'
import { createRateLimiter, clientIp } from '@/app/lib/rateLimit'
import { generate } from '@/app/lib/ai'

const log = createLogger('ai-qonto')

const checkRateLimit = createRateLimiter({ limit: 5, windowMs: 60_000 })

async function getQontoToken() {
  const admin = adminClient()
  const { data, error } = await admin
    .from('settings')
    .select('value')
    .eq('key', 'qonto-token')
    .maybeSingle()
  if (error || !data?.value) return null
  return data.value
}

export async function POST(request) {
  try {
    // 1. Rate limit par IP (avant tout travail)
    if (!checkRateLimit(clientIp(request))) {
      return Response.json(
        { error: 'Trop de requêtes — attendez 1 minute avant de réessayer.' },
        { status: 429 }
      )
    }

    // 2. Auth JWT Supabase
    const { user, status } = await verifyStaff(request)
    if (!user) {
      return Response.json({ error: status === 403 ? 'Réservé à l’équipe' : 'Non autorisé' }, { status })
    }

    // 3. Récupération du token Qonto côté serveur
    const qontoToken = await getQontoToken()
    if (!qontoToken) {
      return Response.json(
        { error: 'Token Qonto non configuré. Va dans l\'onglet Qonto pour le saisir.' },
        { status: 400 }
      )
    }

    // 4. Récupérer les factures de Qonto
    const invoicesResponse = await fetchWithRetry(
      `https://thirdparty.qonto.com/v2/client_invoices`,
      {
        headers: {
          Authorization: qontoToken,
          "Content-Type": "application/json",
        },
        timeoutMs: 15000,
      }
    )

    if (!invoicesResponse.ok) {
      const errText = await invoicesResponse.text().catch(() => '')
      log.error(`qonto ${invoicesResponse.status}`, errText)
      return Response.json(
        { error: `Erreur Qonto: ${invoicesResponse.status}` },
        { status: invoicesResponse.status }
      )
    }

    const invoicesData = await invoicesResponse.json()
    const invoices = invoicesData.client_invoices || []

    // 5. Formater les données pour Claude
    const invoicesSummary = invoices.slice(0, 10).map((inv) => ({
      id: inv.id,
      date: inv.issued_at,
      amount: inv.amount_cents / 100,
      status: inv.status,
      currency: inv.currency,
      client: inv.client?.name,
    }))

    const prompt = `Analyse ces devis/factures de Qonto et fournis:
1. Résumé financier (total, moyenne, tendance)
2. Clients les plus importants
3. Taux de paiement
4. Recommandations

Données:
${JSON.stringify(invoicesSummary, null, 2)}

Réponds en JSON avec: { summary: string, topClients: array, paymentRate: string, recommendations: array }`

    // 6. Appel IA (Claude ou Mistral selon AI_PROVIDER, cf. lib/ai.js)
    const ai = await generate({
      maxTokens: 1024,
      json: true,
      log,
      messages: [{ role: "user", content: prompt }],
    })
    if (!ai.ok) {
      return Response.json({ error: ai.message }, { status: ai.status })
    }
    const responseText = ai.text || ""

    // Parser JSON (Claude peut entourer de markdown malgré l'instruction)
    let analysis = {}
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: responseText }
    } catch {
      analysis = { analysis: responseText }
    }

    return Response.json({
      success: true,
      analysis,
      invoiceCount: invoices.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    log.error('exception', error?.message || error)
    return Response.json(
      { error: "Erreur lors de l'analyse" },
      { status: 500 }
    )
  }
}
