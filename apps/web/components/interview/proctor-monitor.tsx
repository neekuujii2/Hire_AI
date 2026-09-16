"use client";

import { useEffect, useRef } from "react";
import { useRoom } from "@livekit/components-react";
import type { DataPacket } from "livekit-client";

interface ProctorMonitorProps {
  sessionId: string;
  /** Called when the proctor determines the interview should end. */
  onTerminate: (reason: string) => void;
  /** Called for each non-terminating warning. */
  onWarning?: (payload: {
    reason: string;
    count: number;
    max: number;
  }) => void;
}

/**
 * ProctorMonitor — invisible runtime guard for the live interview.
 *
 * Client-side event listeners (no UI of its own):
 *   - visibilitychange  → tab_switch
 *   - paste             → copy_paste
 *   - contextmenu       → preventDefault (no event sent; right-click is just blocked)
 *   - getDisplayMedia   → overridden to throw (screen_share_attempt)
 *
 * Also listens to LiveKit data-channel messages of type "proctor_warning" and
 * "interview_terminated" broadcast by the server-side proctor agent.
 *
 * Each client-side event POSTs to /api/sessions/[id]/warning. The response
 * carries back the updated warning_count + max and a terminate flag. When
 * terminate is true, onTerminate fires.
 */
export function ProctorMonitor({
  sessionId,
  onTerminate,
  onWarning,
}: ProctorMonitorProps) {
  const room = useRoom();
  const warnedCountRef = useRef(0);
  const terminatedRef = useRef(false);

  // POST a warning to the backend and handle the response.
  async function reportWarning(reason: string): Promise<void> {
    if (terminatedRef.current) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/warning`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        warning_count?: number;
        max_warnings?: number;
        terminate?: boolean;
      };
      if (!data.ok) return;

      const count = data.warning_count ?? 0;
      const max = data.max_warnings ?? 3;

      if (data.terminate) {
        terminatedRef.current = true;
        onTerminate(reason);
      } else if (count > warnedCountRef.current) {
        warnedCountRef.current = count;
        onWarning?.({ reason, count, max });
      }
    } catch {
      // Network error — don't interrupt the interview.
    }
  }

  // --- Browser event listeners ---
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        void reportWarning("tab_switch");
      }
    }
    function handlePaste() {
      void reportWarning("copy_paste");
    }
    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu, true);

    // Override getDisplayMedia to block screen sharing.
    const originalGetDisplayMedia =
      navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
    if (originalGetDisplayMedia) {
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        value: () => {
          void reportWarning("screen_share_attempt");
          return Promise.reject(new Error("Screen sharing is not permitted."));
        },
        configurable: true,
        writable: true,
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      if (originalGetDisplayMedia) {
        Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
          value: originalGetDisplayMedia,
          configurable: true,
          writable: true,
        });
      }
    };
  }, [sessionId, onTerminate, onWarning]);

  // --- LiveKit data-channel listener ---
  useEffect(() => {
    if (!room) return;

    const handler = (payload: DataPacket) => {
      // LiveKit data messages carry the payload as a Uint8Array.
      const raw = new TextDecoder().decode(payload.payload);
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      const type = msg.type as string | undefined;
      if (type === "interview_terminated") {
        terminatedRef.current = true;
        onTerminate(
          (msg.reason as string) ?? "Server terminated the interview.",
        );
        return;
      }
      if (type === "proctor_warning") {
        const reason = (msg.reason as string) ?? "policy_violation";
        onWarning?.({
          reason,
          count: (msg.count as number) ?? 0,
          max: (msg.max as number) ?? 3,
        });
        if (msg.terminate) {
          terminatedRef.current = true;
          onTerminate(reason);
        }
      }
    };

    room.on("dataReceived", handler);
    return () => {
      room.off("dataReceived", handler);
    };
  }, [room, onTerminate, onWarning]);

  // This component renders nothing.
  return null;
}
