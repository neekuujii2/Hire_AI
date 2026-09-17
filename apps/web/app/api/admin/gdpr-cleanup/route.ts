import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/gdpr-cleanup — trigger GDPR retention cleanup.
 * GET /api/admin/gdpr-cleanup — check last cleanup status.
 */
export async function POST() {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  const now = new Date();
  const defaultRetentionDays = 90;

  try {
    // Load org retention configs.
    const { data: orgConfigs } = await supabase
      .from("org_configs")
      .select("org_id, recording_retention_days");

    const orgRetention: Record<string, number> = {};
    for (const cfg of (orgConfigs ?? []) as any[]) {
      orgRetention[cfg.org_id] = cfg.recording_retention_days ?? defaultRetentionDays;
    }

    let candidatesDeleted = 0;
    let sessionsDeleted = 0;
    let transcriptsDeleted = 0;

    // Find and soft-delete old candidates.
    const cutoff = new Date(now.getTime() - defaultRetentionDays * 86400000).toISOString();
    const { data: oldCandidates } = await supabase
      .from("candidates")
      .select("id, org_id, created_at")
      .is("deleted_at", null)
      .lt("created_at", cutoff);

    for (const cand of (oldCandidates ?? []) as any[]) {
      const retention = orgRetention[cand.org_id] ?? defaultRetentionDays;
      const createdAt = new Date(cand.created_at);
      if (now.getTime() - createdAt.getTime() < retention * 86400000) continue;

      // Soft-delete candidate.
      await supabase
        .from("candidates")
        .update({ deleted_at: now.toISOString() })
        .eq("id", cand.id);
      candidatesDeleted++;

      // Soft-delete sessions.
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("candidate_id", cand.id)
        .is("deleted_at", null);

      for (const s of (sessions ?? []) as any[]) {
        await supabase
          .from("sessions")
          .update({ deleted_at: now.toISOString() })
          .eq("id", s.id);
        sessionsDeleted++;
      }

      // Soft-delete transcripts.
      const { data: transcripts } = await supabase
        .from("transcripts")
        .select("id")
        .eq("candidate_id", cand.id)
        .is("deleted_at", null);

      for (const t of (transcripts ?? []) as any[]) {
        await supabase
          .from("transcripts")
          .update({ deleted_at: now.toISOString() })
          .eq("id", t.id);
        transcriptsDeleted++;
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      deleted: {
        candidates: candidatesDeleted,
        sessions: sessionsDeleted,
        transcripts: transcriptsDeleted,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cleanup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST to trigger GDPR retention cleanup. Uses org_configs.recording_retention_days (default: 90 days).",
  });
}
