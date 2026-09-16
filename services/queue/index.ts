import { Queue, QueueScheduler } from "bullmq";
import IORedis from "ioredis";

/**
 * BullMQ queue configuration for HireAI.
 *
 * Four queues isolate work by tier so a slow or failing scoring job
 * can never block prep (or vice versa).  Redis connection is shared
 * across all queues via a single IORedis client.
 *
 * Design: 08_Best_Practices.md §4 — queue isolation by tier.
 */

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,   // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

const connection = createRedisConnection();

// ---------------------------------------------------------------------------
// Queue definitions
// ---------------------------------------------------------------------------

export interface PrepJobData {
  sessionId: string;
  orgId: string;
  priority: "high" | "normal";
}

export interface ScoreJobData {
  sessionId: string;
  orgId: string;
}

export interface EmailJobData {
  type: "invite" | "result" | "welcome";
  recipientEmail: string;
  recipientName?: string;
  orgId: string;
  data: Record<string, unknown>;
}

export interface RecordingJobData {
  sessionId: string;
  orgId: string;
  s3Key: string;
  durationSec?: number;
}

/**
 * Prep queue — LangGraph prep pipeline before interview starts.
 * High priority = paid org, processes first.
 * Normal priority = queued, max wait ~2 min.
 */
export const prepQueue = new Queue<PrepJobData>("hireai:prep", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 500 },
  },
});

/**
 * Score queue — post-interview scoring pipeline.
 * Always normal priority (runs after interview ends, latency-tolerant).
 */
export const scoreQueue = new Queue<ScoreJobData>("hireai:score", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 500 },
  },
});

/**
 * Email queue — invite emails, result notifications, welcome messages.
 * Low priority, best-effort.
 */
export const emailQueue = new Queue<EmailJobData>("hireai:email", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 86400, count: 200 },
    removeOnFail: { age: 604800, count: 1000 },
  },
});

/**
 * Recording queue — process LiveKit egress recordings after interview.
 * Handles upload, metadata extraction, thumbnail generation.
 */
export const recordingQueue = new Queue<RecordingJobData>("hireai:recording", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 15000 },
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 604800, count: 500 },
  },
});

// ---------------------------------------------------------------------------
// Priority mapping (08_Best_Practices.md §4)
// ---------------------------------------------------------------------------

/**
 * BullMQ priority: lower number = higher priority.
 *   1 = paid org (high priority, processes first)
 *   5 = normal (queued, max wait ~2 min)
 *   10 = low (best-effort, email/recording)
 */
export function toBullPriority(tier: "high" | "normal" | "low"): number {
  switch (tier) {
    case "high":
      return 1;
    case "normal":
      return 5;
    case "low":
      return 10;
  }
}

// ---------------------------------------------------------------------------
// Queue schedulers (required for delayed jobs)
// ---------------------------------------------------------------------------

export function createSchedulers(): QueueScheduler[] {
  return [
    new QueueScheduler("hireai:prep", { connection }),
    new QueueScheduler("hireai:score", { connection }),
    new QueueScheduler("hireai:email", { connection }),
    new QueueScheduler("hireai:recording", { connection }),
  ];
}
