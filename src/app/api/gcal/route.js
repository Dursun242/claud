/**
 * Google Calendar API proxy — multi-calendriers
 * Accepte un token + une liste de calendarIds
 * Récupère les événements en parallèle et les fusionne
 */
export async function POST(request) {
  try {
    const { token, calendarIds = ['primary'], timeMin, timeMax } = await request.json();

    if (!token) {
      return Response.json({ error: 'TOKEN_MISSING', events: [] }, { status: 401 });
    }

    const now = new Date();
    const tMin = timeMin || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const tMax = timeMax || new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    // Fetch tous les calendriers en parallèle
    const results = await Promise.allSettled(
      calendarIds.map(async (calId) => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
        url.searchParams.set('timeMin', tMin);
        url.searchParams.set('timeMax', tMax);
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        url.searchParams.set('maxResults', '100');

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) throw new Error('TOKEN_EXPIRED');
        if (!res.ok) throw new Error(`Google API ${res.status}`);

        const data = await res.json();
        return { calId, events: data.items || [] };
      })
    );

    // Vérifier si le token est expiré
    const expired = results.find(r => r.reason?.message === 'TOKEN_EXPIRED');
    if (expired) {
      return Response.json({ error: 'TOKEN_EXPIRED', events: [] }, { status: 401 });
    }

    // Fusionner tous les événements avec leur calendarId
    const allEvents = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { calId, events } = result.value;
        for (const ev of events) {
          allEvents.push({
            id:          ev.id,
            calendarId:  calId,
            titre:       ev.summary || 'Sans titre',
            debut:       ev.start?.dateTime || ev.start?.date || '',
            fin:         ev.end?.dateTime   || ev.end?.date   || '',
            lieu:        ev.location  || '',
            description: ev.description || '',
            lien:        ev.htmlLink  || '',
            allDay:      !ev.start?.dateTime,
            colorId:     ev.colorId || null,
            status:      ev.status || 'confirmed',
            recurringId: ev.recurringEventId || null,
          });
        }
      }
    }

    // Trier par date de début
    allEvents.sort((a, b) => new Date(a.debut) - new Date(b.debut));

    return Response.json({ events: allEvents });
  } catch (error) {
    return Response.json({ error: error.message, events: [] }, { status: 500 });
  }
}
