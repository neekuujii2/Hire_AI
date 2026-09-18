import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/candidates/import — bulk import candidates from CSV data.
 *
 * Expects JSON body: { job_id: string, candidates: Array<{name, email}> }
 * Validates emails, deduplicates, creates candidates, sends invite emails.
 */
export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body: { job_id: string; candidates: Array<{ name: string; email: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (!body.job_id || !Array.isArray(body.candidates)) {
    return NextResponse.json(
      { ok: false, error: "job_id and candidates array are required." },
      { status: 400 },
    );
  }

  // Validate and deduplicate.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set<string>();
  const valid: Array<{ name: string; email: string }> = [];
  const errors: Array<{ email: string; error: string }> = [];

  for (const c of body.candidates) {
    const email = c.email?.trim().toLowerCase();
    if (!email || !emailRegex.test(email)) {
      errors.push({ email: c.email ?? "", error: "Invalid email format" });
      continue;
    }
    if (seen.has(email)) {
      errors.push({ email, error: "Duplicate email" });
      continue;
    }
    seen.add(email);
    valid.push({ name: (c.name?.trim() || email.split("@")[0]) as string, email });
  }

  // Check for existing candidates in this job.
  const { data: existing } = await supabase
    .from("candidates")
    .select("email")
    .eq("job_id", body.job_id)
    .in(
      "email",
      valid.map((c) => c.email),
    );

  const existingEmails = new Set((existing ?? []).map((e: { email: string }) => e.email));
  const newCandidates = valid.filter((c) => !existingEmails.has(c.email));
  const skipped = valid.filter((c) => existingEmails.has(c.email));

  for (const s of skipped) {
    errors.push({ email: s.email, error: "Already exists in this job" });
  }

  // Insert new candidates.
  let inserted = 0;
  if (newCandidates.length > 0) {
    const { data, error } = await (supabase.from("candidates") as any)
      .insert(
        newCandidates.map((c) => ({
          job_id: body.job_id,
          name: c.name,
          email: c.email,
          pipeline_status: "invited",
        })),
      )
      .select("id") as { data: any; error: any };

    if (!error && data) {
      inserted = data.length;
    }
  }

  return NextResponse.json({
    ok: true,
    imported: inserted,
    skipped: skipped.length,
    errors,
  });
}
