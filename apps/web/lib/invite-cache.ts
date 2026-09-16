import { cache } from "react";
import { resolveInvite, markLinkOpened, type InvitePayload } from "@/lib/invite";

/**
 * Request-cached invite resolution.
 *
 * `cache()` dedupes identical server calls within one request render, so the
 * layout and every child page can call `getCachedInvite(token)` without
 * re-querying Supabase. The first call resolves + marks the link opened;
 * subsequent calls return the same payload.
 */
export const getCachedInvite = cache(
  async (token: string): Promise<{
    error: string | null;
    payload: InvitePayload | null;
  }> => {
    const resolved = await resolveInvite(token);
    if (resolved.payload) {
      markLinkOpened(resolved.payload.candidate.id).catch(() => {});
    }
    return resolved;
  },
);

export { markLinkOpened };