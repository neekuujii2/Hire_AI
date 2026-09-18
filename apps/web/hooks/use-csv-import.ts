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
    const firstLine = lines[0];
    const hasHeader = firstLine !== undefined && (firstLine.toLowerCase().includes("email") || firstLine.toLowerCase().includes("name"));

    const start = hasHeader ? 1 : 0;
    const candidates: Array<{ name: string; email: string }> = [];

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      const firstName = parts[0];
      const secondEmail = parts[1];
      if (parts.length >= 2 && firstName !== undefined && secondEmail !== undefined) {
        candidates.push({ name: firstName, email: secondEmail.toLowerCase() });
      } else if (parts.length === 1 && firstName !== undefined && firstName.includes("@")) {
        candidates.push({ name: firstName.split("@")[0] ?? "", email: firstName.toLowerCase() });
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
