// Charge les matchers supplémentaires de @testing-library/jest-dom
// (toBeInTheDocument, toHaveClass, toBeVisible, etc.) afin qu'ils soient
// disponibles dans tous les tests sans avoir à les importer manuellement.
import '@testing-library/jest-dom'

// Valeurs placeholder pour les tests : supabaseClient.js jette si les env
// vars sont absentes. En environnement Jest il n'y a pas de .env.local
// chargé, donc on fournit des stubs locaux qui permettent l'import sans
// jamais appeler l'API Supabase réelle (les tests UI mockent le client
// explicitement quand nécessaire).
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'
