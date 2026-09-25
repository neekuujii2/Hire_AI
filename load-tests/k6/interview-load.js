import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics for thresholds
const createSessionDuration = new Trend('create_session_duration', true);
const agentPrepDuration = new Trend('agent_prep_duration', true);
const getTranscriptDuration = new Trend('get_transcript_duration', true);
const errorRate = new Rate('custom_error_rate');
const sessionsCreated = new Counter('sessions_created_total');
const sessionsCompleted = new Counter('sessions_completed_total');

// Environment variables configuration with sensible defaults
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TEST_JOB_ID = __ENV.TEST_JOB_ID || 'job-load-test-default';
const TEST_TOKEN = __ENV.TEST_TOKEN || '';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp to 100 VUs over 2 minutes
    { duration: '5m', target: 500 },  // Ramp to 500 VUs over 5 minutes
    { duration: '10m', target: 500 }, // Hold 500 VUs for 10 minutes
    { duration: '2m', target: 0 },    // Ramp down to 0 VUs over 2 minutes
  ],
  thresholds: {
    create_session_duration: ['p(95)<2000'], // p95 < 2000ms
    agent_prep_duration: ['p(95)<90000'],     // p95 < 90000ms (heavy AI pipeline)
    get_transcript_duration: ['p(95)<500'],  // p95 < 500ms
    custom_error_rate: ['rate<0.01'],         // error_rate < 1%
    http_req_failed: ['rate<0.01'],           // standard k6 failed requests < 1%
  },
};

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (TEST_TOKEN) {
    headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
    headers['X-Internal-Secret'] = TEST_TOKEN;
  }
  return headers;
}

export default function () {
  const headers = getHeaders();
  const vuId = __VU;
  const iterId = __ITER;
  const uniqueCandidateName = `Candidate VU${vuId}_IT${iterId}`;

  // --------------------------------------------------------------------------
  // Step 1: Create Interview Session
  // --------------------------------------------------------------------------
  const sessionPayload = JSON.stringify({
    job_id: TEST_JOB_ID,
    candidate_name: uniqueCandidateName,
    candidate_email: `candidate_${vuId}_${iterId}@loadtest.local`,
    cv_url: 'data:text/plain;base64,U29mdHdhcmUgRW5naW5lZXIgd2l0aCA1IHllYXJzIGV4cGVyaWVuY2UgaW4gVHlwZVNjcmlwdCwgTm9kZS5qcywgUHl0aG9uLCBhbmQgRG9ja2VyLg==',
    jd_text: 'Senior Full Stack Engineer: Experience with React, Node.js, distributed systems, and real-time WebSockets.',
    company: 'HireAI Corp',
    language_mode: {
      primary: 'en',
      mixed: false,
    },
  });

  const createStart = Date.now();
  // Try Next.js API route first, fallback to agent backend endpoint
  let createRes = http.post(`${BASE_URL}/api/session`, sessionPayload, {
    headers,
    tags: { name: 'POST /api/session' },
  });

  // If /api/session is 404, support direct /api/prep endpoint
  if (createRes.status === 404) {
    createRes = http.post(`${BASE_URL}/api/prep`, sessionPayload, {
      headers,
      tags: { name: 'POST /api/prep' },
    });
  }

  const createDuration = Date.now() - createStart;
  createSessionDuration.add(createDuration);

  const createSuccess = check(createRes, {
    'create session status is 200/201': (r) => r.status === 200 || r.status === 201,
    'session response has id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.id || body.session_id || body.sessionId);
      } catch (e) {
        return false;
      }
    },
  });

  if (!createSuccess) {
    errorRate.add(1);
    sleep(1);
    return;
  }

  errorRate.add(0);
  sessionsCreated.add(1);

  let sessionData = {};
  try {
    sessionData = JSON.parse(createRes.body);
  } catch (e) {
    errorRate.add(1);
    return;
  }

  const sessionId = sessionData.id || sessionData.session_id || sessionData.sessionId;

  // --------------------------------------------------------------------------
  // Step 2: Poll Session Status & Agent Prep Pipeline
  // --------------------------------------------------------------------------
  const prepStart = Date.now();
  let prepCompleted = false;
  const maxPollAttempts = 15; // Poll up to ~45s
  const pollIntervalSec = 3;

  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    sleep(pollIntervalSec);

    const statusRes = http.get(`${BASE_URL}/api/session/${sessionId}`, {
      headers,
      tags: { name: 'GET /api/session/:id' },
    });

    const statusOk = check(statusRes, {
      'poll session status is 200': (r) => r.status === 200,
    });

    if (!statusOk) {
      errorRate.add(1);
      break;
    }

    try {
      const statusBody = JSON.parse(statusRes.body);
      const status = statusBody.status;

      // Status transitions: created/prep -> ready/in_progress/completed
      if (status === 'ready' || status === 'in_progress' || status === 'complete' || statusBody.context) {
        prepCompleted = true;
        break;
      } else if (status === 'error' || status === 'rejected') {
        errorRate.add(1);
        break;
      }
    } catch (e) {
      errorRate.add(1);
      break;
    }
  }

  const prepDuration = Date.now() - prepStart;
  agentPrepDuration.add(prepDuration);

  // --------------------------------------------------------------------------
  // Step 3: Fetch Transcript & Evaluation Results
  // --------------------------------------------------------------------------
  const transcriptStart = Date.now();
  let transcriptRes = http.get(`${BASE_URL}/api/session/${sessionId}/transcript`, {
    headers,
    tags: { name: 'GET /api/session/:id/transcript' },
  });

  // If /transcript subresource doesn't exist, fallback to root session view
  if (transcriptRes.status === 404) {
    transcriptRes = http.get(`${BASE_URL}/api/session/${sessionId}`, {
      headers,
      tags: { name: 'GET /api/session/:id' },
    });
  }

  const transcriptDuration = Date.now() - transcriptStart;
  getTranscriptDuration.add(transcriptDuration);

  const transcriptSuccess = check(transcriptRes, {
    'get transcript status is 200': (r) => r.status === 200,
  });

  if (transcriptSuccess) {
    errorRate.add(0);
    sessionsCompleted.add(1);
  } else {
    errorRate.add(1);
  }

  // Think time between iterations
  sleep(Math.random() * 2 + 1);
}
