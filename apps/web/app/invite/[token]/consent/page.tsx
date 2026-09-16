import { notFound } from "next/navigation";
import { getCachedInvite } from "@/lib/invite-cache";
import { MobileGate } from "@/components/invite/mobile-gate";
import { InviteProgress } from "@/components/invite/invite-progress";
import { ConsentForm } from "@/components/invite/consent-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * /invite/[token]/consent — consent + optional CV upload step.
 *
 * Server component: resolves the invite token once, renders the progress
 * indicator and back link, and delegates the interactive consent form to the
 * client-side ConsentForm component.
 */
export default async function InviteConsentPage({
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
        <InviteProgress step="consent" />
        <div className="mt-8">
          <ConsentForm token={token} payload={payload} />
        </div>
        <div className="mt-6 text-center">
          <Link
            href={`/invite/${token}/check`}
            className="text-[12.5px] text-muted hover:text-ink"
          >
            ← Back to device check
          </Link>
        </div>
      </div>
    </MobileGate>
  );
}
