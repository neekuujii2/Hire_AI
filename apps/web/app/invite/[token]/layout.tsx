import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveInvite, markLinkOpened } from "@/lib/invite";
import { isSupabaseConfigured } from "@/lib/env";
import { InviteErrorView } from "@/components/invite/invite-error-view";

export const dynamic = "force-dynamic";

/**
 * Shared layout for the candidate-facing invite pipeline.
 *
 * Resolves the invite token ONCE per navigation and feeds the resolved
 * org + job into every step so each page can render the company logo + job
 * title in the header without re-querying. Error states (invalid / expired /
 * completed / terminated / unavailable) are rendered inline here so the
 * candidate sees a friendly message rather than a bare 404.
 *
 * Mobile detection happens client-side (see `MobileGate` in the landing
 * page); server-rendered here so SSR still shows the desktop-first header.
 */
export default async function InviteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let payload: Awaited<ReturnType<typeof resolveInvite>>["payload"] = null;
  let error: Awaited<ReturnType<typeof resolveInvite>>["error"] = null;
  try {
    const resolved = await resolveInvite(token);
    payload = resolved.payload;
    error = resolved.error;
    if (payload) {
      // Best-effort: mark the link as opened once per load. Never blocks.
      markLinkOpened(payload.candidate.id).catch(() => {});
    }
  } catch {
    error = "unavailable";
  }

  if (error || !payload) {
    return (
      <InviteErrorView
        error={error ?? "invalid"}
        token={token}
        supabaseConfigured={isSupabaseConfigured()}
      />
    );
  }

  const { org, job } = payload;
  const logoUrl = org.logo_url;
  const initials = org.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-panel/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1140px] items-center gap-3 px-7 py-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={`${org.name} logo`}
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">
                {initials}
              </div>
            )}
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-ink">{org.name}</p>
              <p className="text-[12px] text-muted">{job.title}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[12px] text-faint sm:inline">
              AI-powered interview
            </span>
          </div>
        </div>
      </header>
      <main className="py-8 sm:py-12">{children}</main>
    </div>
  );
}