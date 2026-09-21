import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'
import { createLogger } from '@/app/lib/logger'
import { normalizeEntreprise, pickEtablissement, extractDirigeants } from '@/app/lib/entreprises'

const log = createLogger('entreprises')

// API Recherche d'entreprises — État français (DINUM), données SIRENE.
// Publique, gratuite, sans clé. Limite : 7 requêtes / seconde / IP.
// Docs : https://recherche-entreprises.api.gouv.fr/docs/
const BASE = 'https://recherche-entreprises.api.gouv.fr/search'

// Proxy conservé (plutôt qu'un appel direct navigateur) pour : auth
// obligatoire, normalisation en une shape stable, logs serveur.
export async function GET(request) {
  try {
    const user = await verifyAuth(request)
    if (!user) return Response.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const siret = (searchParams.get('siret') || '').replace(/\s/g, '')
    const q = (searchParams.get('q') || '').trim()

    // ─── CAS 1 : lookup direct par SIRET (14 chiffres) ou SIREN (9) ───
    if (siret) {
      if (!/^\d{9}$|^\d{14}$/.test(siret)) {
        return Response.json({ error: 'SIRET invalide (9 ou 14 chiffres attendus)' }, { status: 400 })
      }
      const url = `${BASE}?q=${encodeURIComponent(siret)}&per_page=1&page=1`
      const response = await fetchWithRetry(url, { timeoutMs: 12000 })
      if (!response.ok) {
        log.error(`siret ${response.status}`, await response.text().catch(() => ''))
        return Response.json({ error: "Erreur de l'annuaire des entreprises" }, { status: 502 })
      }
      const data = await response.json().catch(() => ({}))
      const first = (data.results || [])[0]
      if (!first) return Response.json({ error: 'Aucune entreprise pour ce SIRET' }, { status: 404 })
      return Response.json(pickEtablissement(normalizeEntreprise(first), siret.length === 14 ? siret : null))
    }

    // ─── CAS 2 : recherche texte (nom d'entreprise ou de dirigeant) ───
    if (q) {
      if (q.length < 3) return Response.json({ error: 'Saisis au moins 3 caractères' }, { status: 400 })
      const url = `${BASE}?q=${encodeURIComponent(q)}&per_page=8&page=1`
      const response = await fetchWithRetry(url, { timeoutMs: 12000 })
      if (!response.ok) {
        log.error(`recherche ${response.status}`, await response.text().catch(() => ''))
        return Response.json({ error: "Erreur de l'annuaire des entreprises" }, { status: 502 })
      }
      const data = await response.json().catch(() => ({}))
      const resultats = (data.results || []).map(normalizeEntreprise)
      return Response.json({ resultats, dirigeants: extractDirigeants(resultats, q), total: data.total_results ?? resultats.length })
    }

    return Response.json({ error: "Paramètre 'siret' ou 'q' requis" }, { status: 400 })
  } catch (error) {
    log.error('exception', error?.message || error)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
