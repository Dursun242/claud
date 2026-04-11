import { useState } from "react";
import { supabase } from "./supabaseClient";

// Hook appelant /api/ai-qonto.
// Depuis le fix sécurité : on n'envoie plus le token Qonto depuis le client.
// Le serveur le récupère lui-même via Supabase service role key.
// On envoie juste le JWT Supabase pour s'authentifier auprès de notre API.
export function useAIQonto() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const analyzeQonto = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/ai-qonto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Erreur analyse");
      }

      const data = await response.json();
      setAnalysis(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error("AI Qonto error:", err);
    } finally {
      setLoading(false);
    }
  };

  return { analyzeQonto, analysis, loading, error };
}
