// ═══════════════════════════════════════════════════════════════
// debounce.js — helper pour limiter le taux d'appels
// ═══════════════════════════════════════════════════════════════
//
// Cas d'usage principaux :
//   - champ de recherche (annuaire, recherche globale) : on ne filtre qu'après
//     200ms d'inactivité clavier, au lieu de refiltrer à chaque frappe
//   - auto-save : on n'envoie la sauvegarde qu'après 1s sans modif
//
// Exemple :
//   const debouncedSearch = debounce((q) => setQuery(q), 200);
//   <input onChange={(e) => debouncedSearch(e.target.value)} />

/**
 * Debounce classique : la fn n'est appelée qu'après `wait` ms d'inactivité.
 * @param {Function} fn
 * @param {number} wait — ms
 * @returns {Function & { cancel: () => void }}
 */
export function debounce(fn, wait = 200) {
  let timer = null;
  const debounced = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * Hook React qui debounce une valeur plutôt qu'une fonction.
 * Pratique pour des useEffect() qui doivent réagir à un input.
 *
 * Exemple :
 *   const [q, setQ] = useState('');
 *   const debouncedQ = useDebouncedValue(q, 200);
 *   useEffect(() => { runSearch(debouncedQ); }, [debouncedQ]);
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue(value, wait = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), wait);
    return () => clearTimeout(timer);
  }, [value, wait]);
  return debounced;
}
