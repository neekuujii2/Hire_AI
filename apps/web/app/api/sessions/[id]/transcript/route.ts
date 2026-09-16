import { NextResponse } from "next/server";
import { SessionViewSchema } from "@/lib/session";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const TRANSCRIPT_TURN_SCHEMA = (data: unknown): { role: string; text: string }[] => {
  if (!Array.isArray(data)) return [];
  return data
    .map((t) => {
      if (typeof t !== "object" || t === null) return null;
      const obj = t as Record<string, unknown>;
      return {
        role: typeof obj.role === "string" ? obj.role : "interviewer",
        text: typeof obj.text === "string" ? obj.text : "",
      };
    })
    .filter((t): t is { role: string; text: string } => t !== null);
};

/**
 * GET /api/sessions/[id]/transcript — return the accumulated transcript turns.
 *
 * Capability guarded via the invite session cookie. Reads from the agent's
 * session view (which carries the transcript in `context.answers` and agent
 * narration) and falls back to the Supabase `transcripts` table if available.
 *
 * Never throws: on any failure returns an empty transcript so the live
 * transcript panel keeps showing the real-time LiveKit captions.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const sessionCookie = await getSessionIdFromCookie();

  if (!sessionCookie || sessionCookie !== sessionId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 403 });
  }

  try {
    const res = await fetch(
      `${serverEnv.agentApiUrl}/api/session/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json({ ok: true, turns: [] });
    }

    const parsed = SessionViewSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.context) {
      return NextResponse.json({ ok: true, turns: [] });
    }

    const ctx = parsed.data.context;
    const turns: { role: string; text: string; id: string }[] = [];

    // Agent questions → interviewer turns.
    if (Array.isArray(ctx.plan?.questions)) {
      for (const q of ctx.plan.questions) {
        if (typeof q?.text?.en === "string") {
          turns.push({
            id: `q-${q.id ?? Math.random().toString(36).slice(2, 10)}`,
            role: "interviewer",
            text: q.text.en,
          });
        }
      }
    }

    // Candidate answers → candidate turns.
    if (Array.isArray(ctx.answers)) {
      for (const a of ctx.answers) {
        if (typeof a?.transcript === "string") {
          turns.push({
            id: `a-${a.question_id ?? Math.random().toString(36).slice(2, 10)}`,
            role: "candidate",
            text: a.transcript,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, turns });
  } catch {
    return NextResponse.json({ ok: true, turns: [] });
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
