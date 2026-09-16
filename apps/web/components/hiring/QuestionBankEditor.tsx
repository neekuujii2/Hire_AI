"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  BankQuestionCategorySchema,
  moveItem,
  newQuestionId,
  normalizeWeights,
  type BankCompetency,
  type BankQuestion,
  type BankQuestionCategory,
  type BankRubric,
} from "@/lib/question-bank";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

export interface QuestionBankEditorProps {
  jobId: string;
  initialQuestions: BankQuestion[];
  initialRubric: BankRubric;
}

const CATEGORIES = BankQuestionCategorySchema.options;

const CATEGORY_LABEL: Record<BankQuestionCategory, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  culture_fit: "Culture fit",
};

type Draft = {
  text: string;
  category: BankQuestionCategory;
  difficulty: number;
  expected_keywords: string;
  follow_ups: string;
  time_limit_sec: number;
};

const EMPTY_DRAFT: Draft = {
  text: "",
  category: "technical",
  difficulty: 3,
  expected_keywords: "",
  follow_ups: "",
  time_limit_sec: 120,
};

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function DifficultyDots({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Difficulty ${n}`}
          aria-pressed={value === n}
          className={cn(
            "h-4 w-4 rounded-full border transition-colors",
            n <= value
              ? "bg-accent border-accent"
              : "bg-transparent border-line hover:border-ink",
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted tabular-nums">{value}/5</span>
    </div>
  );
}

export function QuestionBankEditor({
  jobId,
  initialQuestions,
  initialRubric,
}: QuestionBankEditorProps) {
  const [questions, setQuestions] = useState<BankQuestion[]>(initialQuestions);
  const [rubric, setRubric] = useState<BankRubric>(initialRubric);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<BankQuestion[] | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  function patchQuestion(id: string, patch: Partial<BankQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions((qs) => qs.filter((q) => q.id !== id));
  }

  function addFromDraft() {
    if (!draft.text.trim()) {
      setError("Question text is required.");
      return;
    }
    setError(null);
    setQuestions((qs) => [
      ...qs,
      {
        id: newQuestionId(),
        text: draft.text.trim(),
        category: draft.category,
        difficulty: draft.difficulty,
        expected_keywords: splitList(draft.expected_keywords),
        follow_ups: splitList(draft.follow_ups),
        time_limit_sec: Math.max(15, draft.time_limit_sec || 120),
      },
    ]);
    setDraft(EMPTY_DRAFT);
    setModalOpen(false);
  }

  function setCompetencyWeight(index: number, weight: number) {
    setRubric((r) => {
      const next: BankCompetency[] = r.competencies.map((c, i) =>
        i === index ? { ...c, weight } : c,
      );
      // Auto-normalize to 100% so sliders always sum to 1.0.
      return { competencies: normalizeWeights(next) };
    });
  }

  function setCompetencyName(index: number, name: string) {
    setRubric((r) => ({
      competencies: r.competencies.map((c, i) =>
        i === index ? { ...c, name } : c,
      ),
    }));
  }

  function addCompetency() {
    setRubric((r) => ({
      competencies: normalizeWeights([
        ...r.competencies,
        { name: "New competency", weight: 1 },
      ]),
    }));
  }

  function removeCompetency(index: number) {
    setRubric((r) => {
      if (r.competencies.length <= 1) return r;
      return {
        competencies: normalizeWeights(
          r.competencies.filter((_, i) => i !== index),
        ),
      };
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/questions/generate`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Generation failed");
      setPreview(json.questions as BankQuestion[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/questions`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questions, rubric }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Save failed");
      showToast("ok", "Question bank saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      showToast("err", msg);
    } finally {
      setSaving(false);
    }
  }

  const rubricTotal = rubric.competencies.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Question bank</CardTitle>
              <CardDescription>
                {questions.length} question{questions.length === 1 ? "" : "s"} · drag rows
                to reorder
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="out"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating && <Spinner />}
                {generating ? "Generating…" : "Generate from JD"}
              </Button>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                Add question
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="w-8 py-2 pr-2 font-medium" aria-label="Reorder" />
                  <th className="py-2 pr-3 font-medium">Question</th>
                  <th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 font-medium">Difficulty</th>
                  <th className="py-2 pr-3 font-medium">Time (s)</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q, i) => (
                  <tr
                    key={q.id}
                    draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom !== null) setQuestions((qs) => moveItem(qs, dragFrom, i));
                      setDragFrom(null);
                    }}
                    onDragEnd={() => setDragFrom(null)}
                    className={cn(
                      "border-t border-line align-top",
                      dragFrom === i && "opacity-50",
                    )}
                  >
                    <td
                      className="cursor-grab py-3 pr-2 text-muted select-none"
                      title="Drag to reorder"
                      aria-hidden
                    >
                      ⋮⋮
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={2}
                        value={q.text}
                        onChange={(e) => patchQuestion(q.id, { text: e.target.value })}
                        aria-label={`Question ${i + 1} text`}
                      />
                      <Input
                        className="mt-2"
                        value={q.expected_keywords.join(", ")}
                        onChange={(e) =>
                          patchQuestion(q.id, {
                            expected_keywords: splitList(e.target.value),
                          })
                        }
                        placeholder="Expected keywords (comma separated)"
                        aria-label={`Question ${i + 1} keywords`}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <select
                        value={q.category}
                        onChange={(e) =>
                          patchQuestion(q.id, {
                            category: e.target.value as BankQuestionCategory,
                          })
                        }
                        aria-label={`Question ${i + 1} category`}
                        className="rounded-[10px] border border-line bg-panel px-2.5 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                          </option>
                        ))}
                      </select>
                      <div className="mt-2">
                        <Badge variant="outline">{CATEGORY_LABEL[q.category]}</Badge>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <DifficultyDots
                        value={q.difficulty}
                        onChange={(v) => patchQuestion(q.id, { difficulty: v })}
                        label={`Question ${i + 1} difficulty`}
                      />
                      <Input
                        className="mt-2"
                        value={q.follow_ups.join("\n")}
                        onChange={(e) =>
                          patchQuestion(q.id, { follow_ups: splitList(e.target.value) })
                        }
                        placeholder="Follow-ups (comma separated)"
                        aria-label={`Question ${i + 1} follow-ups`}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        type="number"
                        min={15}
                        step={15}
                        value={q.time_limit_sec}
                        onChange={(e) =>
                          patchQuestion(q.id, {
                            time_limit_sec: Math.max(15, Number(e.target.value) || 15),
                          })
                        }
                        aria-label={`Question ${i + 1} time limit`}
                        className="w-24"
                      />
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(q.id)}
                        aria-label={`Remove question ${i + 1}`}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
                {questions.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={6} className="py-6 text-center text-muted">
                      No questions yet — add one or generate from the JD.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {preview && (
            <div className="mt-4 rounded-[10px] border border-dashed border-line p-4">
              <p className="text-sm font-medium text-ink">
                AI preview ({preview.length}) — review before saving
              </p>
              <ul className="mt-2 flex flex-col gap-2 text-sm text-ink-soft">
                {preview.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-3">
                    <span>
                      <Badge variant="outline" className="mr-2">
                        {CATEGORY_LABEL[q.category]}
                      </Badge>
                      {q.text}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{q.difficulty}/5</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setQuestions((qs) => [...qs, ...preview]);
                    setPreview(null);
                    showToast("ok", "Preview added — review then save.");
                  }}
                >
                  Accept preview
                </Button>
                <Button variant="out" size="sm" onClick={() => setPreview(null)}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Rubric</CardTitle>
              <CardDescription>
                Weights auto-normalize to 100% · total{" "}
                {Math.round(rubricTotal * 100)}%
              </CardDescription>
            </div>
            <Button variant="out" size="sm" onClick={addCompetency}>
              Add competency
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rubric.competencies.map((c, i) => (
            <div key={`${c.name}-${i}`} className="flex items-center gap-3">
              <div className="flex-1">
                <Label htmlFor={`comp-name-${i}`}>Competency {i + 1}</Label>
                <Input
                  id={`comp-name-${i}`}
                  value={c.name}
                  onChange={(e) => setCompetencyName(i, e.target.value)}
                />
              </div>
              <div className="w-48">
                <Label htmlFor={`comp-weight-${i}`}>
                  Weight · {Math.round(c.weight * 100)}%
                </Label>
                <input
                  id={`comp-weight-${i}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={c.weight}
                  onChange={(e) => setCompetencyWeight(i, Number(e.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeCompetency(i)}
                disabled={rubric.competencies.length <= 1}
                aria-label={`Remove ${c.name}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Spinner />}
          {saving ? "Saving…" : "Save question bank"}
        </Button>
        <span className="text-sm text-muted">
          Weights must sum to 100% — enforced on save.
        </span>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add question"
          onClick={() => setModalOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
            <Card>
              <CardHeader>
                <CardTitle>Add question</CardTitle>
                <CardDescription>
                  Draft a new bank question — it joins the table on add.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div>
                  <Label htmlFor="draft-text">Question text</Label>
                  <Textarea
                    id="draft-text"
                    value={draft.text}
                    onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                    placeholder="e.g. How would you design…"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label htmlFor="draft-category">Category</Label>
                    <select
                      id="draft-category"
                      value={draft.category}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          category: e.target.value as BankQuestionCategory,
                        }))
                      }
                      className="w-full rounded-[10px] border border-line bg-panel px-3.5 py-2.5 text-[14.5px] text-ink focus:border-accent focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <Label>Difficulty</Label>
                    <DifficultyDots
                      value={draft.difficulty}
                      onChange={(v) => setDraft((d) => ({ ...d, difficulty: v }))}
                      label="New question difficulty"
                    />
                  </div>
                  <div className="w-28">
                    <Label htmlFor="draft-time">Time (s)</Label>
                    <Input
                      id="draft-time"
                      type="number"
                      min={15}
                      step={15}
                      value={draft.time_limit_sec}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          time_limit_sec: Number(e.target.value) || 120,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="draft-keywords">Expected keywords (comma separated)</Label>
                  <Input
                    id="draft-keywords"
                    value={draft.expected_keywords}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, expected_keywords: e.target.value }))
                    }
                    placeholder="idempotency, kafka, p99"
                  />
                </div>
                <div>
                  <Label htmlFor="draft-followups">Follow-ups (comma separated)</Label>
                  <Input
                    id="draft-followups"
                    value={draft.follow_ups}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, follow_ups: e.target.value }))
                    }
                    placeholder="What trade-offs…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="out" onClick={() => setModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={addFromDraft}>Add to bank</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[10px] border px-4 py-2.5 text-sm shadow-lg",
            toast.kind === "ok"
              ? "bg-[#E8F3EC] text-ok border-transparent"
              : "bg-red-50 text-red-700 border-red-200",
          )}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
