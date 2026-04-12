import { verifyAuth } from '@/app/lib/auth'

export async function GET(request) {
  try {
    // Auth obligatoire — empêche un tiers de consommer le quota Pappers
    const user = await verifyAuth(request)
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url);
    const siret = searchParams.get('siret');
    const q = searchParams.get('q');

    const apiKey = process.env.PAPPERS_API_KEY;
    if (!apiKey) {
      console.error('[pappers] PAPPERS_API_KEY manquante');
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 });
    }

    // ─── CAS 1 : lookup direct par SIRET ─────────────────────────
    // Renvoie l'entreprise complète (avec representants, NAF, siege, etc.)
    if (siret) {
      const params = new URLSearchParams({ api_token: apiKey, siret });
      const response = await fetch(`https://api.pappers.fr/v2/entreprise?${params.toString()}`);
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[pappers siret] ${response.status} ${errText}`);
        return Response.json(
          { error: 'Erreur lors de la requête Pappers' },
          { status: response.status }
        );
      }
      return Response.json(await response.json());
    }

    // ─── CAS 2 : recherche par nom (société OU dirigeant) ────────
    // On lance les DEUX recherches en parallèle : /recherche (entreprises)
    // et /recherche-dirigeants (personnes physiques). L'utilisateur peut
    // taper "YC Ingénierie" ou "Yusuf Caglayan" indifféremment.
    if (q) {
      const makeUrl = (path) => {
        const p = new URLSearchParams({ api_token: apiKey, q, par_page: '6' });
        return `https://api.pappers.fr/v2/${path}?${p.toString()}`;
      };

      const [companiesRes, dirigeantsRes] = await Promise.allSettled([
        fetch(makeUrl('recherche')),
        fetch(makeUrl('recherche-dirigeants')),
      ]);

      // ─── Parsing des entreprises ───
      let resultats = [];
      let companiesOk = false;
      if (companiesRes.status === 'fulfilled') {
        if (companiesRes.value.ok) {
          const data = await companiesRes.value.json().catch(() => ({}));
          resultats = data.resultats || [];
          companiesOk = true;
        } else {
          const errText = await companiesRes.value.text().catch(() => '');
          console.error(`[pappers recherche] ${companiesRes.value.status} ${errText}`);
        }
      } else {
        console.error('[pappers recherche] network error', companiesRes.reason);
      }

      // ─── Parsing des dirigeants (non-bloquant) ───
      // Si cette recherche échoue (endpoint inaccessible, quota, etc.),
      // on continue avec les entreprises seules — pas grave.
      let dirigeants = [];
      if (dirigeantsRes.status === 'fulfilled' && dirigeantsRes.value.ok) {
        const data = await dirigeantsRes.value.json().catch(() => ({}));
        dirigeants = data.resultats || [];
      } else if (dirigeantsRes.status === 'fulfilled') {
        const errText = await dirigeantsRes.value.text().catch(() => '');
        console.warn(`[pappers recherche-dirigeants] ${dirigeantsRes.value.status} ${errText}`);
      } else {
        console.warn('[pappers recherche-dirigeants] network error', dirigeantsRes.reason);
      }

      // Si les DEUX ont échoué (et pas juste vide) → erreur serveur
      if (!companiesOk && dirigeants.length === 0) {
        return Response.json({ error: 'Erreur lors de la requête Pappers' }, { status: 502 });
      }

      return Response.json({ resultats, dirigeants });
    }

    return Response.json({ error: "Paramètre 'siret' ou 'q' requis" }, { status: 400 });

  } catch (error) {
    console.error('[pappers] exception:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
