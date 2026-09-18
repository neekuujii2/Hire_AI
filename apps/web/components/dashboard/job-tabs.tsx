"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Users,
  FileText,
  Settings,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QuestionBankEditor } from "./question-bank-editor";

interface Candidate {
  id: string;
  name: string;
  email: string;
  pipeline_status: string;
  created_at: string;
  session_id: string | null;
  overall_score: number | null;
}

const TABS = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "candidates", label: "Candidates", icon: Users },
  { key: "questions", label: "Questions", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

const PIPELINE_STYLES: Record<string, string> = {
  invited: "bg-faint/10 text-faint",
  link_opened: "bg-accent/10 text-accent",
  interview_started: "bg-accent/10 text-accent",
  interview_completed: "bg-ok/10 text-ok",
  interview_terminated: "bg-accent/10 text-accent",
  shortlisted: "bg-ok/10 text-ok",
  rejected: "bg-muted/10 text-muted",
  on_hold: "bg-accent/10 text-accent",
  hired: "bg-ok/10 text-ok",
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-faint";
  if (score >= 4) return "text-ok";
  if (score >= 3) return "text-accent";
  return "text-muted";
}

export function JobTabs({
  jobId,
  candidates,
  avgScore,
}: {
  jobId: string;
  candidates: Candidate[];
  avgScore: number;
}) {
  const [activeTab, setActiveTab] = useState<string>("overview");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors",
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <OverviewTab candidates={candidates} avgScore={avgScore} />
        )}
        {activeTab === "candidates" && (
          <CandidatesTab jobId={jobId} candidates={candidates} />
        )}
        {activeTab === "questions" && (
          <QuestionsTab jobId={jobId} />
        )}
        {activeTab === "settings" && (
          <SettingsTab jobId={jobId} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  candidates,
  avgScore,
}: {
  candidates: Candidate[];
  avgScore: number;
}) {
  const recent = candidates.filter((c) => c.overall_score !== null).slice(0, 5);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Avg score donut */}
      <Card>
        <CardHeader>
          <CardTitle>Average Score</CardTitle>
          <CardDescription>Across all scored candidates.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center pb-6">
          <div className="relative flex h-32 w-32 items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#e7e3da"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="#4338ca"
                strokeWidth="8"
                strokeDasharray={`${(avgScore / 5) * 327} 327`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-center">
              <p className="font-serif text-3xl text-ink">{avgScore}</p>
              <p className="text-[11px] text-muted">/5</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent completions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Completions</CardTitle>
          <CardDescription>Latest scored candidates.</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No scored candidates yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/jobs/${c.id}/candidates/${c.id}`}
                  className="flex items-center justify-between rounded-[8px] border border-line px-3 py-2.5 no-underline transition-colors hover:bg-paper"
                >
                  <div>
                    <p className="text-[13px] font-medium text-ink">{c.name}</p>
                    <p className="text-[12px] text-muted">{c.email}</p>
                  </div>
                  <span className={cn("font-serif text-lg", scoreColor(c.overall_score))}>
                    {c.overall_score?.toFixed(1) ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CandidatesTab({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: Candidate[];
}) {
  const [view, setView] = useState<"table" | "kanban">("table");

  const columns = [
    { key: "invited", label: "Invited", filter: ["invited", "link_opened"] },
    { key: "in_progress", label: "In Progress", filter: ["interview_started"] },
    { key: "completed", label: "Completed", filter: ["interview_completed"] },
    { key: "shortlisted", label: "Shortlisted", filter: ["shortlisted"] },
    { key: "rejected", label: "Rejected", filter: ["rejected"] },
  ] as const;

  return (
    <div>
      {/* View toggle */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView("table")}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
            view === "table"
              ? "bg-accent text-white"
              : "bg-panel text-muted hover:text-ink",
          )}
        >
          Table
        </button>
        <button
          type="button"
          onClick={() => setView("kanban")}
          className={cn(
            "rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
            view === "kanban"
              ? "bg-accent text-white"
              : "bg-panel text-muted hover:text-ink",
          )}
        >
          Kanban
        </button>
      </div>

      {view === "table" ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 font-medium text-muted">Name</th>
                    <th className="px-4 py-3 font-medium text-muted">Email</th>
                    <th className="px-4 py-3 font-medium text-muted">Score</th>
                    <th className="px-4 py-3 font-medium text-muted">Status</th>
                    <th className="px-4 py-3 font-medium text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-muted"
                      >
                        No candidates yet.
                      </td>
                    </tr>
                  ) : (
                    candidates.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-ink">
                          {c.name}
                        </td>
                        <td className="px-4 py-3 text-muted">{c.email}</td>
                        <td
                          className={cn(
                            "px-4 py-3 font-serif",
                            scoreColor(c.overall_score),
                          )}
                        >
                          {c.overall_score?.toFixed(1) ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={`text-[10px] capitalize ${PIPELINE_STYLES[c.pipeline_status] ?? ""}`}
                          >
                            {c.pipeline_status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/jobs/${c.id}/candidates/${c.id}`}
                            className="text-[12px] text-accent no-underline hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {columns.map((col) => {
            const items = candidates.filter((c) =>
              (col.filter as readonly string[]).includes(c.pipeline_status),
            );
            return (
              <div key={col.key}>
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                  {col.label}
                  <span className="ml-1.5 text-muted">({items.length})</span>
                </p>
                <div className="space-y-2">
                  {items.map((c) => (
                    <Link
                      key={c.id}
                      href={`/dashboard/jobs/${c.id}/candidates/${c.id}`}
                      className="block rounded-[8px] border border-line bg-panel p-3 no-underline transition-shadow hover:shadow-sm"
                    >
                      <p className="text-[13px] font-medium text-ink">
                        {c.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {c.email}
                      </p>
                      {c.overall_score !== null && (
                        <p
                          className={cn(
                            "mt-1 font-serif text-sm",
                            scoreColor(c.overall_score),
                          )}
                        >
                          {c.overall_score.toFixed(1)}/5
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionsTab({ jobId }: { jobId: string }) {
  const [questions, setQuestions] = useState<any[]>([]);
  const [competencies, setCompetencies] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/questions`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setQuestions(data.questions ?? []);
          setCompetencies(data.rubric?.competencies ?? []);
        }
      })
      .catch(() => {});
  }, [jobId]);

  return (
    <QuestionBankEditor
      jobId={jobId}
      initialQuestions={questions}
      initialCompetencies={competencies}
    />
  );
}

function SettingsTab({ jobId }: { jobId: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm text-muted">
          Job settings coming soon.
        </p>
      </CardContent>
    </Card>
  );
}
