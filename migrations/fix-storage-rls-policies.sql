-- Politiques RLS pour le bucket 'attachments'
-- Exécuter dans l'éditeur SQL de Supabase Dashboard

-- Permettre aux utilisateurs authentifiés de lire les fichiers (nécessaire pour createSignedUrl)
CREATE POLICY "authenticated_read_attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

-- Permettre aux utilisateurs authentifiés d'uploader
CREATE POLICY "authenticated_insert_attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

-- Permettre aux utilisateurs authentifiés de supprimer leurs fichiers
CREATE POLICY "authenticated_delete_attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'attachments');
