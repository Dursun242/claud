/**
 * Google Calendar API proxy
 * Reçoit le Google access_token côté client (stocké dans Supabase settings)
 * et récupère les événements du calendrier principal de l'utilisateur.
 */
export async function POST(request) {
  try {
    const { token, timeMin, timeMax } = await request.json();

    if (!token) {
      return Response.json({ error: "Token Google manquant.", events: [] }, { status: 401 });
    }

    const now = new Date();
    const tMin = timeMin || now.toISOString();
    const tMax = timeMax || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 jours

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", tMin);
    url.searchParams.set("timeMax", tMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "50");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      return Response.json({ error: "TOKEN_EXPIRED", events: [] }, { status: 401 });
    }

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Google Calendar API ${res.status}: ${err}`, events: [] }, { status: res.status });
    }

    const data = await res.json();
    const events = (data.items || []).map(ev => ({
      id:          ev.id,
      titre:       ev.summary || "Sans titre",
      debut:       ev.start?.dateTime || ev.start?.date || "",
      fin:         ev.end?.dateTime   || ev.end?.date   || "",
      lieu:        ev.location  || "",
      description: ev.description || "",
      lien:        ev.htmlLink  || "",
      allDay:      !ev.start?.dateTime, // true si journée entière
      couleur:     ev.colorId  || null,
    }));

    return Response.json({ events });
  } catch (error) {
    return Response.json({ error: error.message, events: [] }, { status: 500 });
  }
}
