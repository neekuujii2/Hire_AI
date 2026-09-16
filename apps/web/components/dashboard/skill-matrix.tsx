"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface Skill {
  name: string;
  score: number;
  level: string;
  evidence?: string;
}

interface SkillMatrixProps {
  skills: Skill[];
  showEvidence?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  strong: "text-ok",
  solid: "text-ok/70",
  developing: "text-accent",
  weak: "text-accent",
};

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color =
    score >= 4 ? "bg-ok" : score >= 3 ? "bg-ok/60" : score >= 2 ? "bg-accent" : "bg-accent/60";

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-line">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] font-medium text-ink w-8">{score.toFixed(1)}</span>
    </div>
  );
}

export function SkillMatrix({ skills, showEvidence = false }: SkillMatrixProps) {
  if (skills.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-[13px] text-muted">No skill data available.</p>
        </CardContent>
      </Card>
    );
  }

  const avgScore = skills.reduce((s, sk) => s + sk.score, 0) / skills.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[14px]">Skill Assessment</CardTitle>
          <Badge variant="outline" className="text-[11px]">
            Avg: {avgScore.toFixed(1)}/5
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {skills
            .sort((a, b) => b.score - a.score)
            .map((skill, i) => (
              <div key={i} className="flex items-center gap-3">
                <p className="w-36 text-[13px] text-ink truncate shrink-0">{skill.name}</p>
                <ScoreBar score={skill.score} />
                <Badge
                  variant="outline"
                  className={cn("text-[10px] shrink-0", LEVEL_COLORS[skill.level])}
                >
                  {skill.level}
                </Badge>
              </div>
            ))}
        </div>

        {showEvidence && skills.some((s) => s.evidence) && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <p className="text-[12px] font-medium text-muted">Evidence</p>
            {skills
              .filter((s) => s.evidence)
              .map((skill, i) => (
                <div key={i} className="text-[12px] text-muted">
                  <span className="font-medium text-ink">{skill.name}:</span>{" "}
                  {skill.evidence}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
