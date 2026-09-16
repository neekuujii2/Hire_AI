"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Mic, Wifi } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMessages } from "@/lib/i18n/client";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CheckStatus = "idle" | "checking" | "pass" | "fail";

interface DeviceResult {
  camera: CheckStatus;
  microphone: CheckStatus;
  network: CheckStatus;
}

interface NetworkResult {
  down: boolean;
  up: boolean;
  latency: number | null;
}

/**
 * Device check form for the invite pipeline. Verifies camera, microphone, and
 * network connectivity. The candidate cannot proceed until all three pass.
 *
 * Camera gets a live preview via getUserMedia(video); mic gets a level meter
 * via an AudioContext AnalyserNode (same technique as the setup DeviceCheck).
 * Network is measured with a fetch round-trip to /api/health.
 *
 * All browser-API access happens inside handlers/effects so the component
 * SSRs cleanly. Streams + AudioContext are torn down on unmount.
 */
export function DeviceCheckForm({
  nextPath,
}: {
  /** Path to navigate to once all checks pass. */
  nextPath: string;
}) {
  const router = useRouter();
  const messages = useMessages();
  const [results, setResults] = useState<DeviceResult>({
    camera: "idle",
    microphone: "idle",
    network: "idle",
  });
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [net, setNet] = useState<NetworkResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const teardownMedia = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    camStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    camStreamRef.current = null;
    setCamStream(null);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => teardownMedia, [teardownMedia]);

  /* --- Camera check --- */
  const checkCamera = useCallback(async () => {
    setResults((r) => ({ ...r, camera: "checking" }));
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setResults((r) => ({ ...r, camera: "fail" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      camStreamRef.current = stream;
      setCamStream(stream);
      // Attach to the video element.
      if (videoRef.current) videoRef.current.srcObject = stream;
      setResults((r) => ({ ...r, camera: "pass" }));
    } catch {
      setResults((r) => ({ ...r, camera: "fail" }));
    }
  }, []);

  /* --- Microphone check --- */
  const checkMic = useCallback(async () => {
    setResults((r) => ({ ...r, microphone: "checking" }));
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setResults((r) => ({ ...r, microphone: "fail" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tracks = stream.getAudioTracks();

      type WindowWithWK = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as WindowWithWK).webkitAudioContext;

      if (!Ctor) {
        // Mic works but no metering API — still a pass.
        stream.getTracks().forEach((tr) => tr.stop());
        setResults((r) => ({ ...r, microphone: "pass" }));
        return;
      }

      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (((data[i] ?? 128) - 128) / 128);
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 2.4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Keep the mic active briefly for visual feedback, then stop.
      setTimeout(() => {
        teardownMedia();
      }, 3000);
      setResults((r) => ({ ...r, microphone: "pass" }));
    } catch {
      setResults((r) => ({ ...r, microphone: "fail" }));
    }
  }, [teardownMedia]);

  /* --- Network check --- */
  const checkNetwork = useCallback(async () => {
    setResults((r) => ({ ...r, network: "checking" }));
    try {
      const start = Date.now();
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        setNet({ down: true, up: true, latency });
        setResults((r) => ({ ...r, network: "pass" }));
      } else {
        setNet({ down: false, up: false, latency: null });
        setResults((r) => ({ ...r, network: "fail" }));
      }
    } catch {
      setNet({ down: false, up: false, latency: null });
      setResults((r) => ({ ...r, network: "fail" }));
    }
  }, []);

  // Run all checks once on mount.
  useEffect(() => {
    checkCamera();
    checkMic();
    checkNetwork();
  }, [checkCamera, checkMic, checkNetwork]);

  const allPassed =
    results.camera === "pass" &&
    results.microphone === "pass" &&
    results.network === "pass";

  const StatusIcon = ({ status }: { status: CheckStatus }) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-ok" aria-hidden />;
      case "fail":
        return <div className="h-5 w-5 rounded-full bg-accent" aria-hidden />;
      case "checking":
        return <div className="h-5 w-5 animate-pulse rounded-full bg-faint" aria-hidden />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[720px] px-6">
      <div className="reveal is-in">
        <h1 className="serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Device check
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
          We need to verify your camera, microphone, and internet connection
          before the interview can begin.
        </p>
      </div>

      {/* Camera preview + check */}
      <div className="mt-8 rounded-card border border-line bg-panel p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-ink" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Camera</p>
              <p className="text-[12px] text-muted">
                {results.camera === "pass"
                  ? "Ready"
                  : results.camera === "fail"
                    ? "Not available"
                    : "Checking..."}
              </p>
            </div>
          </div>
          <Badge variant={results.camera === "pass" ? "ok" : "outline"}>
            {results.camera === "pass" ? "PASS" : results.camera === "fail" ? "FAIL" : "CHECKING"}
          </Badge>
        </div>

        {results.camera === "pass" && camStream && (
          <div className="mt-4 aspect-video w-full max-w-md overflow-hidden rounded-[10px] bg-line">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Camera preview"
            />
          </div>
        )}
        {results.camera === "fail" && (
          <p className="mt-3 text-[13px] text-ink-soft">
            Please ensure a camera is connected and allow camera access when
            prompted.
          </p>
        )}
      </div>

      {/* Microphone check */}
      <div className="mt-4 rounded-card border border-line bg-panel p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mic className="h-5 w-5 text-ink" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Microphone</p>
              <p className="text-[12px] text-muted">
                {results.microphone === "pass"
                  ? "Working"
                  : results.microphone === "fail"
                    ? "Not available"
                    : "Checking..."}
              </p>
            </div>
          </div>
          <Badge variant={results.microphone === "pass" ? "ok" : "outline"}>
            {results.microphone === "pass" ? "PASS" : results.microphone === "fail" ? "FAIL" : "CHECKING"}
          </Badge>
        </div>

        {results.microphone === "check" || results.microphone === "pass" ? (
          <div className="mt-4 flex h-6 items-end gap-1" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => {
              const lit = Math.round(micLevel * 16);
              return (
                <span
                  key={i}
                  className={cn(
                    "w-1.5 flex-1 rounded-sm transition-colors",
                    i < lit ? "bg-accent" : "bg-line",
                  )}
                  style={{ height: `${20 + (i / 16) * 80}%` }}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Network check */}
      <div className="mt-4 rounded-card border border-line bg-panel p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wifi className="h-5 w-5 text-ink" />
            <div>
              <p className="text-[13px] font-semibold text-ink">Network</p>
              <p className="text-[12px] text-muted">
                {results.network === "pass" && net
                  ? `${net.latency}ms latency`
                  : results.network === "fail"
                    ? "Connection problem"
                    : "Checking..."}
              </p>
            </div>
          </div>
          <Badge variant={results.network === "pass" ? "ok" : "outline"}>
            {results.network === "pass" ? "PASS" : results.network === "fail" ? "FAIL" : "CHECKING"}
          </Badge>
        </div>
      </div>

      {/* Action */}
      <div className="mt-8 flex justify-center">
        {allPassed ? (
          <Button size="lg" onClick={() => router.push(nextPath)}>
            Continue to consent
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              checkCamera();
              checkMic();
              checkNetwork();
            }}
          >
            Re-check devices
          </Button>
        )}
      </div>
    </div>
  );
}
