import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// ═══════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════

export function useChantiers() {
  return useQuery({
    queryKey: ['chantiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chantiers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map(c => ({ ...c, lots: c.lots || [] }));
    },
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('nom')
        .limit(100);
      if (error) throw error;
      return (data || []).map(c => ({ ...c, chantiers: [] }));
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('taches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map(t => ({ ...t, chantierId: t.chantier_id }));
    },
  });
}

export function usePlanning(enabled = true) {
  return useQuery({
    queryKey: ['planning'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('planning')
        .select('*')
        .order('debut')
        .limit(50);
      if (error) throw error;
      return (data || []).map(p => ({ ...p, chantierId: p.chantier_id }));
    },
    enabled,
  });
}

export function useRDVs(enabled = true) {
  return useQuery({
    queryKey: ['rdv'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rdv')
        .select('*')
        .order('date')
        .limit(50);
      if (error) throw error;
      return (data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] }));
    },
    enabled,
  });
}

export function useCompteRendus(enabled = true) {
  return useQuery({
    queryKey: ['compteRendus'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compte_rendus')
        .select('*')
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map(c => ({ ...c, chantierId: c.chantier_id }));
    },
    enabled,
  });
}

export function useOrdresService(enabled = true) {
  return useQuery({
    queryKey: ['ordresService'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordres_service')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled,
  });
}

// ═══════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════

export function useCreateChantier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ch) => {
      const row = {
        nom: ch.nom, client: ch.client, adresse: ch.adresse, phase: ch.phase,
        statut: ch.statut, budget: Number(ch.budget)||0, depenses: Number(ch.depenses)||0,
        date_debut: ch.dateDebut||ch.date_debut||null,
        date_fin: ch.dateFin||ch.date_fin||null,
        lots: ch.lots||[]
      };
      const { data, error } = await supabase.from('chantiers').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chantiers'] });
    },
  });
}

export function useUpdateChantier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ch) => {
      const row = {
        nom: ch.nom, client: ch.client, adresse: ch.adresse, phase: ch.phase,
        statut: ch.statut, budget: Number(ch.budget)||0, depenses: Number(ch.depenses)||0,
        date_debut: ch.dateDebut||ch.date_debut||null,
        date_fin: ch.dateFin||ch.date_fin||null,
        lots: ch.lots||[]
      };
      const { data, error } = await supabase.from('chantiers').update(row).eq('id', ch.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chantiers'] });
    },
  });
}

export function useDeleteChantier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('chantiers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chantiers'] });
    },
  });
}

// Similar mutations for other tables...
export function useUpsertContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact) => {
      const row = {
        nom: contact.nom, type: contact.type||"Artisan", specialite: contact.specialite||null,
        tel: contact.tel||null, email: contact.email||null,
        adresse: contact.adresse||null, siret: contact.siret||null, notes: contact.notes||null,
        societe: contact.societe||null, fonction: contact.fonction||null,
        tel_fixe: contact.tel_fixe||null, code_postal: contact.code_postal||null,
        ville: contact.ville||null, site_web: contact.site_web||null, tva_intra: contact.tva_intra||null,
        assurance_decennale: contact.assurance_decennale||null,
        assurance_validite: contact.assurance_validite||null,
        iban: contact.iban||null, qualifications: contact.qualifications||null,
        note: Number(contact.note)||0, actif: contact.actif !== false,
      };

      if (contact.id && String(contact.id).length > 10) {
        const { data, error } = await supabase.from('contacts').update(row).eq('id', contact.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('contacts').insert(row).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpsertTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (task) => {
      const chId = task.chantierId||task.chantier_id||null;
      const row = { chantier_id: chId||null, titre: task.titre, priorite: task.priorite,
                   statut: task.statut, echeance: task.echeance||null, lot: task.lot||null };

      if (task.id && String(task.id).length > 10) {
        const { data, error } = await supabase.from('taches').update(row).eq('id', task.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from('taches').insert(row).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('taches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ═══════════════════════════════════════════
// PAGINATED QUERIES (for infinite scroll)
// ═══════════════════════════════════════════

const PAGE_SIZE = 50;

export function useChantiersPaginated(offset = 0) {
  return useQuery({
    queryKey: ['chantiers', 'paginated', offset],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('chantiers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        items: (data || []).map(c => ({ ...c, lots: c.lots || [] })),
        hasMore: count ? offset + PAGE_SIZE < count : false,
      };
    },
  });
}

export function useContactsPaginated(offset = 0) {
  return useQuery({
    queryKey: ['contacts', 'paginated', offset],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('nom')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        items: (data || []).map(c => ({ ...c, chantiers: [] })),
        hasMore: count ? offset + PAGE_SIZE < count : false,
      };
    },
  });
}

export function useTasksPaginated(offset = 0) {
  return useQuery({
    queryKey: ['tasks', 'paginated', offset],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('taches')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        items: (data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
        hasMore: count ? offset + PAGE_SIZE < count : false,
      };
    },
  });
}

export function useOrdersServicePaginated(offset = 0) {
  return useQuery({
    queryKey: ['ordresService', 'paginated', offset],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('ordres_service')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        items: data || [],
        hasMore: count ? offset + PAGE_SIZE < count : false,
      };
    },
  });
}

export function useCompteRendusPaginated(offset = 0) {
  return useQuery({
    queryKey: ['compteRendus', 'paginated', offset],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('compte_rendus')
        .select('*', { count: 'exact' })
        .order('date', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      return {
        items: (data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
        hasMore: count ? offset + PAGE_SIZE < count : false,
      };
    },
  });
}
