// Route /api/ai-qonto — analyse IA des factures Qonto via Claude.
//
// Sécurité : même pattern que /api/qonto
// - Auth JWT Supabase obligatoire
// - Token Qonto récupéré côté serveur depuis la table settings
//   (service role key), jamais passé dans le body HTTP.
import { Anthropic } from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'

const client = new Anthropic()

async function getQontoToken() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
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
    // 1. Auth JWT Supabase
    const user = await verifyAuth(request)
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // 2. Récupération du token Qonto côté serveur
    const qontoToken = await getQontoToken()
    if (!qontoToken) {
      return Response.json(
        { error: 'Token Qonto non configuré. Va dans l\'onglet Qonto pour le saisir.' },
        { status: 400 }
      )
    }

    // 3. Récupérer les factures de Qonto
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
      console.error(`[ai-qonto] qonto ${invoicesResponse.status} ${errText}`)
      return Response.json(
        { error: `Erreur Qonto: ${invoicesResponse.status}` },
        { status: invoicesResponse.status }
      )
    }

    const invoicesData = await invoicesResponse.json()
    const invoices = invoicesData.client_invoices || []

    // 4. Formater les données pour Claude
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

    // 5. Appel Claude
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : ""

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
    console.error("[ai-qonto] error:", error)
    return Response.json(
      { error: "Erreur lors de l'analyse" },
      { status: 500 }
    )
  }
}
