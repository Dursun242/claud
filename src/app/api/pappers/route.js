export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siret = searchParams.get('siret');
    const q = searchParams.get('q');

    const apiKey = process.env.PAPPERS_API_KEY;
    if (!apiKey) {
      console.error('[pappers] PAPPERS_API_KEY manquante');
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 });
    }

    // Construction propre via URLSearchParams pour éviter tout oubli d'encoding
    // et isoler clairement la clé API du reste de l'URL.
    let endpoint;
    const params = new URLSearchParams({ api_token: apiKey });
    if (siret) {
      endpoint = 'https://api.pappers.fr/v2/entreprise';
      params.set('siret', siret);
    } else if (q) {
      endpoint = 'https://api.pappers.fr/v2/recherche';
      params.set('q', q);
      params.set('par_page', '6');
    } else {
      return Response.json({ error: "Paramètre 'siret' ou 'q' requis" }, { status: 400 });
    }

    const response = await fetch(`${endpoint}?${params.toString()}`);

    if (!response.ok) {
      // On log l'erreur complète côté serveur mais on ne renvoie jamais le body
      // brut de Pappers au client (risque de fuite d'info ou d'écho de la clé).
      const errText = await response.text().catch(() => '');
      console.error(`[pappers] ${response.status} ${errText}`);
      return Response.json(
        { error: 'Erreur lors de la requête Pappers' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    console.error('[pappers] exception:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
