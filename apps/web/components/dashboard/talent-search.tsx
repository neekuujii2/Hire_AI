"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

interface TalentCandidate {
  candidate_id: string;
  name: string;
  email: string;
  pipeline_status: string;
  job_title: string;
  seniority: string;
  overall_score: number | null;
  match_score: number | null;
  recommendation: string | null;
  skills: Array<{ name: string; score: number; level: string }>;
  summary: string | null;
  created_at: string;
}

const REC_COLORS: Record<string, string> = {
  strong_hire: "bg-ok/10 text-ok",
  hire: "bg-ok/10 text-ok",
  maybe: "bg-accent/10 text-accent",
  no_hire: "bg-muted/10 text-muted",
  strong_no_hire: "bg-accent/10 text-accent",
};

const REC_LABELS: Record<string, string> = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  maybe: "Maybe",
  no_hire: "No Hire",
  strong_no_hire: "Strong No Hire",
};

function MatchScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-faint">—</span>;
  const color =
    score >= 80 ? "text-ok" : score >= 60 ? "text-accent" : score >= 40 ? "text-muted" : "text-accent";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-10 w-10">
        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none" stroke="#e7e3da" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${(score / 100) * 100.5} 100.5`}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] font-semibold", color)}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

export function TalentSearch() {
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [candidates, setCandidates] = useState<TalentCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (skillFilter) params.set("skill", skillFilter);
      if (minScore > 0) params.set("min_score", String(minScore));

      const res = await fetch(`/api/talent-pool?${params}`);
      const data = await res.json();
      if (data.ok) {
        setCandidates(data.candidates);
      }
    } catch {
      // Error handled silently.
    } finally {
      setLoading(false);
    }
  }, [query, skillFilter, minScore]);

  useEffect(() => {
    search();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search by name, email, or skill..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Skill filter"
          value={skillFilter}
          onChange={(e) => setSkillFilter(e.target.value)}
          className="w-40"
        />
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value))}
          className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
        >
          <option value={0}>Any score</option>
          <option value={30}>30+</option>
          <option value={50}>50+</option>
          <option value={65}>65+</option>
          <option value={80}>80+</option>
        </select>
        <Button onClick={search} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {/* Results */}
      <div className="grid gap-3">
        {candidates.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-[13px] text-muted">
                No candidates found. Try adjusting your search filters.
              </p>
            </CardContent>
          </Card>
        )}

        {candidates.map((c) => (
          <Card key={c.candidate_id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <MatchScoreBadge score={c.match_score} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-medium text-ink truncate">{c.name}</p>
                    {c.recommendation && (
                      <Badge className={`text-[10px] ${REC_COLORS[c.recommendation] ?? ""}`}>
                        {REC_LABELS[c.recommendation] ?? c.recommendation}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {c.seniority}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-muted truncate">{c.email} · {c.job_title}</p>

                  {/* Skills */}
                  {c.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.skills.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {s.name} {s.score.toFixed(1)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {c.summary && (
                    <p className="mt-2 text-[12px] text-muted line-clamp-2">{c.summary}</p>
                  )}
                </div>

                <div className="flex gap-1 shrink-0">
                  <a href={`/dashboard/jobs/0/candidates/${c.candidate_id}`}>
                    <Button variant="ghost" size="sm">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
