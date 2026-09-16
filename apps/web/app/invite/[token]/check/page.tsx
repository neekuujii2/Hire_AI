import Link from "next/link";
import { notFound } from "next/navigation";
import { getCachedInvite } from "@/lib/invite-cache";
import { MobileGate } from "@/components/invite/mobile-gate";
import { InviteProgress } from "@/components/invite/invite-progress";
import { DeviceCheckForm } from "@/components/invite/device-check-form";

export const dynamic = "force-dynamic";

/**
 * /invite/[token]/check — device verification step of the invite pipeline.
 *
 * Server component: resolves the invite token once (request-cached), renders
 * the shared header via layout, and delegates the interactive camera/mic/
 * network checks to the client-side DeviceCheckForm. When all checks pass
 * the form navigates to /consent.
 */
export default async function InviteCheckPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { error, payload } = await getCachedInvite(token);
  if (error || !payload) {
    notFound();
  }

  return (
    <MobileGate>
      <div className="mx-auto w-full max-w-[720px] px-6">
        <InviteProgress step="check" />
        <DeviceCheckForm nextPath={`/invite/${token}/consent`} />
        <div className="mt-6 text-center">
          <Link
            href={`/invite/${token}`}
            className="text-[12.5px] text-muted hover:text-ink"
          >
            ← Back to start
          </Link>
        </div>
      </div>
    </MobileGate>
  );
}
