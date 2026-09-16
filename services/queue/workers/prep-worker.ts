import { Worker, Job } from "bullmq";
import { createRedisConnection, type PrepJobData } from "../index";

/**
 * Prep worker — runs the LangGraph prep pipeline for each interview session.
 *
 * Concurrency: 25 per worker instance (08_Best_Practices.md §4).
 * Timeout: 90 seconds per job (matches LLM_CALL_TIMEOUT_SEC).
 * Retries: 3 attempts with exponential backoff.
 * On failure: updates session status to 'prep_failed', notifies HR.
 */

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";
const CONCURRENCY = 25;
const JOB_TIMEOUT_MS = 90_000;

async function callPrepApi(sessionId: string): Promise<boolean> {
  const res = await fetch(`${AGENT_API_URL}/api/prep`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
    signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Prep API returned ${res.status}: ${body}`);
  }

  return true;
}

async function updateSessionStatus(
  sessionId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  // Update via the web API's internal endpoint.
  const res = await fetch(
    `${process.env.WEB_API_URL || "http://localhost:3000"}/api/sessions/${sessionId}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "",
      },
      body: JSON.stringify({ status, ...extra }),
    },
  );

  if (!res.ok) {
    console.error(
      `Failed to update session ${sessionId} status to ${status}: ${res.status}`,
    );
  }
}

async function notifyHr(sessionId: string, orgId: string, error: string): Promise<void> {
  // Best-effort HR notification — enqueue an email job.
  try {
    const { enqueueEmail } = await import("../producers");
    await enqueueEmail("result", "", orgId, {
      sessionId,
      error,
      type: "prep_failed",
    });
  } catch {
    // Notification is best-effort; don't fail the job on notification error.
  }
}

const prepWorker = new Worker<PrepJobData>(
  "hireai:prep",
  async (job: Job<PrepJobData>) => {
    const { sessionId, orgId } = job.data;
    const startMs = Date.now();

    console.log(`[prep-worker] Starting prep for session ${sessionId}`);

    try {
      await callPrepApi(sessionId);

      await updateSessionStatus(sessionId, "ready");

      const elapsed = Date.now() - startMs;
      console.log(
        `[prep-worker] Prep completed for session ${sessionId} in ${elapsed}ms`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const elapsed = Date.now() - startMs;

      console.error(
        `[prep-worker] Prep failed for session ${sessionId} after ${elapsed}ms: ${errorMsg}`,
      );

      // Update session to failed status.
      await updateSessionStatus(sessionId, "prep_failed", {
        error: errorMsg,
      });

      // Notify HR (best-effort).
      await notifyHr(sessionId, orgId, errorMsg);

      // Re-throw to trigger BullMQ retry (up to 3 attempts).
      throw err;
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
    limiter: {
      max: 100,
      duration: 1000, // Max 100 jobs per second across all workers
    },
  },
);

// Graceful shutdown.
prepWorker.on("failed", (job, err) => {
  console.error(
    `[prep-worker] Job ${job?.id} failed (${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`,
  );
});

prepWorker.on("completed", (job) => {
  console.log(`[prep-worker] Job ${job.id} completed`);
});

// Export for docker-compose CMD or standalone run.
export default prepWorker;
