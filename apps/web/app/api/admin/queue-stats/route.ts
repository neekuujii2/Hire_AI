import { Queue } from "bullmq";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isClerkConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const QUEUE_NAMES = [
  "hireai:prep",
  "hireai:score",
  "hireai:email",
  "hireai:recording",
] as const;

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  total: number;
}

async function getQueueStats(name: string): Promise<QueueStats> {
  const queue = new Queue(name, {
    connection: { url: REDIS_URL },
  });

  try {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );

    return {
      name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
      total:
        (counts.waiting ?? 0) +
        (counts.active ?? 0) +
        (counts.completed ?? 0) +
        (counts.failed ?? 0) +
        (counts.delayed ?? 0),
    };
  } finally {
    await queue.close();
  }
}

/**
 * GET /api/admin/queue-stats — returns queue depths, active/failed jobs.
 * Protected by Clerk admin role check.
 */
export async function GET() {
  // Auth gate: must be an admin.
  if (isClerkConfigured()) {
    const { userId, orgId } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 },
      );
    }

    // Verify admin role.
    const supabase = createServiceClient();
    if (supabase) {
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("clerk_user_id", userId)
        .maybeSingle();

      if (user?.role !== "admin") {
        return NextResponse.json(
          { ok: false, error: "Admin access required." },
          { status: 403 },
        );
      }
    }
  }

  try {
    const stats = await Promise.all(QUEUE_NAMES.map(getQueueStats));
    return NextResponse.json({ ok: true, queues: stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
