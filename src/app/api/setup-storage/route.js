import { createClient } from '@supabase/supabase-js'
import { verifyAdmin, handleError, successResponse } from '../auth-helpers'

export async function POST(request) {
  try {
    // Verify user is authenticated AND is admin
    const user = await verifyAdmin(request)

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return handleError(
        new Error('SUPABASE_SERVICE_ROLE_KEY not configured'),
        500
      )
    }

    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey)

    // Create bucket if it doesn't exist
    const { data: existing } = await supabaseAdmin.storage.getBucket('attachments').catch(() => ({ data: null }))
    if (!existing) {
      const { error } = await supabaseAdmin.storage.createBucket('attachments', {
        public: false,
        fileSizeLimit: 20971520, // 20 MB
      })
      if (error && !error.message.includes('already exists')) {
        return handleError(
          new Error('Failed to create bucket: ' + error.message),
          500
        )
      }
    }

    // Create attachments table if it doesn't exist
    const { error: tableError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS attachments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          chantier_id uuid REFERENCES chantiers(id) ON DELETE CASCADE,
          os_id uuid,
          cr_id uuid,
          task_id uuid,
          file_name text NOT NULL,
          file_path text NOT NULL,
          file_size bigint,
          uploaded_at timestamptz DEFAULT now(),
          uploaded_by_email text
        );
        ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "attachments_auth" ON attachments;
        CREATE POLICY "attachments_auth" ON attachments FOR ALL USING (
          EXISTS (
            SELECT 1 FROM authorized_users
            WHERE email = auth.jwt()->>'email'
            AND actif = true
          )
        );
      `
    }).catch(() => ({ error: null }))

    return successResponse({
      ok: true,
      message: 'Storage configured successfully',
      setupBy: user.email,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    return handleError(e)
  }
}
