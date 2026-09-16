import { z } from "zod";

/**
 * HireAI question-bank contracts (web-local).
 *
 * Kept in `apps/web` (not `packages/shared`) on purpose: shared schemas feed
 * the Zod→Pydantic parity test, and the hiring-dashboard bank shape is a
 * distinct HR-authored model from the agent's `PlannedQuestion`.
 *
 * Table mapping (supabase/migrations/0007_hireai_schema.sql):
 * - `question_banks.questions` jsonb <-> BankQuestion[]
 * - `question_banks.rubric` jsonb   <-> BankRubric
 */

export const BankQuestionCategorySchema = z.enum([
  "technical",
  "behavioral",
  "culture_fit",
]);
export type BankQuestionCategory = z.infer<typeof BankQuestionCategorySchema>;

export const BankQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  category: BankQuestionCategorySchema,
  difficulty: z.number().int().min(1).max(5),
  expected_keywords: z.array(z.string()).default([]),
  follow_ups: z.array(z.string()).default([]),
  time_limit_sec: z.number().int().positive().default(120),
});
export type BankQuestion = z.infer<typeof BankQuestionSchema>;

export const BankCompetencySchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
});
export type BankCompetency = z.infer<typeof BankCompetencySchema>;

const WEIGHT_TOLERANCE = 1e-6;

export const BankRubricSchema = z
  .object({
    competencies: z.array(BankCompetencySchema).min(1),
  })
  .refine(
    (rubric) =>
      Math.abs(
        rubric.competencies.reduce((sum, c) => sum + c.weight, 0) - 1,
      ) <= WEIGHT_TOLERANCE,
    { message: "Rubric weights must sum to 1.0" },
  );
export type BankRubric = z.infer<typeof BankRubricSchema>;

export const QuestionBankPayloadSchema = z.object({
  questions: z.array(BankQuestionSchema),
  rubric: BankRubricSchema,
});
export type QuestionBankPayload = z.infer<typeof QuestionBankPayloadSchema>;

export const DEFAULT_RUBRIC: BankRubric = {
  competencies: [
    { name: "Technical depth", weight: 0.4 },
    { name: "Communication", weight: 0.3 },
    { name: "Culture fit", weight: 0.3 },
  ],
};

export function newQuestionId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Re-normalize weights so they sum to 1.0 (fixes rounding drift on last item). */
export function normalizeWeights(
  competencies: BankCompetency[],
): BankCompetency[] {
  if (competencies.length === 0) return competencies;
  const total = competencies.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) {
    const even = 1 / competencies.length;
    return competencies.map((c) => ({ ...c, weight: even }));
  }
  const scaled = competencies.map((c) => ({ ...c, weight: c.weight / total }));
  // Round to 3 decimals, then patch the last item so the sum is exactly 1.
  const rounded = scaled.map((c) => ({
    ...c,
    weight: Math.round(c.weight * 1000) / 1000,
  }));
  const drift =
    1 - rounded.reduce((sum, c) => sum + c.weight, 0);
  rounded[rounded.length - 1] = {
    ...rounded[rounded.length - 1],
    weight:
      Math.round((rounded[rounded.length - 1].weight + drift) * 1000) / 1000,
  };
  return rounded;
}

/** Pure reorder helper (used by drag-to-reorder + unit tests). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  if (from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const STOPWORDS = new Set([
  "with", "from", "that", "this", "will", "have", "your", "role",
  "team", "work", "about", "into", "plus", "they", "them", "then",
  "than", "such", "looking", "join", "help", "build", "hiring",
]);

function extractKeywords(jdText: string, limit = 8): string[] {
  const seen = new Set<string>();
  const words = jdText
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  for (const w of words) {
    if (!seen.has(w)) seen.add(w);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/**
 * Offline-safe JD → question preview. Deterministic template generation (no LLM
 * call) so "Generate from JD" works in dev/offline; the caller previews before
 * saving via PUT. Never persists — preview only.
 */
export function generatePreviewFromJD(
  jdText: string,
  jobTitle = "this role",
): { questions: BankQuestion[]; rubric: BankRubric } {
  const keywords = extractKeywords(jdText);
  const focus = keywords.slice(0, 4).join(", ") || "the role requirements";
  const templates: Array<{
    category: BankQuestionCategory;
    difficulty: number;
    text: string;
    follow_ups: string[];
  }> = [
    {
      category: "technical",
      difficulty: 2,
      text: `Walk me through how you would approach a core ${jobTitle} task involving ${focus}.`,
      follow_ups: ["What trade-offs did you consider?"],
    },
    {
      category: "technical",
      difficulty: 3,
      text: `How would you design a reliable solution for ${focus} at scale?`,
      follow_ups: ["How would you handle failure cases?", "How would you measure success?"],
    },
    {
      category: "behavioral",
      difficulty: 2,
      text: "Tell me about a time you disagreed with a teammate on a technical decision.",
      follow_ups: ["What was the outcome?", "What would you do differently?"],
    },
    {
      category: "behavioral",
      difficulty: 3,
      text: "Describe a high-pressure delivery you owned end to end.",
      follow_ups: ["How did you prioritize risks?"],
    },
    {
      category: "culture_fit",
      difficulty: 2,
      text: "What kind of team environment helps you do your best work?",
      follow_ups: ["Can you give a concrete example?"],
    },
  ];
  const questions: BankQuestion[] = templates.map((t, i) => ({
    id: `gen_${Date.now().toString(36)}_${i}`,
    text: t.text,
    category: t.category,
    difficulty: t.difficulty,
    expected_keywords: keywords.slice(0, 5),
    follow_ups: t.follow_ups,
    time_limit_sec: t.category === "technical" ? 180 : 120,
  }));
  return { questions, rubric: DEFAULT_RUBRIC };
}
