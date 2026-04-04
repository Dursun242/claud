/**
 * Authentication & Authorization helpers for API routes
 * All API routes should use these to verify user identity and permissions
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Verify user authentication from request
 * Returns authenticated user or throws error
 */
export async function verifyAuth(request) {
  // Get auth token from request headers
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header', { cause: 'UNAUTHORIZED' })
  }

  const token = authHeader.slice(7) // Remove "Bearer " prefix

  // Verify token with Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    throw new Error('Invalid or expired token', { cause: 'UNAUTHORIZED' })
  }

  return data.user
}

/**
 * Verify user is authenticated AND is an admin
 */
export async function verifyAdmin(request) {
  const user = await verifyAuth(request)

  // Check if user is admin in authorized_users table
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const { data: profile, error } = await supabase
    .from('authorized_users')
    .select('role, actif')
    .eq('email', user.email)
    .single()

  if (error || !profile || profile.role !== 'admin' || !profile.actif) {
    throw new Error('Admin access required', { cause: 'FORBIDDEN' })
  }

  return user
}

/**
 * Verify user can access a specific chantier
 * Returns true if user is admin OR has access via client_chantiers
 */
export async function verifyChantierAccess(request, chantierId) {
  const user = await verifyAuth(request)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Get user profile
  const { data: profile } = await supabase
    .from('authorized_users')
    .select('id, role')
    .eq('email', user.email)
    .single()

  if (!profile) {
    throw new Error('User profile not found', { cause: 'UNAUTHORIZED' })
  }

  // Admins can access everything
  if (profile.role === 'admin') {
    return user
  }

  // Check if client has access to this chantier
  const { data: hasAccess } = await supabase
    .from('client_chantiers')
    .select('id')
    .eq('client_id', profile.id)
    .eq('chantier_id', chantierId)
    .single()

  if (!hasAccess) {
    throw new Error('Access denied to this chantier', { cause: 'FORBIDDEN' })
  }

  return user
}

/**
 * Handle API errors and return standardized response
 */
export function handleError(error, statusCode = 500) {
  console.error('API Error:', error)

  // Determine status code from error cause
  if (error.cause === 'UNAUTHORIZED') statusCode = 401
  if (error.cause === 'FORBIDDEN') statusCode = 403

  return Response.json(
    {
      error: error.message,
      code: error.cause || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    },
    { status: statusCode }
  )
}

/**
 * Safe JSON response with CORS headers
 */
export function successResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    }
  })
}
