import { createClient } from '@supabase/supabase-js'

/**
 * API Route: Add user to authorized_users table
 *
 * Usage: /api/auth/add-user?email=user@example.com
 *
 * This route adds an email to the authorized_users table,
 * allowing them to access the dashboard.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')

    if (!email) {
      return Response.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      return Response.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    // Upsert user to authorized_users
    const { data, error } = await supabase
      .from('authorized_users')
      .upsert(
        {
          email: email.toLowerCase(),
          actif: true,
        },
        {
          onConflict: 'email'
        }
      )
      .select()

    if (error) {
      console.error('Error adding user:', error)
      return Response.json(
        { error: `Failed to add user: ${error.message}` },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      message: `User ${email} has been added to authorized_users`,
      data: data
    })

  } catch (e) {
    console.error('Exception:', e)
    return Response.json(
      { error: e.message },
      { status: 500 }
    )
  }
}
