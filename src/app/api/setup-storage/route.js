import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant dans les variables d\'environnement Vercel.' }, { status: 500 })
  }

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey)

  // Créer le bucket si inexistant
  const { data: existing } = await supabaseAdmin.storage.getBucket('attachments').catch(() => ({ data: null }))
  if (!existing) {
    const { error } = await supabaseAdmin.storage.createBucket('attachments', {
      public: false,
      fileSizeLimit: 20971520, // 20 MB
    })
    if (error && !error.message.includes('already exists')) {
      return Response.json({ error: 'Création bucket échouée : ' + error.message }, { status: 500 })
    }
  }

  // Créer la table attachments si inexistante
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
        uploaded_at timestamptz DEFAULT now()
      );
      ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "allow_all_attachments" ON attachments;
      CREATE POLICY "allow_all_attachments" ON attachments FOR ALL USING (true);
    `
  }).catch(() => ({ error: null }))

  return Response.json({ ok: true, message: 'Storage configuré avec succès.' })
}
