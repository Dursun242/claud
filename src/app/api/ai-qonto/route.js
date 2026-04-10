import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request) {
  try {
    const { qontoData, qontoToken } = await request.json();

    if (!qontoData || !qontoToken) {
      return Response.json(
        { error: "Missing qontoData or qontoToken" },
        { status: 400 }
      );
    }

    // Récupérer les devis et factures de Qonto
    const invoicesResponse = await fetch(
      `https://thirdparty.qonto.com/v2/client_invoices`,
      {
        headers: {
          Authorization: qontoToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!invoicesResponse.ok) {
      throw new Error(`Qonto API error: ${invoicesResponse.status}`);
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = invoicesData.client_invoices || [];

    // Formater les données pour Claude
    const invoicesSummary = invoices.slice(0, 10).map((inv) => ({
      id: inv.id,
      date: inv.issued_at,
      amount: inv.amount_cents / 100,
      status: inv.status,
      currency: inv.currency,
      client: inv.client?.name,
    }));

    const prompt = `Analyse ces devis/factures de Qonto et fournis:
1. Résumé financier (total, moyenne, tendance)
2. Clients les plus importants
3. Taux de paiement
4. Recommandations

Données:
${JSON.stringify(invoicesSummary, null, 2)}

Réponds en JSON avec: { summary: string, topClients: array, paymentRate: string, recommendations: array }`;

    // Appeler Claude
    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extraire la réponse
    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parser JSON
    let analysis = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: responseText };
    } catch (e) {
      analysis = { analysis: responseText };
    }

    return Response.json({
      success: true,
      analysis,
      invoiceCount: invoices.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ai-qonto] error:", error);
    return Response.json(
      { error: "Erreur lors de l'analyse" },
      { status: 500 }
    );
  }
}
