"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, X, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { InvitePayload } from "@/lib/invite";

const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

interface ConsentFormProps {
  token: string;
  payload: InvitePayload;
}

/**
 * Consent form for the invite pipeline.
 *
 * Shows the recording disclosure, a required consent checkbox, and an optional
 * CV upload (only when the job requires it). On submit:
 *   1. Upload CV file to R2 (if chosen) via the consent endpoint's presign.
 *   2. POST to /api/invite/[token]/start to record consent + create session.
 *   3. On success, navigate to the waiting (prep) screen.
 *
 * The consent checkbox is required — "Begin Interview" stays disabled until
 * it's checked. CV is optional unless the job explicitly requires it.
 */
export function ConsentForm({ token, payload }: ConsentFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { job } = payload;
  const cvRequired = job.require_cv_upload;
  const cvMissing = file === null;
  const canSubmit = consent && !submitting && (!cvRequired || file !== null);

  async function uploadCv(): Promise<string | null> {
    if (!file) return null;

    setUploading(true);
    setError(null);

    try {
      // Step 1: request presigned upload URL from the consent endpoint.
      const presignRes = await fetch(`/api/invite/${token}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent: true,
          cv: {
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            size: file.size,
          },
        }),
      });

      if (!presignRes.ok) {
        const data = await presignRes.json().catch(() => ({}));
        throw new Error(data.error || "Could not prepare CV upload.");
      }

      const { cv_url, cv_upload } = (await presignRes.json()) as {
        cv_url: string | null;
        cv_upload?: string;
      };

      if (cv_upload === "unavailable") {
        setError("CV storage is not configured. Please try again later.");
        return null;
      }

      if (cv_url) return cv_url;

      // If the endpoint returned a presigned URL instead, upload the file.
      const uploadRes = await fetch(`/api/invite/${token}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consent: true,
          cv: {
            filename: file.name,
            content_type: file.type || "application/octet-stream",
            size: file.size,
          },
        }),
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data.error || "Could not upload CV.");
      }

      const result = (await uploadRes.json()) as { cv_url: string | null };
      return result.cv_url;
    } catch (e) {
      const message = e instanceof Error ? e.message : "CV upload failed.";
      setError(message);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSubmitting(true);

    try {
      // Upload CV if a file was chosen.
      let cvUrl: string | null = null;
      if (file && cvRequired) {
        cvUrl = await uploadCv();
        if (!cvUrl && cvRequired) {
          setSubmitting(false);
          return;
        }
      }

      // Start the session via the start endpoint.
      const startRes = await fetch(`/api/invite/${token}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cv_url: cvUrl }),
      });

      const result = (await startRes.json()) as {
        ok: boolean;
        session_id?: string;
        error?: string;
      };

      if (!result.ok || !result.session_id) {
        setError(result.error || "Could not start the interview.");
        setSubmitting(false);
        return;
      }

      // Navigate to the waiting (prep) screen.
      router.push(`/invite/${token}/waiting`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Consent checkbox */}
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={consent}
            onClick={() => setConsent(!consent)}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
              consent
                ? "bg-accent border-accent text-white"
                : "border-line bg-panel text-muted",
            )}
          >
            {consent ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-3 w-3" />
            )}
          </button>
          <label className="text-[13px] leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">
              I agree to being recorded and evaluated by AI
            </span>
            <p className="mt-1 text-sm">
              This interview will be audio and video recorded for evaluation by
              {payload.org.name}. The recording is used solely for assessing my
              fit for the {payload.job.title} role and is deleted in accordance
              with the hiring team's retention policy.
            </p>
          </label>
        </div>
      </Card>

      {/* CV upload (if required) */}
      {cvRequired && (
        <Card className="p-6">
          <h3 className="text-[14px] font-semibold text-ink">
            Upload your CV
          </h3>
          <p className="mt-1 text-[12.5px] text-muted">
            PDF or DOCX, up to 5 MB. Required for this role.
          </p>

          <div
            role="button"
            tabIndex={0}
            aria-label="Choose CV file"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-6 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              file
                ? "border-accent bg-accent-soft"
                : "border-line hover:border-ink",
            )}
          >
            {file ? (
              <div className="flex items-center gap-2 text-[14px] text-ink">
                <FileText className="h-4 w-4 text-accent" />
                {file.name}
              </div>
            ) : (
              <>
                <UploadCloud className="h-5 w-5 text-muted" />
                <span className="text-[13px] text-muted">
                  Drag a PDF or DOCX here, or click to choose.
                </span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > MAX_CV_BYTES) {
                    setError("File is too large (max 5 MB).");
                    return;
                  }
                  const normalized = (f.type || "").toLowerCase();
                  if (!ALLOWED_CV_TYPES.has(normalized)) {
                    setError("Unsupported file type. Use PDF or DOCX.");
                    return;
                  }
                  setFile(f);
                  setError(null);
                }
              }}
            />
          </div>

          {file && (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="mt-2 text-[12px] text-accent hover:text-ink"
            >
              Remove file
            </button>
          )}
        </Card>
      )}

      {error && (
        <p className="text-[13px] text-accent" role="alert">
          {error}
        </p>
      )}

      {submitting && (
        <div className="flex items-center gap-3 text-[14px] text-ink-soft">
          <Spinner className="h-4 w-4 text-accent" />
          <span>Starting your interview...</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!canSubmit || uploading}
        aria-disabled={!canSubmit || uploading}
      >
        {submitting ? "Starting..." : "Begin Interview"}
      </Button>
    </form>
  );
}
