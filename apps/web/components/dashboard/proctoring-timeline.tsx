import { AlertTriangle, XCircle, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ProctorEvent {
  id: string;
  event_type: string;
  warning_number: number;
  severity: string;
  occurred_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  tab_switch: "Tab switch detected",
  no_face_visible: "Face not visible",
  multiple_faces: "Multiple people detected",
  copy_paste: "Copy-paste attempt",
  screen_share_attempt: "Screen sharing blocked",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "border-faint bg-faint/5",
  medium: "border-accent bg-accent/5",
  high: "border-accent bg-accent/10",
  critical: "border-accent bg-accent/15",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProctoringTimeline({ events }: { events: ProctorEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proctoring Events</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-center text-sm text-ok">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            No issues detected
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className={`rounded-[8px] border px-3 py-2.5 ${SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.low}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {event.severity === "high" || event.severity === "critical" ? (
                      <XCircle className="h-3.5 w-3.5 text-accent" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-accent" aria-hidden />
                    )}
                    <span className="text-[13px] font-medium text-ink">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatTime(event.occurred_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  Warning {event.warning_number}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
