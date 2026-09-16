import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const WARNING_REASONS = new Set([
  "tab_switch",
  "no_face_visible",
  "multiple_faces",
  "copy_paste",
  "screen_share_attempt",
]);

/**
 * POST /api/sessions/[id]/warning — record a proctoring event from the client.
 *
 * Capability guarded via the invite session cookie. Records the event in
 * `proctoring_events`, increments the session's `warning_count`, and checks
 * against `max_warning_limit`. If the limit is exceeded the session status is
 * set to `terminated_proctor` and the response signals termination.
 *
 * When Supabase is not configured (dev/offline), returns a non-terminating
 * mock so the UI stays functional.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const sessionCookie = await getSessionIdFromCookie();

  if (!sessionCookie || sessionCookie !== sessionId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 403 });
  }

  let body: { reason: string };
  try {
    body = (await request.json()) as { reason: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!WARNING_REASONS.has(body.reason)) {
    return NextResponse.json(
      { ok: false, error: `Unknown warning reason: ${body.reason}` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      warning_count: 0,
      max_warnings: 3,
      terminate: false,
    });
  }

  try {
    // Read current session state.
    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select("org_id, warning_count, max_warning_limit, candidate_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json({
        ok: true,
        warning_count: 0,
        max_warnings: 3,
        terminate: false,
      });
    }

    const orgId = session.org_id;
    const currentCount = session.warning_count ?? 0;
    const maxWarnings = session.max_warning_limit ?? 3;
    const newCount = currentCount + 1;
    const shouldTerminate = newCount >= maxWarnings;

    // Insert the proctoring event.
    const eventData: Record<string, unknown> = {
      session_id: sessionId,
      event_type: body.reason,
      warning_number: newCount,
      severity: shouldTerminate ? "high" : "medium",
      occurred_at: new Date().toISOString(),
    };
    if (orgId) eventData.org_id = orgId;

    await supabase.from("proctoring_events").insert(eventData);

    // Update session warning count.
    if (shouldTerminate) {
      await supabase
        .from("sessions")
        .update({
          warning_count: newCount,
          status: "terminated_proctor",
          termination_reason: body.reason,
        })
        .eq("id", sessionId);
    } else {
      await supabase
        .from("sessions")
        .update({ warning_count: newCount })
        .eq("id", sessionId);
    }

    return NextResponse.json({
      ok: true,
      warning_count: newCount,
      max_warnings: maxWarnings,
      terminate: shouldTerminate,
      reason: body.reason,
    });
  } catch {
    // On any DB error, don't terminate — let the interview continue.
    return NextResponse.json({
      ok: true,
      warning_count: 0,
      max_warnings: 3,
      terminate: false,
    });
  }
}

async function getSessionIdFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get("hireai_session")?.value ?? null;
  } catch {
    return null;
  }
}
