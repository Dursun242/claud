/**
 * Google Calendar API — Feature désactivée
 * L'onglet Google Agenda a été retiré de l'application.
 */
export async function GET() {
  return Response.json({ error: "Google Calendar désactivé.", events: [] }, { status: 410 });
}
