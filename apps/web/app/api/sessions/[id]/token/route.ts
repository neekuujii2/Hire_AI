import { NextResponse } from "next/server";
import { serverEnv, isLiveKitConfigured } from "@/lib/env";
import { SessionViewSchema, type ClientSessionView } from "@/lib/session";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createAnonClient } from "@/lib/supabase/server";
import { createInviteSessionId } from "@/lib/invite-session";
import { createInterviewToken } from "@/lib/livekit";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/[id]/token — mint a LiveKit access token for a Live session.
 *
 * Capability guarded: the session id lives in an httpOnly cookie set by the
 * `/api/invite/[token]/start` route. Only an invite that has already consented
 * and started prep can read the token back. We verify the session is joinable
 * (prep / ready) before minting — a finished or errored session gets no token.
 *
 * Falls back to preview mode (token: null) when LiveKit is unconfigured.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const sessionCookie = await getSessionIdFromCookie();

  // Capability check: the cookie session id must match the requested one.
  if (!sessionCookie || sessionCookie !== sessionId) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized or session mismatch." },
      { status: 403 },
    );
  }

  // Verify the session exists and is joinable via the agent.
  const view = await fetchSessionViewSafe(sessionId);
  if (!view) {
    return NextResponse.json(
      { ok: false, error: "Session not found." },
      { status: 404 },
    );
  }

  const JOINABLE = new Set(["prep", "ready"]);
  if (!JOINABLE.has(view.status)) {
    return NextResponse.json(
      { ok: false, error: "Session not joinable.", status: view.status },
      { status: 409 },
    );
  }

  // Mint the LiveKit token server-side (API secret never reaches the browser).
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ ok: true, token: null, url: null });
  }

  try {
    const room = view.session_id;
    const minted = await createInterviewToken({
      room,
      identity: `cand-${sessionId.slice(0, 8)}`,
    });
    return NextResponse.json({ ok: true, token: minted.token, url: minted.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Token mint failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Read the session id from the invite cookie (server-side). */
async function getSessionIdFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get("hireai_session")?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the session view from the agent, returning null on any failure
 * (agent down, 404, parse error). Never throws.
 */
async function fetchSessionViewSafe(
  id: string,
): Promise<ClientSessionView | null> {
  try {
    const res = await fetch(
      `${serverEnv.agentApiUrl}/api/session/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;
    const parsed = SessionViewSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
