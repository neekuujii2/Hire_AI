import * as Sentry from "@sentry/nextjs";

export function initSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1"),
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay(),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event, hint) {
      // Filter out 404s and rate limit errors
      const error = hint.originalException as Error | undefined;
      if (error?.message?.includes("404")) return null;
      if (error?.message?.includes("429")) return null;
      return event;
    },
  });
}

export function captureError(error: Error, context: Record<string, any> = {}) {
  Sentry.captureException(error, {
    extra: {
      org_id: context.orgId,
      user_id: context.userId,
      session_id: context.sessionId,
      ...context,
    },
  });
}

export default Sentry;