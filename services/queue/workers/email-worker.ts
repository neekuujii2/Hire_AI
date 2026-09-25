import { Worker, Queue, QueueScheduler } from "bullmq";
import { getSupabaseClient } from "@/lib/supabase";
import * as Sentry from "@sentry/node";
import { emailQueue } from "../email/sender";
import { log } from "@/lib/logger";
import IORedis from "ioredis";

// Rate‑limit tracking – simple Redis key per org
const redis = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
});

// QueueScheduler is required for delayed/retries to work correctly
new QueueScheduler("email-queue", { connection: redis });

const worker = new Worker(
  "email-queue",
  async job => {
    const { to, subject, html, text, orgId } = job.data as any;
    // Rate‑limit: 100 emails per minute per org
    const key = `org:${orgId}:emailCount`;
    const count = await redis.incr(key);
    if (count === 1) {
      // set TTL of 60 seconds on first increment
      await redis.expire(key, 60);
    }
    if (count > 100) {
      throw new Error(`Rate limit exceeded for org ${orgId}`);
    }

    // Send via Resend
    const resend = new (require("resend")).default(process.env.RESEND_API_KEY);
    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html,
        text,
      });
      // Update audit log to sent
      const supabase = getSupabaseClient();
      await supabase
        .from("audit_logs")
        .update({ status: "sent" })
        .eq("event_type", "email")
        .eq("payload->>to", to);
    } catch (err) {
      // Update audit to failed
      const supabase = getSupabaseClient();
      await supabase
        .from("audit_logs")
        .update({ status: "failed", payload: { error: err.message } })
        .eq("event_type", "email")
        .eq("payload->>to", to);
      throw err; // let BullMQ handle retries
    }
  },
  {
    connection: redis,
    concurrency: 10,
    // Exponential back‑off: 2 s, 4 s, 8 s
    settings: { backoffStrategies: { exponential: delay => 2000 * Math.pow(2, delay) } },
    // Retry 3 times total (original + 2 retries)
    attempts: 3,
    // On failure after attempts, report to Sentry
    onFailed: async (job, err) => {
      log.error(`Email job ${job.id} failed after retries`, err);
      Sentry.captureException(err, { extra: { jobId: job.id, to: job.data.to } });
    },
  },
);

worker.on("error", err => {
  log.error("BullMQ worker error", err);
  Sentry.captureException(err);
});

export default worker;