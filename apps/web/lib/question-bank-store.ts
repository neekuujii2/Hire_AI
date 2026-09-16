import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_RUBRIC,
  QuestionBankPayloadSchema,
  type BankRubric,
  type QuestionBankPayload,
} from "@/lib/question-bank";

/**
 * Server-only Supabase access for the hiring question bank.
 *
 * Maps to `supabase/migrations/0007_hireai_schema.sql`:
 * - `jobs` (id, org_id, title, job_description)
 * - `question_banks` (job_id, org_id, questions jsonb, rubric jsonb, is_active)
 *
 * RLS is Clerk-org scoped; the web app authenticates via Supabase auth and the
 * service uses the request-bound client, so tenant scoping stays in the DB.
 */

export type BankLoadResult = QuestionBankPayload & {
  job_title: string | null;
};

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
type BankRow = {
  id: string;
  questions: unknown;
  rubric: unknown;
};

export async function loadBank(
  supabase: SupabaseClient,
  jobId: string,
): Promise<BankLoadResult | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id,title,job_description")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const { data: bank } = await supabase
    .from("question_banks")
    .select("id,questions,rubric")
    .eq("job_id", jobId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<BankRow>();

  if (!bank) {
    return {
      job_title: (job.title as string | null) ?? null,
      questions: [],
      rubric: DEFAULT_RUBRIC,
    };
  }
  const parsed = QuestionBankPayloadSchema.safeParse({
    questions: (bank.questions as unknown[]) ?? [],
    rubric: (bank.rubric as BankRubric) ?? DEFAULT_RUBRIC,
  });
  if (!parsed.success) {
    return {
      job_title: (job.title as string | null) ?? null,
      questions: [],
      rubric: DEFAULT_RUBRIC,
    };
  }
  return { job_title: (job.title as string | null) ?? null, ...parsed.data };
}

export async function saveBank(
  supabase: SupabaseClient,
  jobId: string,
  payload: QuestionBankPayload,
): Promise<{ ok: boolean; error?: string }> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id,org_id,title")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Job not found" };

  const { data: existing } = await supabase
    .from("question_banks")
    .select("id")
    .eq("job_id", jobId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing) {
    const { error } = await supabase
      .from("question_banks")
      .update({
        questions: payload.questions,
        rubric: payload.rubric,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await supabase.from("question_banks").insert({
    org_id: (job as { org_id: string }).org_id,
    job_id: jobId,
    name: `${(job as { title?: string }).title ?? "Job"} bank`,
    questions: payload.questions,
    rubric: payload.rubric,
    is_active: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadJobDescription(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ title: string; jd: string } | null> {
  const { data: job } = await supabase
    .from("jobs")
    .select("id,title,job_description")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;
  return {
    title: (job.title as string) ?? "this role",
    jd: (job.job_description as string) ?? "",
  };
}
