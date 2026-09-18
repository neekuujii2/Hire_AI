import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createAnonClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Candidate-facing invite pipeline (HireAI).
 *
 * Maps to `supabase/migrations/0007_hireai_schema.sql`:
 * - `candidates` (invite_token, invite_expires_at, pipeline_status, ...)
 * - `jobs` (title, interview_duration_min, persona_name, require_cv_upload,
 *   instant_feedback, logo_url via organizations)
 * - `organizations` (name, slug, logo_url)
 *
 * RLS is Clerk-org scoped; the invite route is PUBLIC (no login), so we use
 * the service-role client when configured and fall back to the anon client.
 * Token validation is the ONLY capability gate — the token is an unguessable
 * 48-char hex, never an internal id.
 */

export type InviteError =
  | "invalid"
  | "expired"
  | "completed"
  | "terminated"
  | "unavailable";

export interface InviteJob {
  id: string;
  title: string;
  department: string | null;
  job_description: string | null;
  language: string;
  interview_duration_min: number;
  persona_name: string;
  require_cv_upload: boolean;
  instant_feedback: boolean;
}

export interface InviteOrg {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export interface InviteCandidate {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  cv_url: string | null;
  cv_text: string | null;
  pipeline_status: string;
  invite_expires_at: string | null;
  job_id: string;
}

export interface InvitePayload {
  org: InviteOrg;
  job: InviteJob;
  candidate: InviteCandidate;
}

/**
 * Resolve a candidate by invite token. Returns `null` when the candidate does
 * not exist; throws when Supabase is unconfigured so callers can fall back to
 * a graceful "unavailable" state.
 */
export async function loadCandidateByToken(
  token: string,
): Promise<InviteCandidate | null> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("candidates")
    .select(
       [
         "id",
         "email",
         "name",
         "phone",
         "cv_url",
         "cv_text",
         "pipeline_status",
         "invite_expires_at",
         "job_id",
       ].join(","),
    )
    .eq("invite_token", token)
    .maybeSingle();

  if (error) throw new Error(`candidate lookup failed: ${error.message}`);
  return (data as InviteCandidate | null) ?? null;
}

/**
 * Load the job + org for a candidate. Scoped to the candidate's org via the
 * candidate→job→org join so we never leak another tenant's job data.
 */
export async function loadInviteContext(
  candidate: InviteCandidate,
): Promise<{ org: InviteOrg; job: InviteJob } | null> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return null;

   const { data: job, error: jobError } = await supabase
     .from("jobs")
     .select(
       [
         "id",
         "title",
         "department",
         "job_description",
         "language",
         "interview_duration_min",
         "persona_name",
         "require_cv_upload",
         "instant_feedback",
       ].join(","),
     )
    .eq("id", candidate.job_id)
    .maybeSingle();

  if (jobError) throw new Error(`job lookup failed: ${jobError.message}`);
  if (!job) return null;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id,name,slug,logo_url")
    .eq("id", (job as { org_id?: string }).org_id ?? "")
    .maybeSingle();

  if (orgError) throw new Error(`org lookup failed: ${orgError.message}`);
  if (!org) return null;

  return {
    org: org as InviteOrg,
    job: job as unknown as InviteJob,
  };
}

/**
 * Classify a candidate's state into an invite error (or `null` when the
 * candidate is joinable). Order matters: expiry beats completion beats
 * terminated — a candidate whose link has expired should see "expired", not
 * "already completed", even if they previously finished.
 */
export function classifyCandidate(
  candidate: InviteCandidate | null,
): { error: InviteError | null; payload: InvitePayload | null } {
  if (!candidate) return { error: "invalid", payload: null };

  if (candidate.invite_expires_at) {
    const expires = new Date(candidate.invite_expires_at).getTime();
    if (Number.isFinite(expires) && Date.now() > expires) {
      return { error: "expired", payload: null };
    }
  }

  const status = candidate.pipeline_status;
  if (status === "interview_completed") {
    return { error: "completed", payload: null };
  }
  if (status === "interview_terminated") {
    return { error: "terminated", payload: null };
  }

  return { error: null, payload: null };
}

/** Full invite resolution: token → candidate + org + job, or an error state. */
export async function resolveInvite(
  token: string,
): Promise<{ error: InviteError | null; payload: InvitePayload | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "unavailable", payload: null };
  }

  const candidate = await loadCandidateByToken(token);
  const { error, payload } = classifyCandidate(candidate);
  if (error) return { error, payload: null };

  const ctx = await loadInviteContext(candidate!);
  if (!ctx) return { error: "invalid", payload: null };

  return {
    error: null,
    payload: {
      org: ctx.org,
      job: ctx.job,
      candidate: candidate!,
    },
  };
}

/** Mark the link as opened (best-effort, never blocks the UI). */
export async function markLinkOpened(candidateId: string): Promise<void> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return;
  await supabase
    .from("candidates")
    .update({ link_opened_at: new Date().toISOString() })
    .eq("id", candidateId);
}

/** Advance the candidate's pipeline status (best-effort). */
export async function setPipelineStatus(
  candidateId: string,
  status: string,
): Promise<void> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return;
  await supabase
    .from("candidates")
    .update({ pipeline_status: status, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
}

/**
 * Invalidate the invite token after the candidate starts (one-time use).
 * Nulls the token so the link can't be reused.
 */
export async function invalidateInviteToken(
  candidateId: string,
): Promise<void> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return;
  await supabase
    .from("candidates")
    .update({ invite_token: null, updated_at: new Date().toISOString() })
    .eq("id", candidateId);
}

/** Persist a CV URL or text against the candidate record. */
export async function updateCandidateCv(
  candidateId: string,
  fields: { cv_url?: string | null; cv_text?: string | null },
): Promise<void> {
  const supabase = createServiceClient() ?? (await createAnonClient());
  if (!supabase) return;
  await supabase
    .from("candidates")
    .update({
      ...(fields.cv_url !== undefined ? { cv_url: fields.cv_url } : {}),
      ...(fields.cv_text !== undefined ? { cv_text: fields.cv_text } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidateId);
}