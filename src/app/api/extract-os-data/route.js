import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Supabase lazily to avoid build-time errors
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function POST(req) {
  try {
    const { imageBase64, fileName } = await req.json();

    if (!imageBase64) {
      return Response.json(
        { error: "Aucune image fournie" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Appel Claude Haiku Vision pour extraire les données
    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analyse ce document et extrais les informations pour créer un Ordre de Service.

Retourne UNIQUEMENT un JSON (sans markdown) avec cette structure:
{
  "artisan_nom": "Nom de l'entreprise/artisan",
  "artisan_specialite": "Spécialité/domaine",
  "artisan_tel": "Téléphone",
  "artisan_email": "Email",
  "artisan_siret": "SIRET si disponible",
  "prestations": [
    {"description": "Description", "unite": "u|m²|ml|h|forfait", "quantite": 1, "prix_unitaire": 100, "tva_taux": 20}
  ],
  "observations": "Notes supplémentaires",
  "montant_ht": 0,
  "montant_ttc": 0
}

Si un champ n'est pas trouvé, laisse-le vide ou null.`,
            },
          ],
        },
      ],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse la réponse JSON
    let osData;
    try {
      osData = JSON.parse(responseText);
    } catch (e) {
      // Si ce n'est pas du JSON pur, essayer d'extraire le JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        osData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Impossible de parser la réponse");
      }
    }

    // Créer ou récupérer le contact (artisan)
    let contactId = null;
    if (osData.artisan_nom) {
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id")
        .eq("nom", osData.artisan_nom)
        .single();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        // Créer un nouveau contact
        const { data: newContact, error } = await supabase
          .from("contacts")
          .insert({
            nom: osData.artisan_nom,
            type: "Artisan",
            specialite: osData.artisan_specialite || null,
            tel: osData.artisan_tel || null,
            email: osData.artisan_email || null,
            siret: osData.artisan_siret || null,
            actif: true,
          })
          .select()
          .single();

        if (error) {
          console.error("Erreur création contact:", error);
        } else {
          contactId = newContact.id;
        }
      }
    }

    return Response.json({
      success: true,
      data: {
        ...osData,
        artisan_id: contactId,
      },
    });
  } catch (error) {
    console.error("Erreur extraction données:", error);
    return Response.json(
      { error: error.message || "Erreur lors du traitement" },
      { status: 500 }
    );
  }
}
