import {
  prepQueue,
  scoreQueue,
  emailQueue,
  recordingQueue,
  toBullPriority,
  type PrepJobData,
  type ScoreJobData,
  type EmailJobData,
  type RecordingJobData,
} from "./index";

/**
 * Job producer functions for the HireAI BullMQ queues.
 *
 * Each function validates input, attaches metadata, and enqueues.
 * Design: 08_Best_Practices.md §4 — queue isolation by tier.
 */

// ---------------------------------------------------------------------------
// Prep
// ---------------------------------------------------------------------------

/**
 * Enqueue a prep job (LangGraph pipeline → InterviewContext + QuestionPlan).
 *
 * @param sessionId - The interview session ID
 * @param priority  - "high" for paid orgs (priority 1), "normal" for free tier (priority 5)
 * @param orgId     - Organization ID for scoping
 */
export async function enqueuePrep(
  sessionId: string,
  orgId: string,
  priority: "high" | "normal" = "normal",
): Promise<string> {
  const job = await prepQueue.add(
    "prep",
    { sessionId, orgId, priority } satisfies PrepJobData,
    {
      priority: toBullPriority(priority),
      jobId: `prep:${sessionId}`,
      // Paid orgs: max 90s wait. Normal: up to 2 min.
      delay: priority === "high" ? 0 : Math.min(30000, 5000),
    },
  );

  return job.id!;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Enqueue a scoring job (post-interview LLM evaluation → ScoreCard).
 *
 * @param sessionId - The interview session ID
 * @param orgId     - Organization ID for scoping
 */
export async function enqueueScoring(
  sessionId: string,
  orgId: string,
): Promise<string> {
  const job = await scoreQueue.add(
    "score",
    { sessionId, orgId } satisfies ScoreJobData,
    {
      priority: toBullPriority("normal"),
      jobId: `score:${sessionId}`,
    },
  );

  return job.id!;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Enqueue an email job (invite, result notification, or welcome).
 *
 * @param type           - Email type: "invite" | "result" | "welcome"
 * @param recipientEmail - Recipient's email address
 * @param orgId          - Organization ID
 * @param data           - Template-specific data (job title, candidate name, etc.)
 */
export async function enqueueEmail(
  type: "invite" | "result" | "welcome",
  recipientEmail: string,
  orgId: string,
  data: Record<string, unknown> = {},
): Promise<string> {
  const job = await emailQueue.add(
    type,
    {
      type,
      recipientEmail,
      orgId,
      data,
    } satisfies EmailJobData,
    {
      priority: toBullPriority("low"),
      jobId: `email:${type}:${recipientEmail}:${Date.now()}`,
    },
  );

  return job.id!;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Enqueue a recording processing job (after LiveKit egress completes).
 *
 * @param sessionId - The interview session ID
 * @param orgId     - Organization ID
 * @param s3Key     - S3/R2 key of the raw recording
 * @param durationSec - Optional duration for metadata
 */
export async function enqueueRecording(
  sessionId: string,
  orgId: string,
  s3Key: string,
  durationSec?: number,
): Promise<string> {
  const job = await recordingQueue.add(
    "process",
    { sessionId, orgId, s3Key, durationSec } satisfies RecordingJobData,
    {
      priority: toBullPriority("low"),
      jobId: `recording:${sessionId}`,
    },
  );

  return job.id!;
}
