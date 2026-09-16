import { useState, useCallback } from "react";

export function useCsvImport(jobId: string) {
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<Array<{ name: string; email: string }>>([]);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: Array<{ email: string; error: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const parse = useCallback(() => {
    const lines = csvText.trim().split("\n");
    if (lines.length === 0) return;

    // Detect header row.
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes("email") || header.includes("name");

    const start = hasHeader ? 1 : 0;
    const candidates: Array<{ name: string; email: string }> = [];

    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      if (parts.length >= 2) {
        candidates.push({ name: parts[0], email: parts[1].toLowerCase() });
      } else if (parts.length === 1 && parts[0].includes("@")) {
        candidates.push({ name: parts[0].split("@")[0], email: parts[0].toLowerCase() });
      }
    }

    setParsed(candidates);
  }, [csvText]);

  const importCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/candidates/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, candidates: parsed }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({
          imported: data.imported,
          skipped: data.skipped,
          errors: data.errors,
        });
      }
    } catch {
      // Error handled silently.
    } finally {
      setLoading(false);
    }
  }, [jobId, parsed]);

  return { csvText, setCsvText, parsed, parse, importCandidates, result, loading };
}
