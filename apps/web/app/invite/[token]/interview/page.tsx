import { notFound, redirect } from "next/navigation";
import { getCachedInvite } from "@/lib/invite-cache";
import { getInviteSessionId } from "@/lib/invite-session";
import { isLiveKitConfigured, serverEnv } from "@/lib/env";
import { SessionViewSchema, type ClientSessionView } from "@/lib/session";
import { createInterviewToken } from "@/lib/livekit";
import { getPersona } from "@/lib/personas";
import { InviteLiveRoom } from "@/components/interview/invite-live-room";
import { MobileGate } from "@/components/invite/mobile-gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/session/{id} via our proxy — reused to fetch the session context
 * (question plan + cursor) server-side so the interview room can render the
 * initial question-progress state without a client-side round trip.
 */
async function fetchSessionView(
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

/**
 * /invite/[token]/interview — the live interview room.
 *
 * Server component: resolves the invite (persona name, company name, duration),
 * reads the session id from the invite cookie, fetches a LiveKit token (only
 * when LiveKit is configured), and fetches the session context for the initial
 * question-progress state.
 *
 * If there's no session cookie (user navigated here directly), redirect to
 * the waiting/consent step. If the invite is invalid, 404.
 *
 * When LiveKit is unconfigured, passes token=null so the client renders a
 * preview/notice state instead of the live room.
 */
export default async function InviteInterviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { error, payload } = await getCachedInvite(token);
  if (error || !payload) {
    notFound();
  }

  const sessionId = await getInviteSessionId();
  if (!sessionId) {
    redirect(`/invite/${token}/waiting`);
  }

  // Fetch the session context for initial question-progress state.
  const sessionView = await fetchSessionView(sessionId);

  // Mint a LiveKit token (server-side — API secret never reaches the browser).
  let liveToken: string | null = null;
  let liveUrl: string | null = null;
  if (isLiveKitConfigured()) {
    try {
      const room = sessionId;
      const minted = await createInterviewToken({
        room,
        identity: `cand-${sessionId.slice(0, 8)}`,
        metadata: { session_id: room, candidate_id: payload.candidate.id },
      });
      liveToken = minted.token;
      liveUrl = minted.url;
    } catch {
      // Token minting failed — the client will show a preview state.
    }
  }

  // The persona for the avatar display — use the job's persona_name override
  // but keep the default Persona's visual styling (recruiter).
  const basePersona = getPersona(undefined);
  const persona = {
    ...basePersona,
    name: payload.job.persona_name ?? basePersona.name,
  };

  return (
    <MobileGate>
      <InviteLiveRoom
        sessionId={sessionId}
        token={liveToken}
        url={liveUrl}
        persona={persona}
        companyName={payload.org.name}
        orgLogo={payload.org.logo_url ?? undefined}
        interviewDurationMin={payload.job.interview_duration_min}
        totalQuestions={sessionView?.context?.plan?.questions.length ?? 0}
        initialCursor={sessionView?.context?.cursor ?? 0}
        answeredCount={sessionView?.context?.answers.length ?? 0}
      />
    </MobileGate>
  );
}
