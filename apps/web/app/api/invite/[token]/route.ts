import { NextResponse } from "next/server";
import { resolveInvite, markLinkOpened, type InvitePayload } from "@/lib/invite";

export const dynamic = "force-dynamic";

/**
 * GET /api/invite/[token] — public validation of an invite link.
 *
 * Returns the org + job + candidate when joinable, or an error state
 * (`invalid` / `expired` / `completed` / `terminated` / `unavailable`).
 * Never throws: any Supabase failure resolves to `unavailable` so the landing
 * page shows a graceful message instead of a 500.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const { error, payload } = await resolveInvite(token);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: payload });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "unavailable" },
      { status: 503 },
    );
  }
}

/**
 * POST /api/invite/[token]/open — best-effort link-opened tracking.
 * Fire-and-forget from the landing page; never blocks navigation.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    }
    const { data } = await supabase
      .from("candidates")
      .select("id")
      .eq("invite_token", token)
      .maybeSingle();
    if (data?.id) await markLinkOpened(data.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}