// Extraction de données d'un devis artisan via Claude Vision
// pour pré-remplir un Ordre de Service.
//
// Pattern identique à /api/extract-contact : auth JWT, rate limit,
// validation taille/format, modèle Claude à jour, zéro side-effect DB.
// La route retourne juste le JSON parsé — c'est le frontend qui décide
// quoi en faire (pré-remplir le form, créer un contact si absent, etc.).

import { verifyAuth } from '@/app/lib/auth'
import { fetchWithRetry } from '@/app/lib/fetchWithRetry'

// Rate limiting simple en mémoire (par IP)
const rateLimit = new Map();
const LIMIT = 10; // conservateur : les extractions coûtent
const WINDOW_MS = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= LIMIT) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit.entries()) {
    if (now > entry.resetAt) rateLimit.delete(ip);
  }
}, WINDOW_MS * 5);

const SYSTEM_PROMPT = `Tu es un assistant d'extraction de devis du secteur BTP français.

L'utilisateur te fournit une image d'un devis, facture, proforma ou bon
de commande provenant d'un artisan (plombier, électricien, maçon, peintre,
charpentier, etc.) ou d'un fournisseur de matériaux.

Extrais TOUTES les informations utiles pour pré-remplir un Ordre de Service
et retourne-les au format JSON strict.

L'image peut être :
- Une photo d'un devis papier
- Un screenshot d'un PDF ou d'un email contenant un devis
- Une photo d'un bon de commande manuscrit
- Une photo d'une feuille de prix / catalogue

Retourne UNIQUEMENT ce JSON (sans markdown, sans backticks, sans texte avant/après) :

{
  "artisan_societe": "Raison sociale de l'entreprise (le nom en gros dans l'en-tête, ex: 'BRASSEUR TP', 'SARL DUPONT PLOMBERIE', 'YC INGÉNIERIE')",
  "artisan_nom": "Nom et prénom de l'interlocuteur/signataire si visible (ex: 'Christophe Brasseur'). Si le devis ne mentionne qu'une personne physique sans société, mets-le ici et laisse artisan_societe vide.",
  "artisan_specialite": "Métier/activité (Plombier, Électricité CFO/CFA, Gros œuvre, etc.)",
  "artisan_tel": "Téléphone principal (format français avec espaces)",
  "artisan_email": "Email",
  "artisan_siret": "14 chiffres sans espace",
  "artisan_adresse": "Adresse complète si visible (numéro, rue, CP, ville)",
  "client_nom": "Nom du destinataire du devis (souvent libellé 'Client:' ou 'Adresse de facturation')",
  "client_adresse": "Adresse du destinataire",
  "date_emission": "Date d'émission du devis au format AAAA-MM-JJ",
  "date_intervention": "Date d'intervention prévue si mentionnée, format AAAA-MM-JJ",
  "prestations": [
    {
      "description": "Description exacte de la ligne",
      "unite": "u | m² | m³ | ml | h | j | forfait | kg | t | ens",
      "quantite": 1.5,
      "prix_unitaire": 125.50,
      "tva_taux": 20
    }
  ],
  "observations": "Notes / conditions particulières / délais / remarques au bas du devis"
}

RÈGLES STRICTES pour les prestations :

1. N'inclus PAS les lignes de totaux (Total HT, TVA, Total TTC, Sous-total,
   Acompte, Net à payer) dans "prestations". Ce sont des sous-totaux calculés,
   pas des prestations.

2. Inclus UNIQUEMENT les vraies lignes de travail/fourniture, une ligne
   par prestation.

3. Les nombres français utilisent la virgule comme décimale. Convertis-les
   en point pour le JSON :
   - "1 234,56" → 1234.56
   - "125,50 €" → 125.50
   - "15 %" → 15 (pour la TVA, juste le nombre)

4. Unités courantes BTP à reconnaître :
   - "u", "unité", "pièce", "pc", "pce" → "u"
   - "m²", "m2", "mc" → "m²"
   - "m³", "m3" → "m³"
   - "ml", "m.l.", "mètre linéaire" → "ml"
   - "h", "heure", "hr" → "h"
   - "j", "jour", "jr" → "j"
   - "forfait", "ft", "fft" → "forfait"
   - "kg", "kilo" → "kg"
   - "t", "tonne" → "t"
   - "ens", "ensemble" → "ens"
   Si tu ne reconnais pas l'unité, mets "u" par défaut.

5. TVA par défaut si non spécifiée : 20 (taux normal France).
   Reconnais aussi : 5.5 (rénovation logement), 10 (intermédiaire), 2.1 (DOM).

RÈGLES pour les champs optionnels :
- Si une info n'est PAS visible ou PAS certaine, OMETS le champ entièrement
  (ne mets ni null ni chaîne vide).
- Si aucune prestation n'est détectable, renvoie prestations: [].
- Si l'image n'est pas un devis exploitable, renvoie un objet {} vide.

Retourne UNIQUEMENT le JSON, rien d'autre.`;

export async function POST(request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return Response.json(
        { error: 'Trop de requêtes — attendez 1 minute avant de réessayer.' },
        { status: 429 }
      );
    }

    const user = await verifyAuth(request);
    if (!user) {
      return Response.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body = await request.json();
    const { imageBase64, mediaType } = body;

    // Validation du payload
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      return Response.json({ error: 'Image manquante' }, { status: 400 });
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mediaType)) {
      return Response.json(
        { error: "Format d'image non supporté (JPEG/PNG/WebP/GIF attendu)" },
        { status: 400 }
      );
    }
    // Taille max 5 Mo (limite Claude API)
    const approxBytes = Math.floor(imageBase64.length * 0.75);
    if (approxBytes > 5 * 1024 * 1024) {
      return Response.json({ error: 'Image trop volumineuse (max 5 Mo)' }, { status: 400 });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      console.error('[extract-os-data] ANTHROPIC_API_KEY manquante');
      return Response.json({ error: 'Configuration serveur invalide' }, { status: 500 });
    }

    // Appel Claude Vision (Haiku 4.5 — même modèle que extract-contact)
    const anthropicResponse = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      timeoutMs: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        // Un devis peut avoir beaucoup de lignes → on laisse plus de marge
        // qu'un contact (tokens plus élevés pour couvrir le tableau prestations)
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: "Extrais les informations de ce devis au format JSON strict comme indiqué.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text().catch(() => '');
      console.error(`[extract-os-data] Anthropic ${anthropicResponse.status} ${errText}`);
      return Response.json({ error: 'Erreur du service IA' }, { status: anthropicResponse.status });
    }

    const claudeData = await anthropicResponse.json();
    const textResponse = claudeData?.content?.[0]?.text || '';

    if (!textResponse) {
      console.error('[extract-os-data] Réponse Claude vide', claudeData);
      return Response.json({ error: 'Réponse IA vide' }, { status: 500 });
    }

    // Parser le JSON (strip fences markdown si présentes)
    let cleaned = textResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[extract-os-data] JSON parse failed, longueur réponse:', cleaned.length);
      return Response.json({
        error: "Extraction échouée — la réponse IA n'est pas un JSON valide. Essaie avec une photo plus nette.",
      }, { status: 500 });
    }

    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
      return Response.json({ error: 'Format de réponse inattendu' }, { status: 500 });
    }

    // Nettoyer / normaliser les prestations
    if (Array.isArray(extracted.prestations)) {
      extracted.prestations = extracted.prestations
        .filter(p => p && typeof p === 'object')
        .map(p => ({
          description: String(p.description || '').trim(),
          unite: String(p.unite || 'u').trim(),
          quantite: Number(p.quantite) || 0,
          prix_unitaire: Number(p.prix_unitaire) || 0,
          tva_taux: Number(p.tva_taux) || 20,
        }))
        .filter(p => p.description); // vire les lignes sans description
    } else {
      extracted.prestations = [];
    }

    return Response.json({ ok: true, data: extracted });

  } catch (error) {
    console.error('[extract-os-data] exception:', error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
