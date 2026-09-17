import { z } from "zod";
import { MasteryLevelSchema } from "./primitives";

export const CompetencyScoreSchema = z.object({
  competency: z.string(),
  score: z.number(),
  evidence: z.string(),
  level: MasteryLevelSchema,
});
export type CompetencyScore = z.infer<typeof CompetencyScoreSchema>;

export const LanguageReportSchema = z.object({
  fluency_score: z.number(),
  filler_word_count: z.number().int(),
  clarity_score: z.number(),
  code_switching_notes: z.string(),
  pronunciation_notes: z.string(),
  summary: z.string(),
});
export type LanguageReport = z.infer<typeof LanguageReportSchema>;

export const ModelAnswerSchema = z.object({
  question_id: z.string(),
  answer: z.string(),
});
export type ModelAnswer = z.infer<typeof ModelAnswerSchema>;

export const CommunicationStyleSchema = z.object({
  speaking_pace_wpm: z.number().default(0),
  filler_word_count: z.number().int().default(0),
  filler_words: z.array(z.string()).default([]),
  sentence_complexity_ratio: z.number().default(0),
  confidence_score: z.number().default(0),
  hedge_word_count: z.number().int().default(0),
  summary: z.string().default(""),
});
export type CommunicationStyle = z.infer<typeof CommunicationStyleSchema>;

export const STARAnalysisSchema = z.object({
  question_id: z.string().default(""),
  has_situation: z.boolean().default(false),
  has_task: z.boolean().default(false),
  has_action: z.boolean().default(false),
  has_result: z.boolean().default(false),
  completeness_pct: z.number().default(0),
  feedback: z.string().default(""),
});
export type STARAnalysis = z.infer<typeof STARAnalysisSchema>;

export const CulturalFitSignalSchema = z.object({
  value_name: z.string().default(""),
  detected: z.boolean().default(false),
  evidence: z.string().default(""),
  alignment_score: z.number().default(0),
});
export type CulturalFitSignal = z.infer<typeof CulturalFitSignalSchema>;

export const RedFlagSchema = z.object({
  category: z.string().default(""),
  severity: z.enum(["low", "medium", "high"]).default("low"),
  description: z.string().default(""),
  evidence: z.string().default(""),
});
export type RedFlag = z.infer<typeof RedFlagSchema>;

export const ComparativeBenchmarkSchema = z.object({
  metric: z.string().default(""),
  candidate_value: z.number().default(0),
  percentile: z.number().default(0),
  comparison_text: z.string().default(""),
});
export type ComparativeBenchmark = z.infer<typeof ComparativeBenchmarkSchema>;

export const InterviewInsightsSchema = z.object({
  communication_style: CommunicationStyleSchema.default({
    speaking_pace_wpm: 0,
    filler_word_count: 0,
    filler_words: [],
    sentence_complexity_ratio: 0,
    confidence_score: 0,
    hedge_word_count: 0,
    summary: "",
  } as z.infer<typeof CommunicationStyleSchema>),
  star_analysis: z.array(STARAnalysisSchema).default([]),
  star_overall_pct: z.number().default(0),
  cultural_fit: z.array(CulturalFitSignalSchema).default([]),
  cultural_fit_score: z.number().default(0),
  red_flags: z.array(RedFlagSchema).default([]),
  benchmarks: z.array(ComparativeBenchmarkSchema).default([]),
  summary: z.string().default(""),
});
export type InterviewInsights = z.infer<typeof InterviewInsightsSchema>;

export const MatchScoreBreakdownSchema = z.object({
  technical_fit: z.number().default(0),
  communication: z.number().default(0),
  behavioral_depth: z.number().default(0),
  proctoring_confidence: z.number().default(100),
  cultural_fit: z.number().default(0),
  final_score: z.number().default(0),
  recommendation: z
    .enum(["strong_hire", "hire", "maybe", "no_hire", "strong_no_hire"])
    .default("maybe"),
  summary: z.string().default(""),
});
export type MatchScoreBreakdown = z.infer<typeof MatchScoreBreakdownSchema>;

export const CandidateFeedbackSchema = z.object({
  strengths: z.array(z.string()).default([]),
  improvement_areas: z.array(z.string()).default([]),
  overall_assessment: z.string().default(""),
  encouragement: z.string().default(""),
  full_text: z.string().default(""),
});
export type CandidateFeedback = z.infer<typeof CandidateFeedbackSchema>;

export const ScoreCardSchema = z.object({
  overall_score: z.number(),
  competency_scores: z.array(CompetencyScoreSchema),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  weak_competencies: z.array(z.string()),
  model_answers: z.array(ModelAnswerSchema),
  next_steps: z.array(z.string()),
  language_report: LanguageReportSchema,
  summary: z.string(),
  coverage_pct: z.number().default(1.0),
  insights: InterviewInsightsSchema.default({
    communication_style: {
      speaking_pace_wpm: 0,
      filler_word_count: 0,
      filler_words: [],
      sentence_complexity_ratio: 0,
      confidence_score: 0,
      hedge_word_count: 0,
      summary: "",
    },
    star_analysis: [],
    star_overall_pct: 0,
    cultural_fit: [],
    cultural_fit_score: 0,
    red_flags: [],
    benchmarks: [],
    summary: "",
  } as z.infer<typeof InterviewInsightsSchema>),
  match_score: MatchScoreBreakdownSchema.default({
    technical_fit: 0,
    communication: 0,
    behavioral_depth: 0,
    proctoring_confidence: 100,
    cultural_fit: 0,
    final_score: 0,
    recommendation: "maybe",
    summary: "",
  } as z.infer<typeof MatchScoreBreakdownSchema>),
  candidate_feedback: CandidateFeedbackSchema.default({
    strengths: [],
    improvement_areas: [],
    overall_assessment: "",
    encouragement: "",
    full_text: "",
  } as z.infer<typeof CandidateFeedbackSchema>),
});
export type ScoreCard = z.infer<typeof ScoreCardSchema>;
