import { NextResponse } from "next/server";
import { resolveInvite, setPipelineStatus, invalidateInviteToken, updateCandidateCv, type InvitePayload } from "@/lib/invite";
import { setInviteSessionId } from "@/lib/invite-session";
import { serverEnv } from "@/lib/env";
import type { PrepRequest } from "@deepinterview/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/invite/[token]/start — create an interview session for a candidate.
 *
 * Public (no login): the token is the capability. Validates the token via
 * `resolveInvite` (expiry / completed / terminated) before creating a session.
 *
 * Flow:
 *  1. Resolve the invite → candidate + job + org.
 *  2. Persist consent (advance pipeline to "interview_started").
 *  3. Optionally store a CV URL the candidate uploaded separately.
 *  4. Build a PrepRequest from the candidate's CV + the job's JD + org name.
 *  5. Call the agent's prep pipeline → get a session id back.
 *  6. Store the session id in an httpOnly cookie scoped to /invite/*.
 *
 * Never throws: any failure resolves to a structured JSON error so the client
 * can show a friendly retry.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: { cv_url?: string | null };
  try {
    body = (await request.json()) as { cv_url?: string | null };
  } catch {
    body = {};
  }

  const { error, payload } = await resolveInvite(token);
  if (error || !payload) {
    const status =
      error === "expired" || error === "completed" || error === "terminated"
        ? 410
        : 404;
    return NextResponse.json({ ok: false, error: error ?? "invalid" }, { status });
  }

  try {
    // 1. Persist consent + advance pipeline.
    await setPipelineStatus(payload.candidate.id, "interview_started");

    // 2. Optional CV upload reference.
    if (body.cv_url != null) {
      await updateCandidateCv(payload.candidate.id, { cv_url: body.cv_url });
    }

    // 3. Invalidate the invite token (one-time use).
    await invalidateInviteToken(payload.candidate.id);

    // 4. Build the prep request from existing candidate + job data.
    const prepRequest = buildPrepRequest(payload, body.cv_url);

    // 5. Call the agent's prep pipeline.
    const agentRes = await fetch(
      `${serverEnv.agentApiUrl}/api/prep`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(serverEnv.internalApiSecret
            ? { "x-internal-secret": serverEnv.internalApiSecret }
            : {}),
        },
        body: JSON.stringify(prepRequest),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!agentRes.ok) {
      const text = await agentRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `Prep failed: ${agentRes.status} ${agentRes.statusText}${
            text ? ` — ${text}` : ""
          }`,
        },
        { status: 502 },
      );
    }

    const prepResult: { session_id: string } = await agentRes.json();

    // 6. Store session id in cookie.
    await setInviteSessionId(prepResult.session_id);

    return NextResponse.json({
      ok: true,
      session_id: prepResult.session_id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start interview.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function buildPrepRequest(
  payload: InvitePayload,
  cvUrl?: string | null,
): PrepRequest {
  const cv = cvUrl ?? payload.candidate.cv_url ?? payload.candidate.cv_text ?? "";
  return {
    cv_url: cv,
    jd_text: payload.job.job_description ?? payload.job.title,
    company: payload.org.name,
    language_mode: {
      primary: (payload.job.language as "en" | "vi" | "es" | "zh" | "hi" | "id" | "pt" | "fr" | "de" | "ja") ?? "en",
      mixed: false,
    },
  };
}
