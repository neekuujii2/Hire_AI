import "server-only";
import { cookies } from "next/headers";

/**
 * Session-ID bridge for the invite pipeline.
 *
 * The invite URL exposes only the opaque candidate token (`/invite/<token>`),
 * never an internal session id. After the candidate consents, the start route
 * creates a prep session with the agent and stores its id in an httpOnly
 * cookie scoped to `/invite/*` so every downstream page (waiting / interview /
 * complete) can read it server-side without putting the id in the URL.
 *
 * The cookie is short-lived (8 h — a long interview still fits) and secure in
 * production, so an expired or shared browser can't reuse a stale session.
 */

const SESSION_COOKIE = "hireai_session";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

/** Reads the current invite-session id from the cookie, or null. */
export async function getInviteSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  return value;
}

/** Persists the session id in an httpOnly cookie scoped to /invite/*. */
export async function setInviteSessionId(
  sessionId: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/invite",
    sameSite: "lax",
  });
}

/** Clears the invite-session cookie (e.g. on error or after completion). */
export async function clearInviteSessionId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE, { path: "/invite" });
}
