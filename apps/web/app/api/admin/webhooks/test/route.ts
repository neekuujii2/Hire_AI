import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/webhooks/test — send a test webhook payload.
 */
export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: { url: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (!body.url) {
    return NextResponse.json({ ok: false, error: "URL is required." }, { status: 400 });
  }

  const payload = {
    event: "test",
    timestamp: new Date().toISOString(),
    data: { message: "HireAI webhook test delivery" },
  };

  try {
    const crypto = await import("crypto");
    const payloadBytes = Buffer.from(JSON.stringify(payload));
    const signature = body.secret
      ? crypto.createHmac("sha256", body.secret).update(payloadBytes).digest("hex")
      : "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "HireAI-Webhook/1.0",
    };
    if (signature) {
      headers["X-HireAI-Signature"] = `sha256=${signature}`;
    }

    const res = await fetch(body.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
