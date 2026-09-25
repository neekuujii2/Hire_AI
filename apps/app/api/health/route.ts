import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  const detailed = req.nextUrl.searchParams.get("detailed") === "true";
  const version = process.env.NEXT_PUBLIC_VERSION || "1.0.0";

  if (!detailed) {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version,
    });
  }

  // Detailed health check (internal only)
  const health: Record<string, any> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    version,
    database: "down",
    redis: "down",
    livekit: "down",
    queue_depths: {},
    agent_workers: { total: 20, active: 0, idle: 20 },
  };

  // Check Supabase
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      serverEnv.supabaseUrl as string,
      serverEnv.supabaseAnonKey as string,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      }
    );
    const { error } = await supabase.from("organizations").select("id").limit(1);
    health.database = error ? "degraded" : "ok";
  } catch {
    health.database = "down";
  }

  // Check Redis
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    await redis.ping();
    health.redis = "ok";
    await redis.quit();
  } catch {
    health.redis = "down";
  }

  // Check LiveKit
  if (serverEnv.livekitUrl) {
    try {
      const res = await fetch(`${serverEnv.livekitUrl}/health`);
      health.livekit = res.ok ? "ok" : "degraded";
    } catch {
      health.livekit = "down";
    }
  } else {
    health.livekit = "ok"; // Not configured = not a dependency
  }

  // Check queue depths
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
    const queues = ["prep", "score", "email"];
    for (const q of queues) {
      const len = await redis.llen(`bull:${q}`);
      health.queue_depths[q] = len;
    }
    await redis.quit();
  } catch { /* ignore */ }

  const allOk = health.database === "ok" && health.redis === "ok";
  return NextResponse.json(health, { status: allOk ? 200 : 503 });
}