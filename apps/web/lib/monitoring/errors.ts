/**
 * HireAI Error Handling & Sentry Wrapper.
 *
 * Gated & provider-agnostic. Safely captures unhandled exceptions, API errors,
 * and background agent crashes. Automatically enriches errors with org_id,
 * user_id, and session_id context.
 *
 * Automatically filters:
 *  - 404 (Not Found)
 *  - 429 (Rate Limit)
 *  - Network timeouts / client aborts
 */

import { publicEnv } from "@/lib/env";

export interface ErrorContext {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

const IGNORED_STATUS_CODES = new Set([404, 429]);
const IGNORED_ERROR_PATTERNS = [
  /not found/i,
  /rate limit/i,
  /abort/i,
  /canceled/i,
  /aborted/i,
];

/**
 * Filter out noisy or expected errors (404s, 429s, client aborts).
 */
function shouldIgnoreError(error: unknown): boolean {
  if (!error) return true;

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;

    if (
      typeof obj.status === "number" &&
      IGNORED_STATUS_CODES.has(obj.status)
    ) {
      return true;
    }
    if (
      typeof obj.statusCode === "number" &&
      IGNORED_STATUS_CODES.has(obj.statusCode)
    ) {
      return true;
    }

    const message = String(obj.message || obj.name || "");
    for (const pattern of IGNORED_ERROR_PATTERNS) {
      if (pattern.test(message)) return true;
    }
  }

  if (typeof error === "string") {
    for (const pattern of IGNORED_ERROR_PATTERNS) {
      if (pattern.test(error)) return true;
    }
  }

  return false;
}

/**
 * Check if Sentry is available and configured.
 */
export function isSentryConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    publicEnv.appUrl.includes("sentry")
  );
}

/**
 * Capture an error with rich context (org_id, user_id, session_id).
 */
export async function captureError(
  error: unknown,
  context?: ErrorContext
): Promise<void> {
  if (shouldIgnoreError(error)) {
    return;
  }

  // If Sentry is not configured, write to structured console
  if (!isSentryConfigured()) {
    console.error("[error-handler]", error, {
      userId: context?.userId,
      orgId: context?.orgId,
      sessionId: context?.sessionId,
      ...context?.extra,
    });
    return;
  }

  try {
    const moduleName = ["@sentry", "nextjs"].join("/");
    const sentry: any = await import(/* webpackIgnore: true */ moduleName);

    if (sentry?.withScope) {
      sentry.withScope((scope: any) => {
        if (context?.userId) {
          scope.setUser({ id: context.userId });
        }
        if (context?.orgId) {
          scope.setTag("org_id", context.orgId);
        }
        if (context?.sessionId) {
          scope.setTag("session_id", context.sessionId);
        }
        if (context?.tags) {
          scope.setTags(context.tags);
        }
        if (context?.extra) {
          scope.setExtras(context.extra);
        }

        sentry.captureException(error);
      });
      return;
    }

    if (sentry?.captureException) {
      sentry.captureException(error);
      return;
    }
  } catch {
    // Sentry SDK missing/failed, fallback to console
  }

  console.error("[error-handler]", error, context);
}

/**
 * Helper to wrap API route handlers with Sentry + standard error responses.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  options?: { routeName?: string }
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (err: unknown) {
      await captureError(err, {
        tags: options?.routeName ? { route: options.routeName } : undefined,
      });

      const message =
        err instanceof Error ? err.message : "Internal Server Error";
      const status =
        typeof (err as any)?.status === "number" ? (err as any).status : 500;

      return Response.json(
        { ok: false, error: message },
        { status: status >= 400 && status < 600 ? status : 500 }
      );
    }
  }) as T;
}

/**
 * Capture an Agent crash or fatal LiveKit background error.
 */
export async function captureAgentCrash(
  sessionId: string,
  error: unknown,
  metadata?: Record<string, unknown>
): Promise<void> {
  await captureError(error, {
    sessionId,
    tags: {
      component: "agent-worker",
      fatal: "true",
    },
    extra: metadata,
  });
}
