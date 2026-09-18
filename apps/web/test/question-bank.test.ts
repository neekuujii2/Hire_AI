import { describe, expect, it } from "vitest";
import {
  BankQuestionSchema,
  BankRubricSchema,
  generatePreviewFromJD,
  moveItem,
  normalizeWeights,
  QuestionBankPayloadSchema,
} from "../lib/question-bank";

const validQuestion = {
  id: "q1",
  text: "How would you design a payment service?",
  category: "technical",
  difficulty: 4,
  expected_keywords: ["idempotency"],
  follow_ups: ["What trade-offs?"],
  time_limit_sec: 180,
};

describe("question bank contracts", () => {
  it("accepts a valid question", () => {
    expect(BankQuestionSchema.safeParse(validQuestion).success).toBe(true);
  });

  it("rejects out-of-range difficulty and unknown category", () => {
    expect(
      BankQuestionSchema.safeParse({ ...validQuestion, difficulty: 6 }).success,
    ).toBe(false);
    expect(
      BankQuestionSchema.safeParse({ ...validQuestion, category: "trivia" }).success,
    ).toBe(false);
  });

  it("requires rubric weights to sum to 1.0", () => {
    const ok = BankRubricSchema.safeParse({
      competencies: [
        { name: "Technical", weight: 0.6 },
        { name: "Communication", weight: 0.4 },
      ],
    });
    expect(ok.success).toBe(true);
    const bad = BankRubricSchema.safeParse({
      competencies: [
        { name: "Technical", weight: 0.6 },
        { name: "Communication", weight: 0.2 },
      ],
    });
    expect(bad.success).toBe(false);
  });

  it("rejects payloads with bad questions or rubric", () => {
    expect(
      QuestionBankPayloadSchema.safeParse({
        questions: [{ ...validQuestion, difficulty: 0 }],
        rubric: { competencies: [{ name: "A", weight: 1 }] },
      }).success,
    ).toBe(false);
  });
});

describe("normalizeWeights", () => {
  it("scales arbitrary weights to sum to exactly 1", () => {
    const out = normalizeWeights([
      { name: "A", weight: 2 },
      { name: "B", weight: 1 },
    ]);
    const total = out.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(out[0]?.weight).toBeCloseTo(2 / 3, 3);
  });

  it("splits evenly when total is zero", () => {
    const out = normalizeWeights([
      { name: "A", weight: 0 },
      { name: "B", weight: 0 },
    ]);
    expect(out.map((c) => c.weight)).toEqual([0.5, 0.5]);
  });
});

describe("moveItem", () => {
  it("moves an entry and keeps everything else stable", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("ignores out-of-range moves", () => {
    expect(moveItem(["a", "b"], -1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["a", "b"]);
  });
});

describe("generatePreviewFromJD", () => {
  it("produces a categorized preview with bounded difficulty", () => {
    const { questions, rubric } = generatePreviewFromJD(
      "Senior Backend Engineer building distributed payment systems in Python with Kafka and PostgreSQL.",
      "Senior Backend Engineer",
    );
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(BankQuestionSchema.safeParse(q).success).toBe(true);
      expect(q.difficulty).toBeGreaterThanOrEqual(1);
      expect(q.difficulty).toBeLessThanOrEqual(5);
    }
    expect(BankRubricSchema.safeParse(rubric).success).toBe(true);
  });
});
