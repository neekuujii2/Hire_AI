# Load Testing Suite for HireAI

This directory contains comprehensive load testing configurations for the HireAI platform using k6, Locust, and Artillery.

## Overview

Each test suite targets different aspects of the system:

1. **k6** - End-to-end API load testing (session creation, prep pipeline, transcript retrieval)
2. **Locust** - Python agent API endpoint testing (/agent/prep, /agent/score, /agent/screen)  
3. **Artillery** - WebSocket/LiveKit connection simulation

## Prerequisites

- Docker and docker-compose (for self-hosted services) OR running deployment
- Node.js >= 16 (for k6)
- Python >= 3.8 (for Locust)
- Artillery (`npm install -g artillery`)

## Running k6 Tests

### Installation
```bash
# Install k6 locally
brew install k6   # macOS
# OR
choco install k6  # Windows
# OR from binary: https://k6.io/docs/getting-started/installation/
```

### Local Execution

Set required environment variables:
```bash
export BASE_URL="http://localhost:3000"
export TEST_JOB_ID="your-job-id"
export TEST_TOKEN="your-internal-secret-or-jwt"
```

Run the test:
```bash
k6 run --out json=k6-results.json load-tests/k6/interview-load.js
```

### Cloud Execution (k6 Cloud)
```bash
# Login to k6 Cloud
k6 login cloud

# Run with cloud output
k6 run --out cloud load-tests/k6/interview-load.js
```

### Docker Execution
```bash
docker run --rm -i \
  -e BASE_URL=$BASE_URL \
  -e TEST_JOB_ID=$TEST_JOB_ID \
  -e TEST_TOKEN=$TEST_TOKEN \
  loadimpact/k6 run - load-tests/k6/interview-load.js
```

## Viewing Results

### k6 Cloud
Results automatically available at https://app.k6.io with detailed metrics dashboards.

### Local JSON Output
```bash
# Convert to HTML report
k6 html k6-results.json

# Or use Grafana with Prometheus remote write
k6 run --out prometheus=localhost:9090 load-tests/k6/interview-load.js
```

### Key Metrics to Monitor
- **create_session**: Target p95 < 2000ms (session creation API)
- **agent_prep**: Target p95 < 90000ms (heavy AI preprocessing pipeline)  
- **get_transcript**: Target p95 < 500ms (transcript retrieval)
- **error_rate**: Target < 1% (combined failure rate)
- **HTTP 2xx rate**: Should be > 99%
- **Throughput**: Sessions completed per second

## Running Locust Tests

### Installation
```bash
pip install locust
```

### Local Execution
```bash
locust -f load-tests/locust/agent-load.py --host http://localhost:3000
```

Then visit http://localhost:8089 and:
- Set Number of users: 100
- Set Spawn rate: 10 users/second
- Click "Start swarming"

### Headless Execution (CI/CD)
```bash
locust -f load-tests/locust/agent-load.py \
  --host http://localhost:3000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --html locust-report.html
```

### Docker Execution
```bash
docker run --rm -v $(pwd)/load-tests/locust:/mount/locust \
  locustio/locust -f /mount/locust/agent-load.py \
  --host http://host.docker.internal:3000 \
  --users 100 --spawn-rate 10 --run-time 5m \
  --html /mount/locust/report.html
```

## Running Artillery Tests

### Installation
```bash
npm install -g artillery
```

### Local Execution
```bash
artillery run load-tests/artillery/livekit-config.yaml
```

### With HTML Report
```bash
artillery run load-tests/artillery/livekit-config.yaml \
  --output artillery-results.json

artillery report artillery-results.json
```

### Docker Execution
```bash
docker run --rm -v $(pwd)/load-tests/artillery:/artillery \
  artilleryio/artillery:latest run /artillery/livekit-config.yaml
```

## Target Metrics & Success Criteria

| Metric | Target | Measurement Tool |
|--------|--------|------------------|
| Session Creation (p95) | < 2000ms | k6 |
| Agent Prep Pipeline (p95) | < 90s | k6 |
| Transcript Retrieval (p95) | < 500ms | k6 |
| Overall Error Rate | < 1% | k6 |
| Agent Prep API (p95) | < 5000ms | Locust |
| Agent Score API (p95) | < 3000ms | Locust |
| LiveKit Connections | 50 concurrent | Artillery |
| Room Creation Success | > 95% | Artillery |

## Test Data & Configuration

### Environment Variables
All test suites support these variables:
- `BASE_URL`: Base URL of the application (default: http://localhost:3000)
- `TEST_JOB_ID`: Job ID to use for test sessions
- `TEST_TOKEN`: Authentication token (JWT or internal secret)

### Realistic Test Patterns
- Varied candidate names and emails
- Realistic CV data (base64 encoded plain text)
- Industry-standard job descriptions
- Proper authentication headers
- Realistic think times between requests

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Verify the service is running at BASE_URL
   - Check firewall/port accessibility
   - For Docker: use `host.docker.internal` on Mac/Windows or service name on Linux

2. **Authentication Failures**
   - Ensure TEST_TOKEN is valid and not expired
   - Check if INTERNAL_API_SECRET is required on the backend
   - Verify token has required scopes/permissions

3. **High Error Rates**
   - Check backend logs for validation errors
   - Ensure test data matches expected schema
   - Monitor rate limiting (may need to reduce VUs)

4. **Memory Issues (Locust)**
   - Reduce number of users if OOM occurs
   - Consider distributed mode for >1000 users

## Extending the Tests

### Adding New Scenarios
1. **k6**: Add new functions in `interview-load.js` and call them in the default function
2. **Locust**: Add new `@task` methods in `agent-load.py`
3. **Artillery**: Add new scenarios or modify the YAML flow

### Custom Metrics
- k6: Use `Trend`, `Rate`, `Counter` from `k6/metrics`
- Locust: Use `events.request.fire()` or custom listeners
- Artillery: Use `client.emit()` for custom metrics

## Maintenance

- Review test data quarterly for realism
- Update thresholds based on performance baselines
- Add new test cases for additional endpoints
- Monitor test execution time in CI pipelines