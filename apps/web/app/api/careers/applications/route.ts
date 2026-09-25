import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

const RATE_LIMIT_WINDOW_MS = 3600_000; // 1 hour
const RATE_LIMIT_MAX = 3;

interface ApplicationBody {
  jobId: string;
  candidateProfileId: string;
  source: string;
  coverLetter?: string;
  name: string;
  phone?: string;
  linkedinUrl?: string;
  location?: string;
  cvUrl: string;
  hearAbout?: string;
}

const emailRateLimit = new Map<string, number[]>();

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const timestamps = emailRateLimit.get(email) || [];
  const filtered = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (filtered.length >= RATE_LIMIT_MAX) return true;
  filtered.push(now);
  emailRateLimit.set(email, filtered);
  return false;
}

export async function POST(req: NextRequest) {
  let body: ApplicationBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { jobId, candidateProfileId, source, name, email, cvUrl } = body;
  if (!jobId || !candidateProfileId || !source || !name || !email || !cvUrl) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const emailLower = email.toLowerCase();
  if (isRateLimited(emailLower)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. You can submit 3 applications per hour." },
      { status: 429 },
    );
  }

  let supabase;
  try {
    const cookieStore = await cookies();
    supabase = createServerClient(
      serverEnv.supabaseUrl as string,
      serverEnv.supabaseAnonKey as string,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              for (const cookie of cookiesToSet) {
                cookieStore.set(cookie.name, cookie.value, cookie.options);
              }
            } catch {}
          },
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  // Check job is published and not expired
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, org_id, is_published, application_deadline, title, total_applications")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 },
    );
  }

  if (!job.is_published) {
    return NextResponse.json(
      { error: "This job is not accepting applications" },
      { status: 404 },
    );
  }

  if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
    return NextResponse.json(
      { error: "Application deadline has passed" },
      { status: 400 },
    );
  }

  // Check for duplicate application (same email + jobId)
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_profile_id", candidateProfileId)
    .maybeSingle();

  if (existingApp) {
    return NextResponse.json(
      { error: "You have already applied for this job" },
      { status: 409 },
    );
  }

  // Upsert candidate profile
  const { data: profile, error: profileError } = await supabase
    .from("candidate_profiles")
    .upsert(
      {
        id: candidateProfileId,
        email: emailLower,
        name: body.name,
        phone: body.phone || null,
        linkedin_url: body.linkedinUrl || null,
        location: body.location || null,
        cv_url: cvUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (profileError) {
    console.error("[careers/applications] Profile upsert failed:", profileError);
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 },
    );
  }

  // Create application
  const { data: application, error: appError } = await supabase
    .from("applications")
    .insert({
      org_id: job.org_id,
      job_id: jobId,
      candidate_profile_id: profile.id,
      status: "applied",
      source: body.source || "careers_portal",
      cover_letter: body.coverLetter || null,
      applied_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (appError) {
    console.error("[careers/applications] Insert failed:", appError);
    return NextResponse.json(
      { error: "Failed to create application" },
      { status: 500 },
    );
  }

  // Insert status history
  await supabase.from("application_status_history").insert({
    application_id: application.id,
    from_status: null,
    to_status: "applied",
    changed_by: null,
    reason: "Initial application submission",
  });

  // Increment jobs.total_applications counter
  await supabase
    .from("jobs")
    .update({
      total_applications: (job.total_applications || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  // Enqueue AI screening (fire and forget)
  try {
    await fetch(`${serverEnv.appUrl}/api/careers/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    });
  } catch (err) {
    console.warn("[careers/applications] Screen enqueue failed:", err);
  }

  // Enqueue confirmation email (fire and forget)
  try {
    await fetch(`${serverEnv.appUrl}/api/careers/notify/confirmation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailLower,
        name: body.name,
        jobTitle: job.title,
        applicationId: application.id,
      }),
    });
  } catch (err) {
    console.warn("[careers/applications] Email enqueue failed:", err);
  }

  return NextResponse.json({
    applicationId: application.id,
    message: "Application submitted successfully",
  });
}