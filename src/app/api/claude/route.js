export async function POST(request) {
  try {
    const body = await request.json()

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

    if (!ANTHROPIC_API_KEY) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY non configurée sur le serveur." },
        { status: 500 }
      )
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-sonnet-4-20250514",
        max_tokens: body.max_tokens || 1000,
        system: body.system || "",
        messages: body.messages || [],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return Response.json(
        { error: `Anthropic API error ${response.status}: ${errorText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    return Response.json(
      { error: `Erreur serveur: ${error.message}` },
      { status: 500 }
    )
  }
}
