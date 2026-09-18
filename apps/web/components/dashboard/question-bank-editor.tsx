"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Question {
  id: string;
  text: string;
  category: "technical" | "behavioral" | "culture_fit";
  difficulty: number;
  expected_keywords: string[];
  follow_ups: string[];
  time_limit_sec: number;
}

interface Competency {
  name: string;
  weight: number;
}

interface QuestionBankEditorProps {
  jobId: string;
  initialQuestions?: Question[];
  initialCompetencies?: Competency[];
  onSave?: () => void;
}

const CATEGORIES = ["technical", "behavioral", "culture_fit"] as const;
const CATEGORY_COLORS: Record<string, string> = {
  technical: "bg-blue-100 text-blue-800",
  behavioral: "bg-purple-100 text-purple-800",
  culture_fit: "bg-green-100 text-green-800",
};

function makeId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function DifficultyDots({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={cn(
            "h-3 w-3 rounded-full border transition-colors",
            d <= value ? "bg-accent border-accent" : "bg-muted border-line",
          )}
        />
      ))}
    </div>
  );
}

export function QuestionBankEditor({
  jobId,
  initialQuestions = [],
  initialCompetencies = [],
  onSave,
}: QuestionBankEditorProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [competencies, setCompetencies] = useState<Competency[]>(initialCompetencies);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [
      ...prev,
      {
        id: makeId(),
        text: "",
        category: "technical",
        difficulty: 3,
        expected_keywords: [],
        follow_ups: [],
        time_limit_sec: 120,
      },
    ]);
  }, []);

  const removeQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const updateQuestion = useCallback((id: string, patch: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const moveQuestion = useCallback((id: string, direction: -1 | 1) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      next.splice(newIdx, 0, removed!);
      return next;
    });
  }, []);

  const addCompetency = useCallback(() => {
    setCompetencies((prev) => [...prev, { name: "", weight: 0.25 }]);
  }, []);

  const updateCompetency = useCallback((idx: number, patch: Partial<Competency>) => {
    setCompetencies((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }, []);

  const removeCompetency = useCallback((idx: number) => {
    setCompetencies((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const normalizeWeights = useCallback(() => {
    const total = competencies.reduce((s, c) => s + c.weight, 0);
    if (total === 0) return;
    setCompetencies((prev) => prev.map((c) => ({ ...c, weight: c.weight / total })));
  }, [competencies]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/questions/generate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.questions) {
          setQuestions((prev) => [...prev, ...data.questions.map((q: Question) => ({ ...q, id: makeId() }))]);
        }
      }
    } catch {
      // Error handled silently.
    } finally {
      setGenerating(false);
    }
  }, [jobId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/jobs/${jobId}/questions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions,
          rubric: { competencies },
        }),
      });
      onSave?.();
      router.refresh();
    } catch {
      // Error handled silently.
    } finally {
      setSaving(false);
    }
  }, [jobId, questions, competencies, onSave, router]);

  return (
    <div className="space-y-6">
      {/* Rubric Section */}
      <Card>
        <CardHeader>
          <CardTitle>Scoring Rubric</CardTitle>
          <CardDescription>
            Define competencies and their weights. Weights should sum to 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {competencies.map((c, i) => (
            <div key={i} className="flex items-center gap-3">
              <Input
                placeholder="Competency name"
                value={c.name}
                onChange={(e) => updateCompetency(i, { name: e.target.value })}
                className="flex-1"
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={c.weight}
                onChange={(e) => updateCompetency(i, { weight: parseFloat(e.target.value) || 0 })}
                className="w-20 rounded-md border border-line bg-panel px-3 py-2 text-sm"
              />
              <span className="text-[12px] text-muted w-10">
                {Math.round(c.weight * 100)}%
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeCompetency(i)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="out" size="sm" onClick={addCompetency}>
              <Plus className="h-3 w-3 mr-1" />
              Add Competency
            </Button>
            <Button variant="ghost" size="sm" onClick={normalizeWeights}>
              Normalize to 100%
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Questions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Question Bank</CardTitle>
            <CardDescription>
              {questions.length} question{questions.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="out"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {generating ? "Generating..." : "Generate from JD"}
            </Button>
            <Button size="sm" onClick={addQuestion}>
              <Plus className="h-3 w-3 mr-1" />
              Add Question
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.length === 0 && (
            <p className="text-center text-[13px] text-muted py-8">
              No questions yet. Add one manually or generate from the job description.
            </p>
          )}

          {questions.map((q, idx) => {
            const expanded = expandedId === q.id;
            return (
              <div
                key={q.id}
                className="rounded-lg border border-line bg-panel overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <GripVertical className="h-4 w-4 text-faint shrink-0 cursor-grab" />
                  <span className="text-[12px] text-faint w-6 text-right">{idx + 1}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] shrink-0", CATEGORY_COLORS[q.category])}
                  >
                    {q.category}
                  </Badge>
                  <DifficultyDots
                    value={q.difficulty}
                    onChange={(d) => updateQuestion(q.id, { difficulty: d })}
                  />
                  <p className="flex-1 text-[13px] text-ink truncate">
                    {q.text || "(empty question)"}
                  </p>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveQuestion(q.id, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moveQuestion(q.id, 1)}
                      disabled={idx === questions.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expanded ? null : q.id)}
                    >
                      {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeQuestion(q.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-line px-3 py-3 space-y-3">
                    <div>
                      <label className="text-[12px] font-medium text-muted">Question Text</label>
                      <Textarea
                        value={q.text}
                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[12px] font-medium text-muted">Category</label>
                        <select
                          value={q.category}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              category: e.target.value as Question["category"],
                            })
                          }
                          className="mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-muted">Time Limit (sec)</label>
                        <input
                          type="number"
                          min={30}
                          max={600}
                          value={q.time_limit_sec}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              time_limit_sec: parseInt(e.target.value) || 120,
                            })
                          }
                          className="mt-1 block w-full rounded-md border border-line bg-panel px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-muted">Follow-ups</label>
                        <Input
                          placeholder="Comma-separated"
                          value={q.follow_ups.join(", ")}
                          onChange={(e) =>
                            updateQuestion(q.id, {
                              follow_ups: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {questions.length > 0 && (
            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Question Bank"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
