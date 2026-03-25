export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siret = searchParams.get('siret');
    const q = searchParams.get('q');

    const apiKey = process.env.PAPPERS_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "PAPPERS_API_KEY non configurée dans les variables d'environnement" }, { status: 500 });
    }

    let url;
    if (siret) {
      // Lookup direct par SIRET (14 chiffres)
      url = `https://api.pappers.fr/v2/entreprise?siret=${siret}&api_token=${apiKey}`;
    } else if (q) {
      // Recherche par nom (retourne une liste)
      url = `https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(q)}&api_token=${apiKey}&par_page=6`;
    } else {
      return Response.json({ error: "Paramètre 'siret' ou 'q' requis" }, { status: 400 });
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `Pappers ${response.status}: ${errText}` }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    return Response.json({ error: `Erreur proxy Pappers : ${error.message}` }, { status: 500 });
  }
}
