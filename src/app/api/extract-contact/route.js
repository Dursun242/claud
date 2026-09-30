// Extraction d'informations de contact depuis une image
// (carte de visite, signature email, badge, devis…)
//
// Envoie l'image à Claude Haiku 4.5 (multimodal), récupère un JSON strict
// avec les champs normalisés pour la table contacts, puis le renvoie au
// client qui pré-remplit le formulaire.

import { verifyAuth } from '@/app/lib/auth'
import { createLogger } from '@/app/lib/logger'
import { generate } from '@/app/lib/ai'

const log = createLogger('extract-contact')

// Rate limiting simple en mémoire (par IP) — même pattern que /api/claude
const rateLimit = new Map();
const LIMIT = 10; // plus conservateur que /api/claude car les extractions sont chères
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

const SYSTEM_PROMPT = `Tu es un assistant d'extraction de données de contact.

L'utilisateur te fournit une image et tu dois en extraire les informations du CONTACT PRINCIPAL visible sur l'image.

L'image peut être de différents types :
- Photo réelle : carte de visite, badge de salon, en-tête de devis, facture, bon de livraison, tampon d'entreprise
- Signature email (screenshot d'un mail avec le bloc de signature en bas)
- Capture d'écran d'une fiche contact iOS/Android (iOS Contacts, Google Contacts, etc.)
- Capture d'écran d'une conversation SMS (en haut : nom/numéro du correspondant)
- Capture d'écran WhatsApp/Signal/Telegram (nom du contact en haut, parfois "en ligne" ou photo de profil)
- Capture d'écran d'une page LinkedIn, site web d'entreprise, annonce Pages Jaunes
- Photo d'un panneau de chantier ou d'une camionnette avec les coordonnées d'un artisan

Adapte ton extraction au type d'image :
- Capture SMS/WhatsApp : le nom est généralement en haut, le numéro peut être visible
  en cliquant sur le nom. Si tu ne vois que le numéro, mets-le dans tel et laisse nom vide
  (l'utilisateur le remplira).
- Capture iOS Contacts : les champs sont clairement labellisés
  (mobile, domicile, travail, email…), extrais-les tels quels.
- Panneau de chantier : le nom de la société est généralement le plus visible,
  le métier aussi (ex: "Plomberie Dupont — Dépannage 24/7").

Retourne EXCLUSIVEMENT un objet JSON strict, sans aucun texte avant ou après,
sans backticks, sans commentaires, sans markdown. Le JSON doit suivre ce schéma :

{
  "nom": "Nom complet de la personne, ou nom de l'entreprise si pas de personne identifiée",
  "societe": "Raison sociale si visible et différente du nom",
  "type": "Artisan | Sous-traitant | Prestataire | Client | Fournisseur | MOA | Architecte | BET",
  "specialite": "Métier/activité (ex: Plombier, Électricité CFO/CFA, Gros œuvre, Architecte DPLG…)",
  "fonction": "Poste de la personne (ex: Gérant, Chef de chantier, Conducteur de travaux…)",
  "tel": "Numéro de mobile (06 ou 07)",
  "tel_fixe": "Numéro de téléphone fixe (commence par 01-05, 08, 09)",
  "email": "Adresse email complète",
  "adresse": "Numéro et rue uniquement",
  "code_postal": "5 chiffres sans espace",
  "ville": "Ville",
  "siret": "14 chiffres sans espace si visible",
  "site_web": "URL complète du site web",
  "tva_intra": "Numéro TVA intracommunautaire (FR XX XXXXXXXXX) si visible",
  "qualifications": "Certifications/labels (RGE, Qualibat, QualiPV…) si visibles"
}

RÈGLES STRICTES :
- Tous les champs sont optionnels. Si une info n'est PAS visible ou PAS certaine,
  OMETS le champ entièrement. Ne mets jamais null, ne mets jamais une chaîne vide.
- Pour "type", devine selon le contexte métier : Plombier/Électricien/Maçon = "Artisan",
  Architecte = "Architecte", Bureau d'études = "BET", fournisseur de matériaux = "Fournisseur".
  Si impossible à deviner, utilise "Artisan".
- Pour les numéros de téléphone, garde le format français avec espaces (ex: "06 12 34 56 78" ou "02 35 12 34 56").
- Distingue bien tel mobile (06/07) et tel_fixe (01-05, 08, 09).
  Si un seul numéro et tu n'es pas sûr, mets dans "tel".
- Pour le code_postal, exactement 5 chiffres sans espace.
- Si plusieurs contacts sont visibles (ex: signature avec 2 personnes en CC),
  extrais UNIQUEMENT le contact principal/central/le plus visible.
- Si l'image ne contient AUCUNE information de contact exploitable
  (image floue, photo hors sujet, texte illisible), retourne un objet vide : {}
- Retourne UNIQUEMENT le JSON, rien d'autre. Pas de préfixe "Voici :", pas de suffixe, pas de backticks.`;

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
      return Response.json({ error: 'Format d\'image non supporté (JPEG/PNG/WebP/GIF attendu)' }, { status: 400 });
    }
    // Taille max 5 Mo (limite Claude API)
    const approxBytes = Math.floor(imageBase64.length * 0.75);
    if (approxBytes > 5 * 1024 * 1024) {
      return Response.json({ error: 'Image trop volumineuse (max 5 Mo)' }, { status: 400 });
    }

    // Appel IA vision (Claude ou Mistral selon AI_PROVIDER, cf. lib/ai.js)
    const ai = await generate({
      system: SYSTEM_PROMPT,
      maxTokens: 1024,
      json: true,
      log,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', mediaType, base64: imageBase64 },
          { type: 'text', text: 'Extrais les informations du contact principal de cette image et retourne-les au format JSON strict comme indiqué.' },
        ],
      }],
    });
    if (!ai.ok) {
      return Response.json({ error: ai.message }, { status: ai.status });
    }
    const textResponse = ai.text || '';

    if (!textResponse) {
      log.error('Réponse IA vide');
      return Response.json({ error: 'Réponse IA vide' }, { status: 500 });
    }

    // Parser le JSON retourné par Claude
    // Parfois Claude entoure son JSON avec du markdown malgré les instructions
    // → on nettoie avant de parser
    let cleaned = textResponse.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      log.error('JSON invalide', cleaned.slice(0, 500));
      return Response.json({
        error: 'Extraction échouée — la réponse IA n\'est pas un JSON valide. Essaie avec une photo plus nette.',
      }, { status: 500 });
    }

    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
      return Response.json({ error: 'Format de réponse inattendu' }, { status: 500 });
    }

    // Retourne ce que Claude a extrait (pré-rempli pour le formulaire)
    return Response.json({ ok: true, data: extracted });

  } catch (error) {
    log.error('exception', error?.message || error);
    return Response.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
