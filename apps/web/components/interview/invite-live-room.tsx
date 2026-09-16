"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Mic, MicOff, Video, VideoOff, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InviteLiveRoomProps {
  sessionId: string;
  token: string | null;
  url: string | null;
  persona: { id: string; name: string; style: string };
  companyName: string;
  orgLogo?: string;
  interviewDurationMin: number;
  totalQuestions: number;
  initialCursor: number;
  answeredCount: number;
}

interface TranscriptLine {
  role: "ai" | "candidate";
  text: string;
  timestamp: string;
}

interface ProctoringWarning {
  id: string;
  message: string;
  warningNumber: number;
  maxWarnings: number;
}

/**
 * Live interview room for the candidate-facing invite pipeline.
 *
 * Layout:
 * - LEFT (60%): AI avatar, mic status, question progress, controls
 * - RIGHT (40%): candidate webcam, recording indicator, live transcript
 *
 * Proctoring: invisible ProctorMonitor handles visibilitychange, paste events.
 */
export function InviteLiveRoom({
  sessionId,
  token,
  url,
  persona,
  companyName,
  orgLogo,
  interviewDurationMin,
  totalQuestions,
  initialCursor,
  answeredCount,
}: InviteLiveRoomProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(answeredCount + 1);
  const [warnings, setWarnings] = useState<ProctoringWarning[]>([]);
  const [sessionStatus, setSessionStatus] = useState<"live" | "completed" | "terminated">("live");
  const [elapsed, setElapsed] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Camera preview
  useEffect(() => {
    if (!cameraEnabled) {
      cameraStream?.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        setCameraStream(stream);
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {});
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proctoring: tab switch detection
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        reportWarning("Tab switch detected");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proctoring: paste detection
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportWarning("Copy-paste detected");
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Proctoring: right-click detection
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      reportWarning("Right-click detected");
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll session status
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "complete") {
            setSessionStatus("completed");
            router.push(`/invite/${getToken()}/complete`);
          } else if (data.status === "interview_terminated") {
            setSessionStatus("terminated");
          }
          if (data.current_question) {
            setCurrentQuestion(data.current_question);
          }
        }
      } catch {
        // Error handled silently.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionId, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll transcript
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/transcript`);
        if (res.ok) {
          const data = await res.json();
          if (data.transcript) {
            setTranscript(data.transcript);
          }
        }
      } catch {
        // Error handled silently.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const reportWarning = useCallback(
    async (message: string) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/warning`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_type: "tab_switch", details: message }),
        });
        if (res.ok) {
          const data = await res.json();
          const warning: ProctoringWarning = {
            id: `w-${Date.now()}`,
            message,
            warningNumber: data.warning_number ?? 0,
            maxWarnings: data.max_warnings ?? 3,
          };
          setWarnings((prev) => [...prev, warning]);
          setTimeout(() => {
            setWarnings((prev) => prev.filter((w) => w.id !== warning.id));
          }, 5000);
        }
      } catch {
        // Error handled silently.
      }
    },
    [sessionId],
  );

  function getToken(): string {
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/");
    return parts[2] ?? "";
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen bg-paper">
      {/* LEFT PANEL — AI Avatar + Controls */}
      <div className="flex flex-col items-center justify-between w-[60%] border-r border-line p-6">
        {/* Header */}
        <div className="flex items-center gap-3 w-full">
          {orgLogo && (
            <img src={orgLogo} alt="" className="h-8 w-8 rounded" />
          )}
          <div>
            <p className="text-[13px] font-medium text-ink">{companyName}</p>
            <p className="text-[11px] text-muted">{formatTime(elapsed)}</p>
          </div>
        </div>

        {/* AI Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              "relative h-32 w-32 rounded-full border-4 transition-colors",
              speaking ? "border-ok bg-ok/5" : "border-line bg-panel",
            )}
          >
            <div className="flex h-full w-full items-center justify-center text-4xl font-medium text-ink-soft">
              {persona.name.charAt(0)}
            </div>
            {speaking && (
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-ok animate-pulse" />
            )}
          </div>
          <div className="text-center">
            <p className="text-[15px] font-medium text-ink">{persona.name}</p>
            <p className="text-[12px] text-muted">Hiring Manager, {companyName}</p>
          </div>
        </div>

        {/* Mic Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5">
            <div className="h-2 w-2 rounded-full bg-ok animate-pulse" />
            <span className="text-[12px] text-ink-soft">
              {micEnabled ? "Listening..." : "Mic muted"}
            </span>
          </div>
        </div>

        {/* Question Progress */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalQuestions }, (_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i < currentQuestion - 1
                  ? "bg-ok"
                  : i === currentQuestion - 1
                    ? "bg-accent"
                    : "bg-line",
              )}
            />
          ))}
          <span className="ml-2 text-[12px] text-muted">
            Question {currentQuestion} of {totalQuestions}
          </span>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            variant={micEnabled ? "ink" : "out"}
            size="sm"
            onClick={() => setMicEnabled(!micEnabled)}
          >
            {micEnabled ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant={cameraEnabled ? "ink" : "out"}
            size="sm"
            onClick={() => setCameraEnabled(!cameraEnabled)}
          >
            {cameraEnabled ? (
              <Video className="h-4 w-4" />
            ) : (
              <VideoOff className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* RIGHT PANEL — Webcam + Transcript */}
      <div className="flex flex-col w-[40%] bg-panel">
        {/* Webcam Preview */}
        <div className="relative h-48 border-b border-line">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-medium text-white">REC</span>
          </div>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
        >
          {transcript.length === 0 && (
            <p className="text-center text-[13px] text-muted py-8">
              Transcript will appear here...
            </p>
          )}
          {transcript.map((line, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                line.role === "candidate" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-[10px] px-3 py-2 text-[13px]",
                  line.role === "candidate"
                    ? "bg-ink text-white"
                    : "bg-line text-ink",
                )}
              >
                <p className="text-[10px] font-medium opacity-60 mb-1">
                  {line.role === "ai" ? persona.name : "You"}
                </p>
                <p>{line.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proctoring Warnings (absolute top center) */}
      {warnings.map((w) => (
        <div
          key={w.id}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-accent bg-accent-soft px-4 py-3 shadow-lg"
        >
          <AlertTriangle className="h-4 w-4 text-accent shrink-0" />
          <span className="text-[13px] text-ink">
            {w.message} — Warning {w.warningNumber} of {w.maxWarnings}
          </span>
        </div>
      ))}

      {/* Termination Screen */}
      {sessionStatus === "terminated" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-xl bg-panel p-8 text-center shadow-2xl">
            <AlertTriangle className="mx-auto h-12 w-12 text-accent" />
            <h2 className="serif mt-4 text-2xl font-medium text-ink">
              Interview Terminated
            </h2>
            <p className="mt-3 text-[14px] text-muted">
              Your interview has been terminated due to policy violations. The
              hiring team has been notified.
            </p>
            <Button
              variant="out"
              className="mt-6"
              onClick={() => router.push(`/invite/${getToken()}/complete`)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
