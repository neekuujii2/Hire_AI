"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";

interface CandidateNpsProps {
  candidateId: string;
  jobTitle: string;
  companyName: string;
  alreadySubmitted?: boolean;
}

export function CandidateNps({
  candidateId,
  jobTitle,
  companyName,
  alreadySubmitted = false,
}: CandidateNpsProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [fair, setFair] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    try {
      await fetch(`/api/candidates/${candidateId}/nps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          nps_score: fair === true ? 9 : fair === false ? 5 : null,
          feedback_text: feedback.trim() || null,
        }),
      });
      setSubmitted(true);
    } catch {
      // Error handled silently.
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-ok/30 bg-ok/5">
        <CardContent className="py-8 text-center">
          <ThumbsUp className="mx-auto h-8 w-8 text-ok" />
          <p className="mt-3 text-[14px] font-medium text-ink">Thank you for your feedback!</p>
          <p className="mt-1 text-[12px] text-muted">
            Your response helps us improve the interview experience.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">How was your interview experience?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Star Rating */}
        <div>
          <p className="text-[12px] text-muted mb-2">Overall experience</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(star)}
                className="p-0.5"
              >
                <Star
                  className={cn(
                    "h-7 w-7 transition-colors",
                    star <= (hovered || rating)
                      ? "fill-accent text-accent"
                      : "text-line",
                  )}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              {rating <= 2
                ? "We're sorry to hear that"
                : rating <= 3
                  ? "Thanks for the feedback"
                  : rating <= 4
                    ? "Glad you had a good experience!"
                    : "Wonderful! Thank you!"}
            </p>
          )}
        </div>

        {/* Fair Question */}
        <div>
          <p className="text-[12px] text-muted mb-2">
            Was the AI fair and respectful?
          </p>
          <div className="flex gap-2">
            <Button
              variant={fair === true ? "ink" : "out"}
              size="sm"
              onClick={() => setFair(true)}
            >
              <ThumbsUp className="h-3 w-3 mr-1" />
              Yes
            </Button>
            <Button
              variant={fair === false ? "ink" : "out"}
              size="sm"
              onClick={() => setFair(false)}
            >
              <ThumbsDown className="h-3 w-3 mr-1" />
              No
            </Button>
          </div>
        </div>

        {/* Open Feedback */}
        <div>
          <p className="text-[12px] text-muted mb-2">
            Any additional feedback? (optional)
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Tell us how we can improve..."
            rows={3}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-[13px] text-ink placeholder:text-faint resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <Button onClick={handleSubmit} disabled={rating === 0 || submitting}>
          <MessageSquare className="h-3 w-3 mr-1" />
          {submitting ? "Submitting..." : "Submit Feedback"}
        </Button>
      </CardContent>
    </Card>
  );
}
