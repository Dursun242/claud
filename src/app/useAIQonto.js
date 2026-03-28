import { useState } from "react";

export function useAIQonto() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const analyzeQonto = async (qontoToken) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-qonto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qontoData: {}, // Les données sont récupérées server-side
          qontoToken,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
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
