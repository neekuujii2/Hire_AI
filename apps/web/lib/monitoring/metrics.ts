/**
 * HireAI Metrics - Datadog/OpenTelemetry metrics wrapper.
 *
 * Usage:
 *   import { recordMetric, histogram, gauge } from "@/lib/monitoring/metrics";
 *   histogram("interview.prep.duration_ms", durationMs, { session_id, org_id });
 *   gauge("queue.depth", waitingJobs);
 *
 * Providers:
 *   - Datadog: Set DATADOG_API_KEY (HTTP API v2 series endpoint)
 *   - OpenTelemetry: Set OTEL_EXPORTER_OTLP_ENDPOINT (auto-detected via @opentelemetry/sdk-metrics)
 *   - Fallback: Console logger (no-ops, aggregates in memory)
 *
 * This module is gated: with no telemetry configured, it remains a no-op.
 * No external dependencies are required.
 */

type MetricType = "counter" | "gauge" | "histogram" | "distribution";

type Tags = Record<string, string | number | boolean>;

type MetricRecord = {
  name: string;
  value: number;
  type: MetricType;
  tags?: Tags;
  unit?: string;
};

type Provider = {
  record: (m: MetricRecord) => void | Promise<void>;
  flush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

const METRICS_BUFFER: MetricRecord[] = [];
const BATCH_INTERVAL_MS = 5_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let provider: Provider | null = null;
let isInitialized = false;

function getDatadogApiKey(): string | undefined {
  if (typeof process.env !== "undefined") {
    return process.env.DATADOG_API_KEY;
  }
  return undefined;
}

function getOtelEndpoint(): string | undefined {
  if (typeof process.env !== "undefined") {
    return (
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    );
  }
  return undefined;
}

function hasDatadogConfigured(): boolean {
  return Boolean(getDatadogApiKey());
}

function hasOtelConfigured(): boolean {
  return Boolean(getOtelEndpoint());
}

class DatadogProvider implements Provider {
  private apiKey: string;
  private endpoint = "https://api.datadoghq.com/api/v2/series";

  constructor() {
    this.apiKey = getDatadogApiKey()!;
  }

  record(m: MetricRecord): void {
    const series: Record<string, unknown> = {
      metric: m.name,
      type: this.mapMetricType(m.type),
      points: [[Math.floor(Date.now() / 1000), m.value]],
      tags: m.tags ? Object.entries(m.tags).map(([k, v]) => `${k}:${v}`) : [],
      unit: m.unit,
    };

    fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": this.apiKey,
      },
      body: JSON.stringify({ series: [series] }),
    }).catch((e) => console.error("[metrics] Datadog send failed:", e));
  }

  private mapMetricType(type: MetricType): "gauge" | "count" | "distribution" {
    if (type === "histogram" || type === "distribution") {
      return "distribution";
    }
    if (type === "gauge") return "gauge";
    return "count";
  }

  async flush(): Promise<void> {
    await Promise.all(METRICS_BUFFER.map((m) => Promise.resolve(this.record(m))));
    METRICS_BUFFER.length = 0;
  }
}

class OpenTelemetryProvider implements Provider {
  async record(m: MetricRecord): Promise<void> {
    try {
      const { MeterProvider } = await import("@opentelemetry/sdk-metrics");
      const { OTLPMetricExporter } = await import(
        "@opentelemetry/exporter-trace-otlp-http"
      );

      const exporter = new OTLPMetricExporter({
        url: getOtelEndpoint()!.replace("/v1/traces", "/v1/metrics"),
      });

      const meterProvider = new MeterProvider({
        exporters: [exporter],
      });

      const meter = meterProvider.getMeter("hireai-web");

      switch (m.type) {
        case "counter": {
          const counter = meter.createCounter(m.name);
          counter.add(m.value, m.tags);
          break;
        }
        case "gauge": {
          const gauge = meter.createUpDownCounter(m.name);
          gauge.add(m.value, m.tags);
          break;
        }
        case "histogram":
        case "distribution": {
          const histogram = meter.createHistogram(m.name);
          histogram.record(m.value, m.tags);
          break;
        }
      }

      await meterProvider.forceFlush();
    } catch {
      // OpenTelemetry not installed or failed to initialize
    }
  }
}

class ConsoleProvider implements Provider {
  record(m: MetricRecord): void {
    console.debug("[metrics]", `${m.name} ${m.value}`, m.tags);
  }
}

async function initProvider(): Promise<Provider> {
  if (hasDatadogConfigured()) {
    return new DatadogProvider();
  }
  if (hasOtelConfigured()) {
    return new OpenTelemetryProvider();
  }
  return new ConsoleProvider();
}

async function ensureProvider(): Promise<Provider> {
  if (!isInitialized) {
    provider = await initProvider();
    isInitialized = true;

    if (typeof setInterval !== "undefined") {
      flushTimer = setInterval(async () => {
        if (METRICS_BUFFER.length > 0 && provider) {
          try {
            await provider.flush?.();
          } catch {
            // ignore flush errors
          }
        }
      }, BATCH_INTERVAL_MS);
    }

    process.on("SIGTERM", () => provider?.shutdown?.());
    process.on("SIGINT", () => provider?.shutdown?.());
  }
  return provider!;
}

/**
 * Flush buffered metrics manually (useful in tests or at shutdown).
 */
export async function flushMetrics(): Promise<void> {
  const p = provider;
  if (p && METRICS_BUFFER.length > 0) {
    await p.flush?.();
    METRICS_BUFFER.length = 0;
  }
}

/**
 * Release resources and cancel background flush timer.
 */
export async function shutdownMetrics(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushMetrics();
  await provider?.shutdown?.();
}

/**
 * Record a generic metric.
 * @param name - Metric name
 * @param value - Numeric value
 * @param tags - Optional key-value tags for dimensionality
 * @param type - Metric type (default: counter)
 * @param unit - Optional unit (seconds, bytes, ms, etc.)
 */
export async function recordMetric(
  name: string,
  value: number,
  options?: {
    tags?: Tags;
    type?: MetricType;
    unit?: string;
  },
): Promise<void> {
  const m: MetricRecord = {
    name,
    value,
    type: options?.type ?? "counter",
    tags: options?.tags,
    unit: options?.unit,
  };

  const p = await ensureProvider();
  try {
    await p.record(m);
  } catch (e) {
    console.error("[metrics] record failed:", e);
  }
}

/**
 * Record a counter/increment metric.
 * @param name - Metric name
 * @param delta - Value to add (default: 1)
 * @param tags - Optional key-value tags
 */
export async function counter(
  name: string,
  delta = 1,
  tags?: Tags,
): Promise<void> {
  await recordMetric(name, delta, { tags, type: "counter" });
}

/**
 * Record a histogram (distribution) metric.
 * Used for latency, duration, size distributions.
 * @param name - Metric name (should end in _ms or _ms or _sec if using units)
 * @param value - The observed value
 * @param tags - Optional key-value tags
 * @param unit - Unit (default: "ms" for latency)
 */
export async function histogram(
  name: string,
  value: number,
  tags?: Tags,
  unit = "ms",
): Promise<void> {
  await recordMetric(name, value, { tags, type: "histogram", unit });
}

/**
 * Record a gauge metric.
 * Used for instantaneous values like queue depth, connection counts.
 * @param name - Metric name
 * @param value - Current value
 * @param tags - Optional key-value tags
 */
export async function gauge(name: string, value: number, tags?: Tags): Promise<void> {
  await recordMetric(name, value, { tags, type: "gauge" });
}

/**
 * Track interview session lifecycle events.
 */
export const InterviewMetrics = {
  sessionCreated: (sessionId: string, orgId: string) =>
    counter("interview.session.created", 1, { session_id: sessionId, org_id: orgId }),

  sessionCompleted: (sessionId: string, orgId: string, durationMs: number) => {
    counter("interview.session.completed", 1, { session_id: sessionId, org_id: orgId });
    histogram("interview.session.duration_ms", durationMs, {
      session_id: sessionId,
      org_id: orgId,
    });
  },

  sessionTerminatedProctor: (sessionId: string, orgId: string, reason: string) =>
    counter("interview.session.terminated_proctor", 1, {
      session_id: sessionId,
      org_id: orgId,
      reason,
    }),

  prepDuration: (sessionId: string, durationMs: number) =>
    histogram("interview.prep.duration_ms", durationMs, { session_id: sessionId }),

  voiceTurnLatency: (sessionId: string, latencyMs: number) =>
    histogram("interview.voice.turn_latency_ms", latencyMs, { session_id: sessionId }),

  applicationSubmitted: (appId: string, orgId: string) =>
    counter("application.submitted", 1, { app_id: appId, org_id: orgId }),

  aiScore: (appId: string, score: number) =>
    histogram("application.ai_score", score, { app_id: appId }),
};

/**
 * Queue depth gauges for BullMQ queues.
 */
export const QueueMetrics = {
  depth: async (queueName: string, counts: { waiting: number; active: number }) => {
    await gauge(`queue.${queueName}.depth`, counts.waiting);
    await gauge(`queue.${queueName}.active`, counts.active);
  },
};

/**
 * Email metrics.
 */
export const EmailMetrics = {
  sent: (recipient: string, orgId: string) =>
    counter("email.sent", 1, { recipient, org_id: orgId }),

  failed: (error: string, orgId: string) =>
    counter("email.failed", 1, { error, org_id: orgId }),
};

export type { MetricRecord, Tags, MetricType };