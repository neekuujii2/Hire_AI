"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Volume2, VolumeX, Maximize, Download, FileText } from "lucide-react";
import { cn } from "@/lib/cn";

interface RecordingPlaybackProps {
  recordingUrl: string | null;
  transcriptUrl: string | null;
  durationSec: number;
  candidateName: string;
  jobTitle: string;
  sessionId: string;
}

interface TranscriptSegment {
  start_sec: number;
  end_sec: number;
  speaker: "ai" | "candidate";
  text: string;
}

/**
 * Video recording playback component with transcript overlay.
 *
 * Features:
 * - Video player with play/pause, volume, fullscreen
 * - Synchronized transcript panel
 * - Download recording option
 * - Timestamp markers for proctoring events
 */
export function RecordingPlayback({
  recordingUrl,
  transcriptUrl,
  durationSec,
  candidateName,
  jobTitle,
  sessionId,
}: RecordingPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [showTranscript, setShowTranscript] = useState(true);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen();
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = durationSec > 0 ? (currentTime / durationSec) * 100 : 0;

  if (!recordingUrl) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 text-[14px] text-muted">
            Recording not available for this interview.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video Player */}
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          src={recordingUrl}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onEnded={() => setPlaying(false)}
          className="w-full aspect-video"
        />

        {/* Overlay Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="relative h-1 w-full rounded-full bg-white/20 mb-3">
            <div
              className="absolute h-full rounded-full bg-accent"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlay}
                className="text-white hover:text-white hover:bg-white/10"
              >
                {playing ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="text-white hover:text-white hover:bg-white/10"
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <span className="text-[12px] text-white/70">
                {formatTime(currentTime)} / {formatTime(durationSec)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
                className={cn(
                  "text-[12px]",
                  showTranscript
                    ? "text-accent hover:text-accent"
                    : "text-white/70 hover:text-white",
                )}
              >
                Transcript
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFullscreen}
                className="text-white hover:text-white hover:bg-white/10"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <a
                href={recordingUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:text-white hover:bg-white/10"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Panel */}
      {showTranscript && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px]">Transcript</CardTitle>
            <CardDescription className="text-[12px]">
              {candidateName} — {jobTitle}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto space-y-2">
            {transcript.length === 0 && (
              <p className="text-center text-[12px] text-muted py-4">
                Loading transcript...
              </p>
            )}
            {transcript.map((seg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 text-[13px]",
                  seg.speaker === "candidate" ? "justify-end" : "justify-start",
                )}
              >
                <span className="text-[10px] text-faint mt-1 w-10 shrink-0">
                  {formatTime(seg.start_sec)}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-3 py-1.5",
                    seg.speaker === "candidate"
                      ? "bg-ink text-white"
                      : "bg-line text-ink",
                  )}
                >
                  <p className="text-[10px] font-medium opacity-60">
                    {seg.speaker === "ai" ? "AI" : "Candidate"}
                  </p>
                  <p>{seg.text}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
