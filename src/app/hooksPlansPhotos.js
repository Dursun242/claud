import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// ═══════════════════════════════════════════
// PLANS HOOKS
// ═══════════════════════════════════════════

export function usePlans(chantier_id) {
  return useQuery({
    queryKey: ['plans', chantier_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('chantier_id', chantier_id)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!chantier_id,
  });
}

export function useUploadPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, chantier_id, type, user_id, prenom }) => {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `plans/${chantier_id}/${fileName}`;

      // Upload fichier
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Créer enregistrement en base
      const { data, error } = await supabase
        .from('plans')
        .insert({
          chantier_id,
          nom: file.name,
          file_path: filePath,
          type,
          file_size: file.size,
          uploaded_by_id: user_id,
          created_by_prenom: prenom,
          updated_by_prenom: prenom,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['plans', data.chantier_id] });
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan) => {
      // Supprimer fichier du storage
      await supabase.storage.from('documents').remove([plan.file_path]);

      // Supprimer enregistrement
      const { error } = await supabase
        .from('plans')
        .delete()
        .eq('id', plan.id);

      if (error) throw error;
      return plan.chantier_id;
    },
    onSuccess: (chantier_id) => {
      queryClient.invalidateQueries({ queryKey: ['plans', chantier_id] });
    },
  });
}

// ═══════════════════════════════════════════
// PHOTO REPORTS HOOKS
// ═══════════════════════════════════════════

export function usePhotoReports(chantier_id) {
  return useQuery({
    queryKey: ['photoReports', chantier_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photo_reports')
        .select('*')
        .eq('chantier_id', chantier_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!chantier_id,
  });
}

export function useCreatePhotoReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ chantier_id, nom, description, user_id, prenom }) => {
      const { data, error } = await supabase
        .from('photo_reports')
        .insert({
          chantier_id,
          nom,
          description,
          created_by_id: user_id,
          created_by_prenom: prenom,
          updated_by_prenom: prenom,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['photoReports', data.chantier_id] });
    },
  });
}

export function usePhotos(report_id) {
  return useQuery({
    queryKey: ['photos', report_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('report_id', report_id)
        .order('position');
      if (error) throw error;
      return data || [];
    },
    enabled: !!report_id,
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, report_id, user_id, prenom, position = 0 }) => {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `photos/${report_id}/${fileName}`;

      // Upload fichier
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Créer enregistrement
      const { data, error } = await supabase
        .from('photos')
        .insert({
          report_id,
          file_path: filePath,
          position,
          uploaded_by_id: user_id,
          created_by_prenom: prenom,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['photos', data.report_id] });
    },
  });
}

export function useDeletePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photo) => {
      // Supprimer fichier
      await supabase.storage.from('documents').remove([photo.file_path]);

      // Supprimer enregistrement
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photo.id);

      if (error) throw error;
      return photo.report_id;
    },
    onSuccess: (report_id) => {
      queryClient.invalidateQueries({ queryKey: ['photos', report_id] });
    },
  });
}

export function useDeletePhotoReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (report) => {
      // Supprimer toutes les photos associées (cascades mais on peut aussi le faire manuellement)
      const { data: photos } = await supabase
        .from('photos')
        .select('file_path')
        .eq('report_id', report.id);

      if (photos && photos.length > 0) {
        const filePaths = photos.map(p => p.file_path);
        await supabase.storage.from('documents').remove(filePaths);
      }

      // Supprimer le reportage
      const { error } = await supabase
        .from('photo_reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;
      return report.chantier_id;
    },
    onSuccess: (chantier_id) => {
      queryClient.invalidateQueries({ queryKey: ['photoReports', chantier_id] });
    },
  });
}

// ═══════════════════════════════════════════
// USER ROLE HOOKS
// ═══════════════════════════════════════════

export function useUserRole(user_id) {
  return useQuery({
    queryKey: ['userRole', user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user_id)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data?.role || null;
    },
    enabled: !!user_id,
  });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, role }) => {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ user_id, role }, { onConflict: 'user_id' });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['userRole', variables.user_id] });
    },
  });
}
