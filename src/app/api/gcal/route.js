import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'
    const timeMin = searchParams.get('timeMin')
    const timeMax = searchParams.get('timeMax')

    // Get user's Google OAuth token from Supabase session
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return Response.json({ error: "Non authentifié" }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    
    // Get user session and their Google provider token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    
    if (userError || !user) {
      return Response.json({ error: "Session invalide" }, { status: 401 })
    }

    // Try to get the Google OAuth token from the session
    // The provider_token is only available right after login
    // For persistent access, we need to use a different approach
    
    // Fallback: use a Google API key for read-only access to public/shared calendars
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY
    const GCAL_ID = process.env.GOOGLE_CALENDAR_ID || 'primary'

    if (!GOOGLE_API_KEY) {
      return Response.json({ 
        error: "GOOGLE_API_KEY non configurée. Ajoutez-la dans Vercel → Environment Variables.",
        events: [] 
      }, { status: 200 })
    }

    if (action === 'list') {
      const now = new Date()
      const weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() + 14) // 2 weeks ahead

      const tMin = timeMin || now.toISOString()
      const tMax = timeMax || weekEnd.toISOString()

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GCAL_ID)}/events?` +
        `key=${GOOGLE_API_KEY}` +
        `&timeMin=${encodeURIComponent(tMin)}` +
        `&timeMax=${encodeURIComponent(tMax)}` +
        `&singleEvents=true` +
        `&orderBy=startTime` +
        `&maxResults=20`

      const res = await fetch(url)
      
      if (!res.ok) {
        const errText = await res.text()
        return Response.json({ 
          error: `Google Calendar API ${res.status}: ${errText}`,
          events: [] 
        }, { status: 200 })
      }

      const data = await res.json()
      const events = (data.items || []).map(ev => ({
        id: ev.id,
        summary: ev.summary || "Sans titre",
        start: ev.start?.dateTime || ev.start?.date || "",
        end: ev.end?.dateTime || ev.end?.date || "",
        location: ev.location || "",
        description: ev.description || "",
        link: ev.htmlLink || "",
      }))

      return Response.json({ events })
    }

    return Response.json({ error: "Action inconnue" }, { status: 400 })
  } catch (error) {
    return Response.json({ error: error.message, events: [] }, { status: 200 })
  }
}
