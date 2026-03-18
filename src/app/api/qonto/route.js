export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get('endpoint')
    const token = searchParams.get('token')

    if (!endpoint || !token) {
      return Response.json({ error: "Missing endpoint or token" }, { status: 400 })
    }

    // Whitelist allowed endpoints (read-only)
    const allowed = ['client_invoices', 'quotes', 'clients']
    const base = endpoint.split('?')[0]
    if (!allowed.some(a => base.includes(a))) {
      return Response.json({ error: "Endpoint not allowed" }, { status: 403 })
    }

    const response = await fetch(`https://thirdparty.qonto.com/v2/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errText = await response.text()
      return Response.json(
        { error: `Qonto API ${response.status}: ${errText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)

  } catch (error) {
    return Response.json(
      { error: `Proxy error: ${error.message}` },
      { status: 500 }
    )
  }
}
