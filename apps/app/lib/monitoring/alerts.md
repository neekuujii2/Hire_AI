# Alerts configuration for Datadog / PagerDuty
# Copy into your Datadog dashboard or PagerDuty service

# === P1 (Page immediately) ===
# - voice.turn_latency_ms p95 > 3000ms for 5 min
# - error rate > 5% for 2 min
# - database down

# === P2 (Notify) ===
# - voice.turn_latency_ms p95 > 2000ms for 10 min
# - queue.depth > 200 for 5 min
# - agent workers active/total < 0.5 (half idle = may be stuck)

# === P3 (Daily digest) ===
# - email.failed rate > 2%
# - interview terminated_proctor rate > 20% (suspicious)