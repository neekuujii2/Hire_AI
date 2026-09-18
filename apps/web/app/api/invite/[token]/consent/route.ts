import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { resolveInvite, setPipelineStatus } from "@/lib/invite";
import { isR2Configured } from "@/lib/env";
import { presignUpload } from "@/lib/r2";

interface CvPayload {
  filename: string;
  content_type: string;
  size: number;
}

interface ConsentBody {
  consent: boolean;
  cv?: CvPayload;
}

const ConsentSchema = z.object({
  consent: z.literal(true),
  cv: z
    .object({
    filename: z.string().min(1),
    content_type: z.string().min(1),
    size: z.number().int().positive().max(5 * 1024 * 1024),
    })
    .optional(),
});

const ALLOWED_CV_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

export const dynamic = "force-dynamic";

/**
 * POST /api/invite/[token]/consent — record candidate consent (+ optional CV).
 *
 * Public (no login): the token is the capability. Validates the token via
 * `resolveInvite` (expiry / completed / terminated) before accepting consent.
 * CV uploads are presigned to R2 only when R2 is configured; otherwise we
 * return `cv_upload: "unavailable"` so the client can fall back to "skip CV".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: ConsentBody;
  try {
    body = ConsentSchema.parse(await request.json()) as ConsentBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid consent payload" },
      { status: 400 },
    );
  }

  const { error, payload } = await resolveInvite(token);
  if (error || !payload) {
    const status =
      error === "expired" || error === "completed" || error === "terminated"
        ? 410
        : 404;
    return NextResponse.json({ ok: false, error: error ?? "invalid" }, { status });
  }

  if (!body.consent) {
    return NextResponse.json(
      { ok: false, error: "Consent is required to begin" },
      { status: 400 },
    );
  }

  let cvPublicUrl: string | null = null;

  if (body.cv && payload.job.require_cv_upload) {
    if (!isR2Configured()) {
      return NextResponse.json(
        { ok: false, error: "cv_upload_unavailable", cv_upload: "unavailable" },
        { status: 503 },
      );
    }
    const cv: CvPayload = body.cv;
    const normalized = (cv as any).content_type
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_CV_TYPES.has(normalized)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported CV type. Upload a PDF or DOCX." },
        { status: 415 },
      );
    }
    const safeName = cv.filename.replace(/[/\\]/g, "_").slice(0, 100);
    const key = `cvs/${payload.candidate.id}/${randomUUID()}-${safeName}`;
    const signed = await presignUpload(key, normalized, cv.size);
    cvPublicUrl = signed.publicUrl;
  }

  // Persist consent + CV reference; advance pipeline to interview_started.
  await setPipelineStatus(payload.candidate.id, "interview_started");

  return NextResponse.json({
    ok: true,
    candidate_id: payload.candidate.id,
    cv_url: cvPublicUrl,
    cv_upload: cvPublicUrl ? "pending_upload" : "none",
  });
}
