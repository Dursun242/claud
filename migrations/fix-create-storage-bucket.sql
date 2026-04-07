-- Créer le bucket 'attachments' directement via SQL
-- Exécuter dans l'éditeur SQL de Supabase Dashboard

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  20971520,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Politique RLS pour le bucket
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES
  ('allow_authenticated_upload', 'attachments', 'INSERT', 'auth.role() = ''authenticated'''),
  ('allow_authenticated_select', 'attachments', 'SELECT', 'auth.role() = ''authenticated'''),
  ('allow_authenticated_delete', 'attachments', 'DELETE', 'auth.role() = ''authenticated''')
ON CONFLICT DO NOTHING;
