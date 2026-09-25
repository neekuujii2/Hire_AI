/**
 * Custom metrics for HireAI.
 *
 * Uses Datadog if DATADOG_API_KEY is configured; otherwise falls back to
 * OpenTelemetry. Both paths are lazy-loaded so the module imports cleanly
 * even when neither SDK is installed.
 */

export type MetricType = "counter" | "histogram" | "gauge";

export interface MetricEvent {
  name: string;
  type: MetricType;
  value: number;
  tags?: Record<string, string>;
}

const _buffer: MetricEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;

/** Send metrics to Datadog (if configured) or OpenTelemetry. */
async function _flush() {
  if (_buffer.length === 0) return;
  const events = _buffer.splice(0, _buffer.length);

  // Datadog path
  if (process.env.DATADOG_API_KEY) {
    try {
      const { sendMetric } = await import("@datadog/datadog");
      for (const e of events) {
        sendMetric(e.name, e.value, e.type, e.tags);
      }
    } catch { /* ignore */ }
  }

  // OpenTelemetry fallback
  if (!process.env.DATADOG_API_KEY) {
    try {
      const { metrics } = await import("@opentelemetry/api");
      const meter = metrics.getMeter("hireai");
      for (const e of events) {
        const counter = meter.createCounter(e.name);
        counter.add(e.value, e.tags);
      }
    } catch { /* ignore */ }
  }
}

export function recordMetric(
  name: string,
  value: number,
  type: MetricType = "counter",
  tags?: Record<string, string>,
) {
  _buffer.push({ name, type, value, tags });
  if (!_flushTimer) {
    _flushTimer = setInterval(_flush, 5000);
  }
}

export function histogram(name: string, value: number, tags?: Record<string, string>) {
  recordMetric(name, value, "histogram", tags);
}

export function gauge(name: string, value: number, tags?: Record<string, string>) {
  recordMetric(name, value, "gauge", tags);
}

export function counter(name: string, value: number = 1, tags?: Record<string, string>) {
  recordMetric(name, value, "counter", tags);
}

// --- Pre-defined metric helpers ---

export const metrics = {
  sessionCreated: (orgId: string, jobId: string) =>
    counter("interview.session.created", 1, { org_id: orgId, job_id: jobId }),
  sessionCompleted: (orgId: string, durationSeconds: number) =>
    counter("interview.session.completed", 1, { org_id: orgId, duration_seconds: String(durationSeconds) }),
  sessionTerminatedProctor: (orgId: string, reason: string) =>
    counter("interview.session.terminated_proctor", 1, { org_id: orgId, reason }),
  prepDuration: (ms: number, orgId: string) =>
    histogram("interview.prep.duration_ms", ms, { org_id: orgId }),
  voiceTurnLatency: (ms: number, orgId: string) =>
    histogram("interview.voice.turn_latency_ms", ms, { org_id: orgId }),
  applicationSubmitted: (orgId: string, source: string) =>
    counter("application.submitted", 1, { org_id: orgId, source }),
  applicationAiScore: (score: number, orgId: string) =>
    histogram("application.ai_score", score, { org_id: orgId }),
  queueDepth: (queue: string, depth: number) =>
    gauge("queue.depth", depth, { queue_name: queue }),
  emailSent: (template: string) =>
    counter("email.sent", 1, { template_name: template }),
  emailFailed: (template: string) =>
    counter("email.failed", 1, { template_name: template }),
};

export default metrics;