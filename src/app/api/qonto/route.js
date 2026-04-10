export async function POST(request) {
  try {
    const body = await request.json()
    const { endpoint, token } = body

    if (!endpoint || !token) {
      return Response.json({ error: "Missing endpoint or token" }, { status: 400 })
    }

    // Whitelist allowed endpoints (read-only)
    const allowed = ['client_invoices', 'quotes', 'clients', 'attachments']
    const base = endpoint.split('?')[0]
    if (!allowed.some(a => base.includes(a))) {
      return Response.json({ error: "Endpoint not allowed" }, { status: 403 })
    }

    // Qonto API v2 uses "login:secret-key" directly (not Bearer)
    const response = await fetch(`https://thirdparty.qonto.com/v2/${endpoint}`, {
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`[qonto] ${response.status} ${errText}`)
      return Response.json(
        { error: 'Erreur Qonto' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    console.error('[qonto] proxy exception:', error)
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
