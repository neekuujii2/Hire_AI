import { redirect } from "next/navigation";
import { getCachedInvite } from "@/lib/invite-cache";
import { getInviteSessionId } from "@/lib/invite-session";
import { MobileGate } from "@/components/invite/mobile-gate";
import { InviteProgress } from "@/components/invite/invite-progress";
import { PrepLoader } from "@/components/invite/prep-loader";

export const dynamic = "force-dynamic";

/**
 * /invite/[token]/waiting — prep loading step.
 *
 * Server component: resolves the invite token once, reads the session id from
 * the invite cookie (set by /api/invite/[token]/start), and hands both to the
 * client-side PrepLoader which polls the agent until status = "ready".
 *
 * If there's no session cookie yet (e.g. user navigated here directly), redirect
 * back to the consent step.
 */
export default async function InviteWaitingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { error, payload } = await getCachedInvite(token);
  if (error || !payload) {
    redirect(`/invite/${token}`);
  }

  const sessionId = await getInviteSessionId();
  if (!sessionId) {
    // No session started yet — send back to consent.
    redirect(`/invite/${token}/consent`);
  }

  return (
    <MobileGate>
      <div className="mx-auto w-full max-w-[720px] px-6">
        <InviteProgress step="waiting" />
        <PrepLoader
          sessionId={sessionId}
          personaName={payload.job.persona_name ?? "Alex"}
          companyName={payload.org.name}
        />
      </div>
    </MobileGate>
  );
}
