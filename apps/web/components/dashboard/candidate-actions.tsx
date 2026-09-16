"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Pause, FileDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface CandidateActionsProps {
  candidateId: string;
  jobId: string;
  status: string;
}

export function CandidateActions({
  candidateId,
  jobId,
  status,
}: CandidateActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  async function updateStatus(newStatus: string) {
    setLoading(newStatus);
    try {
      await fetch(`/api/candidates/${candidateId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // Optimistic: reload to reflect new status
      window.location.reload();
    } catch {
      // silently fail
    } finally {
      setLoading(null);
    }
  }

  async function exportPdf() {
    setLoading("pdf");
    try {
      const res = await fetch(`/api/candidates/${candidateId}/report?format=pdf`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${candidateId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {status !== "shortlisted" && (
        <button
          type="button"
          onClick={() => updateStatus("shortlisted")}
          disabled={loading === "shortlisted"}
          className="flex items-center gap-1.5 rounded-[8px] border border-ok/30 bg-ok/10 px-3 py-1.5 text-[12px] font-medium text-ok transition-colors hover:bg-ok/20 disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Shortlist
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          onClick={() => updateStatus("rejected")}
          disabled={loading === "rejected"}
          className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
        >
          <XCircle className="h-3.5 w-3.5" aria-hidden />
          Reject
        </button>
      )}
      {status !== "on_hold" && (
        <button
          type="button"
          onClick={() => updateStatus("on_hold")}
          disabled={loading === "on_hold"}
          className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
        >
          <Pause className="h-3.5 w-3.5" aria-hidden />
          Hold
        </button>
      )}
      <button
        type="button"
        onClick={exportPdf}
        disabled={loading === "pdf"}
        className="flex items-center gap-1.5 rounded-[8px] border border-line px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
        Export PDF
      </button>
    </div>
  );
}
