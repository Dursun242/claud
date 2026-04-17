import { QueryClient } from '@tanstack/react-query';

// Retry intelligent : on ne retry JAMAIS sur une erreur client (4xx, typiquement
// 401/403/404). Ça ne sert à rien et ça peut même être dangereux (lockout sur
// un 401 répété). Sur une erreur serveur ou réseau, jusqu'à 2 tentatives.
function smartRetry(failureCount, error) {
  const status = error?.status ?? error?.response?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: smartRetry,
      // Backoff exponentiel plafonné à 8s
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Les mutations ne doivent PAS être retry automatiquement pour éviter
      // les créations en double (ex : POST /api/os qui timeout mais a réussi
      // côté serveur). Laisser l'utilisateur re-cliquer explicitement.
      retry: false,
    },
  },
});
